from django.urls import path

from .views import ClientEventView, ConfigView

urlpatterns = [
    path("config/", ConfigView.as_view()),
    path("events/", ClientEventView.as_view()),
]
