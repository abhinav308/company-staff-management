from django.contrib.auth.backends import ModelBackend
from django.db.models import Q
from .models import User


class NcodeAuthBackend(ModelBackend):
    """
    Authenticates a user for Ncode Solution IT Division (GNFC) using any of:
    1. User ID (Employee ID / username, e.g. NS00125)
    2. Email address (e.g. employee@ncode.example)
    3. ESIC Number (e.g. ESIC123456789)
    """

    def authenticate(self, request, username=None, password=None, **kwargs):
        if not username or not password:
            return None

        clean_id = str(username).strip()

        try:
            # Query by username, email, or employee profile fields (employee_id, esic_number)
            user = (
                User.objects.filter(
                    Q(username__iexact=clean_id)
                    | Q(email__iexact=clean_id)
                    | Q(profile__employee_id__iexact=clean_id)
                    | Q(profile__esic_number__iexact=clean_id)
                )
                .select_related("profile")
                .first()
            )

            if user and user.check_password(password) and self.user_can_authenticate(user):
                return user
        except Exception:
            return None

        return None
