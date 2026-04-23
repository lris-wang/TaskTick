from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.database import get_session
from app.models import LocationReminder, Task, User
from app.schemas.location_reminder import (
    LocationReminderCreate,
    LocationReminderResponse,
    LocationReminderUpdate,
)

router = APIRouter(prefix="/location-reminders", tags=["LocationReminders"])


@router.get("", response_model=list[LocationReminderResponse])
async def list_location_reminders(
    user: Annotated[User, Depends(get_current_user)],
    session: AsyncSession = Depends(get_session),
) -> list[LocationReminder]:
    """获取用户的所有位置提醒"""
    stmt = select(LocationReminder).where(LocationReminder.user_id == user.id)
    result = await session.execute(stmt)
    return list(result.scalars().all())


@router.post("", response_model=LocationReminderResponse, status_code=status.HTTP_201_CREATED)
async def create_location_reminder(
    body: LocationReminderCreate,
    user: Annotated[User, Depends(get_current_user)],
    session: AsyncSession = Depends(get_session),
) -> LocationReminder:
    """为任务创建位置提醒"""
    # Verify task belongs to user
    task_row = await session.get(Task, body.task_id)
    if task_row is None or task_row.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="任务不存在")

    reminder = LocationReminder(
        user_id=user.id,
        task_id=body.task_id,
        location_name=body.location_name,
        latitude=body.latitude,
        longitude=body.longitude,
        radius=body.radius,
        reminder_type=body.reminder_type,
        enabled=body.enabled,
    )
    session.add(reminder)
    await session.commit()
    await session.refresh(reminder)
    return reminder


@router.get("/{reminder_id}", response_model=LocationReminderResponse)
async def get_location_reminder(
    reminder_id: UUID,
    user: Annotated[User, Depends(get_current_user)],
    session: AsyncSession = Depends(get_session),
) -> LocationReminder:
    """获取单个位置提醒"""
    row = await session.get(LocationReminder, reminder_id)
    if row is None or row.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="位置提醒不存在")
    return row


@router.patch("/{reminder_id}", response_model=LocationReminderResponse)
async def update_location_reminder(
    reminder_id: UUID,
    body: LocationReminderUpdate,
    user: Annotated[User, Depends(get_current_user)],
    session: AsyncSession = Depends(get_session),
) -> LocationReminder:
    """更新位置提醒"""
    row = await session.get(LocationReminder, reminder_id)
    if row is None or row.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="位置提醒不存在")

    data = body.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(row, k, v)
    await session.commit()
    await session.refresh(row)
    return row


@router.delete("/{reminder_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_location_reminder(
    reminder_id: UUID,
    user: Annotated[User, Depends(get_current_user)],
    session: AsyncSession = Depends(get_session),
) -> None:
    """删除位置提醒"""
    row = await session.get(LocationReminder, reminder_id)
    if row is None or row.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="位置提醒不存在")
    await session.delete(row)
    await session.commit()


@router.get("/by-task/{task_id}", response_model=list[LocationReminderResponse])
async def get_reminders_by_task(
    task_id: UUID,
    user: Annotated[User, Depends(get_current_user)],
    session: AsyncSession = Depends(get_session),
) -> list[LocationReminder]:
    """获取任务的所有位置提醒"""
    # Verify task belongs to user
    task_row = await session.get(Task, task_id)
    if task_row is None or task_row.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="任务不存在")

    stmt = select(LocationReminder).where(
        LocationReminder.task_id == task_id,
        LocationReminder.user_id == user.id,
    )
    result = await session.execute(stmt)
    return list(result.scalars().all())
