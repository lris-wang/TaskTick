"""
Send Web Push notifications to a subscriber's browser.

Uses the `webpush` library to encrypt the payload with VAPID,
then sends it via httpx to the subscriber's push endpoint.
"""

"""
Send Web Push notifications to a subscriber's browser.

Uses the `webpush` library to encrypt the payload with VAPID,
then sends it via stdlib urllib (async via asyncio.to_thread).
"""

import asyncio
import json
import logging
import urllib.request
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.models.push_subscription import PushSubscription
    from app.models.user import User

logger = logging.getLogger(__name__)


def _get_vapid_keys() -> tuple[str, str, str]:
    from app.utils.vapid import VAPID_PRIVATE_KEY, VAPID_PUBLIC_KEY, VAPID_SUBJECT

    return VAPID_PRIVATE_KEY, VAPID_PUBLIC_KEY, VAPID_SUBJECT


def _do_send_push(
    endpoint: str,
    encrypted: bytes,
    headers: dict[str, str],
) -> tuple[int, str]:
    """Blocking HTTP POST to push endpoint. Returns (status_code, body)."""
    req = urllib.request.Request(
        endpoint,
        data=encrypted,
        headers={**headers, "Content-Length": str(len(encrypted))},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return resp.status, resp.read().decode(errors="replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode(errors="replace")
    except Exception as e:
        return 0, str(e)


async def send_web_push(
    user: "User",
    subscription: "PushSubscription",
    title: str,
    body: str,
    tag: str | None = None,
) -> bool:
    """
    Send a Web Push notification to a single subscriber.

    Args:
        user: the User who owns the subscription
        subscription: the PushSubscription row
        title: notification title
        body: notification body text
        tag: optional notification tag (for deduplication)
    """
    try:
        from webpush import WebPush, WebPushSubscription

        private_key, public_key, subject = _get_vapid_keys()

        sub = WebPushSubscription(
            endpoint=subscription.endpoint,
            keys={"p256dh": subscription.p256dh, "auth": subscription.auth},
        )

        webpush = WebPush(
            private_key=private_key.encode(),
            public_key=public_key.encode(),
            subscriber=subject,
        )

        message = json.dumps({"title": title, "body": body, "tag": tag}).encode("utf-8")
        push_msg = webpush.get(message, sub, subscriber=subject)

        headers = dict(push_msg.headers)

        # Run blocking HTTP call in thread pool
        status, _ = await asyncio.to_thread(
            _do_send_push, subscription.endpoint, push_msg.encrypted, headers
        )

        if status in (200, 201, 204):
            return True
        logger.warning(f"[webpush] Push failed for user {user.id}: HTTP {status}")
        return False

    except Exception as exc:
        logger.warning(f"[webpush] Failed to send push to user {user.id}: {exc}")
        return False

