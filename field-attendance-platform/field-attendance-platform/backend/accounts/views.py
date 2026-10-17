from django.db.models import Exists, OuterRef
from django.http import JsonResponse
from rest_framework import generics, status, viewsets
from rest_framework.filters import SearchFilter
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken
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


class LogoutView(APIView):
    """Blacklist the refresh token so it cannot be used again."""
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth"

    def post(self, request):
        refresh_token = request.data.get("refresh")
        if not refresh_token:
            return Response({"detail": "refresh token required."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            token = RefreshToken(refresh_token)
            token.blacklist()
        except TokenError:
            pass  # Already blacklisted or invalid – still return 200
        return Response({"detail": "Logged out."}, status=status.HTTP_200_OK)


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


def health_check(request):
    """Simple health check: DB connectivity + app up. Returns JSON."""
    try:
        User.objects.exists()
        db_ok = True
    except Exception:
        db_ok = False
    payload = {"status": "ok" if db_ok else "degraded", "db": "ok" if db_ok else "error"}
    return JsonResponse(payload, status=200 if db_ok else 503)
