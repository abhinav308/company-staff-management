from rest_framework.permissions import BasePermission


class IsAdminRole(BasePermission):
    """Role is read from the database on every request, never trusted from the client."""

    def has_permission(self, request, view):
        u = request.user
        return bool(u and u.is_authenticated and u.is_active and u.role == "ADMIN")
