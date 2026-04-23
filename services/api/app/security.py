import hashlib
import uuid

from datetime import datetime, timedelta, timezone

from jose import JWTError, jwt
from passlib.context import CryptContext

from app.config import get_settings

# Password hashing
pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")

# JWT settings (loaded from env, with safe dev default that will warn in logs)
_settings = get_settings()
JWT_SECRET_KEY = _settings.jwt_secret_key
JWT_ALGORITHM = _settings.jwt_algorithm
JWT_ACCESS_TOKEN_EXPIRE_MINUTES = _settings.jwt_access_token_expire_minutes


def hash_password(password: str) -> str:
    return pwd_ctx.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_ctx.verify(plain, hashed)


def hash_api_token(raw: str) -> str:
    """Hash an API token using SHA-256 (used for long-lived API tokens)."""
    return hashlib.sha256(raw.encode()).hexdigest()


def create_access_token(user_id: str, expires_delta: timedelta | None = None) -> str:
    expire = datetime.now(timezone.utc) + (expires_delta or timedelta(minutes=JWT_ACCESS_TOKEN_EXPIRE_MINUTES))
    jti = str(uuid.uuid4())
    to_encode = {"sub": str(user_id), "exp": expire, "jti": jti, "type": "access"}
    return jwt.encode(to_encode, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)


def decode_access_token(token: str) -> tuple[str, str, int] | None:
    """
    Decode and validate a JWT access token.
    Returns (user_id, jti, exp_timestamp) on success, None on failure.
    """
    try:
        payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            return None
        user_id = payload.get("sub")
        jti = payload.get("jti")
        exp = payload.get("exp")
        if not user_id or not jti or not exp:
            return None
        return user_id, jti, int(exp)
    except JWTError:
        return None
