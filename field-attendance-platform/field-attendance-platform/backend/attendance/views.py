from django.db import IntegrityError, transaction
from django.http import FileResponse, Http404
from django.utils import timezone
from rest_framework import generics, status
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from locations.models import LocationRecord
from tracking.models import TrackingEvent as E
from tracking.services import broadcast_live, log_event
from .models import AttendanceSession as S, Visit, VisitPhoto
from .serializers import (
    EventSerializer,
    PunchInSerializer,
    PunchOutSerializer,
    SessionSerializer,
    VisitPhotoSerializer,
    VisitPhotoUploadSerializer,
    VisitSerializer,
)


def active_session(user):
    return S.objects.select_related("user").filter(user=user, status=S.Status.ACTIVE).first()


class PunchInView(APIView):
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        if active_session(request.user):
            return Response({"detail": "You already have an active session."}, status=status.HTTP_409_CONFLICT)
        ser = PunchInSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        d = ser.validated_data
        now = timezone.now()
        try:
            with transaction.atomic():
                session = S.objects.create(
                    user=request.user,
                    selfie=d["selfie"],
                    punch_in_at=now,
                    last_latitude=d["latitude"],
                    last_longitude=d["longitude"],
                    last_accuracy=d.get("accuracy"),
                    last_location_at=now,
                )
                LocationRecord.objects.create(
                    user=request.user,
                    session=session,
                    timestamp=now,
                    latitude=d["latitude"],
                    longitude=d["longitude"],
                    accuracy=d.get("accuracy"),
                )
                for t in (
                    E.Type.PUNCH_IN,
                    E.Type.SELFIE_UPLOADED,
                    E.Type.LOCATION_PERMISSION_GRANTED,
                    E.Type.TRACKING_STARTED,
                ):
                    log_event(session, t)
        except IntegrityError:
            return Response({"detail": "You already have an active session."}, status=status.HTTP_409_CONFLICT)
        broadcast_live(session)
        return Response(SessionSerializer(session).data, status=status.HTTP_201_CREATED)


class PunchOutView(APIView):
    def post(self, request):
        ser = PunchOutSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        d = ser.validated_data
        session = active_session(request.user)
        if not session:
            return Response({"detail": "No active session."}, status=status.HTTP_409_CONFLICT)
        now = timezone.now()
        with transaction.atomic():
            if "latitude" in d and "longitude" in d:  # final location, only if provided
                LocationRecord.objects.create(
                    user=request.user,
                    session=session,
                    timestamp=now,
                    latitude=d["latitude"],
                    longitude=d["longitude"],
                    accuracy=d.get("accuracy"),
                )
                session.last_latitude, session.last_longitude, session.last_location_at = (
                    d["latitude"],
                    d["longitude"],
                    now,
                )
            session.punch_out_at = now
            session.status = S.Status.COMPLETED
            session.tracking_status = S.TrackingStatus.PUNCHED_OUT
            session.save()
            log_event(session, E.Type.PUNCH_OUT)
            log_event(session, E.Type.SESSION_COMPLETED, duration_seconds=session.duration_seconds)
        broadcast_live(session)
        return Response(SessionSerializer(session).data)


class CurrentSessionView(APIView):
    def get(self, request):
        session = active_session(request.user)
        if not session:
            return Response({"session": None, "events": [], "visits": []})
        return Response({
            "session": SessionSerializer(session).data,
            "events": EventSerializer(session.events.all(), many=True).data,
            "visits": VisitSerializer(session.visits.all(), many=True).data,
        })


class HistoryView(generics.ListAPIView):
    serializer_class = SessionSerializer

    def get_queryset(self):
        return S.objects.filter(user=self.request.user).select_related("user")


class SelfieView(APIView):
    """Selfies are served only to their owner or an admin, never via a public URL."""

    def get(self, request, pk):
        session = S.objects.filter(pk=pk).first()
        if not session or not (session.user_id == request.user.id or request.user.role == "ADMIN"):
            raise Http404
        return FileResponse(session.selfie.open("rb"), headers={"Cache-Control": "private, max-age=300"})


