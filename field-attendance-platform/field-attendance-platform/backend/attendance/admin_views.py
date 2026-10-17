import csv
from django.db.models import Count, Q
from django.http import HttpResponse
from django.utils import timezone
from rest_framework import generics
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import EmployeeProfile, User
from accounts.permissions import IsAdminRole
from locations.serializers import LocationSerializer
from tracking.services import live_payload
from .models import AttendanceSession as S, Visit
from .serializers import EventSerializer, SessionSerializer, VisitSerializer

DOWN = [S.TrackingStatus.LOCATION_UNAVAILABLE, S.TrackingStatus.PERMISSION_DENIED, S.TrackingStatus.OFFLINE]


class SummaryView(APIView):
    permission_classes = [IsAdminRole]

    def get(self, request):
        today = timezone.now().date()
        active = S.objects.filter(status=S.Status.ACTIVE)
        total_active = active.count()
        tracking = active.filter(tracking_status=S.TrackingStatus.ACTIVE).count()
        unavailable = active.filter(
            tracking_status__in=[
                S.TrackingStatus.LOCATION_UNAVAILABLE,
                S.TrackingStatus.PERMISSION_DENIED,
            ]
        ).count()
        paused_offline = active.filter(
            tracking_status__in=[
                S.TrackingStatus.PAUSED,
                S.TrackingStatus.OFFLINE,
            ]
        ).count()
        
        # Ensure Active = Tracking + Unavailable + Paused/Offline exactly
        residual = total_active - (tracking + unavailable + paused_offline)
        if residual > 0:
            paused_offline += residual

        return Response({
            "total_users": User.objects.filter(role=User.Role.USER, is_active=True).count(),
            "active_users": total_active,
            "currently_tracking": tracking,
            "location_unavailable": unavailable,
            "paused_offline": paused_offline,
            "today_punch_ins": S.objects.filter(punch_in_at__date=today).count(),
            "today_punch_outs": S.objects.filter(punch_out_at__date=today).count(),
            "completed_sessions": S.objects.filter(status=S.Status.COMPLETED).count(),
            "today_visits": Visit.objects.filter(start_time__date=today).count(),
        })


class LiveView(APIView):
    permission_classes = [IsAdminRole]

    def get(self, request):
        qs = S.objects.filter(status=S.Status.ACTIVE).select_related("user")
        return Response([live_payload(s) for s in qs])


class SessionListView(generics.ListAPIView):
    permission_classes = [IsAdminRole]
    serializer_class = SessionSerializer

    def get_queryset(self):
        p = self.request.query_params
        qs = S.objects.select_related("user", "user__profile").annotate(
            interruptions=Count(
                "events",
                filter=Q(events__event_type__in=["LOCATION_UNAVAILABLE", "LOCATION_PERMISSION_DENIED"]),
            )
        )
        if p.get("user"):
            qs = qs.filter(user_id=p["user"])
        if p.get("status") in S.Status.values:
            qs = qs.filter(status=p["status"])
        if p.get("department"):
            qs = qs.filter(user__profile__department__icontains=p["department"])
        if p.get("date_from"):
            qs = qs.filter(punch_in_at__date__gte=p["date_from"])
        if p.get("date_to"):
            qs = qs.filter(punch_in_at__date__lte=p["date_to"])
        return qs


class SessionDetailView(APIView):
    permission_classes = [IsAdminRole]

    def get(self, request, pk):
        s = generics.get_object_or_404(S.objects.select_related("user", "user__profile"), pk=pk)
        return Response({
            "session": SessionSerializer(s).data,
            "locations": LocationSerializer(s.locations.all(), many=True).data,
            "events": EventSerializer(s.events.all(), many=True).data,
            "visits": VisitSerializer(s.visits.all(), many=True).data,
        })


from rest_framework.pagination import PageNumberPagination
from tracking.models import TrackingEvent


def filter_admin_visits(qs, params):
    """Filters visits queryset by employee, status, category, outcome, department, date range, and search."""
    user = params.get("user") or params.get("employee")
    if user:
        if str(user).isdigit():
            qs = qs.filter(Q(user_id=user) | Q(user__profile__employee_id=str(user)))
        else:
            qs = qs.filter(user__profile__employee_id__iexact=str(user))

    status = params.get("status")
    if status in Visit.Status.values:
        qs = qs.filter(status=status)

    visit_type = params.get("visit_type") or params.get("category")
    if visit_type in Visit.VisitType.values:
        qs = qs.filter(visit_type=visit_type)

    outcome = params.get("outcome")
    if outcome in Visit.Outcome.values:
        qs = qs.filter(outcome=outcome)

    dept = params.get("department")
    if dept:
        qs = qs.filter(user__profile__department__icontains=dept)

    date_from = params.get("date_from")
    if date_from:
        qs = qs.filter(start_time__date__gte=date_from)

    date_to = params.get("date_to")
    if date_to:
        qs = qs.filter(start_time__date__lte=date_to)

    date = params.get("date")
    if date:
        qs = qs.filter(start_time__date=date)

    search = params.get("search") or params.get("q")
    if search:
        search = search.strip()
        search_q = (
            Q(user__first_name__icontains=search)
            | Q(user__last_name__icontains=search)
            | Q(user__username__icontains=search)
            | Q(user__profile__employee_id__icontains=search)
            | Q(site_name__icontains=search)
            | Q(project_name__icontains=search)
            | Q(location_name__icontains=search)
            | Q(end_location_name__icontains=search)
            | Q(notes__icontains=search)
            | Q(outcome_notes__icontains=search)
        )
        clean_id = search.upper().replace("VIS-", "").replace("VIS", "").replace("#", "").strip()
        if clean_id.isdigit():
            search_q |= Q(id=int(clean_id))
        qs = qs.filter(search_q)

    return qs


