from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from .models import EmployeeProfile, User


class EmployeeProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = EmployeeProfile
        fields = ["employee_id", "esic_number", "department", "designation", "status"]


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
        
        # Profile is created or updated
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
