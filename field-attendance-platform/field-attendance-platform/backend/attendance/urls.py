from django.urls import path

from .views import (
    CurrentSessionView,
    ConsentView,
    HistoryView,
    PunchInView,
    PunchOutView,
    SelfieView,
    VisitDetailUpdateView,
    VisitListCreateView,
    VisitPhotoServeView,
    VisitPhotoUploadView,
    VisitUpdateView,
    LeaveRequestListCreateView,
    HolidayListView,
)

urlpatterns = [
    path("consent/", ConsentView.as_view()),
    path("punch-in/", PunchInView.as_view()),
    path("punch-out/", PunchOutView.as_view()),
    path("current/", CurrentSessionView.as_view()),
    path("history/", HistoryView.as_view()),
    path("sessions/<int:pk>/selfie/", SelfieView.as_view()),
    path("visits/", VisitListCreateView.as_view()),
    path("visits/<int:pk>/", VisitDetailUpdateView.as_view()),
    path("visits/<int:pk>/photos/", VisitPhotoUploadView.as_view()),
    path("visits/<int:visit_pk>/photos/<int:photo_pk>/", VisitPhotoServeView.as_view()),
    path("leaves/", LeaveRequestListCreateView.as_view()),
    path("holidays/", HolidayListView.as_view()),
]
