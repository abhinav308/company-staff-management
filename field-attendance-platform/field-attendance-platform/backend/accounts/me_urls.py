from django.urls import path
from .me_views import (
    AttendanceCalendarView,
    AuthenticatedDocumentDownloadView,
    ChangePasswordView,
    MarkAnnouncementReadView,
    MyAnnouncementsView,
    MyDocumentsView,
    MyHolidaysView,
    MyLeaveBalancesView,
    MyLeaveCancelView,
    MyLeaveListView,
    MyNoteDetailView,
    MyNotesViewSet,
    MyProfilePhotoUploadView,
    MyProfileView,
    MyStatsView,
)

urlpatterns = [
    # Profile & Contact
    path("profile/", MyProfileView.as_view(), name="me-profile"),
    path("photo/", MyProfilePhotoUploadView.as_view(), name="me-photo"),
    path("stats/", MyStatsView.as_view(), name="me-stats"),
    path("change-password/", ChangePasswordView.as_view(), name="me-change-password"),

    # Attendance Calendar & History
    path("attendance/calendar/", AttendanceCalendarView.as_view(), name="me-attendance-calendar"),

    # Leave Management
    path("leaves/", MyLeaveListView.as_view(), name="me-leaves-list"),
    path("leaves/<int:pk>/", MyLeaveCancelView.as_view(), name="me-leave-cancel"),
    path("leaves/balances/", MyLeaveBalancesView.as_view(), name="me-leave-balances"),

    # Holidays
    path("holidays/", MyHolidaysView.as_view(), name="me-holidays"),

    # Personal Notes
    path("notes/", MyNotesViewSet.as_view(), name="me-notes"),
    path("notes/<int:pk>/", MyNoteDetailView.as_view(), name="me-note-detail"),

    # Documents
    path("documents/", MyDocumentsView.as_view(), name="me-documents"),
    path("documents/<int:pk>/download/", AuthenticatedDocumentDownloadView.as_view(), name="me-document-download"),

    # Announcements
    path("announcements/", MyAnnouncementsView.as_view(), name="me-announcements"),
    path("announcements/<int:pk>/read/", MarkAnnouncementReadView.as_view(), name="me-announcement-read"),
]
