import asyncio 
import asyncpg 
async def run(): 
    conn = await asyncpg.connect('postgresql://tasktick_bd_user:JSUXuAkBiTPWn5VzvWxnRAXELeGWpmVI@dpg-d7ln8368bjmc73ag4n80-a.oregon-postgres.render.com/tasktick_bd') 
    await conn.execute('ALTER TABLE users ADD COLUMN phone VARCHAR(20)') 
    await conn.execute('CREATE UNIQUE INDEX ix_users_phone ON users (phone)') 
    await conn.close() 
    print('Done') 
asyncio.run(run()) 
