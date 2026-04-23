"""
Verification code generation and storage.

Uses Redis (if configured) with TTL, otherwise falls back to an in-memory dict.
Keys are prefixed to avoid collisions.
"""

import random
import time
from typing import Callable, Awaitable

from app.config import get_settings

CODE_PREFIX = "verify_code:"
RESET_CODE_PREFIX = "reset_code:"
# Fallback in-memory store: email -> (code, expires_at)
_memory_store: dict[str, tuple[str, float]] = {}


def _generate_code() -> str:
    """Generate a 4-digit code using digits 1-9 (no zeros to avoid confusion with O)."""
    return "".join(str(random.randint(1, 9)) for _ in range(4))


async def _get_redis_or_none() -> "redis.Redis | None":
    try:
        from app.cache import get_redis
        return await get_redis()
    except Exception:
        return None


def _in_memory_store(email: str, code: str, ttl_seconds: int) -> None:
    """Store code in memory with expiry."""
    _memory_store[email] = (code, time.time() + ttl_seconds)


def _in_memory_verify(email: str, code: str) -> bool:
    """Verify code from memory store, returns True and deletes on match."""
    entry = _memory_store.get(email)
    if entry is None:
        return False
    stored_code, expires_at = entry
    if time.time() > expires_at:
        del _memory_store[email]
        return False
    if stored_code != code:
        return False
    del _memory_store[email]
    return True


def _in_memory_delete(email: str) -> None:
    _memory_store.pop(email, None)


# ---- Public API ----

def generate_code(email: str, ttl_seconds: int | None = None) -> str:
    """Generate a new code for the given email. Does NOT store it — use store_code()."""
    if ttl_seconds is None:
        ttl_seconds = get_settings().email_verify_code_ttl_seconds
    return _generate_code()


async def store_code(email: str, code: str) -> bool:
    """
    Store a verification code for the email.
    Returns True if stored successfully (or at least attempted).
    """
    settings = get_settings()
    ttl = ttl_seconds if (ttl_seconds := settings.email_verify_code_ttl_seconds) else 600
    redis_client = await _get_redis_or_none()

    if redis_client is not None:
        try:
            await redis_client.setex(f"{CODE_PREFIX}{email}", ttl, code)
            return True
        except Exception:
            pass

    # Fallback to memory
    _in_memory_store(email, code, ttl)
    return True


async def verify_code(email: str, code: str) -> bool:
    """
    Verify the code for the email.
    - Returns True if the code matches and is not expired.
    - The code is deleted after verification (one-time use).
    """
    redis_client = await _get_redis_or_none()

    if redis_client is not None:
        try:
            stored = await redis_client.get(f"{CODE_PREFIX}{email}")
            if stored is None:
                return False
            if stored != code:
                return False
            await redis_client.delete(f"{CODE_PREFIX}{email}")
            return True
        except Exception:
            pass

    # Fallback to memory
    return _in_memory_verify(email, code)


async def delete_code(email: str) -> None:
    """Delete the stored code for an email (e.g., after successful registration)."""
    redis_client = await _get_redis_or_none()

    if redis_client is not None:
        try:
            await redis_client.delete(f"{CODE_PREFIX}{email}")
            return
        except Exception:
            pass

    _in_memory_delete(email)


async def store_reset_code(email: str, code: str) -> bool:
    """Store a password reset code. Same TTL as verification codes."""
    settings = get_settings()
    ttl = settings.email_verify_code_ttl_seconds
    redis_client = await _get_redis_or_none()

    if redis_client is not None:
        try:
            await redis_client.setex(f"{RESET_CODE_PREFIX}{email}", ttl, code)
            return True
        except Exception:
            pass

    # Fallback to memory (reuse same dict, keyed differently)
    _memory_store[f"reset:{email}"] = (code, time.time() + ttl)
    return True


async def verify_reset_code(email: str, code: str) -> bool:
    """
    Verify a password reset code.
    - Returns True if the code matches and is not expired.
    - The code is deleted after verification (one-time use).
    """
    redis_client = await _get_redis_or_none()

    if redis_client is not None:
        try:
            stored = await redis_client.get(f"{RESET_CODE_PREFIX}{email}")
            if stored is None:
                return False
            if stored != code:
                return False
            await redis_client.delete(f"{RESET_CODE_PREFIX}{email}")
            return True
        except Exception:
            pass

    # Fallback to memory
    entry = _memory_store.get(f"reset:{email}")
    if entry is None:
        return False
    stored_code, expires_at = entry
    if time.time() > expires_at:
        del _memory_store[f"reset:{email}"]
        return False
    if stored_code != code:
        return False
    del _memory_store[f"reset:{email}"]
    return True


async def delete_reset_code(email: str) -> None:
    """Delete the stored reset code for an email."""
    redis_client = await _get_redis_or_none()

    if redis_client is not None:
        try:
            await redis_client.delete(f"{RESET_CODE_PREFIX}{email}")
            return
        except Exception:
            pass

    _memory_store.pop(f"reset:{email}", None)


async def get_remaining_ttl(email: str) -> int:
    """Get remaining TTL in seconds, or 0 if not found or Redis unavailable."""
    redis_client = await _get_redis_or_none()

    if redis_client is not None:
        try:
            ttl = await redis_client.ttl(f"{CODE_PREFIX}{email}")
            return max(ttl, 0)
        except Exception:
            pass

    # Memory fallback
    entry = _memory_store.get(email)
    if entry is None:
        return 0
    remaining = int(entry[1] - time.time())
    return max(remaining, 0)
