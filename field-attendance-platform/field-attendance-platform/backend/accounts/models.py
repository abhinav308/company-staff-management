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
    department = models.CharField(max_length=100, default="IT Division")
    designation = models.CharField(max_length=100, default="Field Executive")
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.ACTIVE)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.user.get_full_name() or self.user.username} ({self.employee_id})"


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
                },
            )
        except Exception:
            pass
