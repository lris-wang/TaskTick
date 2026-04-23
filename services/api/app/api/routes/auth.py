from typing import Annotated
from uuid import uuid4

import logging
from fastapi import APIRouter, Depends, File, HTTPException, status, UploadFile
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select

logger = logging.getLogger(__name__)
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.cache import blacklist_token, store_notification_failure
from app.config import get_settings
from app.database import get_session
from app.models import User
from app.schemas.auth import (
    ChangeAvatarRequest,
    ChangePasswordRequest,
    ChangeUsernameRequest,
    RegisterWithCodeRequest,
    ResetPasswordRequest,
    SendResetCodeRequest,
    SendVerifyCodeRequest,
    TokenResponse,
    UserLogin,
    UserRegister,
    UserResponse,
)
from app.security import create_access_token, decode_access_token, hash_password, verify_password
from app.storage.minio_store import MinioStore, minio_configured
from app.utils.email import send_password_reset_code, send_verification_code
from app.utils.verify_code import (
    delete_code,
    delete_reset_code,
    generate_code,
    store_code,
    store_reset_code,
    verify_code,
    verify_reset_code,
)

router = APIRouter(prefix="/auth", tags=["Auth"])


@router.get("/me", response_model=UserResponse)
async def get_me(
    current_user: User = Depends(get_current_user),
) -> User:
    """Get current authenticated user info."""
    return current_user


@router.post("/avatar-upload", status_code=status.HTTP_201_CREATED)
async def upload_avatar(
    file: UploadFile = File(...),
) -> dict:
    """
    上传头像（无需认证，仅用于注册流程）。
    优先使用 MinIO 存储并返回 presigned URL；MinIO 不可用时返回 base64 data URI。
    """
    settings = get_settings()
    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="空文件")

    max_bytes = settings.minio_max_upload_bytes
    if len(raw) > max_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"文件超过限制（最大 {max_bytes} 字节）",
        )

    content_type = file.content_type or "image/png"

    # Try MinIO first
    if minio_configured(settings):
        try:
            host, port_str = settings.minio_endpoint.split(":")
            port = int(port_str)
            sock = __import__("socket").socket()
            sock.settimeout(3)
            sock.connect((host, port))
            sock.close()
        except Exception:
            pass
        else:
            from app.storage.minio_store import sanitize_filename
            import anyio

            name = file.filename or "avatar.png"
            object_key = f"temp/{uuid4().hex}_{sanitize_filename(name)}"

            def _put() -> None:
                store = MinioStore.from_settings(settings)
                store.put_bytes(object_key, raw, content_type)

            await anyio.to_thread.run_sync(_put)

            def _url() -> str:
                store = MinioStore.from_settings(settings)
                url, _ = store.presigned_get_url(object_key)
                return url

            avatar_url: str = await anyio.to_thread.run_sync(_url)
            return {"avatar_url": avatar_url}

    # Fallback: return base64 data URI (works without MinIO)
    import base64

    b64 = base64.b64encode(raw).decode("ascii")
    avatar_url = f"data:{content_type};base64,{b64}"
    return {"avatar_url": avatar_url}


@router.post("/send-verify-code")
async def send_verify_code(
    body: SendVerifyCodeRequest,
    session: AsyncSession = Depends(get_session),
) -> dict:
    """
    Send a 4-digit verification code to the given email.
    If the email is already registered, still return success (don't reveal registration status).
    Rate limiting is handled by the global middleware.
    """
    # Check if email already registered
    result = await session.execute(select(User).where(User.email == body.email))
    if result.scalar_one_or_none() is not None:
        # Don't reveal whether email is taken
        return {"message": "验证码已发送"}

    code = generate_code(body.email)
    await store_code(body.email, code)
    # Always log the code so it's visible in dev server output even if SMTP is not configured
    logger.info("[verify_code] email=%s code=%s", body.email, code)
    sent = await send_verification_code(body.email, code)

    if not sent:
        logger.warning("[verify_code] email=%s: SMTP send failed after all retries", body.email)
        # Return the same message to avoid email enumeration, but include sent flag for frontend warning
        return {"message": "验证码已发送", "sent": False}

    return {"message": "验证码已发送", "sent": True}


