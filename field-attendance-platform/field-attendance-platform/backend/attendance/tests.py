"""
Expanded test suite covering:
- Auth / roles
- Privacy (user cannot read another user's data)
- Punch in/out rules (one active session)
- Interruption / resume events
- Batch location validation
- Admin endpoints
- CSV export
- Logout / token blacklisting
- Health endpoint
- Auto-close stale sessions command
- Batch location flushing with speed sanity check
"""
import io
from datetime import timedelta

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from django.utils import timezone
from PIL import Image
from rest_framework.test import APITestCase

from accounts.models import User
from attendance.models import AttendanceSession, Holiday
from locations.models import LocationRecord
from tracking.models import TrackingEvent


def png():
    buf = io.BytesIO()
    Image.new("RGB", (20, 20), "red").save(buf, "PNG")
    return SimpleUploadedFile("s.png", buf.getvalue(), content_type="image/png")


# ---------------------------------------------------------------------------
# Shared settings override to disable throttling + SSL redirect in tests
# ---------------------------------------------------------------------------
_test_settings = {
    "MEDIA_ROOT": "/tmp/fap-test-media",
    "SECURE_SSL_REDIRECT": False,
    "REST_FRAMEWORK": {
        "DEFAULT_AUTHENTICATION_CLASSES": ["rest_framework_simplejwt.authentication.JWTAuthentication"],
        "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.IsAuthenticated"],
        "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.PageNumberPagination",
        "PAGE_SIZE": 50,
        "DEFAULT_THROTTLE_CLASSES": [],
        "DEFAULT_THROTTLE_RATES": {},
    }
}


@override_settings(**_test_settings)
class AuthTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user("alice", password="x-Str0ng-pass")
        self.admin = User.objects.create_user("boss", password="x-Str0ng-pass", role="ADMIN")

    # --- Role protection --------------------------------------------------
    def test_admin_endpoints_forbidden_for_user(self):
        self.client.force_authenticate(self.user)
        self.assertEqual(self.client.get("/api/admin/summary/").status_code, 403)
        self.assertEqual(self.client.get("/api/admin/users/").status_code, 403)

    def test_register_cannot_choose_role(self):
        r = self.client.post("/api/auth/register/", {"username": "n", "password": "Zx9-long-pass!", "role": "ADMIN"})
        self.assertEqual(r.status_code, 201)
        self.assertEqual(User.objects.get(username="n").role, "USER")

    # --- Logout blacklists refresh token ----------------------------------
    def test_logout_blacklists_token(self):
        r = self.client.post("/api/auth/login/", {"username": "alice", "password": "x-Str0ng-pass"})
        self.assertEqual(r.status_code, 200)
        refresh = r.data["refresh"]

        # Logout
        self.client.force_authenticate(self.user)
        r2 = self.client.post("/api/auth/logout/", {"refresh": refresh}, format="json")
        self.assertEqual(r2.status_code, 200)

        # Attempt to refresh should now fail (token is blacklisted)
        r3 = self.client.post("/api/auth/refresh/", {"refresh": refresh}, format="json")
        self.assertIn(r3.status_code, [400, 401])

    # --- Health endpoint --------------------------------------------------
    def test_health_endpoint(self):
        r = self.client.get("/api/auth/health/")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["status"], "ok")