class VisitListCreateView(APIView):
    def get(self, request):
        session_id = request.query_params.get("session_id")
        status_filter = request.query_params.get("status")
        visit_type_filter = request.query_params.get("visit_type")

        include_all = request.query_params.get("all") == "true"

        if session_id:
            visits = Visit.objects.filter(session_id=session_id)
            if request.user.role != "ADMIN":
                visits = visits.filter(user=request.user)
        elif include_all:
            visits = Visit.objects.all() if request.user.role == "ADMIN" else Visit.objects.filter(user=request.user)
        else:
            session = active_session(request.user)
            if session:
                visits = Visit.objects.filter(session=session)
            else:
                visits = Visit.objects.filter(user=request.user)

        if status_filter in Visit.Status.values:
            visits = visits.filter(status=status_filter)
        if visit_type_filter in Visit.VisitType.values:
            visits = visits.filter(visit_type=visit_type_filter)

        visits = visits.select_related("user", "user__profile").prefetch_related("photos")
        return Response(VisitSerializer(visits, many=True).data)

    def post(self, request):
        session = active_session(request.user)
        if not session:
            return Response(
                {"detail": "An active punch-in session is required to record a visit."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        site_name = request.data.get("site_name", "").strip()
        if not site_name:
            return Response({"site_name": ["This field is required."]}, status=status.HTTP_400_BAD_REQUEST)

        visit_type = request.data.get("visit_type", Visit.VisitType.SITE_INSPECTION)
        if visit_type not in Visit.VisitType.values:
            visit_type = Visit.VisitType.SITE_INSPECTION

        project_name = request.data.get("project_name", "").strip()

        visit = Visit.objects.create(
            user=request.user,
            session=session,
            site_name=site_name,
            project_name=project_name,
            visit_type=visit_type,
            location_name=request.data.get("location_name", ""),
            latitude=request.data.get("latitude") or session.last_latitude,
            longitude=request.data.get("longitude") or session.last_longitude,
            notes=request.data.get("notes", ""),
            status=Visit.Status.IN_PROGRESS,
            outcome=Visit.Outcome.PENDING,
            start_time=timezone.now(),
        )
        log_event(
            session,
            E.Type.VISIT_STARTED,
            visit_id=visit.id,
            site_name=visit.site_name,
            visit_type=visit.visit_type,
            project_name=visit.project_name,
        )
        return Response(VisitSerializer(visit).data, status=status.HTTP_201_CREATED)


class VisitDetailUpdateView(APIView):
    def get(self, request, pk):
        visit = generics.get_object_or_404(
            Visit.objects.select_related("user", "user__profile").prefetch_related("photos"), pk=pk
        )
        if visit.user != request.user and request.user.role != "ADMIN":
            return Response({"detail": "Not authorized."}, status=status.HTTP_403_FORBIDDEN)
        return Response(VisitSerializer(visit).data)

    def patch(self, request, pk):
        visit = generics.get_object_or_404(Visit, pk=pk)
        if visit.user != request.user and request.user.role != "ADMIN":
            return Response({"detail": "Not authorized."}, status=status.HTTP_403_FORBIDDEN)

        status_val = request.data.get("status")
        outcome_val = request.data.get("outcome")
        notes = request.data.get("notes")
        outcome_notes = request.data.get("outcome_notes")
        project_name = request.data.get("project_name")
        site_name = request.data.get("site_name")
        visit_type = request.data.get("visit_type")
        end_location_name = request.data.get("end_location_name")
        end_latitude = request.data.get("end_latitude")
        end_longitude = request.data.get("end_longitude")

        if site_name:
            visit.site_name = site_name.strip()
        if project_name is not None:
            visit.project_name = project_name.strip()
        if visit_type in Visit.VisitType.values:
            visit.visit_type = visit_type

        if outcome_val in Visit.Outcome.values:
            visit.outcome = outcome_val

        if notes is not None:
            visit.notes = notes
        if outcome_notes is not None:
            visit.outcome_notes = outcome_notes

        if end_location_name is not None:
            visit.end_location_name = end_location_name
        if end_latitude is not None:
            visit.end_latitude = end_latitude
        if end_longitude is not None:
            visit.end_longitude = end_longitude

        if status_val in Visit.Status.values:
            visit.status = status_val
            if status_val == Visit.Status.COMPLETED and not visit.end_time:
                visit.end_time = timezone.now()
                # If outcome was still pending, set default satisfactory if not specified
                if visit.outcome == Visit.Outcome.PENDING:
                    visit.outcome = Visit.Outcome.SATISFACTORY
                log_event(
                    visit.session,
                    E.Type.VISIT_COMPLETED,
                    visit_id=visit.id,
                    site_name=visit.site_name,
                    outcome=visit.outcome,
                )

        visit.save()
        return Response(VisitSerializer(visit).data)


# Backward compatibility alias
VisitUpdateView = VisitDetailUpdateView


class VisitPhotoUploadView(APIView):
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request, pk):
        visit = generics.get_object_or_404(Visit, pk=pk)
        if visit.user != request.user and request.user.role != "ADMIN":
            return Response({"detail": "Not authorized."}, status=status.HTTP_403_FORBIDDEN)

        ser = VisitPhotoUploadSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        d = ser.validated_data

        photo = VisitPhoto.objects.create(
            visit=visit,
            photo=d["photo"],
            caption=d.get("caption", ""),
            latitude=d.get("latitude") or visit.latitude,
            longitude=d.get("longitude") or visit.longitude,
            captured_at=d.get("captured_at") or timezone.now(),
        )

        log_event(
            visit.session,
            E.Type.VISIT_PHOTO_UPLOADED,
            visit_id=visit.id,
            photo_id=photo.id,
            caption=photo.caption,
        )

        return Response(VisitPhotoSerializer(photo).data, status=status.HTTP_201_CREATED)


class VisitPhotoServeView(APIView):
    """Evidence photos are served only to the visit owner or an admin, never via public direct URL."""

    def get(self, request, visit_pk, photo_pk):
        photo = generics.get_object_or_404(VisitPhoto.objects.select_related("visit"), pk=photo_pk, visit_id=visit_pk)
        if not (photo.visit.user_id == request.user.id or request.user.role == "ADMIN"):
            raise Http404
        return FileResponse(photo.photo.open("rb"), headers={"Cache-Control": "private, max-age=300"})
