/**
 * database.cjs — SQLite database layer via sql.js
 *
 * Runs in the Electron main process. Provides typed CRUD over
 * tasks / projects / tags with SQLite persistence in the user's data dir.
 */

"use strict";

const path = require("path");
const fs = require("fs");
const { app } = require("electron");

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

/** @type {import('sql.js').Database | null} */
let _db = null;

/** Absolute path to the SQLite file */
function dbPath() {
  return path.join(app.getPath("userData"), "tasktick.db");
}

/**
 * Initialise (or open) the SQLite database.
 * Creates tables if they don't exist.
 * Safe to call multiple times — subsequent calls return the existing handle.
 */
async function initDatabase() {
  if (_db) return _db;

  const initSqlJs = require("sql.js");

  // Locate the WASM file:
  //   packaged → inside the asar at app.getAppPath()
  //   dev      → apps/desktop/node_modules/sql.js/dist/sql-wasm.wasm
  let wasmPath;
  if (app.isPackaged) {
    // app.getAppPath() returns the path to the asar root
    wasmPath = path.join(app.getAppPath(), "node_modules", "sql.js", "dist", "sql-wasm.wasm");
  } else {
    // database.cjs is at apps/desktop/database.cjs, so node_modules is a sibling
    wasmPath = path.join(__dirname, "node_modules", "sql.js", "dist", "sql-wasm.wasm");
  }

  const SQL = await initSqlJs({ locateFile: () => wasmPath });

  const p = dbPath();
  let data = null;
  if (fs.existsSync(p)) {
    try {
      data = fs.readFileSync(p);
    } catch {
      /* corrupt / unreadable — recreate below */
    }
  }

  _db = data ? new SQL.Database(data) : new SQL.Database();

  // Persist after every write
  _db.on("progress", () => {
    saveToDisk();
  });

  createTables();
  return _db;
}

function saveToDisk() {
  if (!_db) return;
  try {
    const data = _db.export();
    const buf = Buffer.from(data);
    fs.writeFileSync(dbPath(), buf);
  } catch (e) {
    console.error("[database] save error:", e);
  }
}

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

