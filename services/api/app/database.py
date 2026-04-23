from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import get_settings

settings = get_settings()

engine_kwargs: dict = {"echo": False}

if settings.is_postgresql:
    engine_kwargs.update(
        {
            "pool_size": settings.database_pool_size,
            "max_overflow": settings.database_max_overflow,
            "pool_timeout": settings.database_pool_timeout,
            "pool_pre_ping": True,
            "connect_args": {"ssl": settings.database_ssl},
        }
    )

engine = create_async_engine(settings.database_url, **engine_kwargs)

SessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def get_session() -> AsyncGenerator[AsyncSession, None]:
    async with SessionLocal() as session:
        yield session
