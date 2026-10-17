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

from accounts.models import EmployeeProfile, User
from attendance.models import AttendanceSession, Holiday
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

        # ---- Holidays -------------------------------------------------------
        holidays = [
            ("Republic Day", "2025-01-26"),
            ("Holi",         "2025-03-14"),
            ("Diwali",       "2025-10-20"),
            ("Christmas",    "2025-12-25"),
        ]
        for name, date_str in holidays:
            Holiday.objects.get_or_create(date=date_str, defaults={"name": name})
        self.stdout.write(self.style.SUCCESS(f"  Ensured {len(holidays)} holidays."))

        self.stdout.write(self.style.SUCCESS("\n[DONE] seed_demo complete."))
        self.stdout.write("   Admin:  admin / Admin@12345")
        self.stdout.write("   Users:  arjun, priya, ravi, meena, suresh / Demo@12345")