@override_settings(**_test_settings)
class FlowTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user("rahul", password="x-Str0ng-pass")
        self.admin = User.objects.create_user("boss", password="x-Str0ng-pass", role="ADMIN")

    def test_full_session_flow(self):
        self.client.force_authenticate(self.user)
        r = self.client.post("/api/attendance/punch-in/", {"selfie": png(), "latitude": 12.9, "longitude": 77.5}, format="multipart")
        self.assertEqual(r.status_code, 201)
        sid = r.data["id"]
        self.assertEqual(self.client.post("/api/attendance/punch-in/", {"selfie": png(), "latitude": 1, "longitude": 1}, format="multipart").status_code, 409)

        self.client.post("/api/tracking/events/", {"event_type": "LOCATION_UNAVAILABLE"}, format="json")
        self.client.post("/api/tracking/events/", {"event_type": "LOCATION_UNAVAILABLE"}, format="json")  # deduped
        self.assertEqual(TrackingEvent.objects.filter(event_type="LOCATION_UNAVAILABLE").count(), 1)
        self.client.post("/api/locations/", {"latitude": 12.91, "longitude": 77.51}, format="json")
        self.assertTrue(TrackingEvent.objects.filter(event_type="TRACKING_RESUMED").exists())

        self.assertEqual(self.client.get(f"/api/attendance/sessions/{sid}/selfie/").status_code, 200)
        self.client.force_authenticate(User.objects.create_user("other", password="x"))
        self.assertEqual(self.client.get(f"/api/attendance/sessions/{sid}/selfie/").status_code, 404)

        self.client.force_authenticate(self.user)
        r = self.client.post("/api/attendance/punch-out/", {}, format="json")
        self.assertEqual(r.data["status"], "COMPLETED")
        self.assertEqual(self.client.post("/api/locations/", {"latitude": 1, "longitude": 1}, format="json").status_code, 409)

    def test_field_visit_lifecycle_photos_and_export(self):
        self.client.force_authenticate(self.user)
        r_in = self.client.post("/api/attendance/punch-in/", {"selfie": png(), "latitude": 21.69, "longitude": 73.01}, format="multipart")
        self.assertEqual(r_in.status_code, 201)

        v_data = {
            "site_name": "GNFC Narmadanagar Substation",
            "project_name": "GNFC SCADA Modernization",
            "visit_type": "TECHNICAL_VERIFICATION",
            "location_name": "Bay 3 Switchyard",
            "latitude": 21.691,
            "longitude": 73.012,
            "notes": "Initial inspection of high-voltage PLC units",
        }
        r_v = self.client.post("/api/attendance/visits/", v_data, format="json")
        self.assertEqual(r_v.status_code, 201)
        vid = r_v.data["id"]

        r_p = self.client.post(
            f"/api/attendance/visits/{vid}/photos/",
            {"photo": png(), "caption": "PLC control panel snapshot", "latitude": 21.691, "longitude": 73.012},
            format="multipart",
        )
        self.assertEqual(r_p.status_code, 201)
        pid = r_p.data["id"]
        photo_url = r_p.data["photo_url"]
        self.assertTrue(photo_url.endswith(f"/api/attendance/visits/{vid}/photos/{pid}/"))

        r_img_owner = self.client.get(photo_url)
        self.assertEqual(r_img_owner.status_code, 200)

        other_user = User.objects.create_user("amit", password="x-Str0ng-pass")
        self.client.force_authenticate(other_user)
        self.assertEqual(self.client.get(photo_url).status_code, 404)

        self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.get(photo_url).status_code, 200)

        self.client.force_authenticate(self.user)
        r_complete = self.client.patch(
            f"/api/attendance/visits/{vid}/",
            {
                "status": "COMPLETED",
                "outcome": "SATISFACTORY",
                "outcome_notes": "All telemetry signals reporting within normal parameters.",
                "end_location_name": "Substation Exit Gate",
                "end_latitude": 21.692,
                "end_longitude": 73.013,
            },
            format="json",
        )
        self.assertEqual(r_complete.status_code, 200)
        self.assertEqual(r_complete.data["status"], "COMPLETED")
        self.assertEqual(r_complete.data["outcome"], "SATISFACTORY")
        self.assertIsNotNone(r_complete.data["end_time"])
        self.assertEqual(r_complete.data["photos_count"], 1)

        self.client.force_authenticate(other_user)
        self.assertEqual(self.client.get("/api/admin/visits/export-csv/").status_code, 403)

        self.client.force_authenticate(self.admin)
        r_admin_list = self.client.get("/api/admin/visits/?visit_type=TECHNICAL_VERIFICATION")
        self.assertEqual(r_admin_list.status_code, 200)
        visits_list = r_admin_list.data if isinstance(r_admin_list.data, list) else r_admin_list.data.get("results", [])
        self.assertGreaterEqual(len(visits_list), 1)

        r_csv = self.client.get("/api/admin/visits/export-csv/")
        self.assertEqual(r_csv.status_code, 200)
        self.assertEqual(r_csv["Content-Type"], "text/csv")
        csv_text = r_csv.content.decode("utf-8")
        self.assertIn("GNFC Narmadanagar Substation", csv_text)
        self.assertIn("Technical Verification", csv_text)

    def test_step5_3_admin_command_center(self):
        self.client.force_authenticate(self.user)
        r_in = self.client.post("/api/attendance/punch-in/", {"selfie": png(), "latitude": 21.70, "longitude": 73.02}, format="multipart")
        self.assertEqual(r_in.status_code, 201)

        v_res = self.client.post("/api/attendance/visits/", {
            "site_name": "GNFC Bharuch Plant Site A",
            "project_name": "Smart Water Metering",
            "visit_type": "SITE_INSPECTION",
            "location_name": "Gate 1 Sensor",
            "latitude": 21.701,
            "longitude": 73.021,
            "notes": "Verify wireless transmitter installation",
        }, format="json")
        self.assertEqual(v_res.status_code, 201)
        vid = v_res.data["id"]

        self.client.post(
            f"/api/attendance/visits/{vid}/photos/",
            {"photo": png(), "caption": "Flow meter antenna", "latitude": 21.701, "longitude": 73.021},
            format="multipart",
        )

        self.client.patch(f"/api/attendance/visits/{vid}/", {
            "status": "COMPLETED",
            "outcome": "SATISFACTORY",
            "outcome_notes": "All sensors operational and calibrated.",
            "end_location_name": "Control Room B",
            "end_latitude": 21.705,
            "end_longitude": 73.025,
        }, format="json")

        self.client.force_authenticate(self.user)
        self.assertEqual(self.client.get("/api/admin/visits/").status_code, 403)

        self.client.force_authenticate(self.admin)
        r_list = self.client.get("/api/admin/visits/")
        self.assertEqual(r_list.status_code, 200)
        self.assertIn("count", r_list.data)
        self.assertIn("results", r_list.data)

        r_csv = self.client.get("/api/admin/visits/export-csv/?search=Smart+Water")
        self.assertEqual(r_csv.status_code, 200)
        self.assertEqual(r_csv["Content-Type"], "text/csv")
        self.assertIn("GNFC Bharuch Plant Site A", r_csv.content.decode("utf-8"))


