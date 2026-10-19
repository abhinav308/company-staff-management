from decimal import Decimal
from django.utils import timezone
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import (
    Announcement,
    EmployeeDocument,
    EmployeeProfile,
    ProfileChangeRequest,
    User,
)
from accounts.serializers import (
    AnnouncementSerializer,
    EmployeeDocumentSerializer,
    ProfileChangeRequestSerializer,
)
from attendance.models import Holiday, LeaveBalance, LeaveRequest, LeaveType
from attendance.serializers import (
    HolidaySerializer,
    LeaveRequestSerializer,
    LeaveTypeSerializer,
)


class IsAdminUserOrManager(permissions.BasePermission):
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and (
            request.user.role == User.Role.ADMIN or request.user.reportees.exists()
        ))


class AdminLeaveListView(APIView):
    permission_classes = [IsAdminUserOrManager]

    def get(self, request):
        user = request.user
        status_filter = request.query_params.get("status")

        if user.role == User.Role.ADMIN:
            qs = LeaveRequest.objects.all()
        else:
            # Manager sees reportees' leaves
            reportee_ids = user.reportees.values_list("user_id", flat=True)
            qs = LeaveRequest.objects.filter(user_id__in=reportee_ids)

        if status_filter:
            qs = qs.filter(status=status_filter.upper())

        ser = LeaveRequestSerializer(qs.order_by("-created_at"), many=True, context={"request": request})
        return Response(ser.data)


class AdminLeaveDecisionView(APIView):
    permission_classes = [IsAdminUserOrManager]

    def post(self, request, pk):
        user = request.user
        try:
            leave = LeaveRequest.objects.select_related("user", "leave_type_ref").get(pk=pk)
        except LeaveRequest.DoesNotExist:
            return Response({"error": "Leave request not found."}, status=status.HTTP_404_NOT_FOUND)

        # Check permission: admin or manager of this employee
        if user.role != User.Role.ADMIN:
            is_manager = False
            if hasattr(leave.user, "profile") and leave.user.profile.reporting_manager == user:
                is_manager = True
            if not is_manager:
                return Response({"error": "You do not have permission to approve/reject this leave request."}, status=status.HTTP_403_FORBIDDEN)

        decision = (request.data.get("decision") or request.data.get("status") or "").upper()
        comment = (request.data.get("comment") or request.data.get("notes") or "").strip()

        if decision not in [LeaveRequest.Status.APPROVED, LeaveRequest.Status.REJECTED]:
            return Response({"error": "Decision must be either APPROVED or REJECTED."}, status=status.HTTP_400_BAD_REQUEST)

        if leave.status != LeaveRequest.Status.PENDING:
            return Response({"error": f"Leave request is already {leave.status}."}, status=status.HTTP_400_BAD_REQUEST)

        leave.status = decision
        leave.approver = user
        leave.approver_comment = comment
        leave.decided_at = timezone.now()
        leave.save()

        # If approved, deduct used_days from LeaveBalance
        if decision == LeaveRequest.Status.APPROVED and leave.leave_type_ref:
            balance, _ = LeaveBalance.objects.get_or_create(
                user=leave.user,
                leave_type=leave.leave_type_ref,
                year=leave.start_date.year,
                defaults={"total_days": leave.leave_type_ref.default_days_per_year, "used_days": Decimal("0.0")}
            )
            balance.used_days += leave.days_count
            balance.save()

        ser = LeaveRequestSerializer(leave, context={"request": request})
        return Response({
            "message": f"Leave request has been {decision.lower()}.",
            "leave": ser.data,
        })


