from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from .models import Announcement, AnnouncementRead, EmployeeDocument, EmployeeProfile, Note, ProfileChangeRequest, User


class EmployeeProfileSerializer(serializers.ModelSerializer):
    reporting_manager_name = serializers.SerializerMethodField()
    photo_url = serializers.SerializerMethodField()

    class Meta:
        model = EmployeeProfile
        fields = [
            "employee_id",
            "esic_number",
            "department",
            "designation",
            "company",
            "agency",
            "office",
            "zone",
            "district",
            "work_location",
            "reporting_manager",
            "reporting_manager_name",
            "joining_date",
            "employment_type",
            "shift_timing",
            "emergency_contact_name",
            "emergency_contact_phone",
            "emergency_contact_relation",
            "photo",
            "photo_url",
            "status",
        ]
        read_only_fields = [
            "employee_id",
            "esic_number",
            "department",
            "designation",
            "company",
            "agency",
            "office",
            "zone",
            "district",
            "work_location",
            "reporting_manager",
            "reporting_manager_name",
            "joining_date",
            "employment_type",
            "shift_timing",
            "status",
        ]

    def get_reporting_manager_name(self, obj):
        if obj.reporting_manager:
            return obj.reporting_manager.get_full_name() or obj.reporting_manager.username
        return "Ncode Operations Head"

    def get_photo_url(self, obj):
        if obj.photo:
            request = self.context.get("request")
            if request:
                return request.build_absolute_uri(obj.photo.url)
            return obj.photo.url
        return None


class UserSerializer(serializers.ModelSerializer):
    profile = EmployeeProfileSerializer(read_only=True)
    full_name = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "id",
            "username",
            "email",
            "first_name",
            "last_name",
            "full_name",
            "phone",
            "role",
            "is_active",
            "profile",
        ]
        read_only_fields = fields

    def get_full_name(self, obj):
        name = f"{obj.first_name} {obj.last_name}".strip()
        return name if name else obj.username


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True)
    employee_id = serializers.CharField(required=False, write_only=True)
    esic_number = serializers.CharField(required=False, allow_blank=True, write_only=True)
    department = serializers.CharField(required=False, allow_blank=True, write_only=True)
    designation = serializers.CharField(required=False, allow_blank=True, write_only=True)

    class Meta:
        model = User
        fields = [
            "username",
            "email",
            "password",
            "first_name",
            "last_name",
            "phone",
            "employee_id",
            "esic_number",
            "department",
            "designation",
        ]

    def validate(self, attrs):
        user_attrs = {k: v for k, v in attrs.items() if k not in ["password", "employee_id", "esic_number", "department", "designation"]}
        validate_password(attrs["password"], User(**user_attrs))
        
        emp_id = attrs.get("employee_id") or attrs.get("username")
        if EmployeeProfile.objects.filter(employee_id__iexact=emp_id).exists():
            raise serializers.ValidationError({"employee_id": "An employee with this Employee ID already exists."})
            
        esic = attrs.get("esic_number")
        if esic and EmployeeProfile.objects.filter(esic_number__iexact=esic).exists():
            raise serializers.ValidationError({"esic_number": "An employee with this ESIC Number already exists."})

        return attrs

    def create(self, validated):
        emp_id = validated.pop("employee_id", None) or validated.get("username")
        esic = validated.pop("esic_number", "")
        dept = validated.pop("department", "IT Division (GNFC)")
        desig = validated.pop("designation", "Field Officer")

        user = User.objects.create_user(role=User.Role.USER, **validated)
        
        profile, _ = EmployeeProfile.objects.get_or_create(user=user)
        profile.employee_id = emp_id
        if esic:
            profile.esic_number = esic
        profile.department = dept or "IT Division (GNFC)"
        profile.designation = desig or "Field Officer"
        profile.save()

        return user


class AdminUserSerializer(serializers.ModelSerializer):
    has_active_session = serializers.BooleanField(read_only=True)
    profile = EmployeeProfileSerializer(read_only=True)
    full_name = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "id",
            "username",
            "email",
            "first_name",
            "last_name",
            "full_name",
            "phone",
            "role",
            "is_active",
            "date_joined",
            "has_active_session",
            "profile",
        ]
        read_only_fields = ["id", "username", "email", "role", "date_joined", "has_active_session"]

    def get_full_name(self, obj):
        name = f"{obj.first_name} {obj.last_name}".strip()
        return name if name else obj.username


