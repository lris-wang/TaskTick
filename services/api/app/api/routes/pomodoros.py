from datetime import UTC, datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.database import get_session
from app.models import PomodoroSession, User
from app.schemas.pomodoro import (
    PomodoroSessionCreate,
    PomodoroSessionResponse,
    PomodoroSessionUpdate,
    PomodoroStatsResponse,
)

router = APIRouter(prefix="/pomodoros", tags=["Pomodoros"])


def _dt_start_of_day(dt: datetime) -> datetime:
    return dt.replace(hour=0, minute=0, second=0, microsecond=0)


def _dt_start_of_week(dt: datetime) -> datetime:
    # week starts on Monday
    days_since_monday = dt.weekday()
    return _dt_start_of_day(dt).replace(day=dt.day - days_since_monday)


@router.get("", response_model=list[PomodoroSessionResponse])
async def list_pomodoros(
    user: Annotated[User, Depends(get_current_user)],
    session: AsyncSession = Depends(get_session),
    task_id: UUID | None = Query(default=None),
    from_time: datetime | None = Query(default=None, alias="from"),
    to_time: datetime | None = Query(default=None, alias="to"),
    limit: int = Query(default=100, ge=1, le=500),
) -> list[PomodoroSession]:
    stmt = select(PomodoroSession).where(PomodoroSession.user_id == user.id)
    if task_id is not None:
        stmt = stmt.where(PomodoroSession.task_id == task_id)
    if from_time is not None:
        stmt = stmt.where(PomodoroSession.started_at >= from_time)
    if to_time is not None:
        stmt = stmt.where(PomodoroSession.started_at <= to_time)
    stmt = stmt.order_by(PomodoroSession.started_at.desc()).limit(limit)
    result = await session.execute(stmt)
    return list(result.scalars().all())


@router.post("", response_model=PomodoroSessionResponse, status_code=status.HTTP_201_CREATED)
async def create_pomodoro(
    body: PomodoroSessionCreate,
    user: Annotated[User, Depends(get_current_user)],
    session: AsyncSession = Depends(get_session),
) -> PomodoroSession:
    row = PomodoroSession(
        user_id=user.id,
        task_id=body.task_id,
        started_at=body.started_at,
        duration_minutes=body.duration_minutes,
    )
    session.add(row)
    await session.commit()
    await session.refresh(row)
    return row


@router.get("/stats", response_model=PomodoroStatsResponse)
async def get_pomodoro_stats(
    user: Annotated[User, Depends(get_current_user)],
    session: AsyncSession = Depends(get_session),
) -> dict:
    now = datetime.now(UTC)
    today_start = _dt_start_of_day(now)
    week_start = _dt_start_of_week(now)

    # total
    total_stmt = select(
        func.count(PomodoroSession.id),
        func.coalesce(func.sum(PomodoroSession.duration_minutes), 0),
    ).where(
        PomodoroSession.user_id == user.id,
        PomodoroSession.completed == True,  # noqa: E712
    )
    total_result = await session.execute(total_stmt)
    total_sessions, total_minutes = total_result.one()

    # today
    today_stmt = select(
        func.count(PomodoroSession.id),
        func.coalesce(func.sum(PomodoroSession.duration_minutes), 0),
    ).where(
        PomodoroSession.user_id == user.id,
        PomodoroSession.completed == True,  # noqa: E712
        PomodoroSession.started_at >= today_start,
    )
    today_result = await session.execute(today_stmt)
    today_sessions, today_minutes = today_result.one()

    # week
    week_stmt = select(
        func.count(PomodoroSession.id),
        func.coalesce(func.sum(PomodoroSession.duration_minutes), 0),
    ).where(
        PomodoroSession.user_id == user.id,
        PomodoroSession.completed == True,  # noqa: E712
        PomodoroSession.started_at >= week_start,
    )
    week_result = await session.execute(week_stmt)
    week_sessions, week_minutes = week_result.one()

    return {
        "total_sessions": total_sessions or 0,
        "total_minutes": total_minutes or 0,
        "today_sessions": today_sessions or 0,
        "today_minutes": today_minutes or 0,
        "week_sessions": week_sessions or 0,
        "week_minutes": week_minutes or 0,
    }


@router.get("/{pomodoro_id}", response_model=PomodoroSessionResponse)
async def get_pomodoro(
    pomodoro_id: UUID,
    user: Annotated[User, Depends(get_current_user)],
    session: AsyncSession = Depends(get_session),
) -> PomodoroSession:
    row = await session.get(PomodoroSession, pomodoro_id)
    if row is None or row.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="番茄钟不存在")
    return row


@router.patch("/{pomodoro_id}", response_model=PomodoroSessionResponse)
async def update_pomodoro(
    pomodoro_id: UUID,
    body: PomodoroSessionUpdate,
    user: Annotated[User, Depends(get_current_user)],
    session: AsyncSession = Depends(get_session),
) -> PomodoroSession:
    row = await session.get(PomodoroSession, pomodoro_id)
    if row is None or row.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="番茄钟不存在")
    data = body.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(row, k, v)
    row.updated_at = datetime.now(UTC)
    await session.commit()
    await session.refresh(row)
    return row


@router.delete("/{pomodoro_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_pomodoro(
    pomodoro_id: UUID,
    user: Annotated[User, Depends(get_current_user)],
    session: AsyncSession = Depends(get_session),
) -> None:
    row = await session.get(PomodoroSession, pomodoro_id)
    if row is None or row.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="番茄钟不存在")
    await session.delete(row)
    await session.commit()
