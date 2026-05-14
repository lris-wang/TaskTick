import asyncio
import asyncpg

async def run():
    conn = await asyncpg.connect(
        'postgresql://tasktick_bd_user:JSUXuAkBiTPWn5VzvWxnRAXELeGWpmVI@dpg-d7ln8368bjmc73ag4n80-a.oregon-postgres.render.com/tasktick_bd'
    )
    await conn.execute('ALTER TABLE users ADD COLUMN is_vip BOOLEAN NOT NULL DEFAULT false')
    await conn.close()
    print('is_vip column added successfully')

asyncio.run(run())