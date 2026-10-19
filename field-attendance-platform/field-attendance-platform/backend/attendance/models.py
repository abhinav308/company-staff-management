from django.conf import settings
from django.db import models
from django.db.models import Q
from django.utils import timezone


class AttendanceSession(models.Model):
    class Status(models.TextChoices):
        ACTIVE = "ACTIVE"
        COMPLETED = "COMPLETED"

    class TrackingStatus(models.TextChoices):
        ACTIVE = "ACTIVE"
        PAUSED = "PAUSED"
        LOCATION_UNAVAILABLE = "LOCATION_UNAVAILABLE"
        PERMISSION_DENIED = "PERMISSION_DENIED"
        OFFLINE = "OFFLINE"
        PUNCHED_OUT = "PUNCHED_OUT"

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="sessions")
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.ACTIVE, db_index=True)
    tracking_status = models.CharField(max_length=24, choices=TrackingStatus.choices, default=TrackingStatus.ACTIVE)
    punch_in_at = models.DateTimeField(default=timezone.now, db_index=True)
    punch_out_at = models.DateTimeField(null=True, blank=True)
    # Selfie stored as a file reference (object storage in prod), not binary in the DB.
    selfie = models.ImageField(upload_to="selfies/%Y/%m/")
    last_latitude = models.FloatField(null=True, blank=True)
    last_longitude = models.FloatField(null=True, blank=True)
    last_accuracy = models.FloatField(null=True, blank=True)
    last_location_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-punch_in_at"]
        constraints = [
            models.UniqueConstraint(fields=["user"], condition=Q(status="ACTIVE"), name="one_active_session_per_user")
        ]

    @property
    def duration_seconds(self):
        return int(((self.punch_out_at or timezone.now()) - self.punch_in_at).total_seconds())


