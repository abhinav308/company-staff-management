from django.db.models import Exists, OuterRef
from rest_framework import generics, viewsets
from rest_framework.filters import SearchFilter
from rest_framework.permissions import AllowAny
from rest_framework.throttling import ScopedRateThrottle
from rest_framework_simplejwt.views import TokenObtainPairView

from .models import User
from .permissions import IsAdminRole
from .serializers import AdminUserSerializer, RegisterSerializer, RoleTokenSerializer, UserSerializer


class RegisterView(generics.CreateAPIView):
    serializer_class = RegisterSerializer
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth"


class LoginView(TokenObtainPairView):
    serializer_class = RoleTokenSerializer
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth"


class MeView(generics.RetrieveAPIView):
    serializer_class = UserSerializer

    def get_object(self):
        return self.request.user


class AdminUserViewSet(viewsets.ModelViewSet):
    """Admin: list/search/filter users, view one, activate/deactivate or edit profile fields."""
    permission_classes = [IsAdminRole]
    serializer_class = AdminUserSerializer
    http_method_names = ["get", "patch", "head", "options"]
    filter_backends = [SearchFilter]
    search_fields = [
        "username",
        "email",
        "first_name",
        "last_name",
        "phone",
        "profile__employee_id",
        "profile__esic_number",
        "profile__department",
    ]

    def get_queryset(self):
        from attendance.models import AttendanceSession

        qs = (
            User.objects.filter(role=User.Role.USER)
            .select_related("profile")
            .annotate(
                has_active_session=Exists(AttendanceSession.objects.filter(user=OuterRef("pk"), status="ACTIVE"))
            )
            .order_by("username")
        )
        active = self.request.query_params.get("active")
        if active == "1":
            qs = qs.filter(has_active_session=True)
        elif active == "0":
            qs = qs.filter(has_active_session=False)
        return qs
