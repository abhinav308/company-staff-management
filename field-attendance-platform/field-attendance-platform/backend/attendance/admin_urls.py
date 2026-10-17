from django.urls import path

from .admin_views import (
    AdminVisitDetailView,
    AdminVisitExportCsvView,
    AdminVisitListView,
    AdminEventListView,
    DepartmentListView,
    LiveView,
    SessionDetailView,
    SessionExportCsvView,
    SessionListView,
    SummaryView,
)

urlpatterns = [
    path("summary/", SummaryView.as_view()),
    path("live/", LiveView.as_view()),
    path("sessions/", SessionListView.as_view()),
    path("sessions/export-csv/", SessionExportCsvView.as_view()),
    path("sessions/<int:pk>/", SessionDetailView.as_view()),
    path("visits/", AdminVisitListView.as_view()),
    path("visits/export-csv/", AdminVisitExportCsvView.as_view()),
    path("visits/<int:pk>/", AdminVisitDetailView.as_view()),
    path("departments/", DepartmentListView.as_view()),
    path("events/", AdminEventListView.as_view()),
]
