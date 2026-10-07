from django.conf import settings
from django.db import models
from django.utils import timezone


class TrackingEvent(models.Model):
    class Type(models.TextChoices):
        LOGIN = "LOGIN"
        PUNCH_IN = "PUNCH_IN"
        SELFIE_UPLOADED = "SELFIE_UPLOADED"
        LOCATION_PERMISSION_GRANTED = "LOCATION_PERMISSION_GRANTED"
        TRACKING_STARTED = "TRACKING_STARTED"
        LOCATION_UPDATED = "LOCATION_UPDATED"  # reserved; individual updates live in LocationRecord
        LOCATION_UNAVAILABLE = "LOCATION_UNAVAILABLE"
        LOCATION_PERMISSION_DENIED = "LOCATION_PERMISSION_DENIED"
        TRACKING_RESUMED = "TRACKING_RESUMED"
        VISIT_STARTED = "VISIT_STARTED"
        VISIT_PHOTO_UPLOADED = "VISIT_PHOTO_UPLOADED"
        VISIT_COMPLETED = "VISIT_COMPLETED"
        PUNCH_OUT = "PUNCH_OUT"
        SESSION_COMPLETED = "SESSION_COMPLETED"
        LOGOUT = "LOGOUT"

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="tracking_events")
    session = models.ForeignKey("attendance.AttendanceSession", on_delete=models.CASCADE, related_name="events")
    event_type = models.CharField(max_length=40, choices=Type.choices)
    timestamp = models.DateTimeField(default=timezone.now, db_index=True)
    metadata = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ["timestamp", "id"]
        indexes = [models.Index(fields=["session", "timestamp"])]
