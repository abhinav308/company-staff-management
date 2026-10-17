from django.urls import path

from .views import BatchLocationCreateView, LocationCreateView

urlpatterns = [
    path("", LocationCreateView.as_view()),
    path("batch/", BatchLocationCreateView.as_view()),
]
