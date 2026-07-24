// Mrite v2.0 — 数据库核心（better-sqlite3，存储在系统用户数据目录）
const path = require('path');
const fs = require('fs');

let db = null;

function init(rootDir) {
  let dataDir;
  try {
    const { app } = require('electron');
    dataDir = path.join(app.getPath('userData'), 'data');
  } catch(e) {
    dataDir = path.join(rootDir, '.mrite-data');
  }
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

  const Database = require('better-sqlite3');
  const dbPath = path.join(dataDir, 'mrite.db');
  db = new Database(dbPath);

  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // ── 建表 ──
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS history (
      id             TEXT PRIMARY KEY,
      project_name   TEXT NOT NULL,
      workspace_name TEXT NOT NULL,
      project_path   TEXT NOT NULL,
      timestamp      TEXT NOT NULL,
      output_path    TEXT DEFAULT '',
      created_at     TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS usage_daily (
      date          TEXT PRIMARY KEY,
      input_tokens  INTEGER DEFAULT 0,
      output_tokens INTEGER DEFAULT 0,
      tasks         INTEGER DEFAULT 0,
      duration_ms   INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS usage_tasks (
      id            TEXT PRIMARY KEY,
      model         TEXT DEFAULT '',
      input_tokens  INTEGER DEFAULT 0,
      output_tokens INTEGER DEFAULT 0,
      duration_ms   INTEGER DEFAULT 0,
      status        TEXT DEFAULT '',
      created_at    TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS usage_hourly (
      date          TEXT NOT NULL,
      hour          INTEGER NOT NULL,
      input_tokens  INTEGER DEFAULT 0,
      output_tokens INTEGER DEFAULT 0,
      tasks         INTEGER DEFAULT 0,
      PRIMARY KEY (date, hour)
    );

    CREATE TABLE IF NOT EXISTS name_overrides (
      workspace_name TEXT PRIMARY KEY,
      display_name   TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS app_state (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS task_logs (
      id             TEXT PRIMARY KEY,
      task_type      TEXT NOT NULL,
      status         TEXT NOT NULL,
      project_name   TEXT DEFAULT '',
      workspace_name TEXT DEFAULT '',
      started_at     TEXT DEFAULT (datetime('now')),
      finished_at    TEXT,
      duration_ms    INTEGER DEFAULT 0,
      input_tokens   INTEGER DEFAULT 0,
      output_tokens  INTEGER DEFAULT 0,
      error_msg      TEXT DEFAULT '',
      metadata       TEXT DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS file_operations (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id     TEXT,
      operation   TEXT NOT NULL,
      file_path   TEXT NOT NULL,
      file_size   INTEGER DEFAULT 0,
      created_at  TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (task_id) REFERENCES task_logs(id)
    );
  `);

  // 回填 usage_hourly（从 usage_tasks 的 created_at + token 数据）
  try {
    // 清理旧的无效数据（全是0 token的）
    const hasBadData = db.prepare("SELECT COUNT(*) AS c FROM usage_hourly WHERE input_tokens = 0 AND output_tokens = 0").get().c;
    if (hasBadData > 0) {
      db.prepare("DELETE FROM usage_hourly").run();
    }
    const hasHourly = db.prepare("SELECT COUNT(*) AS c FROM usage_hourly").get().c;
    if (hasHourly === 0) {
      const tasks = db.prepare("SELECT created_at, input_tokens, output_tokens FROM usage_tasks WHERE created_at IS NOT NULL").all();
      for (const t of tasks) {
        if (!t.created_at) continue;
        const dt = new Date(t.created_at.replace(' ', 'T'));
        if (isNaN(dt.getTime())) continue;
        const date = dt.toISOString().split('T')[0];
        const hour = dt.getHours();
        const existing = db.prepare('SELECT * FROM usage_hourly WHERE date = ? AND hour = ?').get(date, hour);
        if (existing) {
          db.prepare('UPDATE usage_hourly SET input_tokens = input_tokens + ?, output_tokens = output_tokens + ?, tasks = tasks + 1 WHERE date = ? AND hour = ?')
            .run(t.input_tokens || 0, t.output_tokens || 0, date, hour);
        } else {
          db.prepare('INSERT INTO usage_hourly (date, hour, input_tokens, output_tokens, tasks) VALUES (?, ?, ?, ?, 1)')
            .run(date, hour, t.input_tokens || 0, t.output_tokens || 0);
        }
      }
    }
  } catch (e) { /* 静默 */ }

  return { db, dataDir };
}

// ── 通用 helpers ──

function _parse(v) {
  if (typeof v !== 'string') return v;
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (v === 'null') return null;
  if ((v.startsWith('{') || v.startsWith('[')) && (v.endsWith('}') || v.endsWith(']'))) {
    try { return JSON.parse(v); } catch(e) { /* 普通字符串 */ }
  }
  return v;
}

function getSetting(key, fallback = '') {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? _parse(row.value) : fallback;
}

function setSetting(key, value) {
  var serialized = (typeof value === 'string') ? value : JSON.stringify(value);
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, serialized);
}

function deleteSetting(key) {
  db.prepare('DELETE FROM settings WHERE key = ?').run(key);
}

function getAllSettings() {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const out = {};
  for (const r of rows) out[r.key] = _parse(r.value);
  return out;
}

// ── app_state ──
function getState(key, fallback = '') {
  const row = db.prepare('SELECT value FROM app_state WHERE key = ?').get(key);
  return row ? row.value : fallback;
}

function setState(key, value) {
  db.prepare('INSERT OR REPLACE INTO app_state (key, value) VALUES (?, ?)').run(key, String(value));
}

// ── history ──
function getHistory(limit = 15) {
  return db.prepare('SELECT * FROM history ORDER BY created_at DESC LIMIT ?').all(limit);
}

function addHistory(entry) {
  db.prepare(`INSERT OR REPLACE INTO history (id, project_name, workspace_name, project_path, timestamp, output_path, created_at)
    VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`).run(
    entry.id, entry.projectName || entry.project_name,
    entry.workspaceName || entry.workspace_name,
    entry.projectPath || entry.project_path,
    entry.timestamp, entry.outputPath || entry.output_path || ''
  );
}

function deleteHistory(id) {
  db.prepare('DELETE FROM history WHERE id = ?').run(id);
}

function renameHistory(id, newName) {
  db.prepare('UPDATE history SET project_name = ? WHERE id = ?').run(newName, id);
}

function clearHistory() {
  db.prepare('DELETE FROM history').run();
}

// ── name overrides ──
function getNameOverrides() {
  const rows = db.prepare('SELECT * FROM name_overrides').all();
  const out = {};
  for (const r of rows) out[r.workspace_name] = r.display_name;
  return out;
}

function setNameOverride(workspaceName, displayName) {
  db.prepare('INSERT OR REPLACE INTO name_overrides (workspace_name, display_name) VALUES (?, ?)').run(workspaceName, displayName);
}

function deleteNameOverride(workspaceName) {
  db.prepare('DELETE FROM name_overrides WHERE workspace_name = ?').run(workspaceName);
}

// ── usage ──
function getUsageStats() {
  const daily = {};
  const dRows = db.prepare('SELECT * FROM usage_daily ORDER BY date DESC').all();
  for (const r of dRows) {
    daily[r.date] = { input: r.input_tokens, output: r.output_tokens, tasks: r.tasks, durationMs: r.duration_ms };
  }
  let tasks = [];
  try {
    tasks = db.prepare(`SELECT id, task_type, status, project_name, workspace_name,
      started_at AS created_at, input_tokens, output_tokens, duration_ms, error_msg
      FROM task_logs ORDER BY started_at DESC LIMIT 100`).all();
  } catch {}
  if (!tasks.length) {
    tasks = db.prepare('SELECT * FROM usage_tasks ORDER BY created_at DESC LIMIT 100').all();
  }
  const totals = db.prepare('SELECT COALESCE(SUM(input_tokens),0) AS input, COALESCE(SUM(output_tokens),0) AS output, COALESCE(SUM(tasks),0) AS tasks, COALESCE(SUM(duration_ms),0) AS durationMs FROM usage_daily').get();

  // 最近7天趋势数据
  const trend = [];
  const today = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    const row = daily[dateStr];
    trend.push({
      date: dateStr,
      input: row ? row.input : 0,
      output: row ? row.output : 0
    });
  }

  return { daily, tasks, totals, trend };
}

function recordUsage({ date, inputTokens, outputTokens, durationMs }) {
  const dayRow = db.prepare('SELECT * FROM usage_daily WHERE date = ?').get(date);
  if (dayRow) {
    db.prepare(`UPDATE usage_daily SET input_tokens = input_tokens + ?, output_tokens = output_tokens + ?, tasks = tasks + 1, duration_ms = duration_ms + ? WHERE date = ?`)
      .run(inputTokens, outputTokens, durationMs || 0, date);
  } else {
    db.prepare('INSERT INTO usage_daily (date, input_tokens, output_tokens, tasks, duration_ms) VALUES (?, ?, ?, 1, ?)')
      .run(date, inputTokens, outputTokens, durationMs || 0);
  }
  // 小时级记录
  const hour = new Date().getHours();
  const hourRow = db.prepare('SELECT * FROM usage_hourly WHERE date = ? AND hour = ?').get(date, hour);
  if (hourRow) {
    db.prepare('UPDATE usage_hourly SET input_tokens = input_tokens + ?, output_tokens = output_tokens + ?, tasks = tasks + 1 WHERE date = ? AND hour = ?')
      .run(inputTokens, outputTokens, date, hour);
  } else {
    db.prepare('INSERT INTO usage_hourly (date, hour, input_tokens, output_tokens, tasks) VALUES (?, ?, ?, ?, 1)')
      .run(date, hour, inputTokens, outputTokens);
  }
}

function getHourlyStats() {
  // 近 30 天的小时级数据
  const rows = db.prepare("SELECT date, hour, input_tokens, output_tokens, tasks FROM usage_hourly WHERE date >= date('now', '-30 days') ORDER BY date, hour").all();
  return rows;
}

function recordUsageTask(task) {
  db.prepare(`INSERT OR REPLACE INTO usage_tasks (id, model, input_tokens, output_tokens, duration_ms, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`).run(
    task.id, task.model || '', task.inputTokens || task.input_tokens || 0,
    task.outputTokens || task.output_tokens || 0,
    task.durationMs || task.duration_ms || 0,
    task.status || ''
  );
}

function clearUsage() {
  db.prepare('DELETE FROM usage_daily').run();
  db.prepare('DELETE FROM usage_tasks').run();
}

// ── task_logs（新增）──
function addTaskLog(log) {
  const id = log.id || (Date.now().toString(36) + Math.random().toString(36).slice(2, 8));
  db.prepare(`INSERT INTO task_logs (id, task_type, status, project_name, workspace_name, started_at, finished_at, duration_ms, input_tokens, output_tokens, error_msg, metadata)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    id, log.taskType || 'solve', log.status || 'running',
    log.projectName || '', log.workspaceName || '',
    log.startedAt || new Date().toISOString(),
    log.finishedAt || null,
    log.durationMs || 0,
    log.inputTokens || 0, log.outputTokens || 0,
    log.errorMsg || '', JSON.stringify(log.metadata || {})
  );
  return id;
}

function updateTaskLog(id, updates) {
  const sets = [];
  const vals = [];
  for (const [k, v] of Object.entries(updates)) {
    const col = k.replace(/([A-Z])/g, '_$1').toLowerCase();
    sets.push(col + ' = ?');
    vals.push(v);
  }
  if (sets.length === 0) return;
  vals.push(id);
  db.prepare('UPDATE task_logs SET ' + sets.join(', ') + ' WHERE id = ?').run(...vals);
}

function getTaskLogs(limit = 50) {
  return db.prepare('SELECT * FROM task_logs ORDER BY started_at DESC LIMIT ?').all(limit);
}

function getTaskLogStats() {
  return db.prepare(`SELECT
    COUNT(*) AS total,
    SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed,
    SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) AS errors,
    SUM(duration_ms) AS totalDuration,
    SUM(input_tokens) AS totalInput,
    SUM(output_tokens) AS totalOutput
  FROM task_logs`).get();
}

// ── file_operations（新增）──
function addFileOperation(op) {
  db.prepare('INSERT INTO file_operations (task_id, operation, file_path, file_size) VALUES (?, ?, ?, ?)')
    .run(op.taskId || null, op.operation, op.filePath, op.fileSize || 0);
}

function getFileOperations(taskId) {
  return db.prepare('SELECT * FROM file_operations WHERE task_id = ? ORDER BY created_at DESC').all(taskId);
}

// ── 数据迁移（一次性）──
function migrateIfNeeded(rootDir) {
  const projectsDir = path.join(rootDir, 'projects');
  const parentDir = path.dirname(projectsDir);
  const migratedKey = 'db_migrated_v1.8';

  if (getSetting(migratedKey) === '1') return;

  // 迁移 .mrite-history.json
  const historyFile = path.join(parentDir, '.mrite-history.json');
  if (fs.existsSync(historyFile)) {
    try {
      const entries = JSON.parse(fs.readFileSync(historyFile, 'utf-8'));
      for (const e of entries) addHistory(e);
      fs.renameSync(historyFile, historyFile + '.bak');
    } catch {}
  }

  // 迁移 .mrite-names.json
  const namesFile = path.join(parentDir, '.mrite-names.json');
  if (fs.existsSync(namesFile)) {
    try {
      const names = JSON.parse(fs.readFileSync(namesFile, 'utf-8'));
      for (const [k, v] of Object.entries(names)) setNameOverride(k, v);
      fs.renameSync(namesFile, namesFile + '.bak');
    } catch {}
  }

  // 迁移 .mrite-usage.json
  const usageFile = path.join(parentDir, '.mrite-usage.json');
  if (fs.existsSync(usageFile)) {
    try {
      const data = JSON.parse(fs.readFileSync(usageFile, 'utf-8'));
      if (data.daily) {
        for (const [date, d] of Object.entries(data.daily)) {
          db.prepare('INSERT OR REPLACE INTO usage_daily (date, input_tokens, output_tokens, tasks, duration_ms) VALUES (?, ?, ?, ?, ?)')
            .run(date, d.input || 0, d.output || 0, d.tasks || 0, d.durationMs || 0);
        }
      }
      if (data.tasks) {
        for (const t of data.tasks) recordUsageTask(t);
      }
      fs.renameSync(usageFile, usageFile + '.bak');
    } catch {}
  }

  // 迁移 .mrite-project
  const stateFile = path.join(parentDir, '.mrite-project');
  if (fs.existsSync(stateFile)) {
    try {
      const projectName = fs.readFileSync(stateFile, 'utf-8').trim();
      if (projectName) setState('current_project', projectName);
      fs.renameSync(stateFile, stateFile + '.bak');
    } catch {}
  }

  setSetting(migratedKey, '1');
}

function close() {
  if (db) { db.close(); db = null; }
}

function getDb() {
  return db;
}

module.exports = {
  init, close, migrateIfNeeded, getDb,
  getSetting, setSetting, deleteSetting, getAllSettings,
  getState, setState,
  getHistory, addHistory, deleteHistory, renameHistory, clearHistory,
  getNameOverrides, setNameOverride, deleteNameOverride,
  getUsageStats, getHourlyStats, recordUsage, recordUsageTask, clearUsage,
  addTaskLog, updateTaskLog, getTaskLogs, getTaskLogStats,
  addFileOperation, getFileOperations,
};