@override_settings(**_test_settings)
class BatchLocationTests(APITestCase):
    """Test the offline batch flush endpoint."""

    def setUp(self):
        self.user = User.objects.create_user("batchuser", password="x-Str0ng-pass")
        self.client.force_authenticate(self.user)

    def _punch_in(self):
        r = self.client.post(
            "/api/attendance/punch-in/",
            {"selfie": png(), "latitude": 21.0, "longitude": 73.0},
            format="multipart",
        )
        self.assertEqual(r.status_code, 201)
        return r.data["id"]

    def test_batch_accepts_valid_points(self):
        sid = self._punch_in()
        now = timezone.now()
        AttendanceSession.objects.filter(id=sid).update(punch_in_at=now - timedelta(minutes=10))
        points = [
            {"latitude": 21.001, "longitude": 73.001, "accuracy": 10, "client_ts": (now - timedelta(minutes=5)).isoformat()},
            {"latitude": 21.002, "longitude": 73.002, "accuracy": 10, "client_ts": (now - timedelta(minutes=4)).isoformat()},
            {"latitude": 21.003, "longitude": 73.003, "accuracy": 10, "client_ts": (now - timedelta(minutes=3)).isoformat()},
        ]
        r = self.client.post("/api/locations/batch/", {"points": points}, format="json")
        self.assertEqual(r.status_code, 201)
        self.assertEqual(r.data["accepted"], 3)
        self.assertEqual(r.data["rejected"], 0)

    def test_batch_rejects_impossible_speed(self):
        """Two points 1000 km apart in 1 second should be rejected."""
        sid = self._punch_in()
        now = timezone.now()
        AttendanceSession.objects.filter(id=sid).update(punch_in_at=now - timedelta(minutes=10))
        t1 = (now - timedelta(minutes=2)).isoformat()
        t2 = (now - timedelta(minutes=1, seconds=59)).isoformat()
        points = [
            {"latitude": 21.0, "longitude": 73.0, "client_ts": t1},
            {"latitude": 31.0, "longitude": 83.0, "client_ts": t2},  # ~1400 km in 1s
        ]
        r = self.client.post("/api/locations/batch/", {"points": points}, format="json")
        self.assertEqual(r.status_code, 201)
        self.assertEqual(r.data["accepted"], 1)
        self.assertEqual(r.data["rejected"], 1)

    def test_batch_rejects_invalid_coords(self):
        self._punch_in()
        now = timezone.now()
        points = [
            {"latitude": 999, "longitude": 73.0, "client_ts": now.isoformat()},  # bad lat
            {"latitude": 21.0, "longitude": -999, "client_ts": now.isoformat()},  # bad lng
        ]
        r = self.client.post("/api/locations/batch/", {"points": points}, format="json")
        self.assertEqual(r.status_code, 201)
        self.assertEqual(r.data["rejected"], 2)

    def test_batch_requires_active_session(self):
        r = self.client.post("/api/locations/batch/", {"points": []}, format="json")
        self.assertEqual(r.status_code, 409)

    def test_batch_resumes_tracking_on_paused_session(self):
        """If session was paused, batch flush should emit TRACKING_RESUMED."""
        self._punch_in()
        session = AttendanceSession.objects.get(user=self.user, status="ACTIVE")
        session.tracking_status = AttendanceSession.TrackingStatus.LOCATION_UNAVAILABLE
        session.save()

        now = timezone.now()
        r = self.client.post("/api/locations/batch/", {
            "points": [{"latitude": 21.0, "longitude": 73.0, "client_ts": now.isoformat()}]
        }, format="json")
        self.assertEqual(r.status_code, 201)
        self.assertTrue(TrackingEvent.objects.filter(
            user=self.user, event_type=TrackingEvent.Type.TRACKING_RESUMED
        ).exists())


