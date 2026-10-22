"""
Management command: seed_demo

Creates:
  - 1 admin  (admin / Admin@12345)
  - 5 field officers with realistic completed sessions and routes
  - 1 session that has a LOCATION_UNAVAILABLE gap then TRACKING_RESUMED
  - 1 still-active session for live-map testing

Usage:
    python manage.py seed_demo
    python manage.py seed_demo --flush   # wipe demo users first
"""
import math
import random
from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from decimal import Decimal
from accounts.models import Announcement, EmployeeDocument, EmployeeProfile, Note, User
from attendance.models import AttendanceSession, Holiday, LeaveBalance, LeaveRequest, LeaveType
from locations.models import LocationRecord
from tracking.models import TrackingEvent
from tracking.services import log_event


# ---------------------------------------------------------------------------
# Utility helpers
# ---------------------------------------------------------------------------

def _rand_route(lat0, lng0, n_points=30, step_deg=0.0005):
    """Generate a wandering route starting from (lat0, lng0)."""
    pts = []
    lat, lng = lat0, lng0
    for _ in range(n_points):
        lat += random.uniform(-step_deg, step_deg)
        lng += random.uniform(-step_deg, step_deg)
        pts.append((lat, lng))
    return pts


def _make_selfie_stub():
    """Return a tiny in-memory PNG so we don't need actual uploads."""
    import io
    from PIL import Image
    from django.core.files.uploadedfile import InMemoryUploadedFile
    buf = io.BytesIO()
    Image.new("RGB", (10, 10), color=(30, 100, 200)).save(buf, format="PNG")
    buf.seek(0)
    return InMemoryUploadedFile(buf, "selfie", "selfie.png", "image/png", buf.getbuffer().nbytes, None)


def _create_session_with_route(user, punch_in_dt, punch_out_dt, route_pts, with_gap=False):
    """Create a completed AttendanceSession with locations and events."""
    from attendance.models import AttendanceSession as S

    selfie = _make_selfie_stub()
    session = S.objects.create(
        user=user,
        punch_in_at=punch_in_dt,
        punch_out_at=punch_out_dt,
        status=S.Status.COMPLETED,
        tracking_status=S.TrackingStatus.PUNCHED_OUT,
        selfie=selfie,
        last_latitude=route_pts[-1][0],
        last_longitude=route_pts[-1][1],
        last_location_at=punch_out_dt,
    )

    # Log start events
    for ev_type in (
        TrackingEvent.Type.PUNCH_IN,
        TrackingEvent.Type.SELFIE_UPLOADED,
        TrackingEvent.Type.LOCATION_PERMISSION_GRANTED,
        TrackingEvent.Type.TRACKING_STARTED,
    ):
        TrackingEvent.objects.create(user=user, session=session, event_type=ev_type, timestamp=punch_in_dt)

    # Create location records, injecting a gap if requested
    total = len(route_pts)
    gap_start = total // 3
    gap_end = total // 2

    interval = (punch_out_dt - punch_in_dt) / max(total, 1)
    gap_event_logged = False

    for i, (lat, lng) in enumerate(route_pts):
        ts = punch_in_dt + interval * i

        # Inject LOCATION_UNAVAILABLE gap in middle third
        if with_gap and i == gap_start and not gap_event_logged:
            TrackingEvent.objects.create(
                user=user, session=session,
                event_type=TrackingEvent.Type.LOCATION_UNAVAILABLE,
                timestamp=ts,
            )
            session.tracking_status = AttendanceSession.TrackingStatus.LOCATION_UNAVAILABLE
            gap_event_logged = True

        # Skip recording location points during gap
        if with_gap and gap_start <= i < gap_end:
            continue

        # Resume after gap
        if with_gap and i == gap_end and gap_event_logged:
            TrackingEvent.objects.create(
                user=user, session=session,
                event_type=TrackingEvent.Type.TRACKING_RESUMED,
                timestamp=ts,
            )

        LocationRecord.objects.create(
            user=user, session=session,
            latitude=lat, longitude=lng,
            accuracy=random.uniform(5, 30),
            timestamp=ts,
        )

    # Punch-out events
    for ev_type in (TrackingEvent.Type.PUNCH_OUT, TrackingEvent.Type.SESSION_COMPLETED):
        TrackingEvent.objects.create(user=user, session=session, event_type=ev_type, timestamp=punch_out_dt)

    session.status = AttendanceSession.Status.COMPLETED
    session.tracking_status = AttendanceSession.TrackingStatus.PUNCHED_OUT
    session.save()
    return session