class AdminHolidayManagementView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get_permissions(self):
        if self.request.method == "GET":
            return [permissions.IsAuthenticated()]
        return [permissions.IsAuthenticated(), permissions.IsAdminUser()]

    def get(self, request):
        year = int(request.query_params.get("year", timezone.now().year))
        holidays = Holiday.objects.filter(date__year=year).order_by("date")
        ser = HolidaySerializer(holidays, many=True)
        return Response(ser.data)

    def post(self, request):
        if request.user.role != User.Role.ADMIN:
            return Response({"error": "Admin privileges required."}, status=status.HTTP_403_FORBIDDEN)

        data = request.data
        name = data.get("name", "").strip()
        date_str = data.get("date")
        holiday_type = data.get("holiday_type", "NATIONAL")
        description = data.get("description", "").strip()
        is_mandatory = str(data.get("is_mandatory", "true")).lower() in ["true", "1"]

        if not name or not date_str:
            return Response({"error": "Name and date are required."}, status=status.HTTP_400_BAD_REQUEST)

        holiday, created = Holiday.objects.update_or_create(
            date=date_str,
            defaults={
                "name": name,
                "holiday_type": holiday_type,
                "description": description,
                "is_mandatory": is_mandatory,
                "year": int(date_str.split("-")[0]),
            }
        )
        ser = HolidaySerializer(holiday)
        return Response(ser.data, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)


class AdminHolidayDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def delete(self, request, pk):
        if request.user.role != User.Role.ADMIN:
            return Response({"error": "Admin privileges required."}, status=status.HTTP_403_FORBIDDEN)
        try:
            holiday = Holiday.objects.get(pk=pk)
            holiday.delete()
            return Response({"message": "Holiday deleted successfully."})
        except Holiday.DoesNotExist:
            return Response({"error": "Holiday not found."}, status=status.HTTP_404_NOT_FOUND)


class AdminDocumentQueueView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        if request.user.role != User.Role.ADMIN:
            return Response({"error": "Admin privileges required."}, status=status.HTTP_403_FORBIDDEN)
        status_filter = request.query_params.get("status")
        qs = EmployeeDocument.objects.all().select_related("user", "uploaded_by", "verified_by")
        if status_filter:
            qs = qs.filter(status=status_filter.upper())
        ser = EmployeeDocumentSerializer(qs.order_by("-created_at"), many=True, context={"request": request})
        return Response(ser.data)


class AdminDocumentVerifyView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        if request.user.role != User.Role.ADMIN:
            return Response({"error": "Admin privileges required."}, status=status.HTTP_403_FORBIDDEN)
        try:
            doc = EmployeeDocument.objects.get(pk=pk)
        except EmployeeDocument.DoesNotExist:
            return Response({"error": "Document not found."}, status=status.HTTP_404_NOT_FOUND)

        decision = request.data.get("decision", "").upper()
        notes = request.data.get("notes", "").strip()

        if decision not in [EmployeeDocument.Status.VERIFIED, EmployeeDocument.Status.REJECTED]:
            return Response({"error": "Decision must be VERIFIED or REJECTED."}, status=status.HTTP_400_BAD_REQUEST)

        doc.status = decision
        doc.verified_by = request.user
        doc.verified_at = timezone.now()
        doc.verification_notes = notes
        doc.save()

        ser = EmployeeDocumentSerializer(doc, context={"request": request})
        return Response({
            "message": f"Document has been {decision.lower()}.",
            "document": ser.data,
        })

    def delete(self, request, pk):
        if request.user.role != User.Role.ADMIN:
            return Response({"error": "Admin privileges required."}, status=status.HTTP_403_FORBIDDEN)
        try:
            doc = EmployeeDocument.objects.get(pk=pk)
            doc.delete()
            return Response({"message": "Document deleted successfully."})
        except EmployeeDocument.DoesNotExist:
            return Response({"error": "Document not found."}, status=status.HTTP_404_NOT_FOUND)


class AdminProfileChangeQueueView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        if request.user.role != User.Role.ADMIN:
            return Response({"error": "Admin privileges required."}, status=status.HTTP_403_FORBIDDEN)
        status_filter = request.query_params.get("status")
        qs = ProfileChangeRequest.objects.all().select_related("user", "reviewed_by")
        if status_filter:
            qs = qs.filter(status=status_filter.upper())
        ser = ProfileChangeRequestSerializer(qs.order_by("-created_at"), many=True)
        return Response(ser.data)