@router.post("/register-with-code", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register_with_code(
    body: RegisterWithCodeRequest,
    session: AsyncSession = Depends(get_session),
) -> User:
    """
    Register with email + verification code + password.
    The verification code must be obtained via POST /send-verify-code first.
    """
    # Verify the code
    if not await verify_code(body.email, body.code):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="验证码错误或已过期",
        )

    # Check email not already registered
    result = await session.execute(select(User).where(User.email == body.email))
    if result.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="该邮箱已被注册",
        )

    # Check username
    if body.username:
        result = await session.execute(select(User).where(User.username == body.username))
        if result.scalar_one_or_none() is not None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="该用户名已被使用",
            )

    user = User(
        email=body.email,
        username=body.username,
        password_hash=hash_password(body.password),
        avatar_url=body.avatar_url,
    )
    session.add(user)
    await session.commit()
    await session.refresh(user)

    # Clean up verification code
    await delete_code(body.email)

    return user


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register(
    body: UserRegister,
    session: AsyncSession = Depends(get_session),
) -> User:
    result = await session.execute(select(User).where(User.email == body.email))
    if result.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="该邮箱已被注册",
        )
    result = await session.execute(select(User).where(User.username == body.username))
    if result.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="该用户名已被使用",
        )
    user = User(
        email=body.email,
        username=body.username,
        password_hash=hash_password(body.password),
    )
    session.add(user)
    await session.commit()
    await session.refresh(user)
    return user


@router.post("/login", response_model=TokenResponse)
async def login(
    body: UserLogin,
    session: AsyncSession = Depends(get_session),
) -> TokenResponse:
    result = await session.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()
    if user is None or not verify_password(body.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="邮箱或密码错误",
        )
    access_token = create_access_token(str(user.id))
    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        id=str(user.id),
        email=user.email,
        username=user.username,
        avatar_url=user.avatar_url,
    )


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    creds: Annotated[HTTPAuthorizationCredentials, Depends(HTTPBearer(auto_error=True))],
) -> None:
    """
    登出：将当前 token 加入黑名单（Redis），后续请求会被拒绝。
    """
    token = creds.credentials.strip()
    decoded = decode_access_token(token)
    if decoded is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="无效的 token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    _user_id, jti, exp = decoded
    await blacklist_token(jti, exp)


@router.post("/send-reset-code")
async def send_reset_code(
    body: SendResetCodeRequest,
    session: AsyncSession = Depends(get_session),
) -> dict:
    """
    发送密码重置验证码到邮箱。
    无论邮箱是否存在，始终返回成功（防止用户枚举）。
    """
    # Check if email exists
    result = await session.execute(select(User).where(User.email == body.email))
    if result.scalar_one_or_none() is None:
        # Don't reveal whether email is registered
        return {"message": "如果该邮箱已注册，重置验证码已发送"}

    code = generate_code(body.email)
    await store_reset_code(body.email, code)
    # Always log the code so it's visible in dev server output even if SMTP is not configured
    logger.info("[reset_code] email=%s code=%s", body.email, code)
    sent = await send_password_reset_code(body.email, code)

    if not sent:
        logger.warning("[reset_code] email=%s: SMTP send failed after all retries", body.email)
        # Return same message to avoid email enumeration; sent flag allows frontend to show warning
        return {"message": "如果该邮箱已注册，重置验证码已发送", "sent": False}

    return {"message": "如果该邮箱已注册，重置验证码已发送", "sent": True}


@router.post("/reset-password", status_code=status.HTTP_204_NO_CONTENT)
async def reset_password(
    body: ResetPasswordRequest,
    session: AsyncSession = Depends(get_session),
) -> None:
    """
    验证密码重置码并更新密码。
    """
    if not await verify_reset_code(body.email, body.code):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="验证码错误或已过期",
        )

    result = await session.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="用户不存在",
        )

    user.password_hash = hash_password(body.new_password)
    session.add(user)
    await session.commit()

    await delete_reset_code(body.email)


@router.put("/username", response_model=UserResponse)
async def change_username(
    body: ChangeUsernameRequest,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> User:
    """
    修改用户名。
    """
    result = await session.execute(
        select(User).where(User.username == body.username, User.id != current_user.id)
    )
    if result.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="该用户名已被使用",
        )
    current_user.username = body.username
    session.add(current_user)
    await session.commit()
    await session.refresh(current_user)
    return current_user


@router.put("/avatar", response_model=UserResponse)
async def change_avatar(
    body: ChangeAvatarRequest,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> User:
    """
    修改头像。
    """
    current_user.avatar_url = body.avatar_url
    session.add(current_user)
    await session.commit()
    await session.refresh(current_user)
    return current_user


@router.put("/password", status_code=status.HTTP_204_NO_CONTENT)
async def change_password(
    body: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> None:
    """
    修改密码，需提供旧密码验证。
    """
    if not verify_password(body.old_password, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="旧密码错误",
        )
    current_user.password_hash = hash_password(body.new_password)
    session.add(current_user)
    await session.commit()