def _create_active_session(user, punch_in_dt, route_pts_so_far):
    """Create a still-active session (no punch-out)."""
    from attendance.models import AttendanceSession as S

    selfie = _make_selfie_stub()
    last_lat, last_lng = route_pts_so_far[-1]
    session = S.objects.create(
        user=user,
        punch_in_at=punch_in_dt,
        status=S.Status.ACTIVE,
        tracking_status=S.TrackingStatus.ACTIVE,
        selfie=selfie,
        last_latitude=last_lat,
        last_longitude=last_lng,
        last_location_at=timezone.now(),
    )

    for ev_type in (
        TrackingEvent.Type.PUNCH_IN,
        TrackingEvent.Type.SELFIE_UPLOADED,
        TrackingEvent.Type.LOCATION_PERMISSION_GRANTED,
        TrackingEvent.Type.TRACKING_STARTED,
    ):
        TrackingEvent.objects.create(user=user, session=session, event_type=ev_type, timestamp=punch_in_dt)

    interval = timedelta(seconds=30)
    for i, (lat, lng) in enumerate(route_pts_so_far):
        ts = punch_in_dt + interval * i
        LocationRecord.objects.create(
            user=user, session=session,
            latitude=lat, longitude=lng,
            accuracy=random.uniform(5, 20),
            timestamp=ts,
        )

    return session


# ---------------------------------------------------------------------------
# Main command
# ---------------------------------------------------------------------------

