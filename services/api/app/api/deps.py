from typing import Annotated
from uuid import UUID

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.models import ApiToken, TeamMember, User
from app.security import hash_api_token

security = HTTPBearer(auto_error=False)


# ---- AI Bearer Token auth (existing) ----

async def get_ai_user_id(
    creds: Annotated[HTTPAuthorizationCredentials | None, Depends(security)],
    session: AsyncSession = Depends(get_session),
) -> UUID:
    if creds is None or creds.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="缺少或无效的 Bearer token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    raw = creds.credentials.strip()
    if not raw:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token 为空",
            headers={"WWW-Authenticate": "Bearer"},
        )
    digest = hash_api_token(raw)
    result = await session.execute(select(ApiToken).where(ApiToken.token_hash == digest))
    row = result.scalar_one_or_none()
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="无效或已吊销的 token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return row.user_id


# ---- JWT User auth ----

_jwt_security = HTTPBearer(auto_error=True)


async def get_current_user(
    creds: Annotated[HTTPAuthorizationCredentials, Depends(_jwt_security)],
    session: AsyncSession = Depends(get_session),
) -> User:
    from app.security import decode_access_token

    token = creds.credentials.strip()
    decoded = decode_access_token(token)
    if decoded is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="无效或已过期的 token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    user_id_str, jti, exp = decoded

    # 检查 token 是否在黑名单中（登出过的 token）
    from app.cache import is_token_blacklisted
    if await is_token_blacklisted(jti):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token 已失效，请重新登录",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        user_id = UUID(user_id_str)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="无效的 token payload",
            headers={"WWW-Authenticate": "Bearer"},
        )
    result = await session.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="用户不存在",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user


# ---- JWT User auth（从 query 参数，适用于 EventSource 等无法自定义 header 的客户端）----

async def get_current_user_from_query(
    token: str,
    session: AsyncSession = Depends(get_session),
) -> User:
    """通过 query 参数中的 JWT token 认证用户（用于 SSE 连接）。"""
    from app.security import decode_access_token

    decoded = decode_access_token(token)
    if decoded is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="无效或已过期的 token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    user_id_str, jti, exp = decoded

    from app.cache import is_token_blacklisted
    if await is_token_blacklisted(jti):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token 已失效，请重新登录",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        user_id = UUID(user_id_str)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="无效的 token payload",
            headers={"WWW-Authenticate": "Bearer"},
        )
    result = await session.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="用户不存在",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user


async def get_current_team_member(
    team_id: UUID,
    user: Annotated[User, Depends(get_current_user)],
    session: AsyncSession = Depends(get_session),
) -> TeamMember:
    """Get the current user's membership in a specific team, with role."""
    result = await session.execute(
        select(TeamMember).where(
            TeamMember.team_id == team_id,
            TeamMember.user_id == user.id,
        )
    )
    member = result.scalar_one_or_none()
    if member is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="不是团队成员",
        )
    return member


def require_role(*allowed_roles: str):
    """Dependency factory for role-based access control."""
    async def check_role(
        member: TeamMember = Depends(get_current_team_member),
    ) -> TeamMember:
        if member.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="权限不足",
            )
        return member
    return check_role
