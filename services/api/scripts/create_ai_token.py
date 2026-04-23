"""
为指定用户创建 AI 调用令牌（仅打印一次明文，请妥善保存）。

用法（在 services/api 目录下）:
  python -m scripts.create_ai_token --email you@example.com --name gpt-agent
"""

from __future__ import annotations

import argparse
import asyncio

from app.database import SessionLocal, engine
from app.models import ApiToken, Schedule, User  # noqa: F401
from app.models.base import Base
from app.security import generate_raw_api_token, hash_api_token
from sqlalchemy import select


async def _ensure_schema() -> None:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def run(email: str, name: str) -> str:
    await _ensure_schema()
    raw = generate_raw_api_token()
    digest = hash_api_token(raw)
    async with SessionLocal() as session:
        result = await session.execute(select(User).where(User.email == email))
        user = result.scalar_one_or_none()
        if user is None:
            user = User(email=email)
            session.add(user)
            await session.flush()
        session.add(ApiToken(user_id=user.id, token_hash=digest, name=name))
        await session.commit()
    return raw


def main() -> None:
    parser = argparse.ArgumentParser(description="创建 AI API Bearer token")
    parser.add_argument("--email", required=True, help="用户邮箱（不存在则自动创建）")
    parser.add_argument("--name", default="ai", help="令牌备注名")
    args = parser.parse_args()
    token = asyncio.run(run(args.email, args.name))
    print("以下 token 仅显示一次，请保存到安全位置：")
    print(token)


if __name__ == "__main__":
    main()
