from urllib.parse import parse_qs

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer
from rest_framework_simplejwt.tokens import AccessToken

from accounts.models import User
from .services import ADMIN_GROUP


class AdminLiveConsumer(AsyncJsonWebsocketConsumer):
    """Read-only live feed for admins. Auth: ?token=<access JWT>; role re-checked in the DB."""

    async def connect(self):
        token = (parse_qs(self.scope["query_string"].decode()).get("token") or [""])[0]
        user = await self._auth(token)
        if not user:
            await self.close(code=4401)
            return
        await self.channel_layer.group_add(ADMIN_GROUP, self.channel_name)
        await self.accept()

    async def disconnect(self, code):
        await self.channel_layer.group_discard(ADMIN_GROUP, self.channel_name)

    async def live_update(self, event):
        await self.send_json(event["data"])

    @database_sync_to_async
    def _auth(self, token):
        try:
            user = User.objects.get(pk=AccessToken(token)["user_id"])
        except Exception:  # noqa: BLE001
            return None
        return user if user.is_active and user.role == User.Role.ADMIN else None