class Visit(models.Model):
    class Status(models.TextChoices):
        IN_PROGRESS = "IN_PROGRESS"
        COMPLETED = "COMPLETED"
        CANCELLED = "CANCELLED"

    class VisitType(models.TextChoices):
        SITE_INSPECTION = "SITE_INSPECTION", "Site Inspection"
        CLIENT_MEETING = "CLIENT_MEETING", "Client Meeting"
        TECHNICAL_VERIFICATION = "TECHNICAL_VERIFICATION", "Technical Verification"
        INFRASTRUCTURE_AUDIT = "INFRASTRUCTURE_AUDIT", "Infrastructure / IT Audit"
        OTHER = "OTHER", "Other Official Work"

    class Outcome(models.TextChoices):
        PENDING = "PENDING", "Pending / In Progress"
        SATISFACTORY = "SATISFACTORY", "Satisfactory / Completed"
        ACTION_REQUIRED = "ACTION_REQUIRED", "Action Required / Issues Found"
        FOLLOW_UP_NEEDED = "FOLLOW_UP_NEEDED", "Follow-up Needed"
        CANCELLED = "CANCELLED", "Cancelled"

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="visits")
    session = models.ForeignKey(AttendanceSession, on_delete=models.CASCADE, related_name="visits")
    site_name = models.CharField(max_length=200)
    project_name = models.CharField(max_length=200, blank=True, default="")
    visit_type = models.CharField(max_length=32, choices=VisitType.choices, default=VisitType.SITE_INSPECTION)
    location_name = models.CharField(max_length=255, blank=True)
    latitude = models.FloatField(null=True, blank=True)
    longitude = models.FloatField(null=True, blank=True)
    end_location_name = models.CharField(max_length=255, blank=True, default="")
    end_latitude = models.FloatField(null=True, blank=True)
    end_longitude = models.FloatField(null=True, blank=True)
    start_time = models.DateTimeField(default=timezone.now)
    end_time = models.DateTimeField(null=True, blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.IN_PROGRESS)
    outcome = models.CharField(max_length=32, choices=Outcome.choices, default=Outcome.PENDING)
    notes = models.TextField(blank=True)
    outcome_notes = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-start_time", "id"]

    @property
    def duration_minutes(self):
        if self.end_time and self.start_time:
            return max(0, int((self.end_time - self.start_time).total_seconds() // 60))
        return None


class VisitPhoto(models.Model):
    visit = models.ForeignKey(Visit, on_delete=models.CASCADE, related_name="photos")
    photo = models.ImageField(upload_to="evidence/%Y/%m/")
    caption = models.CharField(max_length=255, blank=True, default="")
    latitude = models.FloatField(null=True, blank=True)
    longitude = models.FloatField(null=True, blank=True)
    captured_at = models.DateTimeField(default=timezone.now)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at", "id"]


class LeaveType(models.Model):
    code = models.CharField(max_length=30, unique=True, db_index=True)
    name = models.CharField(max_length=100)
    description = models.TextField(blank=True, default="")
    default_days_per_year = models.DecimalField(max_digits=5, decimal_places=1, default=12.0)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["code"]

    def __str__(self):
        return f"{self.name} ({self.code})"


class LeaveBalance(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="leave_balances")
    leave_type = models.ForeignKey(LeaveType, on_delete=models.CASCADE, related_name="balances")
    year = models.IntegerField(default=2026, db_index=True)
    total_days = models.DecimalField(max_digits=5, decimal_places=1, default=12.0)
    used_days = models.DecimalField(max_digits=5, decimal_places=1, default=0.0)

    class Meta:
        ordering = ["year", "leave_type__code"]
        constraints = [
            models.UniqueConstraint(fields=["user", "leave_type", "year"], name="unique_user_leave_balance_per_year")
        ]

    @property
    def available_days(self):
        return max(0.0, float(self.total_days - self.used_days))

    def __str__(self):
        return f"{self.user.username} - {self.leave_type.code} ({self.available_days} left)"


class LeaveRequest(models.Model):
    class LeaveTypeEnum(models.TextChoices):
        CASUAL = "CASUAL", "Casual Leave"
        SICK = "SICK", "Sick Leave"
        EARNED = "EARNED", "Earned Leave"
        PTO = "PTO", "Paid Time Off"
        OTHER = "OTHER", "Other Leave"

    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending Approval"
        APPROVED = "APPROVED", "Approved"
        REJECTED = "REJECTED", "Rejected"
        CANCELLED = "CANCELLED", "Cancelled"

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="leave_requests")
    leave_type_ref = models.ForeignKey(LeaveType, null=True, blank=True, on_delete=models.SET_NULL, related_name="requests")
    leave_type = models.CharField(max_length=30, default="CASUAL")
    start_date = models.DateField(db_index=True)
    end_date = models.DateField(db_index=True)
    is_half_day = models.BooleanField(default=False)
    half_day_period = models.CharField(max_length=20, blank=True, default="")
    days_count = models.DecimalField(max_digits=4, decimal_places=1, default=1.0)
    reason = models.TextField()
    attachment = models.FileField(upload_to="leave_attachments/", null=True, blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING, db_index=True)
    approver = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="approved_leaves")
    approver_comment = models.TextField(blank=True, default="")
    decided_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.user.username} - {self.leave_type} ({self.start_date} to {self.end_date}): {self.status}"


class Holiday(models.Model):
    class HolidayType(models.TextChoices):
        NATIONAL = "NATIONAL", "National Holiday"
        STATE = "STATE", "State Holiday"
        OPTIONAL = "OPTIONAL", "Restricted / Optional"

    name = models.CharField(max_length=150)
    date = models.DateField(unique=True, db_index=True)
    year = models.IntegerField(default=2026, db_index=True)
    holiday_type = models.CharField(max_length=20, choices=HolidayType.choices, default=HolidayType.NATIONAL)
    description = models.TextField(blank=True, default="")
    is_mandatory = models.BooleanField(default=True)

    class Meta:
        ordering = ["date"]

    def __str__(self):
        return f"{self.date} - {self.name} ({self.holiday_type})"


class UserConsent(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="consents")
    policy_version = models.CharField(max_length=20, default="1.0")
    accepted_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ["-accepted_at"]
        constraints = [
            models.UniqueConstraint(fields=["user", "policy_version"], name="unique_user_policy_consent")
        ]


