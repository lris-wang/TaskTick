import sqlite3
conn = sqlite3.connect('tasktick.db')
cur = conn.cursor()
cur.execute('PRAGMA foreign_keys=ON')

# Recreate table with proper FK
cur.execute('''
CREATE TABLE IF NOT EXISTS project_groups_new (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    color TEXT,
    "order" INTEGER DEFAULT 0,
    deleted_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
)
''')
cur.execute('INSERT OR IGNORE INTO project_groups_new SELECT * FROM project_groups')
cur.execute('DROP TABLE project_groups')
cur.execute('ALTER TABLE project_groups_new RENAME TO project_groups')
print('Schema updated OK')
conn.commit()
conn.close()
