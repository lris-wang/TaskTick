import json
from datetime import UTC, datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.database import get_session
from app.models import SmartList, User
from app.schemas.smart_list import SmartListCreate, SmartListResponse, SmartListUpdate

router = APIRouter(prefix="/smart-lists", tags=["SmartLists"])


def _smart_list_to_dict(sl: SmartList) -> dict:
    filter_data = json.loads(sl.filter_json) if sl.filter_json else {}
    return {
        "id": str(sl.id),
        "name": sl.name,
        "color": sl.color,
        "filter": filter_data,
        "created_at": sl.created_at.isoformat(),
        "updated_at": sl.updated_at.isoformat(),
    }


@router.get("", response_model=list[SmartListResponse])
async def list_smart_lists(
    user: Annotated[User, Depends(get_current_user)],
    session: AsyncSession = Depends(get_session),
) -> list[SmartList]:
    stmt = select(SmartList).where(SmartList.user_id == user.id).order_by(SmartList.created_at.asc())
    result = await session.execute(stmt)
    return list(result.scalars().all())


@router.post("", response_model=SmartListResponse, status_code=status.HTTP_201_CREATED)
async def create_smart_list(
    body: SmartListCreate,
    user: Annotated[User, Depends(get_current_user)],
    session: AsyncSession = Depends(get_session),
) -> SmartList:
    filter_json = "{}"
    if body.filter is not None:
        filter_json = json.dumps(body.filter.model_dump(exclude_none=True))

    smart_list = SmartList(
        user_id=user.id,
        name=body.name,
        color=body.color,
        filter_json=filter_json,
    )
    session.add(smart_list)
    await session.commit()
    await session.refresh(smart_list)
    return smart_list


@router.get("/{smart_list_id}", response_model=SmartListResponse)
async def get_smart_list(
    smart_list_id: UUID,
    user: Annotated[User, Depends(get_current_user)],
    session: AsyncSession = Depends(get_session),
) -> SmartList:
    row = await session.get(SmartList, smart_list_id)
    if row is None or row.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="智能清单不存在")
    return row


@router.patch("/{smart_list_id}", response_model=SmartListResponse)
async def update_smart_list(
    smart_list_id: UUID,
    body: SmartListUpdate,
    user: Annotated[User, Depends(get_current_user)],
    session: AsyncSession = Depends(get_session),
) -> SmartList:
    row = await session.get(SmartList, smart_list_id)
    if row is None or row.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="智能清单不存在")

    if body.name is not None:
        row.name = body.name
    if body.color is not None:
        row.color = body.color
    if body.filter is not None:
        row.filter_json = json.dumps(body.filter.model_dump(exclude_none=True))
    row.updated_at = datetime.now(UTC)
    await session.commit()
    await session.refresh(row)
    return row


@router.delete("/{smart_list_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_smart_list(
    smart_list_id: UUID,
    user: Annotated[User, Depends(get_current_user)],
    session: AsyncSession = Depends(get_session),
) -> None:
    row = await session.get(SmartList, smart_list_id)
    if row is None or row.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="智能清单不存在")
    await session.delete(row)
    await session.commit()