class AdminVisitPagination(PageNumberPagination):
    page_size = 15
    page_size_query_param = "page_size"
    max_page_size = 100

    def paginate_queryset(self, queryset, request, view=None):
        if request.query_params.get("no_page", "").lower() in ("true", "1", "yes"):
            return None
        return super().paginate_queryset(queryset, request, view)


class AdminVisitListView(generics.ListAPIView):
    permission_classes = [IsAdminRole]
    serializer_class = VisitSerializer
    pagination_class = AdminVisitPagination

    def get_queryset(self):
        qs = (
            Visit.objects.select_related("user", "user__profile", "session")
            .prefetch_related("photos")
            .order_by("-start_time")
        )
        return filter_admin_visits(qs, self.request.query_params)


class AdminVisitDetailView(APIView):
    """Returns detailed visit inspection dossier including employee info, photos, and audit timeline."""
    permission_classes = [IsAdminRole]

    def get(self, request, pk):
        visit = generics.get_object_or_404(
            Visit.objects.select_related("user", "user__profile", "session").prefetch_related("photos"),
            pk=pk,
        )
        # Fetch audit events matching this visit
        events = TrackingEvent.objects.filter(
            Q(session=visit.session, metadata__visit_id=visit.id)
            | Q(
                session=visit.session,
                event_type__in=["VISIT_STARTED", "VISIT_PHOTO_UPLOADED", "VISIT_COMPLETED"],
                timestamp__gte=visit.start_time,
                timestamp__lte=visit.end_time or timezone.now(),
            )
        ).distinct().order_by("timestamp")

        emp = visit.user
        prof = getattr(emp, "profile", None)

        return Response({
            "visit": VisitSerializer(visit).data,
            "events": EventSerializer(events, many=True).data,
            "employee": {
                "id": emp.id,
                "name": emp.get_full_name() or emp.username,
                "employee_id": prof.employee_id if prof else emp.username,
                "department": prof.department if prof else "IT Division (GNFC)",
                "designation": prof.designation if prof else "Field Officer",
                "email": emp.email,
                "phone": getattr(emp, "phone", "") or "",
            },
        })


class AdminVisitExportCsvView(APIView):
    """Generates and downloads a CSV export of filtered field visits."""
    permission_classes = [IsAdminRole]

    def get(self, request):
        qs = (
            Visit.objects.select_related("user", "user__profile", "session")
            .prefetch_related("photos")
            .order_by("-start_time")
        )
        qs = filter_admin_visits(qs, request.query_params)

        response = HttpResponse(content_type="text/csv")
        now_str = timezone.now().strftime("%Y%m%d_%H%M%S")
        response["Content-Disposition"] = f'attachment; filename="ncode_visits_export_{now_str}.csv"'

        writer = csv.writer(response)
        writer.writerow([
            "Visit ID",
            "Employee Name",
            "Employee ID",
            "Department",
            "Site Name",
            "Project Name",
            "Visit Category",
            "Status",
            "Outcome",
            "Start Time",
            "End Time",
            "Duration (Minutes)",
            "Start Location Name",
            "Start Coordinates",
            "End Location Name",
            "End Coordinates",
            "Photos Count",
            "Notes",
            "Outcome Notes",
        ])

        for v in qs:
            name = v.user.get_full_name() or v.user.username
            emp_id = (
                v.user.profile.employee_id
                if hasattr(v.user, "profile") and v.user.profile
                else v.user.username
            )
            dept = (
                v.user.profile.department
                if hasattr(v.user, "profile") and v.user.profile
                else "IT Division (GNFC)"
            )
            start_coord = (
                f"{v.latitude}, {v.longitude}"
                if v.latitude is not None and v.longitude is not None
                else ""
            )
            end_coord = (
                f"{v.end_latitude}, {v.end_longitude}"
                if v.end_latitude is not None and v.end_longitude is not None
                else ""
            )
            start_str = v.start_time.strftime("%Y-%m-%d %H:%M:%S") if v.start_time else ""
            end_str = v.end_time.strftime("%Y-%m-%d %H:%M:%S") if v.end_time else ""

            writer.writerow([
                v.id,
                name,
                emp_id,
                dept,
                v.site_name,
                v.project_name or "",
                v.get_visit_type_display(),
                v.get_status_display(),
                v.get_outcome_display(),
                start_str,
                end_str,
                v.duration_minutes if v.duration_minutes is not None else "",
                v.location_name or "",
                start_coord,
                v.end_location_name or "",
                end_coord,
                v.photos.count(),
                v.notes or "",
                v.outcome_notes or "",
            ])

        return response


