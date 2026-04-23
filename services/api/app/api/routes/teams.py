from datetime import UTC, datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.api.deps import get_current_user, get_current_team_member
from app.database import get_session
from app.events import sse_emitter
from app.models import Project, Tag, Team, TeamMember, User
from app.schemas.project import ProjectResponse
from app.schemas.tag import TagResponse
from app.schemas.team import TeamCreate, TeamResponse, TeamUpdate
from app.schemas.team_member import (
    TransferOwnershipRequest,
    TransferOwnershipResponse,
    TeamInviteRequest,
    TeamInviteResponse,
    TeamMemberResponse,
    TeamMemberUpdate,
    TeamMemberWithUser,
)

router = APIRouter(prefix="/teams", tags=["Teams"])


# ---- Team CRUD ----


@router.get("", response_model=list[TeamResponse])
async def list_teams(
    user: Annotated[User, Depends(get_current_user)],
    session: AsyncSession = Depends(get_session),
) -> list[Team]:
    stmt = (
        select(Team)
        .join(TeamMember, TeamMember.team_id == Team.id)
        .where(TeamMember.user_id == user.id)
        .order_by(Team.created_at.asc())
    )
    result = await session.execute(stmt)
    return list(result.scalars().all())


@router.post("", response_model=TeamResponse, status_code=status.HTTP_201_CREATED)
async def create_team(
    body: TeamCreate,
    user: Annotated[User, Depends(get_current_user)],
    session: AsyncSession = Depends(get_session),
) -> Team:
    team = Team(name=body.name, owner_user_id=user.id)
    session.add(team)
    await session.flush()

    # Auto-add creator as owner member
    member = TeamMember(team_id=team.id, user_id=user.id, role="owner")
    session.add(member)

    await session.commit()
    await session.refresh(team)
    return team


@router.get("/{team_id}", response_model=TeamResponse)
async def get_team(
    team_id: UUID,
    member: Annotated[TeamMember, Depends(get_current_team_member)],
    session: AsyncSession = Depends(get_session),
) -> Team:
    team = await session.get(Team, team_id)
    return team


@router.patch("/{team_id}", response_model=TeamResponse)
async def update_team(
    team_id: UUID,
    body: TeamUpdate,
    member: Annotated[TeamMember, Depends(get_current_team_member)],
    session: AsyncSession = Depends(get_session),
) -> Team:
    # Only owner/admin can update
    if member.role not in ("owner", "admin"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="权限不足")

    team = await session.get(Team, team_id)
    if team is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="团队不存在")

    if body.name is not None:
        team.name = body.name
    team.updated_at = datetime.now(UTC)
    await session.commit()
    await session.refresh(team)
    return team


@router.delete("/{team_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_team(
    team_id: UUID,
    member: Annotated[TeamMember, Depends(get_current_team_member)],
    session: AsyncSession = Depends(get_session),
) -> None:
    # Only owner can delete
    if member.role != "owner":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="只有队长可以删除团队")

    team = await session.get(Team, team_id)
    if team is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="团队不存在")

    await session.delete(team)
    await session.commit()


# ---- Team Members ----


@router.get("/{team_id}/members", response_model=list[TeamMemberWithUser])
async def list_members(
    team_id: UUID,
    member: Annotated[TeamMember, Depends(get_current_team_member)],
    session: AsyncSession = Depends(get_session),
) -> list:
    stmt = (
        select(TeamMember, User)
        .join(User, User.id == TeamMember.user_id)
        .where(TeamMember.team_id == team_id)
        .order_by(TeamMember.joined_at.asc())
    )
    result = await session.execute(stmt)
    rows = result.all()
    return [
        TeamMemberWithUser(
            id=m.id,
            team_id=m.team_id,
            user_id=m.user_id,
            role=m.role,
            joined_at=m.joined_at,
            user_email=u.email,
            user_username=u.username,
            user_avatar_url=u.avatar_url,
        )
        for m, u in rows
    ]


@router.post("/{team_id}/invite", response_model=TeamInviteResponse)
async def invite_member(
    team_id: UUID,
    body: TeamInviteRequest,
    member: Annotated[TeamMember, Depends(get_current_team_member)],
    session: AsyncSession = Depends(get_session),
) -> dict:
    # Only owner/admin can invite
    if member.role not in ("owner", "admin"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="权限不足")

    # Find user by email
    result = await session.execute(select(User).where(User.email == body.email))
    invited_user = result.scalar_one_or_none()

    if invited_user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="用户不存在")

    # Check if already a member
    result = await session.execute(
        select(TeamMember).where(
            TeamMember.team_id == team_id,
            TeamMember.user_id == invited_user.id,
        )
    )
    if result.scalar_one_or_none() is not None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="已是团队成员")

    # Validate role
    if body.role not in ("admin", "member", "guest"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="无效的角色")

    # Create membership
    new_member = TeamMember(
        team_id=team_id,
        user_id=invited_user.id,
        role=body.role,
    )
    session.add(new_member)
    await session.commit()

    return {"message": "邀请成功", "invited_email": body.email}


