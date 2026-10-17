from django.utils import timezone
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from attendance.models import AttendanceSession as S
from tracking.models import TrackingEvent as E
from tracking.services import broadcast_live, log_event
from .models import LocationRecord
from .serializers import LocationInputSerializer, LocationSerializer

# Haversine distance in km
import math


def _haversine_km(lat1, lng1, lat2, lng2):
    R = 6371
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = math.sin(dlat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlng / 2) ** 2
    return R * 2 * math.asin(math.sqrt(a))


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


class BatchLocationCreateView(APIView):
    """
    Flush offline-queued location points in a single request.
    Body: {"points": [{"latitude": ..., "longitude": ..., "accuracy": ..., "client_ts": "ISO8601"}, ...]}
    Points are validated: not future, within session window, sane speed (<150 km/h between consecutive).
    Returns counts of accepted and rejected points.
    """
    MAX_SPEED_KMH = 150
    MAX_POINTS_PER_BATCH = 500

    def post(self, request):
        session = S.objects.select_related("user").filter(user=request.user, status=S.Status.ACTIVE).first()
        if not session:
            return Response({"detail": "No active session."}, status=status.HTTP_409_CONFLICT)

        points = request.data.get("points", [])
        if not isinstance(points, list):
            return Response({"detail": "'points' must be a list."}, status=status.HTTP_400_BAD_REQUEST)

        points = points[: self.MAX_POINTS_PER_BATCH]  # cap

        now = timezone.now()
        accepted, rejected = 0, 0
        prev_lat, prev_lng, prev_ts = None, None, None
        to_create = []

        for pt in sorted(points, key=lambda p: p.get("client_ts", "")):
            try:
                lat = float(pt["latitude"])
                lng = float(pt["longitude"])
                accuracy = float(pt.get("accuracy", 0)) or None
                from django.utils.dateparse import parse_datetime
                ts = parse_datetime(pt.get("client_ts", "")) or now

                # Sanity: not in the future
                if ts > now:
                    ts = now
                # Sanity: not before session start
                if ts < session.punch_in_at:
                    ts = session.punch_in_at

                # Sanity: valid coords
                if not (-90 <= lat <= 90) or not (-180 <= lng <= 180):
                    rejected += 1
                    continue

                # Speed check
                if prev_lat is not None and prev_ts is not None:
                    dt_h = max((ts - prev_ts).total_seconds() / 3600, 1e-6)
                    dist_km = _haversine_km(prev_lat, prev_lng, lat, lng)
                    if dist_km / dt_h > self.MAX_SPEED_KMH:
                        rejected += 1
                        continue

                to_create.append(LocationRecord(
                    user=request.user, session=session,
                    latitude=lat, longitude=lng,
                    accuracy=accuracy, timestamp=ts,
                ))
                prev_lat, prev_lng, prev_ts = lat, lng, ts
                accepted += 1
            except (KeyError, ValueError, TypeError):
                rejected += 1

        if to_create:
            LocationRecord.objects.bulk_create(to_create, ignore_conflicts=True)
            last = to_create[-1]
            session.last_latitude = last.latitude
            session.last_longitude = last.longitude
            session.last_accuracy = last.accuracy
            session.last_location_at = now
            fields = ["last_latitude", "last_longitude", "last_accuracy", "last_location_at"]
            if session.tracking_status != S.TrackingStatus.ACTIVE:
                prev_status = session.tracking_status
                session.tracking_status = S.TrackingStatus.ACTIVE
                fields.append("tracking_status")
                log_event(session, E.Type.TRACKING_RESUMED, previous_status=prev_status, reason="batch_flush")
            session.save(update_fields=fields)
            broadcast_live(session)

        return Response({"accepted": accepted, "rejected": rejected}, status=status.HTTP_201_CREATED)
