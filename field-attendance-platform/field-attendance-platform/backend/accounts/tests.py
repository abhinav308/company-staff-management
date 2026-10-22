import datetime
from decimal import Decimal
from django.core.files.uploadedfile import SimpleUploadedFile
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import (
    Announcement,
    AnnouncementRead,
    EmployeeDocument,
    EmployeeProfile,
    Note,
    ProfileChangeRequest,
    User,
)
from attendance.models import AttendanceSession, Holiday, LeaveBalance, LeaveRequest, LeaveType


class SelfServiceHubTests(APITestCase):
    def setUp(self):
        # Admin
        self.admin = User.objects.create_superuser(
            username="admin_test", email="admin@test.com", password="Password123!", role=User.Role.ADMIN
        )
        # Officers
        self.officer1 = User.objects.create_user(
            username="officer1", email="officer1@test.com", password="Password123!", role=User.Role.USER
        )
        self.profile1, _ = EmployeeProfile.objects.get_or_create(user=self.officer1)
        self.profile1.employee_id = "OFF001"
        self.profile1.reporting_manager = self.admin
        self.profile1.save()

        self.officer2 = User.objects.create_user(
            username="officer2", email="officer2@test.com", password="Password123!", role=User.Role.USER
        )
        self.profile2, _ = EmployeeProfile.objects.get_or_create(user=self.officer2)
        self.profile2.employee_id = "OFF002"
        self.profile2.reporting_manager = self.admin
        self.profile2.save()

        # Leave Types
        self.casual_lt, _ = LeaveType.objects.get_or_create(
            code="CASUAL",
            defaults={"name": "Casual Leave", "default_days_per_year": Decimal("12.0")}
        )
        self.sick_lt, _ = LeaveType.objects.get_or_create(
            code="SICK",
            defaults={"name": "Sick Leave", "default_days_per_year": Decimal("10.0")}
        )

        # Leave Balance for officer1
        self.balance1, _ = LeaveBalance.objects.get_or_create(
            user=self.officer1,
            leave_type=self.casual_lt,
            year=timezone.now().year,
            defaults={"total_days": Decimal("12.0"), "used_days": Decimal("2.0")}
        )

    def test_profile_view_and_contact_change_request(self):
        """Employee can read their profile and editing phone creates a PENDING ProfileChangeRequest."""
        self.client.force_authenticate(user=self.officer1)
        res = self.client.get("/api/me/profile/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["profile"]["employee_id"], "OFF001")

        # Edit phone
        patch_res = self.client.patch("/api/me/profile/", {
            "phone": "+91 99999 88888",
            "emergency_contact_name": "Emergency Person",
            "reason": "Updated mobile number",
        })
        self.assertEqual(patch_res.status_code, status.HTTP_201_CREATED)
        self.assertTrue(ProfileChangeRequest.objects.filter(user=self.officer1, status="PENDING").exists())

    def test_leave_application_balance_validation_and_approval(self):
        """Apply for leave -> check balance -> manager approves -> balance updates."""
        self.client.force_authenticate(user=self.officer1)
        today = timezone.now().date()
        start_date = today + datetime.timedelta(days=5)
        end_date = today + datetime.timedelta(days=6)

        # 1. Apply for 2 days leave
        res = self.client.post("/api/me/leaves/", {
            "leave_type": "CASUAL",
            "start_date": start_date.isoformat(),
            "end_date": end_date.isoformat(),
            "reason": "Personal medical appointment",
        })
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        leave_id = res.data["id"]

        # 2. Prevent overlapping leave
        overlap_res = self.client.post("/api/me/leaves/", {
            "leave_type": "CASUAL",
            "start_date": start_date.isoformat(),
            "end_date": end_date.isoformat(),
            "reason": "Duplicate attempt",
        })
        self.assertEqual(overlap_res.status_code, status.HTTP_400_BAD_REQUEST)

        # 3. Manager/Admin approves leave
        self.client.force_authenticate(user=self.admin)
        dec_res = self.client.post(f"/api/admin/leaves/{leave_id}/decision/", {
            "decision": "APPROVED",
            "comment": "Approved by manager",
        })
        self.assertEqual(dec_res.status_code, status.HTTP_200_OK)

        # 4. Check balance deducted
        self.balance1.refresh_from_db()
        self.assertEqual(self.balance1.used_days, Decimal("4.0"))  # 2.0 initial + 2.0 approved

    def test_cross_user_isolation_security(self):
        """Crucial security test: officer2 cannot read/download officer1's documents, notes, or cancel their leave."""
        # Create document for officer1
        dummy_file = SimpleUploadedFile("confidential.pdf", b"%PDF-1.4 Private Info", content_type="application/pdf")
        doc1 = EmployeeDocument.objects.create(
            user=self.officer1,
            title="Private ID Card",
            file=dummy_file,
            file_size=len(b"%PDF-1.4 Private Info"),
            file_type="application/pdf",
            status=EmployeeDocument.Status.VERIFIED,
            uploaded_by=self.officer1,
        )

        # Create note for officer1
        note1 = Note.objects.create(user=self.officer1, title="Confidential Note", content="Secret passwords")

        # Create pending leave for officer1
        today = timezone.now().date()
        leave1 = LeaveRequest.objects.create(
            user=self.officer1,
            leave_type="CASUAL",
            start_date=today + datetime.timedelta(days=20),
            end_date=today + datetime.timedelta(days=21),
            reason="Private leave",
            status=LeaveRequest.Status.PENDING,
        )

        # Authenticate as officer2
        self.client.force_authenticate(user=self.officer2)

        # Attempt to download officer1's document -> MUST BE 403 Forbidden
        doc_res = self.client.get(f"/api/documents/{doc1.id}/download/")
        self.assertEqual(doc_res.status_code, status.HTTP_403_FORBIDDEN)

        # Attempt to read officer1's note -> MUST BE 404 Not Found
        note_res = self.client.get(f"/api/me/notes/{note1.id}/")
        self.assertEqual(note_res.status_code, status.HTTP_404_NOT_FOUND)

        # Attempt to cancel officer1's leave -> MUST BE 404 Not Found
        cancel_res = self.client.delete(f"/api/me/leaves/{leave1.id}/")
        self.assertEqual(cancel_res.status_code, status.HTTP_404_NOT_FOUND)

    def test_holiday_list_upcoming_highlight(self):
        """Holiday list highlights next upcoming holiday."""
        today = timezone.now().date()
        Holiday.objects.create(name="Past Holiday", date=today - datetime.timedelta(days=5), holiday_type="NATIONAL")
        next_h = Holiday.objects.create(name="Next Upcoming", date=today + datetime.timedelta(days=5), holiday_type="NATIONAL")
        Holiday.objects.create(name="Future Holiday", date=today + datetime.timedelta(days=25), holiday_type="STATE")

        self.client.force_authenticate(user=self.officer1)
        res = self.client.get("/api/me/holidays/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        items = {h["name"]: h["is_next_upcoming"] for h in res.data}
        self.assertTrue(items["Next Upcoming"])
        self.assertFalse(items["Past Holiday"])

    def test_announcements_unread_count_and_mark_read(self):
        """Announcements compute unread_count and mark as read."""
        a1 = Announcement.objects.create(title="A1", content="Content 1", priority="NORMAL", is_active=True)
        a2 = Announcement.objects.create(title="A2", content="Content 2", priority="IMPORTANT", is_active=True)

        self.client.force_authenticate(user=self.officer1)
        res = self.client.get("/api/me/announcements/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["unread_count"], 2)

        # Mark a1 as read
        self.client.post(f"/api/me/announcements/{a1.id}/read/")

        res2 = self.client.get("/api/me/announcements/")
        self.assertEqual(res2.data["unread_count"], 1)
