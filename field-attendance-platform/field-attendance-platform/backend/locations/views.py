from django.utils import timezone
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from attendance.models import AttendanceSession as S
from tracking.models import TrackingEvent as E
from tracking.services import broadcast_live, log_event
from .models import LocationRecord
from .serializers import LocationInputSerializer, LocationSerializer


class LocationCreateView(APIView):
    """Records a point for the caller's ACTIVE session only. Location is never accepted outside a session."""

    def get(self, request):
        session_id = request.query_params.get("session")
        qs = LocationRecord.objects.all()
        if request.user.role != "ADMIN":
            qs = qs.filter(user=request.user)
        if session_id:
            qs = qs.filter(session_id=session_id)
        return Response(LocationSerializer(qs.order_by("timestamp"), many=True).data)

    def post(self, request):
        ser = LocationInputSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        d = ser.validated_data
        session = S.objects.select_related("user").filter(user=request.user, status=S.Status.ACTIVE).first()
        if not session:
            return Response({"detail": "No active session."}, status=status.HTTP_409_CONFLICT)

        now = timezone.now()  # server time; client clocks are not trusted
        LocationRecord.objects.create(user=request.user, session=session, timestamp=now, **d)
        session.last_latitude, session.last_longitude = d["latitude"], d["longitude"]
        session.last_accuracy, session.last_location_at = d.get("accuracy"), now
        fields = ["last_latitude", "last_longitude", "last_accuracy", "last_location_at"]
        if session.tracking_status != S.TrackingStatus.ACTIVE:
            prev = session.tracking_status
            session.tracking_status = S.TrackingStatus.ACTIVE
            fields.append("tracking_status")
            log_event(session, E.Type.TRACKING_RESUMED, previous_status=prev)
        session.save(update_fields=fields)
        broadcast_live(session)
        return Response(status=status.HTTP_201_CREATED)
