import secrets
from functools import lru_cache
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # ---- Database ----
    # 开发默认 SQLite；生产改为 postgresql+asyncpg://user:pass@host:5432/dbname
    database_url: str = "sqlite+aiosqlite:///./tasktick.db"
    # PostgreSQL 专用配置（当 database_url 以 postgresql 开头时生效）
    database_pool_size: int = 20
    database_max_overflow: int = 30
    database_pool_timeout: int = 30
    database_ssl: Literal["disable", "allow", "prefer", "require", "verify-ca", "verify-full"] = "prefer"
    # SQLite 路径（仅 SQLite 模式使用，可通过 DATABASE_URL 覆盖）
    database_path: str = "./tasktick.db"

    # ---- MinIO (S3 compatible) ----
    minio_endpoint: str | None = None
    minio_access_key: str | None = None
    minio_secret_key: str | None = None
    minio_bucket: str = "tasktick-files"
    minio_secure: bool = False
    minio_region: str = ""
    minio_presign_expiry_seconds: int = 3600
    minio_max_upload_bytes: int = 20 * 1024 * 1024

    # ---- Redis（可选；不配则禁用缓存 / 限流 / token 黑名单）----
    redis_url: str | None = None          # e.g. redis://localhost:6379/0
    redis_password: str | None = None
    redis_db: int = 0
    redis_max_connections: int = 20

    # ---- JWT ----
    # 空字符串时自动生成随机 32 字节密钥；生产务必通过环境变量设置
    jwt_secret_key: str = ""
    jwt_algorithm: str = "HS256"
    jwt_access_token_expire_minutes: int = 60 * 24  # 1 day

    # ---- Rate Limiting ----
    rate_limit_enabled: bool = True
    rate_limit_requests: int = 60          # 每窗口最大请求数
    rate_limit_window_seconds: int = 60     # 窗口大小（秒）
    rate_limit_auth_requests: int = 10      # 登录注册接口单独限制

    # ---- Email (SMTP) ----
    email_smtp_host: str | None = None
    email_smtp_host1: str | None = None  # fallback for Render env var name with 1
    email_smtp_port: int = 587
    email_smtp_port1: int | None = None  # fallback
    email_smtp_user: str | None = None
    email_smtp_user1: str | None = None  # fallback
    email_smtp_password: str | None = None
    email_smtp_password1: str | None = None  # fallback
    email_from: str = "TaskTick <noreply@tasktick.com>"
    email_from1: str | None = None  # fallback
    email_verify_code_ttl_seconds: int = 600

    # ---- CORS ----
    # 逗号分隔的允许来源列表，* 表示允许所有（仅限开发环境）
    cors_origins: str = "*"

    # Insecure defaults that must be replaced with random values at runtime
    _INSECURE_JWT_SECRET = "tasktick-dev-secret-change-in-production-please"

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        if not self.jwt_secret_key or self.jwt_secret_key == self._INSECURE_JWT_SECRET:
            self.jwt_secret_key = secrets.token_urlsafe(32)

    @property
    def is_postgresql(self) -> bool:
        return self.database_url.startswith("postgresql")

    @property
    def is_redis(self) -> bool:
        return bool(self.redis_url)

    @property
    def cors_origins_list(self) -> list[str]:
        if self.cors_origins == "*":
            return ["*"]
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
