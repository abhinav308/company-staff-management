from django.conf import settings
from rest_framework import serializers

from tracking.models import TrackingEvent
from .models import AttendanceSession, Visit, VisitPhoto, LeaveRequest, Holiday, UserConsent

INTERRUPTION_TYPES = ["LOCATION_UNAVAILABLE", "LOCATION_PERMISSION_DENIED"]


class VisitPhotoSerializer(serializers.ModelSerializer):
    photo_url = serializers.SerializerMethodField()

    class Meta:
        model = VisitPhoto
        fields = [
            "id",
            "visit",
            "caption",
            "latitude",
            "longitude",
            "captured_at",
            "created_at",
            "photo_url",
        ]
        read_only_fields = ["id", "visit", "created_at", "photo_url"]

    def get_photo_url(self, o):
        if not o.photo:
            return None
        return f"/api/attendance/visits/{o.visit_id}/photos/{o.id}/"


class VisitPhotoUploadSerializer(serializers.Serializer):
    photo = serializers.ImageField()
    caption = serializers.CharField(required=False, allow_blank=True, max_length=255, default="")
    latitude = serializers.FloatField(required=False, allow_null=True, min_value=-90, max_value=90)
    longitude = serializers.FloatField(required=False, allow_null=True, min_value=-180, max_value=180)
    captured_at = serializers.DateTimeField(required=False, allow_null=True)

    def validate_photo(self, f):
        max_bytes = getattr(settings, "PHOTO_MAX_BYTES", 10 * 1024 * 1024)
        allowed_types = getattr(settings, "PHOTO_ALLOWED_TYPES", {"image/jpeg", "image/png", "image/webp"})
        if f.size > max_bytes:
            raise serializers.ValidationError("Photo must be 10 MB or smaller.")
        if getattr(f, "content_type", None) not in allowed_types:
            raise serializers.ValidationError("Photo must be a JPEG, PNG or WebP image.")
        return f


class VisitSerializer(serializers.ModelSerializer):
    employee_name = serializers.SerializerMethodField()
    employee_id = serializers.SerializerMethodField()
    department = serializers.SerializerMethodField()
    photos = VisitPhotoSerializer(many=True, read_only=True)
    photos_count = serializers.SerializerMethodField()
    duration_minutes = serializers.IntegerField(read_only=True)

    class Meta:
        model = Visit
        fields = [
            "id",
            "user",
            "session",
            "site_name",
            "project_name",
            "visit_type",
            "location_name",
            "latitude",
            "longitude",
            "end_location_name",
            "end_latitude",
            "end_longitude",
            "start_time",
            "end_time",
            "duration_minutes",
            "status",
            "outcome",
            "notes",
            "outcome_notes",
            "created_at",
            "employee_name",
            "employee_id",
            "department",
            "photos",
            "photos_count",
        ]
        read_only_fields = [
            "id",
            "user",
            "session",
            "start_time",
            "created_at",
            "employee_name",
            "employee_id",
            "department",
            "photos",
            "photos_count",
            "duration_minutes",
        ]

    def get_employee_name(self, o):
        return o.user.get_full_name() or o.user.username

    def get_employee_id(self, o):
        if hasattr(o.user, "profile") and o.user.profile:
            return o.user.profile.employee_id
        return o.user.username

    def get_department(self, o):
        if hasattr(o.user, "profile") and o.user.profile:
            return o.user.profile.department
        return "IT Division (GNFC)"

    def get_photos_count(self, o):
        return o.photos.count()


class SessionSerializer(serializers.ModelSerializer):
    display_name = serializers.SerializerMethodField()
    employee_id = serializers.SerializerMethodField()
    department = serializers.SerializerMethodField()
    duration_seconds = serializers.IntegerField(read_only=True)
    interruptions = serializers.SerializerMethodField()
    visits_count = serializers.SerializerMethodField()

    class Meta:
        model = AttendanceSession
        fields = [
            "id",
            "user",
            "display_name",
            "employee_id",
            "department",
            "status",
            "tracking_status",
            "punch_in_at",
            "punch_out_at",
            "duration_seconds",
            "interruptions",
            "visits_count",
            "last_latitude",
            "last_longitude",
            "last_location_at",
        ]

    def get_display_name(self, o):
        return o.user.get_full_name() or o.user.username

    def get_employee_id(self, o):
        if hasattr(o.user, "profile") and o.user.profile:
            return o.user.profile.employee_id
        return o.user.username

    def get_department(self, o):
        if hasattr(o.user, "profile") and o.user.profile:
            return o.user.profile.department
        return "IT Division (GNFC)"

    def get_interruptions(self, o):
        n = getattr(o, "interruptions", None)
        return n if n is not None else o.events.filter(event_type__in=INTERRUPTION_TYPES).count()

    def get_visits_count(self, o):
        return o.visits.count()


class EventSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source="user.username", read_only=True)
    display_name = serializers.SerializerMethodField()
    employee_id = serializers.SerializerMethodField()

    class Meta:
        model = TrackingEvent
        fields = ["id", "user", "username", "display_name", "employee_id", "session_id", "event_type", "timestamp", "metadata"]

    def get_display_name(self, o):
        return o.user.get_full_name() or o.user.username

    def get_employee_id(self, o):
        if hasattr(o.user, "profile") and o.user.profile:
            return o.user.profile.employee_id
        return o.user.username


class UserConsentSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserConsent
        fields = ["id", "policy_version", "accepted_at"]
        read_only_fields = ["id", "accepted_at"]


class PunchInSerializer(serializers.Serializer):
    selfie = serializers.ImageField(required=True)  # Pillow verifies it is a real image
    latitude = serializers.FloatField(required=True, min_value=-90, max_value=90)
    longitude = serializers.FloatField(required=True, min_value=-180, max_value=180)
    accuracy = serializers.FloatField(required=False, allow_null=True, min_value=0)
    consent = serializers.BooleanField(required=False, default=False)
    policy_version = serializers.CharField(required=False, default="1.0")

    def validate_selfie(self, f):
        if not f:
            raise serializers.ValidationError("A verified front-camera selfie or photo is strictly required.")
        if f.size > settings.SELFIE_MAX_BYTES:
            raise serializers.ValidationError("Selfie must be 5 MB or smaller.")
        if getattr(f, "content_type", None) not in settings.SELFIE_ALLOWED_TYPES:
            raise serializers.ValidationError("Selfie must be a JPEG, PNG or WebP image.")
        return f


class PunchOutSerializer(serializers.Serializer):
    latitude = serializers.FloatField(required=False, min_value=-90, max_value=90)
    longitude = serializers.FloatField(required=False, min_value=-180, max_value=180)
    accuracy = serializers.FloatField(required=False, allow_null=True, min_value=0)


class LeaveRequestSerializer(serializers.ModelSerializer):
    class Meta:
        model = LeaveRequest
        fields = [
            "id", "user", "leave_type", "start_date", "end_date",
            "reason", "status", "created_at", "updated_at"
        ]
        read_only_fields = ["id", "user", "status", "created_at", "updated_at"]


class HolidaySerializer(serializers.ModelSerializer):
    class Meta:
        model = Holiday
        fields = ["id", "name", "date", "is_mandatory"]
