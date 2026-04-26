"""
Verification code storage using database.
All instances share the same database, so codes work correctly across instances.
"""

import random
from datetime import datetime, timedelta

from sqlalchemy import select, delete
from app.config import get_settings

CODE_TTL_SECONDS = 600  # 10 minutes


def _generate_code() -> str:
    """Generate a 4-digit code using digits 1-9 (no zeros to avoid confusion with O)."""
    return "".join(str(random.randint(1, 9)) for _ in range(4))


async def store_code(email: str, code: str) -> bool:
    """Store a verification code for the email in the database."""
    from app.database import SessionLocal as AsyncSessionLocal
    from app.models import VerificationCode

    ttl = get_settings().email_verify_code_ttl_seconds
    expires_at = datetime.utcnow() + timedelta(seconds=ttl)

    async with AsyncSessionLocal() as session:
        # Upsert: delete existing + insert new
        await session.execute(
            delete(VerificationCode).where(
                VerificationCode.email == email,
                VerificationCode.is_reset == False,  # noqa: E702
            )
        )
        record = VerificationCode(
            email=email,
            code=code,
            expires_at=expires_at,
            is_reset=False,
        )
        session.add(record)
        await session.commit()
    return True


async def verify_code(email: str, code: str) -> bool:
    """Verify the code for the email. Deletes code after verification (one-time use)."""
    from app.database import SessionLocal as AsyncSessionLocal
    from app.models import VerificationCode

    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(VerificationCode).where(
                VerificationCode.email == email,
                VerificationCode.is_reset == False,  # noqa: E702
            )
        )
        record = result.scalar_one_or_none()
        if record is None:
            return False
        if record.code != code:
            return False
        if record.is_expired:
            await session.delete(record)
            await session.commit()
            return False
        await session.delete(record)
        await session.commit()
        return True


async def delete_code(email: str) -> None:
    """Delete the stored code for an email (e.g., after successful registration)."""
    from app.database import SessionLocal as AsyncSessionLocal
    from app.models import VerificationCode

    async with AsyncSessionLocal() as session:
        await session.execute(
            delete(VerificationCode).where(
                VerificationCode.email == email,
                VerificationCode.is_reset == False,  # noqa: E702
            )
        )
        await session.commit()


# ---- Password reset codes (same storage, different column) ----

async def store_reset_code(email: str, code: str) -> bool:
    """Store a password reset code in the database."""
    from app.database import SessionLocal as AsyncSessionLocal
    from app.models import VerificationCode

    ttl = get_settings().email_verify_code_ttl_seconds
    expires_at = datetime.utcnow() + timedelta(seconds=ttl)

    async with AsyncSessionLocal() as session:
        await session.execute(
            delete(VerificationCode).where(
                VerificationCode.email == email,
                VerificationCode.is_reset == True,  # noqa: E702
            )
        )
        record = VerificationCode(
            email=email,
            code=code,
            expires_at=expires_at,
            is_reset=True,
        )
        session.add(record)
        await session.commit()
    return True


async def verify_reset_code(email: str, code: str) -> bool:
    """Verify a password reset code. Deletes code after verification."""
    from app.database import SessionLocal as AsyncSessionLocal
    from app.models import VerificationCode

    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(VerificationCode).where(
                VerificationCode.email == email,
                VerificationCode.is_reset == True,  # noqa: E702
            )
        )
        record = result.scalar_one_or_none()
        if record is None:
            return False
        if record.code != code:
            return False
        if record.is_expired:
            await session.delete(record)
            await session.commit()
            return False
        await session.delete(record)
        await session.commit()
        return True


async def delete_reset_code(email: str) -> None:
    """Delete the stored reset code for an email."""
    from app.database import SessionLocal as AsyncSessionLocal
    from app.models import VerificationCode

    async with AsyncSessionLocal() as session:
        await session.execute(
            delete(VerificationCode).where(
                VerificationCode.email == email,
                VerificationCode.is_reset == True,  # noqa: E702
            )
        )
        await session.commit()


async def get_remaining_ttl(email: str) -> int:
    """Get remaining TTL in seconds, or 0 if not found."""
    from app.database import SessionLocal as AsyncSessionLocal
    from app.models import VerificationCode

    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(VerificationCode).where(
                VerificationCode.email == email,
                VerificationCode.is_reset == False,  # noqa: E702
            )
        )
        record = result.scalar_one_or_none()
        if record is None:
            return 0
        remaining = (record.expires_at - datetime.utcnow()).total_seconds()
        return max(int(remaining), 0)


# ---- Compatibility shims for existing callers ----

async def generate_code(email: str, ttl_seconds: int | None = None) -> str:
    """Generate a new code. Does NOT store it — use store_code()."""
    return _generate_code()