class Command(BaseCommand):
    help = "Seed demo data: 1 admin, 5 field officers, sessions, routes."

    def add_arguments(self, parser):
        parser.add_argument(
            "--flush", action="store_true",
            help="Delete existing demo users before seeding."
        )

    def handle(self, *args, **options):
        random.seed(42)

        demo_usernames = ["admin", "arjun", "priya", "ravi", "meena", "suresh"]

        if options["flush"]:
            deleted, _ = User.objects.filter(username__in=demo_usernames).delete()
            self.stdout.write(self.style.WARNING(f"Flushed {deleted} existing demo user(s)."))

        # ---- Admin --------------------------------------------------------
        admin, created = User.objects.get_or_create(username="admin", defaults={
            "email": "admin@ncode.in",
            "first_name": "Admin",
            "last_name": "User",
            "role": User.Role.ADMIN,
            "is_staff": True,
            "is_superuser": True,
        })
        if created:
            admin.set_password("Admin@12345")
            admin.save()
            self.stdout.write(self.style.SUCCESS("  Created admin / Admin@12345"))
        else:
            self.stdout.write("  Admin already exists, skipping.")

        # ---- Demo field officers ------------------------------------------
        demo_users_data = [
            {"username": "arjun",  "first_name": "Arjun",  "last_name": "Mehta",  "email": "arjun@ncode.in",  "lat": 21.1702, "lng": 72.8311},
            {"username": "priya",  "first_name": "Priya",  "last_name": "Sharma", "email": "priya@ncode.in",  "lat": 21.1750, "lng": 72.8400},
            {"username": "ravi",   "first_name": "Ravi",   "last_name": "Kumar",  "email": "ravi@ncode.in",   "lat": 21.1800, "lng": 72.8350},
            {"username": "meena",  "first_name": "Meena",  "last_name": "Patel",  "email": "meena@ncode.in",  "lat": 21.1650, "lng": 72.8250},
            {"username": "suresh", "first_name": "Suresh", "last_name": "Nair",   "email": "suresh@ncode.in", "lat": 21.1600, "lng": 72.8450},
        ]

        now = timezone.now()

        for idx, ud in enumerate(demo_users_data):
            user, created = User.objects.get_or_create(username=ud["username"], defaults={
                "email": ud["email"],
                "first_name": ud["first_name"],
                "last_name": ud["last_name"],
                "role": User.Role.USER,
            })
            if created:
                user.set_password("Demo@12345")
                user.save()
                self.stdout.write(self.style.SUCCESS(f"  Created user {ud['username']} / Demo@12345"))
            else:
                self.stdout.write(f"  User {ud['username']} exists, ensuring demo sessions.")

            # Skip if user already has sessions
            if user.sessions.exists():
                self.stdout.write(f"    {ud['username']} already has sessions, skipping session creation.")
                continue

            lat0, lng0 = ud["lat"], ud["lng"]

            # --- 3 completed sessions (past days) --------------------------
            for day_offset in [3, 2, 1]:
                punch_in = now - timedelta(days=day_offset, hours=9)
                punch_out = punch_in + timedelta(hours=random.randint(6, 9))
                route = _rand_route(lat0, lng0, n_points=40)
                with_gap = (idx == 0 and day_offset == 2)  # one session has a gap
                _create_session_with_route(user, punch_in, punch_out, route, with_gap=with_gap)
                self.stdout.write(f"    Created session day -{day_offset} (gap={with_gap})")

            # --- 1 active session for the last user (live-map demo) --------
            if idx == len(demo_users_data) - 1:
                punch_in = now - timedelta(hours=2)
                route = _rand_route(lat0, lng0, n_points=20)
                _create_active_session(user, punch_in, route)
                self.stdout.write(self.style.SUCCESS(f"    Created ACTIVE session for {ud['username']}"))

        # ---- Leave Types ----------------------------------------------------
        leave_types = [
            ("CASUAL", "Casual Leave", Decimal("12.0"), "For short-notice personal or family obligations"),
            ("SICK", "Sick Leave", Decimal("10.0"), "For illness, injury, or medical recovery"),
            ("EARNED", "Earned Leave", Decimal("18.0"), "Annual privilege leave accrued over active tenure"),
        ]
        created_lts = {}
        for code, name, days, desc in leave_types:
            lt, _ = LeaveType.objects.get_or_create(
                code=code,
                defaults={"name": name, "default_days_per_year": days, "description": desc, "is_active": True}
            )
            created_lts[code] = lt
        self.stdout.write(self.style.SUCCESS(f"  Ensured {len(created_lts)} leave types."))

        # ---- Assign Reporting Manager & Leave Balances ---------------------
        admin_user = User.objects.filter(role=User.Role.ADMIN).first()
        all_field_users = User.objects.filter(role=User.Role.USER)
        for u in all_field_users:
            p, _ = EmployeeProfile.objects.get_or_create(user=u)
            if admin_user and not p.reporting_manager:
                p.reporting_manager = admin_user
                p.company = "Gujarat Narmada Valley Fertilizers & Chemicals Ltd. (GNFC)"
                p.agency = "(n)Code Solutions - IT Division"
                p.office = "Headquarters - Gandhinagar / Ahmedabad"
                p.zone = "West Zone"
                p.district = "Ahmedabad"
                p.work_location = "Field Operations - Gujarat Circle"
                p.emergency_contact_name = "Rajesh Mehta" if u.username == "arjun" else "Family Contact"
                p.emergency_contact_phone = "+91 98250 11223"
                p.emergency_contact_relation = "Father" if u.username == "arjun" else "Next of Kin"
                p.save()

            for code, lt in created_lts.items():
                LeaveBalance.objects.get_or_create(
                    user=u,
                    leave_type=lt,
                    year=2026,
                    defaults={
                        "total_days": lt.default_days_per_year,
                        "used_days": Decimal("2.0") if code == "CASUAL" and u.username == "arjun" else Decimal("0.0")
                    }
                )

        # Seed sample leave request for arjun
        arjun = User.objects.filter(username="arjun").first()
        if arjun and not LeaveRequest.objects.filter(user=arjun).exists():
            LeaveRequest.objects.create(
                user=arjun,
                leave_type_ref=created_lts["CASUAL"],
                leave_type="CASUAL",
                start_date=timezone.now().date() + timedelta(days=10),
                end_date=timezone.now().date() + timedelta(days=11),
                days_count=Decimal("2.0"),
                reason="Attending family function in Vadodara",
                status=LeaveRequest.Status.PENDING,
            )

        # ---- Holidays 2026 --------------------------------------------------
        holidays_2026 = [
            ("Republic Day", "2026-01-26", "NATIONAL", "Celebration of the Constitution of India"),
            ("Maha Shivratri", "2026-02-15", "STATE", "Traditional state festival"),
            ("Holi (Dhuleti)", "2026-03-04", "STATE", "Festival of colours"),
            ("Mahavir Jayanti", "2026-03-31", "OPTIONAL", "Birth anniversary of Lord Mahavira"),
            ("Dr. Ambedkar Jayanti", "2026-04-14", "NATIONAL", "Commemorating Dr. B. R. Ambedkar"),
            ("Gujarat Day", "2026-05-01", "STATE", "State foundation day"),
            ("Independence Day", "2026-08-15", "NATIONAL", "National Independence Day"),
            ("Raksha Bandhan", "2026-08-28", "OPTIONAL", "Traditional festival"),
            ("Gandhi Jayanti", "2026-10-02", "NATIONAL", "Mahatma Gandhi's birthday"),
            ("Dussehra (Vijayadashami)", "2026-10-20", "NATIONAL", "Victory of good over evil"),
            ("Diwali (Laxmi Pujan)", "2026-11-08", "NATIONAL", "Festival of lights"),
            ("Vikram Samvat New Year", "2026-11-09", "STATE", "Gujarati New Year"),
            ("Bhai Dooj", "2026-11-11", "STATE", "Traditional regional holiday"),
            ("Christmas Day", "2026-12-25", "NATIONAL", "Christmas celebration"),
            ("New Year's Day", "2027-01-01", "OPTIONAL", "Civil calendar New Year"),
        ]
        for name, date_str, h_type, desc in holidays_2026:
            Holiday.objects.update_or_create(
                date=date_str,
                defaults={
                    "name": name,
                    "year": int(date_str.split("-")[0]),
                    "holiday_type": h_type,
                    "description": desc,
                    "is_mandatory": (h_type != "OPTIONAL"),
                }
            )
        self.stdout.write(self.style.SUCCESS(f"  Ensured {len(holidays_2026)} holidays for 2026."))

        # ---- Announcements --------------------------------------------------
        announcements_data = [
            ("Annual Field Safety & Geolocation Policy (v1.0)", "All Field Officers must ensure GPS accuracy is maintained and verified front-camera selfies are uploaded at start of duty. Tracking is active exclusively while punched in.", "URGENT", "COMPLIANCE"),
            ("Quarterly IT Systems Maintenance Notice", "Scheduled server optimizations on 25th of this month from 01:00 AM to 03:00 AM IST. Field operations offline queueing will handle breadcrumbs smoothly.", "NORMAL", "OPERATIONS"),
            ("Employee Welfare: Medical Checkup Camp at GNFC Bharuch", "Complimentary annual health and ESIC biometric checkups scheduled for field personnel across Gujarat Circle.", "IMPORTANT", "HR & WELFARE"),
        ]
        for title, content, priority, cat in announcements_data:
            Announcement.objects.get_or_create(
                title=title,
                defaults={
                    "content": content,
                    "priority": priority,
                    "category": cat,
                    "published_by": admin_user,
                    "is_active": True,
                }
            )
        self.stdout.write(self.style.SUCCESS(f"  Ensured {len(announcements_data)} announcements."))

        # ---- Notes for Arjun -----------------------------------------------
        if arjun and not Note.objects.filter(user=arjun).exists():
            Note.objects.create(
                user=arjun,
                title="S.G. Highway Client Inspection Checklist",
                content="1. Check biometrics hardware serial numbers\n2. Verify SIM card connectivity\n3. Take site supervisor sign-off",
            )
            Note.objects.create(
                user=arjun,
                title="Expense reimbursements for Bharuch visit",
                content="Fuel slip of Rs. 850 from Indian Oil bunk. Keep physical copy for claims.",
            )
            self.stdout.write(self.style.SUCCESS("  Created demo notes for Arjun."))

        # ---- Documents for Arjun -------------------------------------------
        if arjun and not EmployeeDocument.objects.filter(user=arjun).exists():
            from django.core.files.base import ContentFile
            dummy_pdf = ContentFile(b"%PDF-1.4 ... Dummy Company ID Document ...", name="arjun_id_card.pdf")
            EmployeeDocument.objects.create(
                user=arjun,
                doc_type=EmployeeDocument.DocType.ID_CARD,
                title="GNFC / (n)Code Company ID Card",
                file=dummy_pdf,
                file_size=1024 * 45,
                file_type="application/pdf",
                status=EmployeeDocument.Status.VERIFIED,
                uploaded_by=arjun,
                verified_by=admin_user,
                verified_at=timezone.now(),
                verification_notes="Verified against HR master record.",
            )
            dummy_app = ContentFile(b"%PDF-1.4 ... Appointment Letter ...", name="appointment_letter.pdf")
            EmployeeDocument.objects.create(
                user=arjun,
                doc_type=EmployeeDocument.DocType.APPOINTMENT_LETTER,
                title="Official Appointment Letter",
                file=dummy_app,
                file_size=1024 * 128,
                file_type="application/pdf",
                status=EmployeeDocument.Status.VERIFIED,
                uploaded_by=arjun,
                verified_by=admin_user,
                verified_at=timezone.now(),
                verification_notes="Signed and sealed copy verified.",
            )
            dummy_cert = ContentFile(b"%PDF-1.4 ... Degree Certificate ...", name="btech_certificate.pdf")
            EmployeeDocument.objects.create(
                user=arjun,
                doc_type=EmployeeDocument.DocType.CERTIFICATE,
                title="Bachelor of Technology Degree Certificate",
                file=dummy_cert,
                file_size=1024 * 210,
                file_type="application/pdf",
                status=EmployeeDocument.Status.PENDING,
                uploaded_by=arjun,
            )
            self.stdout.write(self.style.SUCCESS("  Created demo documents for Arjun."))

        self.stdout.write(self.style.SUCCESS("\n[DONE] seed_demo complete."))
        self.stdout.write("   Admin:  admin / Admin@12345")
        self.stdout.write("   Users:  arjun, priya, ravi, meena, suresh / Demo@12345")
