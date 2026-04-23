from datetime import UTC, datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.database import get_session
from app.models import Schedule, User
from app.schemas.schedule import ScheduleCreate, ScheduleRead, ScheduleUpdate

router = APIRouter(prefix="/schedules", tags=["Schedules"])


@router.get("", response_model=list[ScheduleRead])
async def list_schedules(
    user: Annotated[User, Depends(get_current_user)],
    session: AsyncSession = Depends(get_session),
    from_time: datetime | None = Query(default=None, alias="from"),
    to_time: datetime | None = Query(default=None, alias="to"),
    limit: int = Query(default=100, ge=1, le=500),
) -> list[Schedule]:
    stmt = select(Schedule).where(Schedule.user_id == user.id)
    if from_time is not None:
        stmt = stmt.where(Schedule.start_at >= from_time)
    if to_time is not None:
        stmt = stmt.where(Schedule.start_at <= to_time)
    stmt = stmt.order_by(Schedule.start_at.asc()).limit(limit)
    result = await session.execute(stmt)
    return list(result.scalars().all())


@router.post("", response_model=ScheduleRead, status_code=status.HTTP_201_CREATED)
async def create_schedule(
    body: ScheduleCreate,
    user: Annotated[User, Depends(get_current_user)],
    session: AsyncSession = Depends(get_session),
) -> Schedule:
    row = Schedule(
        user_id=user.id,
        title=body.title,
        description=body.description,
        start_at=body.start_at,
        end_at=body.end_at,
        timezone=body.timezone,
        location=body.location,
    )
    session.add(row)
    await session.commit()
    await session.refresh(row)
    return row


@router.get("/{schedule_id}", response_model=ScheduleRead)
async def get_schedule(
    schedule_id: UUID,
    user: Annotated[User, Depends(get_current_user)],
    session: AsyncSession = Depends(get_session),
) -> Schedule:
    row = await session.get(Schedule, schedule_id)
    if row is None or row.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="日程不存在")
    return row


@router.patch("/{schedule_id}", response_model=ScheduleRead)
async def update_schedule(
    schedule_id: UUID,
    body: ScheduleUpdate,
    user: Annotated[User, Depends(get_current_user)],
    session: AsyncSession = Depends(get_session),
) -> Schedule:
    row = await session.get(Schedule, schedule_id)
    if row is None or row.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="日程不存在")
    data = body.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(row, k, v)
    row.updated_at = datetime.now(UTC)
    await session.commit()
    await session.refresh(row)
    return row


@router.delete("/{schedule_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_schedule(
    schedule_id: UUID,
    user: Annotated[User, Depends(get_current_user)],
    session: AsyncSession = Depends(get_session),
) -> None:
    row = await session.get(Schedule, schedule_id)
    if row is None or row.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="日程不存在")
    await session.delete(row)
    await session.commit()