@router.patch("/{team_id}/members/{target_user_id}", response_model=TeamMemberResponse)
async def update_member_role(
    team_id: UUID,
    target_user_id: UUID,
    body: TeamMemberUpdate,
    member: Annotated[TeamMember, Depends(get_current_team_member)],
    session: AsyncSession = Depends(get_session),
) -> TeamMember:
    # Only owner/admin can update roles
    if member.role not in ("owner", "admin"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="权限不足")

    # Cannot demote owner
    result = await session.execute(
        select(TeamMember).where(
            TeamMember.team_id == team_id,
            TeamMember.user_id == target_user_id,
        )
    )
    target = result.scalar_one_or_none()
    if target is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="成员不存在")

    if target.role == "owner":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无法修改队长角色")

    if body.role is not None:
        if body.role not in ("admin", "member", "guest"):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="无效的角色")
        target.role = body.role

    await session.commit()
    await session.refresh(target)
    return target


@router.post("/{team_id}/transfer-ownership", response_model=TransferOwnershipResponse)
async def transfer_ownership(
    team_id: UUID,
    body: TransferOwnershipRequest,
    member: Annotated[TeamMember, Depends(get_current_team_member)],
    session: AsyncSession = Depends(get_session),
) -> dict:
    """转让队长所有权给其他成员，转让后原队长变为 admin。"""
    if member.role != "owner":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="仅队长可以转让所有权")

    if body.target_user_id == member.user_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="不能转让给自己")

    # Find current owner
    result = await session.execute(
        select(TeamMember).where(
            TeamMember.team_id == team_id,
            TeamMember.user_id == member.user_id,
        )
    )
    current_owner = result.scalar_one_or_none()
    if current_owner is None or current_owner.role != "owner":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权操作")

    # Find target member
    result2 = await session.execute(
        select(TeamMember).where(
            TeamMember.team_id == team_id,
            TeamMember.user_id == body.target_user_id,
        )
    )
    target_member = result2.scalar_one_or_none()
    if target_member is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="目标成员不存在")

    # Transfer ownership: target becomes owner, current owner becomes admin
    target_member.role = "owner"
    current_owner.role = "admin"

    await session.commit()

    return {"message": "所有权已转让", "new_owner_id": str(body.target_user_id)}


@router.delete("/{team_id}/members/{target_user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_member(
    team_id: UUID,
    target_user_id: UUID,
    member: Annotated[TeamMember, Depends(get_current_team_member)],
    session: AsyncSession = Depends(get_session),
) -> None:
    result = await session.execute(
        select(TeamMember).where(
            TeamMember.team_id == team_id,
            TeamMember.user_id == target_user_id,
        )
    )
    target = result.scalar_one_or_none()
    if target is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="成员不存在")

    if target.role == "owner":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无法移除队长")

    # Only owner/admin can remove others; user can remove themselves
    if member.role not in ("owner", "admin") and member.user_id != target_user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="权限不足")

    await session.delete(target)
    await session.commit()


# ---- Team Resources ----


@router.get("/{team_id}/projects", response_model=list[ProjectResponse])
async def list_team_projects(
    team_id: UUID,
    member: Annotated[TeamMember, Depends(get_current_team_member)],
    session: AsyncSession = Depends(get_session),
) -> list[ProjectResponse]:
    stmt = select(Project).where(
        Project.team_id == team_id,
        Project.deleted_at.is_(None),
    ).order_by(Project.created_at.asc())
    result = await session.execute(stmt)
    projects = result.scalars().all()
    return [ProjectResponse.model_validate(p) for p in projects]


@router.get("/{team_id}/tags", response_model=list[TagResponse])
async def list_team_tags(
    team_id: UUID,
    member: Annotated[TeamMember, Depends(get_current_team_member)],
    session: AsyncSession = Depends(get_session),
) -> list[TagResponse]:
    stmt = select(Tag).where(
        Tag.team_id == team_id,
        Tag.deleted_at.is_(None),
    ).order_by(Tag.created_at.asc())
    result = await session.execute(stmt)
    tags = result.scalars().all()
    return [TagResponse.model_validate(t) for t in tags]
