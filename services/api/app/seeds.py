"""
Seed script: clears all users and creates only the demo account.
Run with: python -m app.seeds
"""

import asyncio


async def seed():
    from app.database import SessionLocal
    from app.models import User
    from app.security import hash_password
    from sqlalchemy import delete, select

    async with SessionLocal() as session:
        # Delete all users
        await session.execute(delete(User))
        await session.commit()

        # Create demo account
        demo = User(
            email="1111@example.com",
            username="Demo",
            password_hash=hash_password("1111"),
        )
        session.add(demo)
        await session.commit()
        print("Seed complete: 1111@example.com / 1111")


if __name__ == "__main__":
    asyncio.run(seed())
