from django.contrib.auth.models import AbstractUser
from django.db import models
from django.db.models.signals import post_save
from django.dispatch import receiver


class User(AbstractUser):
    class Role(models.TextChoices):
        USER = "USER"
        ADMIN = "ADMIN"

    role = models.CharField(max_length=10, choices=Role.choices, default=Role.USER)
    phone = models.CharField(max_length=20, blank=True)

    def save(self, *args, **kwargs):
        if self.is_superuser:
            self.role = self.Role.ADMIN
        super().save(*args, **kwargs)

    @property
    def display_identifier(self):
        if hasattr(self, "profile") and self.profile and self.profile.employee_id:
            return self.profile.employee_id
        return self.username


class EmployeeProfile(models.Model):
    class Status(models.TextChoices):
        ACTIVE = "ACTIVE"
        INACTIVE = "INACTIVE"
        ON_LEAVE = "ON_LEAVE"

    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="profile")
    employee_id = models.CharField(max_length=30, unique=True, db_index=True)
    esic_number = models.CharField(max_length=40, unique=True, null=True, blank=True, db_index=True)
    department = models.CharField(max_length=100, default="IT Division (GNFC)")
    designation = models.CharField(max_length=100, default="Field Officer")
    company = models.CharField(max_length=150, default="Gujarat Narmada Valley Fertilizers & Chemicals Ltd. (GNFC)")
    agency = models.CharField(max_length=150, default="(n)Code Solutions - IT Division")
    office = models.CharField(max_length=150, default="Headquarters - Ahmedabad")
    zone = models.CharField(max_length=100, default="West Zone")
    district = models.CharField(max_length=100, default="Ahmedabad")
    work_location = models.CharField(max_length=150, default="Field Operations - Gujarat Circle")
    reporting_manager = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name="reportees")
    joining_date = models.DateField(null=True, blank=True)
    employment_type = models.CharField(max_length=50, default="Permanent / Full-Time")
    shift_timing = models.CharField(max_length=100, default="09:30 AM - 06:30 PM (Mon-Sat)")
    emergency_contact_name = models.CharField(max_length=100, blank=True, default="")
    emergency_contact_phone = models.CharField(max_length=20, blank=True, default="")
    emergency_contact_relation = models.CharField(max_length=50, blank=True, default="")
    photo = models.ImageField(upload_to="profile_photos/", null=True, blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.ACTIVE)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.user.get_full_name() or self.user.username} ({self.employee_id})"


class EmployeeDocument(models.Model):
    class DocType(models.TextChoices):
        ID_CARD = "ID_CARD", "Company ID Card"
        APPOINTMENT_LETTER = "APPOINTMENT_LETTER", "Appointment Letter"
        ID_PROOF = "ID_PROOF", "Identity Proof (Govt ID)"
        CERTIFICATE = "CERTIFICATE", "Certificates & Degree"
        PAYSLIP = "PAYSLIP", "Salary Payslip"
        OTHER = "OTHER", "Other Official Document"

    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending Verification"
        VERIFIED = "VERIFIED", "Verified"
        REJECTED = "REJECTED", "Rejected"

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="documents")
    doc_type = models.CharField(max_length=40, choices=DocType.choices, default=DocType.ID_CARD)
    title = models.CharField(max_length=150)
    # Stored privately, accessed only through authenticated endpoint
    file = models.FileField(upload_to="employee_docs/")
    file_size = models.IntegerField(default=0)  # bytes (max 5 MB)
    file_type = models.CharField(max_length=100, blank=True, default="")
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING, db_index=True)
    uploaded_by = models.ForeignKey(User, null=True, on_delete=models.SET_NULL, related_name="uploaded_docs")
    verified_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name="verified_docs")
    verified_at = models.DateTimeField(null=True, blank=True)
    verification_notes = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.user.username} - {self.title} ({self.get_doc_type_display()})"


class Note(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="notes")
    title = models.CharField(max_length=200)
    content = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at"]

    def __str__(self):
        return f"{self.user.username}: {self.title}"


class Announcement(models.Model):
    class Priority(models.TextChoices):
        NORMAL = "NORMAL", "Normal"
        IMPORTANT = "IMPORTANT", "Important"
        URGENT = "URGENT", "Urgent"

    title = models.CharField(max_length=200)
    content = models.TextField()
    priority = models.CharField(max_length=20, choices=Priority.choices, default=Priority.NORMAL)
    category = models.CharField(max_length=50, default="GENERAL")
    published_by = models.ForeignKey(User, null=True, on_delete=models.SET_NULL, related_name="published_announcements")
    is_active = models.BooleanField(default=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"[{self.priority}] {self.title}"


class AnnouncementRead(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="read_announcements")
    announcement = models.ForeignKey(Announcement, on_delete=models.CASCADE, related_name="reads")
    read_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["user", "announcement"], name="unique_user_announcement_read")
        ]


class ProfileChangeRequest(models.Model):
    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending HR Approval"
        APPROVED = "APPROVED", "Approved"
        REJECTED = "REJECTED", "Rejected"

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="profile_change_requests")
    requested_phone = models.CharField(max_length=20, blank=True, default="")
    requested_emergency_name = models.CharField(max_length=100, blank=True, default="")
    requested_emergency_phone = models.CharField(max_length=20, blank=True, default="")
    requested_emergency_relation = models.CharField(max_length=50, blank=True, default="")
    reason = models.TextField(blank=True, default="")
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING, db_index=True)
    reviewed_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name="reviewed_profile_changes")
    reviewer_notes = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    reviewed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"Change Request #{self.id} for {self.user.username} ({self.status})"


@receiver(post_save, sender=User)
def create_or_update_user_profile(sender, instance, created, **kwargs):
    if not hasattr(instance, "profile") or instance.profile is None:
        try:
            EmployeeProfile.objects.get_or_create(
                user=instance,
                defaults={
                    "employee_id": instance.username,
                    "esic_number": f"ESIC-{instance.username.upper()}" if instance.username != "admin" else "ESIC-ADMIN",
                    "department": "IT Division (GNFC)",
                    "designation": "System Administrator" if instance.role == User.Role.ADMIN else "Field Officer",
                    "company": "Gujarat Narmada Valley Fertilizers & Chemicals Ltd. (GNFC)",
                    "agency": "(n)Code Solutions - IT Division",
                    "office": "Headquarters - Ahmedabad",
                    "zone": "West Zone",
                    "district": "Ahmedabad",
                    "work_location": "Field Operations - Gujarat Circle",
                    "employment_type": "Permanent / Full-Time",
                    "shift_timing": "09:30 AM - 06:30 PM (Mon-Sat)",
                },
            )
        except Exception:
            pass