class RoleTokenSerializer(TokenObtainPairSerializer):
    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        token["role"] = user.role
        if hasattr(user, "profile") and user.profile:
            token["employee_id"] = user.profile.employee_id
            token["department"] = user.profile.department
        return token


class EmployeeDocumentSerializer(serializers.ModelSerializer):
    doc_type_display = serializers.CharField(source="get_doc_type_display", read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    uploader_name = serializers.SerializerMethodField()
    verifier_name = serializers.SerializerMethodField()
    file_size_formatted = serializers.SerializerMethodField()
    download_url = serializers.SerializerMethodField()
    file_name = serializers.SerializerMethodField()
    mime_type = serializers.CharField(source="file_type", read_only=True)
    reviewer_notes = serializers.CharField(source="verification_notes", read_only=True)
    user_full_name = serializers.SerializerMethodField()
    employee_id = serializers.SerializerMethodField()

    class Meta:
        model = EmployeeDocument
        fields = [
            "id",
            "user",
            "user_full_name",
            "employee_id",
            "doc_type",
            "doc_type_display",
            "title",
            "file_name",
            "file_size",
            "file_size_formatted",
            "file_type",
            "mime_type",
            "status",
            "status_display",
            "uploader_name",
            "verifier_name",
            "verified_at",
            "verification_notes",
            "reviewer_notes",
            "created_at",
            "download_url",
        ]
        read_only_fields = [
            "id",
            "doc_type_display",
            "status",
            "status_display",
            "file_size",
            "file_size_formatted",
            "file_type",
            "uploader_name",
            "verifier_name",
            "verified_at",
            "verification_notes",
            "created_at",
            "download_url",
        ]

    def get_uploader_name(self, obj):
        if obj.uploaded_by:
            return obj.uploaded_by.get_full_name() or obj.uploaded_by.username
        return "System"

    def get_verifier_name(self, obj):
        if obj.verified_by:
            return obj.verified_by.get_full_name() or obj.verified_by.username
        return None

    def get_file_size_formatted(self, obj):
        bytes_val = obj.file_size or (obj.file.size if obj.file else 0)
        if bytes_val < 1024:
            return f"{bytes_val} B"
        elif bytes_val < 1024 * 1024:
            return f"{bytes_val / 1024:.1f} KB"
        return f"{bytes_val / (1024 * 1024):.1f} MB"

    def get_download_url(self, obj):
        return f"/api/documents/{obj.id}/download/"

    def get_file_name(self, obj):
        if obj.file and hasattr(obj.file, "name"):
            return obj.file.name.split("/")[-1]
        return obj.title or f"document_{obj.id}"

    def get_user_full_name(self, obj):
        return obj.user.get_full_name() or obj.user.username

    def get_employee_id(self, obj):
        if hasattr(obj.user, "profile") and obj.user.profile:
            return obj.user.profile.employee_id
        return obj.user.username


class NoteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Note
        fields = ["id", "title", "content", "created_at", "updated_at"]
        read_only_fields = ["id", "created_at", "updated_at"]


class AnnouncementSerializer(serializers.ModelSerializer):
    is_read = serializers.SerializerMethodField()
    priority_display = serializers.CharField(source="get_priority_display", read_only=True)

    class Meta:
        model = Announcement
        fields = [
            "id",
            "title",
            "content",
            "priority",
            "priority_display",
            "category",
            "is_active",
            "created_at",
            "is_read",
        ]

    def get_is_read(self, obj):
        request = self.context.get("request")
        if request and request.user.is_authenticated:
            return AnnouncementRead.objects.filter(user=request.user, announcement=obj).exists()
        return False


class ProfileChangeRequestSerializer(serializers.ModelSerializer):
    user_name = serializers.SerializerMethodField()
    reviewer_name = serializers.SerializerMethodField()

    class Meta:
        model = ProfileChangeRequest
        fields = [
            "id",
            "user",
            "user_name",
            "requested_phone",
            "requested_emergency_name",
            "requested_emergency_phone",
            "requested_emergency_relation",
            "reason",
            "status",
            "reviewer_name",
            "reviewer_notes",
            "created_at",
            "reviewed_at",
        ]
        read_only_fields = [
            "id",
            "user",
            "user_name",
            "status",
            "reviewer_name",
            "reviewer_notes",
            "created_at",
            "reviewed_at",
        ]

    def get_user_name(self, obj):
        return obj.user.get_full_name() or obj.user.username

    def get_reviewer_name(self, obj):
        if obj.reviewed_by:
            return obj.reviewed_by.get_full_name() or obj.reviewed_by.username
        return None
