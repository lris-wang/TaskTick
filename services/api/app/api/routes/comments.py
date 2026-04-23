from datetime import UTC, datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.database import get_session
from app.models import Task, User, Comment

router = APIRouter(prefix="/comments", tags=["Comments"])


@router.get("/task/{task_id}", response_model=list[dict])
async def list_comments(
    task_id: UUID,
    user: Annotated[User, Depends(get_current_user)],
    session: AsyncSession = Depends(get_session),
) -> list[Comment]:
    """列出某个任务的所有评论"""
    # Verify task belongs to user
    task = await session.get(Task, task_id)
    if task is None or task.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="任务不存在")

    stmt = select(Comment).where(Comment.task_id == task_id).order_by(Comment.created_at.asc())
    result = await session.execute(stmt)
    comments = list(result.scalars().all())
    return [
        {
            "id": str(c.id),
            "taskId": str(c.task_id),
            "userId": str(c.user_id),
            "authorName": c.author_name,
            "content": c.content,
            "createdAt": c.created_at.isoformat(),
        }
        for c in comments
    ]


@router.post("", response_model=dict, status_code=status.HTTP_201_CREATED)
async def create_comment(
    task_id: UUID,
    content: str,
    user: Annotated[User, Depends(get_current_user)],
    session: AsyncSession = Depends(get_session),
) -> dict:
    """添加评论到任务"""
    # Verify task belongs to user
    task = await session.get(Task, task_id)
    if task is None or task.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="任务不存在")

    if not content or not content.strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="评论内容不能为空")

    comment = Comment(
        task_id=task_id,
        user_id=user.id,
        author_name=user.username or user.email or "用户",
        content=content.strip(),
    )
    session.add(comment)
    await session.commit()
    await session.refresh(comment)

    return {
        "id": str(comment.id),
        "taskId": str(comment.task_id),
        "userId": str(comment.user_id),
        "authorName": comment.author_name,
        "content": comment.content,
        "createdAt": comment.created_at.isoformat(),
    }


@router.delete("/{comment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_comment(
    comment_id: UUID,
    user: Annotated[User, Depends(get_current_user)],
    session: AsyncSession = Depends(get_session),
) -> None:
    """删除评论（仅评论作者可删除）"""
    row = await session.get(Comment, comment_id)
    if row is None or row.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="评论不存在或无权限")
    await session.delete(row)
    await session.commit()
