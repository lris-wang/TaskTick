"""在导入应用前设置独立测试数据库，避免污染开发库。"""

from __future__ import annotations

import asyncio
import os
import uuid
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

_root = Path(__file__).resolve().parents[1]
_test_db = _root / "tests" / ".tasktick_test.db"
os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{_test_db.as_posix()}"

from app.database import SessionLocal  # noqa: E402
from app.main import app  # noqa: E402
from app.models import ApiToken, User  # noqa: E402
from app.security import generate_raw_api_token, hash_api_token  # noqa: E402


@pytest.fixture
def client() -> TestClient:
    with TestClient(app) as c:
        yield c


@pytest.fixture
def ai_token(client: TestClient) -> str:
    raw = generate_raw_api_token()
    digest = hash_api_token(raw)

    async def seed() -> None:
        async with SessionLocal() as session:
            user = User(email=f"pytest-{uuid.uuid4().hex[:16]}@local.test")
            session.add(user)
            await session.flush()
            session.add(ApiToken(user_id=user.id, token_hash=digest, name="pytest"))
            await session.commit()

    asyncio.run(seed())
    return raw
