from django.urls import path

from .consumers import AdminLiveConsumer

websocket_urlpatterns = [path("ws/admin/live/", AdminLiveConsumer.as_asgi())]