class SessionExportCsvView(APIView):
    """Generates and downloads a CSV export of filtered attendance records."""
    permission_classes = [IsAdminRole]

    def get(self, request):
        p = request.query_params
        qs = S.objects.select_related("user", "user__profile").annotate(
            interruptions=Count(
                "events",
                filter=Q(events__event_type__in=["LOCATION_UNAVAILABLE", "LOCATION_PERMISSION_DENIED"]),
            )
        )
        if p.get("user"):
            qs = qs.filter(user_id=p["user"])
        if p.get("status") in S.Status.values:
            qs = qs.filter(status=p["status"])
        if p.get("department"):
            qs = qs.filter(user__profile__department__icontains=p["department"])
        if p.get("date_from"):
            qs = qs.filter(punch_in_at__date__gte=p["date_from"])
        if p.get("date_to"):
            qs = qs.filter(punch_in_at__date__lte=p["date_to"])

        response = HttpResponse(content_type="text/csv")
        now_str = timezone.now().strftime("%Y%m%d_%H%M%S")
        response["Content-Disposition"] = f'attachment; filename="ncode_attendance_export_{now_str}.csv"'

        writer = csv.writer(response)
        writer.writerow([
            "Session ID",
            "Employee Name",
            "Employee ID",
            "Email",
            "Department",
            "Designation",
            "Date",
            "Punch In",
            "Punch Out",
            "Duration Seconds",
            "Duration Formatted",
            "GPS Interruptions",
            "Field Visits Count",
            "Status",
            "Tracking Status",
        ])

        for s in qs:
            name = s.user.get_full_name() or s.user.username
            emp_id = (
                s.user.profile.employee_id
                if hasattr(s.user, "profile") and s.user.profile
                else s.user.username
            )
            dept = (
                s.user.profile.department
                if hasattr(s.user, "profile") and s.user.profile
                else "IT Division (GNFC)"
            )
            desig = (
                s.user.profile.designation
                if hasattr(s.user, "profile") and s.user.profile
                else "Field Officer"
            )
            dur = s.duration_seconds
            hours, remainder = divmod(dur, 3600)
            minutes, _ = divmod(remainder, 60)
            dur_fmt = f"{hours}h {minutes:02d}m"
            date_str = s.punch_in_at.strftime("%Y-%m-%d") if s.punch_in_at else ""
            in_str = s.punch_in_at.strftime("%H:%M:%S") if s.punch_in_at else ""
            out_str = s.punch_out_at.strftime("%H:%M:%S") if s.punch_out_at else "—"

            writer.writerow([
                s.id,
                name,
                emp_id,
                s.user.email,
                dept,
                desig,
                date_str,
                in_str,
                out_str,
                dur,
                dur_fmt,
                s.interruptions,
                s.visits.count(),
                s.status,
                s.tracking_status,
            ])

        return response


class DepartmentListView(APIView):
    """Returns list of all distinct departments for filter dropdowns."""
    permission_classes = [IsAdminRole]

    def get(self, request):
        depts = (
            EmployeeProfile.objects.exclude(department="")
            .values_list("department", flat=True)
            .distinct()
            .order_by("department")
        )
        dept_list = list(depts)
        return Response(dept_list)


class AdminEventListView(generics.ListAPIView):
    """Admin view for system tracking audit events log with search and filters."""
    permission_classes = [IsAdminRole]
    serializer_class = EventSerializer

    def get_queryset(self):
        from tracking.models import TrackingEvent
        qs = TrackingEvent.objects.select_related("user", "user__profile", "session").order_by("-timestamp")
        p = self.request.query_params
        if p.get("user"):
            qs = qs.filter(user_id=p["user"])
        if p.get("event_type"):
            qs = qs.filter(event_type=p["event_type"])
        if p.get("date_from"):
            qs = qs.filter(timestamp__date__gte=p["date_from"])
        if p.get("date_to"):
            qs = qs.filter(timestamp__date__lte=p["date_to"])
        if p.get("search"):
            q = p["search"].strip()
            qs = qs.filter(
                Q(user__username__icontains=q)
                | Q(user__first_name__icontains=q)
                | Q(user__last_name__icontains=q)
                | Q(user__profile__employee_id__icontains=q)
            )
        return qs
