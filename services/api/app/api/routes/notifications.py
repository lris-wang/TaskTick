"""
Notification history — lets users query failed email/push delivery events.
"""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.cache.redis import get_notification_failures
from app.models import User

router = APIRouter(prefix="/notifications", tags=["Notifications"])


class NotificationFailure(BaseModel):
    type: str
    subject: str
    reason: str
    ts: float


class NotificationFailureResponse(BaseModel):
    failures: list[NotificationFailure]


@router.get("/failures", response_model=NotificationFailureResponse)
async def list_notification_failures(
    user: Annotated[User, Depends(get_current_user)],
) -> NotificationFailureResponse:
    """Return recent notification delivery failures for the current user (last 24h)."""
    failures = await get_notification_failures(str(user.id))
    return NotificationFailureResponse(
        failures=[NotificationFailure(**f) for f in failures]
    )
