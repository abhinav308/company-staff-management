from django.urls import path

from .views import LocationCreateView

urlpatterns = [path("", LocationCreateView.as_view())]
