from django.conf import settings
from rest_framework import serializers, status
from rest_framework.response import Response
from rest_framework.views import APIView

from attendance.models import AttendanceSession as S
from .models import TrackingEvent as E
from .services import broadcast_live, log_event

# Events a client may report (things only the browser can detect).
CLIENT_EVENTS = {
    E.Type.LOCATION_UNAVAILABLE: S.TrackingStatus.LOCATION_UNAVAILABLE,
    E.Type.LOCATION_PERMISSION_DENIED: S.TrackingStatus.PERMISSION_DENIED,
}


class ConfigView(APIView):
    def get(self, request):
        return Response({"interval_seconds": settings.TRACKING_INTERVAL_SECONDS})


class ClientEventSerializer(serializers.Serializer):
    event_type = serializers.ChoiceField(choices=[c.value for c in CLIENT_EVENTS])
    metadata = serializers.DictField(required=False, default=dict)


class ClientEventView(APIView):
    def post(self, request):
        ser = ClientEventSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        session = S.objects.select_related("user").filter(user=request.user, status=S.Status.ACTIVE).first()
        if not session:
            return Response({"detail": "No active session."}, status=status.HTTP_409_CONFLICT)
        new_status = CLIENT_EVENTS[ser.validated_data["event_type"]]
        if session.tracking_status != new_status:  # dedupe repeated reports of the same condition
            session.tracking_status = new_status
            session.save(update_fields=["tracking_status"])
            log_event(session, ser.validated_data["event_type"], **{"client": str(ser.validated_data["metadata"])[:500]})
            broadcast_live(session)
        return Response(status=status.HTTP_204_NO_CONTENT)