@override_settings(**_test_settings)
class StaleSessionCommandTests(APITestCase):
    """Test the close_stale_sessions management command."""

    def setUp(self):
        self.user = User.objects.create_user("staleuser", password="x-Str0ng-pass")

    def _create_stale_session(self, hours_ago=10):
        """Create a session that hasn't had a location update in hours_ago hours."""
        buf = io.BytesIO()
        Image.new("RGB", (10, 10), "blue").save(buf, "PNG")
        buf.seek(0)
        from django.core.files.uploadedfile import InMemoryUploadedFile
        selfie = InMemoryUploadedFile(buf, "selfie", "selfie.png", "image/png", buf.getbuffer().nbytes, None)
        stale_time = timezone.now() - timedelta(hours=hours_ago)
        session = AttendanceSession.objects.create(
            user=self.user,
            selfie=selfie,
            status=AttendanceSession.Status.ACTIVE,
            tracking_status=AttendanceSession.TrackingStatus.ACTIVE,
            punch_in_at=stale_time - timedelta(hours=1),
            last_location_at=stale_time,
        )
        return session

    def test_close_stale_sessions_command(self):
        session = self._create_stale_session(hours_ago=10)
        self.assertEqual(session.status, AttendanceSession.Status.ACTIVE)

        from django.core.management import call_command
        call_command("close_stale_sessions", hours=8, verbosity=0)

        session.refresh_from_db()
        self.assertEqual(session.status, AttendanceSession.Status.COMPLETED)
        # Should have logged SESSION_COMPLETED with auto_closed reason
        event = TrackingEvent.objects.filter(session=session, event_type=TrackingEvent.Type.SESSION_COMPLETED).first()
        self.assertIsNotNone(event)
        self.assertEqual(event.metadata.get("reason"), "auto_closed")

    def test_dry_run_does_not_close(self):
        session = self._create_stale_session(hours_ago=10)

        from django.core.management import call_command
        call_command("close_stale_sessions", hours=8, dry_run=True, verbosity=0)

        session.refresh_from_db()
        self.assertEqual(session.status, AttendanceSession.Status.ACTIVE)  # unchanged

    def test_fresh_session_not_closed(self):
        """Session with recent location update should NOT be closed."""
        session = self._create_stale_session(hours_ago=1)  # only 1 hour stale

        from django.core.management import call_command
        call_command("close_stale_sessions", hours=8, verbosity=0)

        session.refresh_from_db()
        self.assertEqual(session.status, AttendanceSession.Status.ACTIVE)
