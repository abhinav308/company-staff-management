import calendar
import datetime
from decimal import Decimal
import io
import mimetypes
from PIL import Image

from django.conf import settings
from django.contrib.auth import password_validation
from django.db.models import Q, Sum
from django.http import FileResponse, Http404
from django.utils import timezone
from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import (
    Announcement,
    AnnouncementRead,
    EmployeeDocument,
    EmployeeProfile,
    Note,
    ProfileChangeRequest,
    User,
)
from accounts.serializers import (
    AnnouncementSerializer,
    EmployeeDocumentSerializer,
    EmployeeProfileSerializer,
    NoteSerializer,
    ProfileChangeRequestSerializer,
    UserSerializer,
)
from attendance.models import AttendanceSession, Holiday, LeaveBalance, LeaveRequest, LeaveType
from attendance.serializers import (
    HolidaySerializer,
    LeaveBalanceSerializer,
    LeaveRequestSerializer,
    LeaveTypeSerializer,
)


class MyProfileView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        user = request.user
        profile, _ = EmployeeProfile.objects.get_or_create(user=user)
        user_ser = UserSerializer(user, context={"request": request})
        profile_ser = EmployeeProfileSerializer(profile, context={"request": request})
        
        pending_changes = ProfileChangeRequest.objects.filter(user=user, status=ProfileChangeRequest.Status.PENDING).first()
        pending_ser = ProfileChangeRequestSerializer(pending_changes).data if pending_changes else None

        return Response({
            "user": user_ser.data,
            "profile": profile_ser.data,
            "pending_change_request": pending_ser,
        })

    def patch(self, request):
        user = request.user
        profile, _ = EmployeeProfile.objects.get_or_create(user=user)
        
        req_phone = request.data.get("phone", "").strip()
        req_em_name = request.data.get("emergency_contact_name", "").strip()
        req_em_phone = request.data.get("emergency_contact_phone", "").strip()
        req_em_rel = request.data.get("emergency_contact_relation", "").strip()
        reason = request.data.get("reason", "").strip()

        # Check if fields are actually different
        has_changes = (
            (req_phone and req_phone != user.phone) or
            (req_em_name and req_em_name != profile.emergency_contact_name) or
            (req_em_phone and req_em_phone != profile.emergency_contact_phone) or
            (req_em_rel and req_em_rel != profile.emergency_contact_relation)
        )

        if not has_changes:
            return Response({"message": "No changes detected in contact details."}, status=status.HTTP_200_OK)

        # If user is Admin, auto-apply changes immediately
        if user.role == User.Role.ADMIN:
            if req_phone:
                user.phone = req_phone
                user.save(update_fields=["phone"])
            if req_em_name:
                profile.emergency_contact_name = req_em_name
            if req_em_phone:
                profile.emergency_contact_phone = req_em_phone
            if req_em_rel:
                profile.emergency_contact_relation = req_em_rel
            profile.save()
            return Response({"message": "Profile updated immediately (Administrator privilege)."}, status=status.HTTP_200_OK)

        # For Field Officers: submit a change request for HR / Admin approval
        # Cancel any previous pending request
        ProfileChangeRequest.objects.filter(user=user, status=ProfileChangeRequest.Status.PENDING).update(
            status=ProfileChangeRequest.Status.REJECTED,
            reviewer_notes="Superseded by newer request."
        )

        pcr = ProfileChangeRequest.objects.create(
            user=user,
            requested_phone=req_phone or user.phone,
            requested_emergency_name=req_em_name or profile.emergency_contact_name,
            requested_emergency_phone=req_em_phone or profile.emergency_contact_phone,
            requested_emergency_relation=req_em_rel or profile.emergency_contact_relation,
            reason=reason or "Officer requested contact detail update.",
            status=ProfileChangeRequest.Status.PENDING,
        )

        return Response({
            "message": "Contact update request submitted for HR approval.",
            "request_id": pcr.id,
            "status": "PENDING",
        }, status=status.HTTP_201_CREATED)


