import io

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from PIL import Image
from rest_framework.test import APITestCase

from accounts.models import User
from tracking.models import TrackingEvent


def png():
    buf = io.BytesIO()
    Image.new("RGB", (20, 20), "red").save(buf, "PNG")
    return SimpleUploadedFile("s.png", buf.getvalue(), content_type="image/png")


@override_settings(MEDIA_ROOT="/tmp/fap-test-media", SECURE_SSL_REDIRECT=False,
                   REST_FRAMEWORK={**__import__("django.conf").conf.settings.REST_FRAMEWORK, "DEFAULT_THROTTLE_CLASSES": []})
class FlowTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user("rahul", password="x-Str0ng-pass")
        self.admin = User.objects.create_user("boss", password="x-Str0ng-pass", role="ADMIN")

    def test_admin_endpoints_forbidden_for_user(self):
        self.client.force_authenticate(self.user)
        self.assertEqual(self.client.get("/api/admin/summary/").status_code, 403)
        self.assertEqual(self.client.get("/api/admin/users/").status_code, 403)

    def test_register_cannot_choose_role(self):
        r = self.client.post("/api/auth/register/", {"username": "n", "password": "Zx9-long-pass!", "role": "ADMIN"})
        self.assertEqual(r.status_code, 201)
        self.assertEqual(User.objects.get(username="n").role, "USER")

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
        # Punch in first
        r_in = self.client.post("/api/attendance/punch-in/", {"selfie": png(), "latitude": 21.69, "longitude": 73.01}, format="multipart")
        self.assertEqual(r_in.status_code, 201)

        # 1. Create Field Visit with inspection parameters
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
        self.assertEqual(r_v.data["site_name"], "GNFC Narmadanagar Substation")
        self.assertEqual(r_v.data["project_name"], "GNFC SCADA Modernization")
        self.assertEqual(r_v.data["visit_type"], "TECHNICAL_VERIFICATION")
        self.assertEqual(r_v.data["status"], "IN_PROGRESS")
        self.assertEqual(r_v.data["outcome"], "PENDING")

        # 2. Upload Evidence Photo
        r_p = self.client.post(
            f"/api/attendance/visits/{vid}/photos/",
            {"photo": png(), "caption": "PLC control panel snapshot", "latitude": 21.691, "longitude": 73.012},
            format="multipart",
        )
        self.assertEqual(r_p.status_code, 201)
        pid = r_p.data["id"]
        photo_url = r_p.data["photo_url"]
        self.assertTrue(photo_url.endswith(f"/api/attendance/visits/{vid}/photos/{pid}/"))

        # 3. Retrieve Photo with permissions check
        r_img_owner = self.client.get(photo_url)
        self.assertEqual(r_img_owner.status_code, 200)

        # Unauthorized user
        other_user = User.objects.create_user("amit", password="x-Str0ng-pass")
        self.client.force_authenticate(other_user)
        self.assertEqual(self.client.get(photo_url).status_code, 404)

        # Admin user
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.get(photo_url).status_code, 200)

        # 4. Complete Field Visit with outcome
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
        self.assertEqual(r_complete.data["outcome_notes"], "All telemetry signals reporting within normal parameters.")
        self.assertIsNotNone(r_complete.data["end_time"])
        self.assertEqual(r_complete.data["photos_count"], 1)

        # 5. Admin filtering and CSV export
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
        self.assertIn("GNFC SCADA Modernization", csv_text)
        self.assertIn("Technical Verification", csv_text)

    def test_step5_3_admin_command_center(self):
        # 1. Setup user with profile and a completed visit
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

        # Upload photo
        self.client.post(
            f"/api/attendance/visits/{vid}/photos/",
            {"photo": png(), "caption": "Flow meter antenna", "latitude": 21.701, "longitude": 73.021},
            format="multipart",
        )

        # Complete visit
        self.client.patch(f"/api/attendance/visits/{vid}/", {
            "status": "COMPLETED",
            "outcome": "SATISFACTORY",
            "outcome_notes": "All sensors operational and calibrated.",
            "end_location_name": "Control Room B",
            "end_latitude": 21.705,
            "end_longitude": 73.025,
        }, format="json")

        # 2. Security: normal employee denied from admin endpoints
        self.client.force_authenticate(self.user)
        self.assertEqual(self.client.get("/api/admin/visits/").status_code, 403)
        self.assertEqual(self.client.get(f"/api/admin/visits/{vid}/").status_code, 403)
        self.assertEqual(self.client.get("/api/admin/visits/export-csv/").status_code, 403)

        # 3. Admin: list with pagination
        self.client.force_authenticate(self.admin)
        r_list = self.client.get("/api/admin/visits/")
        self.assertEqual(r_list.status_code, 200)
        self.assertIn("count", r_list.data)
        self.assertIn("results", r_list.data)
        self.assertGreaterEqual(r_list.data["count"], 1)

        # 4. Admin search
        r_search_hit = self.client.get("/api/admin/visits/?search=Smart+Water")
        self.assertEqual(r_search_hit.status_code, 200)
        self.assertGreaterEqual(len(r_search_hit.data["results"]), 1)

        r_search_id = self.client.get(f"/api/admin/visits/?search=VIS-{vid}")
        self.assertEqual(r_search_id.status_code, 200)
        self.assertGreaterEqual(len(r_search_id.data["results"]), 1)

        r_search_miss = self.client.get("/api/admin/visits/?search=NonExistentSite999")
        self.assertEqual(r_search_miss.status_code, 200)
        self.assertEqual(len(r_search_miss.data["results"]), 0)

        # 5. Admin filters
        r_filt_cat = self.client.get("/api/admin/visits/?category=SITE_INSPECTION")
        self.assertEqual(r_filt_cat.status_code, 200)
        self.assertGreaterEqual(len(r_filt_cat.data["results"]), 1)

        r_filt_status = self.client.get("/api/admin/visits/?status=COMPLETED")
        self.assertEqual(r_filt_status.status_code, 200)
        self.assertGreaterEqual(len(r_filt_status.data["results"]), 1)

        r_filt_outcome = self.client.get("/api/admin/visits/?outcome=SATISFACTORY")
        self.assertEqual(r_filt_outcome.status_code, 200)
        self.assertGreaterEqual(len(r_filt_outcome.data["results"]), 1)

        # 6. Admin Visit Detail / Dossier
        r_detail = self.client.get(f"/api/admin/visits/{vid}/")
        self.assertEqual(r_detail.status_code, 200)
        self.assertIn("visit", r_detail.data)
        self.assertIn("events", r_detail.data)
        self.assertIn("employee", r_detail.data)
        self.assertEqual(r_detail.data["visit"]["id"], vid)
        self.assertEqual(r_detail.data["visit"]["site_name"], "GNFC Bharuch Plant Site A")
        self.assertEqual(r_detail.data["employee"]["name"], "rahul")
        self.assertGreaterEqual(len(r_detail.data["visit"]["photos"]), 1)
        self.assertGreaterEqual(len(r_detail.data["events"]), 1)

        # 7. Admin CSV export respecting filters
        r_csv = self.client.get("/api/admin/visits/export-csv/?search=Smart+Water")
        self.assertEqual(r_csv.status_code, 200)
        self.assertEqual(r_csv["Content-Type"], "text/csv")
        csv_body = r_csv.content.decode("utf-8")
        self.assertIn("GNFC Bharuch Plant Site A", csv_body)
        self.assertIn("Smart Water Metering", csv_body)
        self.assertIn("Gate 1 Sensor", csv_body)


