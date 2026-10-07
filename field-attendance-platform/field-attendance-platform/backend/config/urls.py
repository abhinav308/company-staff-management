from django.contrib import admin
from django.urls import include, path

urlpatterns = [
    path("django-admin/", admin.site.urls),
    path("api/auth/", include("accounts.urls")),
    path("api/attendance/", include("attendance.urls")),
    path("api/locations/", include("locations.urls")),
    path("api/tracking/", include("tracking.urls")),
    path("api/admin/", include("accounts.admin_urls")),
    path("api/admin/", include("attendance.admin_urls")),
]
