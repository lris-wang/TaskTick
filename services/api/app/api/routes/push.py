"""
Web Push subscription management.

POST   /api/v1/push/subscribe       — save/update push subscription
DELETE /api/v1/push/unsubscribe    — remove subscription
GET    /api/v1/push/vapid-key      — get VAPID public key for frontend
"""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.database import get_session
from app.models import PushSubscription, User
from app.utils.vapid import VAPID_PUBLIC_KEY, VAPID_APPLICATION_SERVER_KEY

router = APIRouter(prefix="/push", tags=["Push"])


class SubscribeBody(BaseModel):
    endpoint: str
    p256dh: str
    auth: str


class VapidKeyResponse(BaseModel):
    public_key: str


@router.post("/subscribe")
async def subscribe(
    body: SubscribeBody,
    user: Annotated[User, Depends(get_current_user)],
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Save or update the user's push subscription (one per user)."""
    # Upsert: delete old then insert new
    await session.execute(
        delete(PushSubscription).where(PushSubscription.user_id == user.id)
    )
    sub = PushSubscription(
        user_id=user.id,
        endpoint=body.endpoint,
        p256dh=body.p256dh,
        auth=body.auth,
    )
    session.add(sub)
    await session.commit()
    return {"status": "ok"}


@router.delete("/unsubscribe")
async def unsubscribe(
    user: Annotated[User, Depends(get_current_user)],
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Remove the user's push subscription."""
    await session.execute(
        delete(PushSubscription).where(PushSubscription.user_id == user.id)
    )
    await session.commit()
    return {"status": "ok"}


@router.get("/vapid-key", response_model=VapidKeyResponse)
async def get_vapid_key() -> VapidKeyResponse:
    """Return the VAPID application server key for the frontend to use when subscribing."""
    return VapidKeyResponse(public_key=VAPID_APPLICATION_SERVER_KEY)