class MyProfilePhotoUploadView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        user = request.user
        photo_file = request.FILES.get("photo")
        if not photo_file:
            return Response({"error": "No image file provided."}, status=status.HTTP_400_BAD_REQUEST)

        # Max 5MB
        if photo_file.size > 5 * 1024 * 1024:
            return Response({"error": "Photo file must be 5 MB or smaller."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            img = Image.open(photo_file)
            if img.format not in ["JPEG", "PNG", "WEBP"]:
                return Response({"error": "Unsupported image format. Please upload JPEG, PNG, or WebP."}, status=status.HTTP_400_BAD_REQUEST)

            # Square crop
            width, height = img.size
            min_dim = min(width, height)
            left = (width - min_dim) / 2
            top = (height - min_dim) / 2
            right = (width + min_dim) / 2
            bottom = (height + min_dim) / 2
            img = img.crop((left, top, right, bottom))

            # Resize to max 512x512
            if min_dim > 512:
                img = img.resize((512, 512), Image.Resampling.LANCZOS)

            # Convert to RGB if needed (e.g. RGBA png)
            if img.mode in ("RGBA", "P"):
                img = img.convert("RGB")

            buf = io.BytesIO()
            img.save(buf, format="JPEG", quality=85, optimize=True)
            buf.seek(0)

            profile, _ = EmployeeProfile.objects.get_or_create(user=user)
            filename = f"user_{user.id}_avatar_{int(timezone.now().timestamp())}.jpg"
            profile.photo.save(filename, buf, save=True)

            photo_url = request.build_absolute_uri(profile.photo.url)
            return Response({
                "message": "Profile photo updated successfully.",
                "photo_url": photo_url,
            }, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({"error": f"Failed to process photo: {str(e)}"}, status=status.HTTP_400_BAD_REQUEST)


class MyStatsView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        user = request.user
        now = timezone.now()
        cur_year = now.year
        cur_month = now.month

        # Days present this month
        sessions = AttendanceSession.objects.filter(
            user=user,
            punch_in_at__year=cur_year,
            punch_in_at__month=cur_month,
        )
        present_dates = set(sessions.values_list("punch_in_at__date", flat=True))
        days_present = len(present_dates)

        # Leave balance available
        balances = LeaveBalance.objects.filter(user=user, year=cur_year)
        # Auto init if empty
        if not balances.exists():
            for lt in LeaveType.objects.filter(is_active=True):
                LeaveBalance.objects.get_or_create(
                    user=user,
                    leave_type=lt,
                    year=cur_year,
                    defaults={"total_days": lt.default_days_per_year, "used_days": Decimal("0.0")}
                )
            balances = LeaveBalance.objects.filter(user=user, year=cur_year)

        leave_balance_total = sum(float(b.available_days) for b in balances)

        # Last punch
        last_session = AttendanceSession.objects.filter(user=user).order_by("-punch_in_at").first()
        last_punch = None
        if last_session:
            last_punch = {
                "punch_in_at": last_session.punch_in_at.isoformat(),
                "punch_out_at": last_session.punch_out_at.isoformat() if last_session.punch_out_at else None,
                "status": last_session.status,
                "tracking_status": last_session.tracking_status,
                "duration_seconds": last_session.duration_seconds,
            }

        return Response({
            "days_present_month": days_present,
            "leave_balance_total": round(leave_balance_total, 1),
            "last_punch": last_punch,
        })


class AttendanceCalendarView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        user = request.user
        month_param = request.query_params.get("month")
        now = timezone.now().date()

        if month_param:
            try:
                parts = month_param.split("-")
                year, month = int(parts[0]), int(parts[1])
            except (ValueError, IndexError):
                year, month = now.year, now.month
        else:
            year, month = now.year, now.month

        _, num_days = calendar.monthrange(year, month)

        # Pre-fetch monthly data
        start_date = datetime.date(year, month, 1)
        end_date = datetime.date(year, month, num_days)

        holidays_map = {
            h.date: h for h in Holiday.objects.filter(date__range=(start_date, end_date))
        }

        approved_leaves = LeaveRequest.objects.filter(
            user=user,
            status=LeaveRequest.Status.APPROVED,
            start_date__lte=end_date,
            end_date__gte=start_date,
        )

        sessions_map = {}
        for s in AttendanceSession.objects.filter(user=user, punch_in_at__date__range=(start_date, end_date)):
            s_date = s.punch_in_at.date()
            if s_date not in sessions_map or s.status == AttendanceSession.Status.ACTIVE:
                sessions_map[s_date] = s

        days_data = []
        present_count = 0
        absent_count = 0
        leave_count = 0
        holiday_count = 0
        weekly_off_count = 0
        total_seconds = 0

        for day in range(1, num_days + 1):
            d = datetime.date(year, month, day)
            day_name = d.strftime("%A")
            is_sunday = d.weekday() == 6
            is_today = (d == now)
            is_past = (d < now)
            is_future = (d > now)

            # Check Holiday
            holiday_obj = holidays_map.get(d)
            # Check Leave
            matching_leave = next((l for l in approved_leaves if l.start_date <= d <= l.end_date), None)
            # Check Session
            session_obj = sessions_map.get(d)

            day_status = "SCHEDULED"
            session_info = None

            if session_obj:
                day_status = "PRESENT"
                present_count += 1
                total_seconds += session_obj.duration_seconds
                session_info = {
                    "id": session_obj.id,
                    "punch_in_at": session_obj.punch_in_at.isoformat(),
                    "punch_out_at": session_obj.punch_out_at.isoformat() if session_obj.punch_out_at else None,
                    "duration_seconds": session_obj.duration_seconds,
                    "tracking_status": session_obj.tracking_status,
                    "status": session_obj.status,
                    "interruptions_count": session_obj.events.filter(event_type__in=["LOCATION_UNAVAILABLE", "LOCATION_PERMISSION_DENIED"]).count() if hasattr(session_obj, "events") else 0
                }
            elif matching_leave:
                day_status = "LEAVE"
                leave_count += 1
            elif holiday_obj:
                day_status = "HOLIDAY"
                holiday_count += 1
            elif is_sunday:
                day_status = "WEEKLY_OFF"
                weekly_off_count += 1
            elif is_past:
                day_status = "ABSENT"
                absent_count += 1
            elif is_today:
                day_status = "PENDING_DUTY"
            else:
                day_status = "UPCOMING"

            days_data.append({
                "date": d.isoformat(),
                "day": day,
                "day_name": day_name,
                "day_name_short": day_name[:3],
                "status": day_status,
                "is_today": is_today,
                "is_past": is_past,
                "is_future": is_future,
                "holiday": {
                    "name": holiday_obj.name,
                    "type": holiday_obj.holiday_type,
                } if holiday_obj else None,
                "leave": {
                    "type": matching_leave.leave_type_ref.name if matching_leave.leave_type_ref else matching_leave.leave_type,
                    "is_half_day": matching_leave.is_half_day,
                } if matching_leave else None,
                "session": session_info,
            })

        total_hours = total_seconds // 3600
        total_mins = (total_seconds % 3600) // 60

        return Response({
            "year": year,
            "month": month,
            "month_name": calendar.month_name[month],
            "days": days_data,
            "summary": {
                "total_days": num_days,
                "present_days": present_count,
                "absent_days": absent_count,
                "leave_days": leave_count,
                "holiday_days": holiday_count,
                "weekly_off_days": weekly_off_count,
                "total_hours": f"{total_hours}h {total_mins}m",
                "total_seconds": total_seconds,
            }
        })


class MyLeaveListView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        user = request.user
        status_filter = request.query_params.get("status")
        qs = LeaveRequest.objects.filter(user=user)
        if status_filter:
            qs = qs.filter(status=status_filter.upper())
        ser = LeaveRequestSerializer(qs.order_by("-created_at"), many=True, context={"request": request})
        return Response(ser.data)

    def post(self, request):
        user = request.user
        data = request.data

        leave_type_code = data.get("leave_type")
        start_date_str = data.get("start_date")
        end_date_str = data.get("end_date")
        reason = data.get("reason", "").strip()
        is_half_day = str(data.get("is_half_day", "false")).lower() in ["true", "1"]
        half_day_period = data.get("half_day_period", "")
        attachment = request.FILES.get("attachment")

        if not leave_type_code:
            return Response({"error": "Leave type is required."}, status=status.HTTP_400_BAD_REQUEST)
        if not start_date_str:
            return Response({"error": "Start date is required."}, status=status.HTTP_400_BAD_REQUEST)
        if not reason:
            return Response({"error": "Reason for leave is required."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            start_date = datetime.date.fromisoformat(start_date_str)
            end_date = datetime.date.fromisoformat(end_date_str) if end_date_str else start_date
        except ValueError:
            return Response({"error": "Invalid date format. Use YYYY-MM-DD."}, status=status.HTTP_400_BAD_REQUEST)

        if end_date < start_date:
            return Response({"error": "End date cannot be earlier than start date."}, status=status.HTTP_400_BAD_REQUEST)

        # Validate past date (max 7 days in past allowed for retroactive sick leave)
        today = timezone.now().date()
        if start_date < today - datetime.timedelta(days=14):
            return Response({"error": "Cannot apply for leave more than 14 days in the past."}, status=status.HTTP_400_BAD_REQUEST)

        # Calculate days count
        if is_half_day:
            if start_date != end_date:
                return Response({"error": "Half-day leave must be for a single date."}, status=status.HTTP_400_BAD_REQUEST)
            days_count = Decimal("0.5")
        else:
            days_count = Decimal(str((end_date - start_date).days + 1))

        # Check overlapping existing requests
        overlap = LeaveRequest.objects.filter(
            user=user,
            status__in=[LeaveRequest.Status.PENDING, LeaveRequest.Status.APPROVED],
            start_date__lte=end_date,
            end_date__gte=start_date,
        ).exists()
        if overlap:
            return Response({
                "error": "You already have a pending or approved leave request overlapping this date range."
            }, status=status.HTTP_400_BAD_REQUEST)

        # Leave Type Lookup
        leave_type_obj = LeaveType.objects.filter(code__iexact=leave_type_code).first()
        if not leave_type_obj:
            leave_type_obj = LeaveType.objects.create(
                code=leave_type_code.upper(),
                name=f"{leave_type_code.title()} Leave",
                default_days_per_year=Decimal("12.0")
            )

        # Balance check
        balance, _ = LeaveBalance.objects.get_or_create(
            user=user,
            leave_type=leave_type_obj,
            year=start_date.year,
            defaults={"total_days": leave_type_obj.default_days_per_year, "used_days": Decimal("0.0")}
        )

        if balance.available_days < float(days_count):
            return Response({
                "error": f"Insufficient leave balance for {leave_type_obj.name}. Available: {balance.available_days} day(s), Requested: {days_count} day(s)."
            }, status=status.HTTP_400_BAD_REQUEST)

        # Validate attachment
        if attachment and attachment.size > 5 * 1024 * 1024:
            return Response({"error": "Attachment must be 5 MB or smaller."}, status=status.HTTP_400_BAD_REQUEST)

        leave_req = LeaveRequest.objects.create(
            user=user,
            leave_type_ref=leave_type_obj,
            leave_type=leave_type_obj.code,
            start_date=start_date,
            end_date=end_date,
            is_half_day=is_half_day,
            half_day_period=half_day_period if is_half_day else "",
            days_count=days_count,
            reason=reason,
            attachment=attachment,
            status=LeaveRequest.Status.PENDING,
        )

        ser = LeaveRequestSerializer(leave_req, context={"request": request})
        return Response(ser.data, status=status.HTTP_201_CREATED)


class MyLeaveCancelView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def delete(self, request, pk):
        user = request.user
        try:
            leave = LeaveRequest.objects.get(id=pk, user=user)
        except LeaveRequest.DoesNotExist:
            return Response({"error": "Leave request not found."}, status=status.HTTP_404_NOT_FOUND)

        if leave.status != LeaveRequest.Status.PENDING:
            return Response({"error": f"Cannot cancel leave request that is already {leave.status}."}, status=status.HTTP_400_BAD_REQUEST)

        leave.status = LeaveRequest.Status.CANCELLED
        leave.save(update_fields=["status", "updated_at"])
        return Response({"message": "Leave request cancelled successfully.", "id": leave.id})


class MyLeaveBalancesView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        user = request.user
        year = int(request.query_params.get("year", timezone.now().year))
        
        # Ensure default leave types exist
        default_types = [
            ("CASUAL", "Casual Leave", Decimal("12.0"), "For short-notice personal commitments"),
            ("SICK", "Sick Leave", Decimal("10.0"), "For illness and medical appointments"),
            ("EARNED", "Earned Leave", Decimal("18.0"), "Annual privilege leave accrued over time"),
        ]
        for code, name, days, desc in default_types:
            lt, _ = LeaveType.objects.get_or_create(
                code=code,
                defaults={"name": name, "default_days_per_year": days, "description": desc}
            )
            LeaveBalance.objects.get_or_create(
                user=user,
                leave_type=lt,
                year=year,
                defaults={"total_days": days, "used_days": Decimal("0.0")}
            )

        balances = LeaveBalance.objects.filter(user=user, year=year).select_related("leave_type")
        ser = LeaveBalanceSerializer(balances, many=True)
        return Response(ser.data)


class MyHolidaysView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        year = int(request.query_params.get("year", timezone.now().year))
        today = timezone.now().date()

        holidays = list(Holiday.objects.filter(date__year=year).order_by("date"))

        # Find next upcoming holiday
        next_upcoming_id = None
        for h in holidays:
            if h.date >= today:
                next_upcoming_id = h.id
                break

        for h in holidays:
            h.is_next_upcoming = (h.id == next_upcoming_id)

        ser = HolidaySerializer(holidays, many=True)
        return Response(ser.data)


class MyNotesViewSet(generics.ListCreateAPIView):
    serializer_class = NoteSerializer
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = None

    def get_queryset(self):
        qs = Note.objects.filter(user=self.request.user)
        query = self.request.query_params.get("q", "").strip()
        if query:
            qs = qs.filter(Q(title__icontains=query) | Q(content__icontains=query))
        return qs.order_by("-updated_at")

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


class MyNoteDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = NoteSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return Note.objects.filter(user=self.request.user)


class MyDocumentsView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        docs = EmployeeDocument.objects.filter(user=request.user).order_by("-created_at")
        ser = EmployeeDocumentSerializer(docs, many=True, context={"request": request})
        return Response(ser.data)

    def post(self, request):
        user = request.user
        uploaded_file = request.FILES.get("file")
        title = request.data.get("title", "").strip()
        doc_type = request.data.get("doc_type", "OTHER")

        if not uploaded_file:
            return Response({"error": "No file uploaded."}, status=status.HTTP_400_BAD_REQUEST)
        if not title:
            return Response({"error": "Document title is required."}, status=status.HTTP_400_BAD_REQUEST)

        # Max 5MB
        if uploaded_file.size > 5 * 1024 * 1024:
            return Response({"error": "File size exceeds 5 MB limit."}, status=status.HTTP_400_BAD_REQUEST)

        # Validate file type / extension
        ext = uploaded_file.name.split(".")[-1].lower() if "." in uploaded_file.name else ""
        allowed_exts = ["pdf", "jpg", "jpeg", "png"]
        if ext not in allowed_exts:
            return Response({"error": "Unsupported file type. Allowed: PDF, JPG, PNG."}, status=status.HTTP_400_BAD_REQUEST)

        mime_type, _ = mimetypes.guess_type(uploaded_file.name)
        mime_type = mime_type or uploaded_file.content_type or "application/octet-stream"

        doc = EmployeeDocument.objects.create(
            user=user,
            doc_type=doc_type,
            title=title,
            file=uploaded_file,
            file_size=uploaded_file.size,
            file_type=mime_type,
            uploaded_by=user,
            status=EmployeeDocument.Status.PENDING,
        )

        ser = EmployeeDocumentSerializer(doc, context={"request": request})
        return Response(ser.data, status=status.HTTP_201_CREATED)


class AuthenticatedDocumentDownloadView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, pk):
        try:
            doc = EmployeeDocument.objects.get(pk=pk)
        except EmployeeDocument.DoesNotExist:
            raise Http404("Document not found.")

        # Permission verification: owner, admin, or reporting manager
        user = request.user
        is_owner = (doc.user == user)
        is_admin = (user.role == User.Role.ADMIN)
        is_manager = False
        if hasattr(doc.user, "profile") and doc.user.profile.reporting_manager == user:
            is_manager = True

        if not (is_owner or is_admin or is_manager):
            return Response({"error": "You do not have permission to access this document."}, status=status.HTTP_403_FORBIDDEN)

        if not doc.file or not doc.file.storage.exists(doc.file.name):
            raise Http404("Document binary file not found on server.")

        response = FileResponse(doc.file.open("rb"), content_type=doc.file_type or "application/octet-stream")
        filename = doc.file.name.split("/")[-1]
        response["Content-Disposition"] = f'inline; filename="{filename}"'
        return response


class MyAnnouncementsView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        user = request.user
        announcements = Announcement.objects.filter(is_active=True).order_by("-created_at")
        
        unread_count = 0
        read_ids = set(AnnouncementRead.objects.filter(user=user).values_list("announcement_id", flat=True))

        items = []
        for a in announcements:
            is_read = a.id in read_ids
            if not is_read:
                unread_count += 1
            items.append({
                "id": a.id,
                "title": a.title,
                "content": a.content,
                "priority": a.priority,
                "priority_display": a.get_priority_display(),
                "category": a.category,
                "created_at": a.created_at.isoformat(),
                "is_read": is_read,
            })

        return Response({
            "announcements": items,
            "unread_count": unread_count,
        })


class MarkAnnouncementReadView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        try:
            announcement = Announcement.objects.get(pk=pk, is_active=True)
        except Announcement.DoesNotExist:
            return Response({"error": "Announcement not found."}, status=status.HTTP_404_NOT_FOUND)

        AnnouncementRead.objects.get_or_create(user=request.user, announcement=announcement)
        return Response({"message": "Announcement marked as read.", "id": announcement.id})


class ChangePasswordView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        user = request.user
        old_password = request.data.get("old_password", "")
        new_password = request.data.get("new_password", "")
        confirm_password = request.data.get("confirm_password", "")

        if not old_password or not new_password or not confirm_password:
            return Response({"error": "All password fields are required."}, status=status.HTTP_400_BAD_REQUEST)

        if not user.check_password(old_password):
            return Response({"error": "Current password does not match."}, status=status.HTTP_400_BAD_REQUEST)

        if new_password != confirm_password:
            return Response({"error": "New password and confirmation do not match."}, status=status.HTTP_400_BAD_REQUEST)

        if old_password == new_password:
            return Response({"error": "New password must be different from the current password."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            password_validation.validate_password(new_password, user)
        except Exception as e:
            return Response({"error": list(e.messages)}, status=status.HTTP_400_BAD_REQUEST)

        user.set_password(new_password)
        user.save()
        return Response({"message": "Password updated successfully. Please log in again with your new credentials."})
