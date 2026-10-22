import datetime
from decimal import Decimal
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import RefreshToken

from attendance.models import AttendanceSession, UserConsent
from locations.models import LocationRecord
from tracking.models import TrackingEvent

User = get_user_model()


class BatchLocationCreateViewTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="testofficer",
            password="Password@123",
            role=User.Role.USER,
            first_name="Test",
            last_name="Officer",
        )
        self.other_user = User.objects.create_user(
            username="otherofficer",
            password="Password@123",
            role=User.Role.USER,
        )
        refresh = RefreshToken.for_user(self.user)
        self.token = str(refresh.access_token)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {self.token}")

        UserConsent.objects.create(user=self.user, policy_version="1.0")

    def test_batch_upload_without_active_session_returns_409(self):
        payload = {
            "points": [
                {"latitude": 23.0225, "longitude": 72.5714, "accuracy": 10.0, "client_ts": timezone.now().isoformat()}
            ]
        }
        resp = self.client.post("/api/locations/batch/", payload, format="json")
        self.assertEqual(resp.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(resp.data["detail"], "No active session.")

    def test_batch_upload_with_active_session_success(self):
        now = timezone.now()
        # Create active session
        dummy_selfie = SimpleUploadedFile("selfie.jpg", b"dummy image data", content_type="image/jpeg")
        session = AttendanceSession.objects.create(
            user=self.user,
            selfie=dummy_selfie,
            punch_in_at=now - datetime.timedelta(minutes=30),
            status=AttendanceSession.Status.ACTIVE,
            tracking_status=AttendanceSession.TrackingStatus.ACTIVE,
            last_latitude=23.0225,
            last_longitude=72.5714,
            last_location_at=now - datetime.timedelta(minutes=30),
        )

        ts1 = (now - datetime.timedelta(minutes=20)).isoformat()
        ts2 = (now - datetime.timedelta(minutes=10)).isoformat()

        payload = {
            "points": [
                {"latitude": 23.0230, "longitude": 72.5720, "accuracy": 8.5, "client_ts": ts1},
                {"latitude": 23.0240, "longitude": 72.5730, "accuracy": 6.2, "client_ts": ts2},
            ]
        }
        resp = self.client.post("/api/locations/batch/", payload, format="json")
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resp.data["accepted"], 2)
        self.assertEqual(resp.data["rejected"], 0)

        # Check records created
        records = LocationRecord.objects.filter(session=session).order_by("timestamp")
        self.assertEqual(records.count(), 2)
        self.assertAlmostEqual(records[0].latitude, 23.0230, places=4)
        self.assertAlmostEqual(records[1].latitude, 23.0240, places=4)

        # Session updated with latest point
        session.refresh_from_db()
        self.assertAlmostEqual(session.last_latitude, 23.0240, places=4)

    def test_batch_upload_filters_invalid_and_future_points(self):
        now = timezone.now()
        dummy_selfie = SimpleUploadedFile("selfie.jpg", b"dummy image data", content_type="image/jpeg")
        session = AttendanceSession.objects.create(
            user=self.user,
            selfie=dummy_selfie,
            punch_in_at=now - datetime.timedelta(minutes=15),
            status=AttendanceSession.Status.ACTIVE,
            tracking_status=AttendanceSession.TrackingStatus.PAUSED,
        )

        valid_ts = (now - datetime.timedelta(minutes=5)).isoformat()

        payload = {
            "points": [
                # Invalid latitude
                {"latitude": 95.0, "longitude": 72.5720, "accuracy": 5.0, "client_ts": valid_ts},
                # Valid point
                {"latitude": 23.0230, "longitude": 72.5720, "accuracy": 5.0, "client_ts": valid_ts},
                # Malformed point
                {"latitude": "not-a-number", "longitude": 72.5720, "client_ts": valid_ts},
            ]
        }
        resp = self.client.post("/api/locations/batch/", payload, format="json")
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resp.data["accepted"], 1)
        self.assertEqual(resp.data["rejected"], 2)

        # Verify tracking resumed event logged and status updated
        session.refresh_from_db()
        self.assertEqual(session.tracking_status, AttendanceSession.TrackingStatus.ACTIVE)
        resumed_event = TrackingEvent.objects.filter(
            session=session, event_type=TrackingEvent.Type.TRACKING_RESUMED
        ).first()
        self.assertIsNotNone(resumed_event)
