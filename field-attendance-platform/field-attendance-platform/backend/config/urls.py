from django.contrib import admin
from django.urls import include, path

from accounts.me_views import AuthenticatedDocumentDownloadView

urlpatterns = [
    path("django-admin/", admin.site.urls),
    path("api/auth/", include("accounts.urls")),
    path("api/me/", include("accounts.me_urls")),
    path("api/documents/<int:pk>/download/", AuthenticatedDocumentDownloadView.as_view(), name="document-download"),
    path("api/attendance/", include("attendance.urls")),
    path("api/locations/", include("locations.urls")),
    path("api/tracking/", include("tracking.urls")),
    path("api/admin/", include("accounts.admin_urls")),
    path("api/admin/", include("attendance.admin_urls")),
]
