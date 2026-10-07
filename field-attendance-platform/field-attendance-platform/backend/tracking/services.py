import logging

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer

from .models import TrackingEvent

log = logging.getLogger(__name__)
ADMIN_GROUP = "admin_live"


def log_event(session, event_type, **metadata):
    return TrackingEvent.objects.create(user=session.user, session=session, event_type=event_type, metadata=metadata)


def live_payload(s):
    return {
        "session_id": s.id,
        "user_id": s.user_id,
        "display_name": s.user.get_full_name() or s.user.username,
        "status": s.status,
        "tracking_status": s.tracking_status,
        "latitude": s.last_latitude,
        "longitude": s.last_longitude,
        "last_location_at": s.last_location_at.isoformat() if s.last_location_at else None,
        "punch_in_at": s.punch_in_at.isoformat(),
    }


def broadcast_live(session):
    """Push a session snapshot to connected admins. Never lets a WS failure break the API call."""
    try:
        layer = get_channel_layer()
        if layer:
            async_to_sync(layer.group_send)(ADMIN_GROUP, {"type": "live.update", "data": live_payload(session)})
    except Exception:  # noqa: BLE001
        log.exception("live broadcast failed")
