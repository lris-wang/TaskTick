from datetime import UTC, datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.database import get_session
from app.events import EVENT_NOTE_CREATED, EVENT_NOTE_DELETED, EVENT_NOTE_UPDATED, sse_emitter
from app.models import Note, User
from app.schemas.note import NoteCreate, NoteResponse, NoteUpdate

router = APIRouter(prefix="/notes", tags=["Notes"])


@router.get("", response_model=list[NoteResponse])
async def list_notes(
    user: Annotated[User, Depends(get_current_user)],
    session: AsyncSession = Depends(get_session),
) -> list[Note]:
    stmt = select(Note).where(
        Note.user_id == user.id,
        Note.deleted_at.is_(None),
    ).order_by(Note.created_at.desc())
    result = await session.execute(stmt)
    return list(result.scalars().all())


@router.post("", response_model=NoteResponse, status_code=status.HTTP_201_CREATED)
async def create_note(
    body: NoteCreate,
    user: Annotated[User, Depends(get_current_user)],
    session: AsyncSession = Depends(get_session),
) -> Note:
    note = Note(
        user_id=user.id,
        title=body.title,
        content=body.content,
        is_markdown=body.is_markdown,
    )
    session.add(note)
    await session.commit()
    await session.refresh(note)
    await sse_emitter.emit(user.id, EVENT_NOTE_CREATED, {
        "id": str(note.id),
        "user_id": str(note.user_id),
        "title": note.title,
        "content": note.content,
        "is_markdown": note.is_markdown,
        "created_at": note.created_at.isoformat(),
        "updated_at": note.updated_at.isoformat(),
    })
    return note


@router.get("/{note_id}", response_model=NoteResponse)
async def get_note(
    note_id: UUID,
    user: Annotated[User, Depends(get_current_user)],
    session: AsyncSession = Depends(get_session),
) -> Note:
    row = await session.get(Note, note_id)
    if row is None or row.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="笔记不存在")
    if row.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="笔记不存在")
    return row


@router.patch("/{note_id}", response_model=NoteResponse)
async def update_note(
    note_id: UUID,
    body: NoteUpdate,
    user: Annotated[User, Depends(get_current_user)],
    session: AsyncSession = Depends(get_session),
) -> Note:
    row = await session.get(Note, note_id)
    if row is None or row.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="笔记不存在")
    if row.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="笔记不存在")

    data = body.model_dump(exclude_unset=True)
    for k, v in data.items():
        if k == "is_markdown":
            setattr(row, "is_markdown", v)
        else:
            setattr(row, k, v)
    row.updated_at = datetime.now(UTC)
    await session.commit()
    await session.refresh(row)
    await sse_emitter.emit(user.id, EVENT_NOTE_UPDATED, {
        "id": str(row.id),
        "title": row.title,
        "content": row.content,
        "is_markdown": row.is_markdown,
        "updated_at": row.updated_at.isoformat(),
    })
    return row


@router.delete("/{note_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_note(
    note_id: UUID,
    user: Annotated[User, Depends(get_current_user)],
    session: AsyncSession = Depends(get_session),
) -> None:
    row = await session.get(Note, note_id)
    if row is None or row.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="笔记不存在")
    if row.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="笔记不存在")
    row.deleted_at = datetime.now(UTC)
    await session.commit()
    await sse_emitter.emit(user.id, EVENT_NOTE_DELETED, {"id": str(note_id)})
