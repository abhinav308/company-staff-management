from django.urls import path
from rest_framework.routers import SimpleRouter

from .admin_views import (
    AdminAnnouncementDetailView,
    AdminAnnouncementManagementView,
    AdminDocumentQueueView,
    AdminDocumentVerifyView,
    AdminHolidayDetailView,
    AdminHolidayManagementView,
    AdminLeaveDecisionView,
    AdminLeaveListView,
    AdminLeaveTypeManagementView,
    AdminProfileChangeDecisionView,
    AdminProfileChangeQueueView,
)
from .views import AdminUserViewSet

router = SimpleRouter()
router.register("users", AdminUserViewSet, basename="admin-users")

urlpatterns = router.urls + [
    # Leaves
    path("leaves/", AdminLeaveListView.as_view(), name="admin-leaves-list"),
    path("leaves/<int:pk>/decision/", AdminLeaveDecisionView.as_view(), name="admin-leave-decision"),
    path("leave-types/", AdminLeaveTypeManagementView.as_view(), name="admin-leave-types"),

    # Holidays
    path("holidays/", AdminHolidayManagementView.as_view(), name="admin-holidays"),
    path("holidays/<int:pk>/", AdminHolidayDetailView.as_view(), name="admin-holiday-detail"),

    # Documents
    path("documents/", AdminDocumentQueueView.as_view(), name="admin-documents-queue"),
    path("documents/<int:pk>/verify/", AdminDocumentVerifyView.as_view(), name="admin-document-verify"),

    # Profile Changes
    path("profile-changes/", AdminProfileChangeQueueView.as_view(), name="admin-profile-changes"),
    path("profile-changes/<int:pk>/decision/", AdminProfileChangeDecisionView.as_view(), name="admin-profile-change-decision"),

    # Announcements
    path("announcements/", AdminAnnouncementManagementView.as_view(), name="admin-announcements"),
    path("announcements/<int:pk>/", AdminAnnouncementDetailView.as_view(), name="admin-announcement-detail"),
]