function createTables() {
  const db = _db;
  if (!db) return;

  db.run(`
    CREATE TABLE IF NOT EXISTS projects (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      color       TEXT,
      deleted_at  TEXT,
      created_at  TEXT NOT NULL,
      updated_at  TEXT NOT NULL,
      built_in    INTEGER NOT NULL DEFAULT 0
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS tags (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      color       TEXT,
      deleted_at  TEXT,
      created_at  TEXT NOT NULL,
      updated_at  TEXT NOT NULL
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS tasks (
      id                TEXT PRIMARY KEY,
      title             TEXT NOT NULL,
      description       TEXT,
      completed         INTEGER NOT NULL DEFAULT 0,
      due_at            TEXT,
      priority          INTEGER NOT NULL DEFAULT 0,
      project_ids       TEXT NOT NULL DEFAULT '[]',
      tag_ids           TEXT NOT NULL DEFAULT '[]',
      deleted_at        TEXT,
      client_mutation_id TEXT,
      is_important      INTEGER NOT NULL DEFAULT 0,
      repeat_daily      INTEGER NOT NULL DEFAULT 0,
      notify_enabled    INTEGER NOT NULL DEFAULT 0,
      attachments       TEXT NOT NULL DEFAULT '[]',
      created_at        TEXT NOT NULL,
      updated_at        TEXT NOT NULL
    )
  `);

  // Indexes for common queries
  try {
    db.run("CREATE INDEX IF NOT EXISTS idx_tasks_deleted_at ON tasks(deleted_at)");
    db.run("CREATE INDEX IF NOT EXISTS idx_tasks_updated_at ON tasks(updated_at)");
    db.run("CREATE INDEX IF NOT EXISTS idx_projects_deleted_at ON projects(deleted_at)");
    db.run("CREATE INDEX IF NOT EXISTS idx_tags_deleted_at ON tags(deleted_at)");
  } catch {
    /* index may already exist */
  }

  saveToDisk();
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Run a SELECT all and return as plain array of objects */
function queryAll(sql, params = []) {
  const db = _db;
  if (!db) throw new Error("DB not ready");
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

/** Run a statement that changes rows */
function run(sql, params = []) {
  const db = _db;
  if (!db) throw new Error("DB not ready");
  db.run(sql, params);
  saveToDisk();
}

/** Insert or replace a single row */
function upsert(sql, params) {
  const db = _db;
  if (!db) throw new Error("DB not ready");
  db.run(sql, params);
  saveToDisk();
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

function getAllProjects() {
  return queryAll(
    "SELECT id, name, color, deleted_at, created_at, updated_at, built_in FROM projects WHERE deleted_at IS NULL ORDER BY created_at",
  ).map(normalizeProjectRow);
}

function upsertProject(project) {
  upsert(
    `INSERT OR REPLACE INTO projects (id, name, color, deleted_at, created_at, updated_at, built_in)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      project.id,
      project.name,
      project.color ?? null,
      project.deletedAt ?? null,
      project.createdAt,
      project.updatedAt,
      project.builtIn ? 1 : 0,
    ],
  );
  return project;
}

function softDeleteProject(id) {
  const now = new Date().toISOString();
  run("UPDATE projects SET deleted_at = ?, updated_at = ? WHERE id = ?", [now, now, id]);
}

function normalizeProjectRow(row) {
  return {
    id: row.id,
    name: row.name,
    color: row.color ?? null,
    deletedAt: row.deleted_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    builtIn: Boolean(row.built_in),
  };
}

// ---------------------------------------------------------------------------
// Tags
// ---------------------------------------------------------------------------

function getAllTags() {
  return queryAll(
    "SELECT id, name, color, deleted_at, created_at, updated_at FROM tags WHERE deleted_at IS NULL ORDER BY created_at",
  ).map(normalizeTagRow);
}

function upsertTag(tag) {
  upsert(
    `INSERT OR REPLACE INTO tags (id, name, color, deleted_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [tag.id, tag.name, tag.color ?? null, tag.deletedAt ?? null, tag.createdAt, tag.updatedAt],
  );
  return tag;
}

function softDeleteTag(id) {
  const now = new Date().toISOString();
  run("UPDATE tags SET deleted_at = ?, updated_at = ? WHERE id = ?", [now, now, id]);
}

function normalizeTagRow(row) {
  return {
    id: row.id,
    name: row.name,
    color: row.color ?? null,
    deletedAt: row.deleted_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

function getAllTasks() {
  return queryAll(
    `SELECT id, title, description, completed, due_at, priority,
            project_ids, tag_ids, deleted_at, client_mutation_id,
            is_important, repeat_daily, notify_enabled, attachments, created_at, updated_at
     FROM tasks
     WHERE deleted_at IS NULL
     ORDER BY created_at DESC`,
  ).map(normalizeTaskRow);
}

function upsertTask(task) {
  upsert(
    `INSERT OR REPLACE INTO tasks
       (id, title, description, completed, due_at, priority,
        project_ids, tag_ids, deleted_at, client_mutation_id,
        is_important, repeat_daily, notify_enabled, attachments, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      task.id,
      task.title,
      task.description ?? null,
      task.completed ? 1 : 0,
      task.dueAt ?? null,
      task.priority ?? 0,
      JSON.stringify(task.projectIds ?? []),
      JSON.stringify(task.tagIds ?? []),
      task.deletedAt ?? null,
      task.clientMutationId ?? null,
      task.isImportant ? 1 : 0,
      task.repeatDaily ? 1 : 0,
      task.notifyEnabled ? 1 : 0,
      JSON.stringify(task.attachments ?? []),
      task.createdAt,
      task.updatedAt,
    ],
  );
  return task;
}

function softDeleteTask(id) {
  const now = new Date().toISOString();
  run("UPDATE tasks SET deleted_at = ?, updated_at = ? WHERE id = ?", [now, now, id]);
}

function normalizeTaskRow(row) {
  let attachments = [];
  try {
    attachments = JSON.parse(row.attachments ?? "[]");
  } catch {
    attachments = [];
  }
  let projectIds = [];
  try {
    projectIds = JSON.parse(row.project_ids ?? "[]");
  } catch {
    projectIds = [];
  }
  let tagIds = [];
  try {
    tagIds = JSON.parse(row.tag_ids ?? "[]");
  } catch {
    tagIds = [];
  }
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? null,
    completed: Boolean(row.completed),
    dueAt: row.due_at ?? null,
    priority: Number(row.priority) || 0,
    projectIds,
    tagIds,
    deletedAt: row.deleted_at ?? null,
    clientMutationId: row.client_mutation_id ?? null,
    isImportant: Boolean(row.is_important),
    repeatDaily: Boolean(row.repeat_daily),
    notifyEnabled: Boolean(row.notify_enabled),
    attachments,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

module.exports = {
  initDatabase,
  // Projects
  getAllProjects,
  upsertProject,
  softDeleteProject,
  // Tags
  getAllTags,
  upsertTag,
  softDeleteTag,
  // Tasks
  getAllTasks,
  upsertTask,
  softDeleteTask,
};
