"""
Management command: close_stale_sessions

Closes AttendanceSessions with no location update for more than STALE_SESSION_HOURS.
Safe to run as a cron job (e.g. every 30 minutes).

Usage:
    python manage.py close_stale_sessions
    python manage.py close_stale_sessions --hours 12  # custom threshold
    python manage.py close_stale_sessions --dry-run   # preview only
"""
import os
from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from attendance.models import AttendanceSession as S
from tracking.models import TrackingEvent


class Command(BaseCommand):
    help = "Auto-close stale active sessions (no location update for N hours)."

    def add_arguments(self, parser):
        parser.add_argument(
            "--hours",
            type=float,
            default=float(os.environ.get("STALE_SESSION_HOURS", "8")),
            help="Hours since last location update before session is auto-closed (default: 8).",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Show which sessions would be closed without actually closing them.",
        )

    def handle(self, *args, **options):
        hours = options["hours"]
        dry_run = options["dry_run"]
        threshold = timezone.now() - timedelta(hours=hours)

        stale = S.objects.filter(
            status=S.Status.ACTIVE,
            last_location_at__lt=threshold,
        ).select_related("user")

        count = stale.count()
        if count == 0:
            self.stdout.write("No stale sessions found.")
            return

        self.stdout.write(f"Found {count} stale session(s) (no update for {hours}h).")

        for session in stale:
            self.stdout.write(
                f"  {'[DRY-RUN] Would close' if dry_run else 'Closing'} "
                f"session {session.id} for {session.user.username} "
                f"(last update: {session.last_location_at})"
            )
            if not dry_run:
                now = timezone.now()
                session.punch_out_at = session.punch_out_at or now
                session.status = S.Status.COMPLETED
                session.tracking_status = S.TrackingStatus.PUNCHED_OUT
                session.save(update_fields=["punch_out_at", "status", "tracking_status"])
                TrackingEvent.objects.create(
                    user=session.user,
                    session=session,
                    event_type=TrackingEvent.Type.SESSION_COMPLETED,
                    timestamp=now,
                    metadata={"reason": "auto_closed", "stale_hours": hours},
                )

        if not dry_run:
            self.stdout.write(self.style.SUCCESS(f"Closed {count} stale session(s)."))