class AdminProfileChangeDecisionView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        if request.user.role != User.Role.ADMIN:
            return Response({"error": "Admin privileges required."}, status=status.HTTP_403_FORBIDDEN)
        try:
            pcr = ProfileChangeRequest.objects.select_related("user").get(pk=pk)
        except ProfileChangeRequest.DoesNotExist:
            return Response({"error": "Change request not found."}, status=status.HTTP_404_NOT_FOUND)

        decision = (request.data.get("decision") or request.data.get("status") or "").upper()
        notes = (request.data.get("notes") or request.data.get("comment") or "").strip()

        if decision not in [ProfileChangeRequest.Status.APPROVED, ProfileChangeRequest.Status.REJECTED]:
            return Response({"error": "Decision must be APPROVED or REJECTED."}, status=status.HTTP_400_BAD_REQUEST)

        if pcr.status != ProfileChangeRequest.Status.PENDING:
            return Response({"error": f"Request is already {pcr.status}."}, status=status.HTTP_400_BAD_REQUEST)

        pcr.status = decision
        pcr.reviewed_by = request.user
        pcr.reviewer_notes = notes
        pcr.reviewed_at = timezone.now()
        pcr.save()

        if decision == ProfileChangeRequest.Status.APPROVED:
            user = pcr.user
            profile, _ = EmployeeProfile.objects.get_or_create(user=user)
            if pcr.requested_phone:
                user.phone = pcr.requested_phone
                user.save(update_fields=["phone"])
            if pcr.requested_emergency_name:
                profile.emergency_contact_name = pcr.requested_emergency_name
            if pcr.requested_emergency_phone:
                profile.emergency_contact_phone = pcr.requested_emergency_phone
            if pcr.requested_emergency_relation:
                profile.emergency_contact_relation = pcr.requested_emergency_relation
            profile.save()

        ser = ProfileChangeRequestSerializer(pcr)
        return Response({
            "message": f"Profile change request has been {decision.lower()}.",
            "request": ser.data,
        })


class AdminAnnouncementManagementView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        if request.user.role != User.Role.ADMIN:
            return Response({"error": "Admin privileges required."}, status=status.HTTP_403_FORBIDDEN)
        announcements = Announcement.objects.all().order_by("-created_at")
        ser = AnnouncementSerializer(announcements, many=True, context={"request": request})
        return Response(ser.data)

    def post(self, request):
        if request.user.role != User.Role.ADMIN:
            return Response({"error": "Admin privileges required."}, status=status.HTTP_403_FORBIDDEN)

        title = request.data.get("title", "").strip()
        content = request.data.get("content", "").strip()
        priority = request.data.get("priority", "NORMAL").upper()
        category = request.data.get("category", "GENERAL").strip()

        if not title or not content:
            return Response({"error": "Title and content are required."}, status=status.HTTP_400_BAD_REQUEST)

        announcement = Announcement.objects.create(
            title=title,
            content=content,
            priority=priority,
            category=category or "GENERAL",
            published_by=request.user,
            is_active=True,
        )
        ser = AnnouncementSerializer(announcement, context={"request": request})
        return Response(ser.data, status=status.HTTP_201_CREATED)


class AdminAnnouncementDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def delete(self, request, pk):
        if request.user.role != User.Role.ADMIN:
            return Response({"error": "Admin privileges required."}, status=status.HTTP_403_FORBIDDEN)
        try:
            a = Announcement.objects.get(pk=pk)
            a.delete()
            return Response({"message": "Announcement deleted successfully."})
        except Announcement.DoesNotExist:
            return Response({"error": "Announcement not found."}, status=status.HTTP_404_NOT_FOUND)


class AdminLeaveTypeManagementView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        types = LeaveType.objects.all().order_by("code")
        ser = LeaveTypeSerializer(types, many=True)
        return Response(ser.data)

    def post(self, request):
        if request.user.role != User.Role.ADMIN:
            return Response({"error": "Admin privileges required."}, status=status.HTTP_403_FORBIDDEN)
        data = request.data
        code = data.get("code", "").strip().upper()
        name = data.get("name", "").strip()
        days = data.get("default_days_per_year", 12.0)
        desc = data.get("description", "").strip()

        if not code or not name:
            return Response({"error": "Code and name are required."}, status=status.HTTP_400_BAD_REQUEST)

        lt, created = LeaveType.objects.update_or_create(
            code=code,
            defaults={"name": name, "default_days_per_year": Decimal(str(days)), "description": desc}
        )
        ser = LeaveTypeSerializer(lt)
        return Response(ser.data, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)
