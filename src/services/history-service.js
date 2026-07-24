// Mrite v2.0 — 历史记录服务
const path = require('path');
const fs = require('fs');

let _ctx = null;

function init(ctx) {
  _ctx = ctx;
}

function _extractBaseName(dirName) {
  const m = dirName.match(/^(.+?)_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}$/);
  return m ? m[1] : dirName;
}

function _getCommittedNames() {
  const ctx = _ctx;
  const db = ctx.db;
  const wsRoot = path.join(path.dirname(ctx.projectsDir), 'workspace');
  const set = new Set();
  try {
    const entries = db.prepare('SELECT workspace_name FROM history').all();
    for (const e of entries) { if (e.workspace_name) set.add(e.workspace_name); }
    const overrides = db.prepare('SELECT workspace_name FROM name_overrides').all();
    for (const o of overrides) set.add(o.workspace_name);
    if (fs.existsSync(wsRoot)) {
      const dirs = fs.readdirSync(wsRoot, { withFileTypes: true })
        .filter(d => d.isDirectory() && !d.name.startsWith('.'));
      for (const d of dirs) {
        try {
          const sf = path.join(wsRoot, d.name, '.mrite-ws.json');
          if (fs.existsSync(sf)) {
            const ws = JSON.parse(fs.readFileSync(sf, 'utf-8'));
            if (ws.inputLoaded) set.add(d.name);
          }
        } catch {}
      }
    }
  } catch {}
  return set;
}

function saveHistoryEntry(entry) {
  const ctx = _ctx;
  const db = ctx.db;
  try {
    var wsName = entry.workspaceName || '';
    if (!wsName) {
      try { wsName = path.basename(ctx.getWorkDir()); } catch {}
    }

    // ★ 优先使用用户设置的项目名称
    let displayName = null;
    if (entry.projectName && entry.projectName.trim()) {
      displayName = { display_name: entry.projectName.trim() };
      // 保存到 name_overrides 表
      if (wsName) {
        db.prepare('INSERT OR REPLACE INTO name_overrides (workspace_name, display_name) VALUES (?, ?)').run(wsName, displayName.display_name);
      }
    }

    // 如果没有用户设置的名称，才从数据库读取或生成默认名称
    if (!displayName) {
      displayName = db.prepare('SELECT display_name FROM name_overrides WHERE workspace_name = ?').get(wsName);
    }
    if (!displayName) {
      // 使用项目目录名作为默认名称
      const dirName = entry.projectPath ? path.basename(entry.projectPath) : '';
      displayName = { display_name: dirName || '未命名项目' };
      if (wsName) {
        db.prepare('INSERT OR REPLACE INTO name_overrides (workspace_name, display_name) VALUES (?, ?)').run(wsName, displayName.display_name);
      }
    }

    const newEntry = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
      project_name: displayName.display_name || displayName,
      workspace_name: wsName,
      project_path: entry.projectPath,
      timestamp: entry.timestamp || new Date().toISOString(),
      output_path: entry.outputPath || '',
    };

    db.prepare('DELETE FROM history WHERE project_path = ?').run(entry.projectPath);
    db.prepare(`INSERT INTO history (id, project_name, workspace_name, project_path, timestamp, output_path)
      VALUES (?, ?, ?, ?, ?, ?)`).run(newEntry.id, newEntry.project_name, newEntry.workspace_name, newEntry.project_path, newEntry.timestamp, newEntry.output_path);

    const count = db.prepare('SELECT COUNT(*) AS c FROM history').get().c;
    if (count > 15) {
      db.prepare('DELETE FROM history WHERE id NOT IN (SELECT id FROM history ORDER BY created_at DESC LIMIT 15)').run();
    }

    return { success: true, entry: newEntry };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function listHistory() {
  const db = _ctx.db;
  try {
    const entries = db.prepare('SELECT * FROM history ORDER BY created_at DESC LIMIT 15').all();
    return { success: true, entries };
  } catch (err) {
    return { success: false, error: err.message, entries: [] };
  }
}

function deleteHistoryEntry(entryId) {
  try {
    _ctx.db.prepare('DELETE FROM history WHERE id = ?').run(entryId);
    return { success: true };
  } catch (err) { return { success: false, error: err.message }; }
}

function renameHistoryEntry(entryId, newName) {
  const db = _ctx.db;
  try {
    const entry = db.prepare('SELECT * FROM history WHERE id = ?').get(entryId);
    if (!entry) return { success: false, error: '条目不存在' };
    db.prepare('UPDATE history SET project_name = ? WHERE id = ?').run(newName, entryId);
    if (entry.workspace_name) {
      db.prepare('INSERT OR REPLACE INTO name_overrides (workspace_name, display_name) VALUES (?, ?)').run(entry.workspace_name, newName);
    }
    return { success: true };
  } catch (err) { return { success: false, error: err.message }; }
}

function clearHistory() {
  const db = _ctx.db;
  try {
    db.prepare('DELETE FROM history').run();
    db.prepare('DELETE FROM name_overrides').run();
    return { success: true };
  } catch (err) { return { success: false, error: err.message }; }
}

function scanWorkspaceProjects() {
  const ctx = _ctx;
  const db = ctx.db;
  const wsRoot = path.join(path.dirname(ctx.projectsDir), 'workspace');
  try {
    const projects = [];
    if (!fs.existsSync(wsRoot)) return { success: true, projects: [] };

    const committed = _getCommittedNames();
    const overrides = {};
    const orRows = db.prepare('SELECT * FROM name_overrides').all();
    for (const r of orRows) overrides[r.workspace_name] = r.display_name;

    const dirs = fs.readdirSync(wsRoot, { withFileTypes: true })
      .filter(d => d.isDirectory() && !d.name.startsWith('.'))
      .filter(d => committed.has(d.name));

    dirs.sort((a, b) => {
      try { return fs.statSync(path.join(wsRoot, a.name)).mtime - fs.statSync(path.join(wsRoot, b.name)).mtime; }
      catch { return 0; }
    });

    let needsSave = false;
    for (const d of dirs) {
      let displayName = overrides[d.name];
      const pp = path.join(wsRoot, d.name);
      let wsState = null;
      try {
        const sf = path.join(pp, '.mrite-ws.json');
        if (fs.existsSync(sf)) {
          wsState = JSON.parse(fs.readFileSync(sf, 'utf-8'));
        }
      } catch {}
      if (!displayName) {
        displayName = wsState?.projectName || wsState?.displayName || '';
        if (!displayName) {
          // ★ 最后才使用目录名作为默认名称（从目录名提取模板名）
          // 目录名格式：高教社杯_2026-07-10_19-29-57 → 高教社杯
          const match = d.name.match(/^(.+?)_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}$/);
          displayName = match ? match[1] : d.name;
        }
        overrides[d.name] = displayName;
        needsSave = true;
      }

      let status = '未完成';
      let mtime = null;
      try {
        if (wsState) {
          // ★ 三种状态：已完成、已修改、未完成
          // ★ 只有明确的完成信号才算完成，progress>=100 不足以判定
          const hasCompletedSignal = !!(
            wsState.runCompletedAt ||
            wsState.status === 'completed' ||
            wsState.status === 'modify'
          );
          if (wsState.status === 'modify') status = '已修改';
          else if (hasCompletedSignal) status = '已完成';
          else status = '未完成';
          mtime = wsState._updated || wsState.createdAt || null;
        } else {
          // 没有状态文件，检查是否有实际内容（PDF 存在才算完成）
          const hasPaper = fs.existsSync(path.join(pp, '论文'));
          if (hasPaper) {
            const pdfFiles = fs.readdirSync(path.join(pp, '论文'), { withFileTypes: true })
              .filter(e => e.name.endsWith('.pdf')).length;
            if (pdfFiles > 0) status = '已完成';
          }
          mtime = fs.statSync(pp).mtime.toISOString();
        }
      } catch {}

      projects.push({
        id: d.name,
        projectName: displayName,
        workspaceName: d.name,
        projectPath: pp,
        status: status,
        timestamp: mtime || new Date().toISOString(),
      });
    }

    if (needsSave) {
      for (const [k, v] of Object.entries(overrides)) {
        db.prepare('INSERT OR REPLACE INTO name_overrides (workspace_name, display_name) VALUES (?, ?)').run(k, v);
      }
    }
    projects.sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));
    return { success: true, projects };
  } catch (err) {
    return { success: false, error: err.message, projects: [] };
  }
}

function cleanupUncommitted() {
  const ctx = _ctx;
  const db = ctx.db;
  const wsRoot = path.join(path.dirname(ctx.projectsDir), 'workspace');
  try {
    if (!fs.existsSync(wsRoot)) return { success: true, deleted: 0 };
    const committed = _getCommittedNames();
    let deleted = 0;
    const dirs = fs.readdirSync(wsRoot, { withFileTypes: true })
      .filter(d => d.isDirectory() && !d.name.startsWith('.'));
    for (const d of dirs) {
      if (!committed.has(d.name)) {
        try {
          fs.rmSync(path.join(wsRoot, d.name), { recursive: true, force: true });
          deleted++;
        } catch {}
      }
    }
    return { success: true, deleted };
  } catch (err) { return { success: false, error: err.message }; }
}

function deleteTempWorkspace(force = false) {
  const ctx = _ctx;
  try {
    const workDir = ctx.getWorkDir();
    const wsName = path.basename(workDir);
    const committed = _getCommittedNames();
    if ((force || !committed.has(wsName)) && fs.existsSync(workDir)) {
      fs.rmSync(workDir, { recursive: true, force: true });
      if (force) {
        const db = ctx.db;
        db.prepare('DELETE FROM name_overrides WHERE workspace_name = ?').run(wsName);
        db.prepare('DELETE FROM history WHERE workspace_name = ?').run(wsName);
      }
      return { success: true, deleted: wsName };
    }
    return { success: true, skipped: true };
  } catch (err) { return { success: false, error: err.message }; }
}

function deleteWorkspaceProject(workspaceName) {
  const ctx = _ctx;
  const db = ctx.db;
  const wsRoot = path.join(path.dirname(ctx.projectsDir), 'workspace');
  try {
    const pp = path.join(wsRoot, workspaceName);
    if (fs.existsSync(pp)) fs.rmSync(pp, { recursive: true, force: true });
    db.prepare('DELETE FROM name_overrides WHERE workspace_name = ?').run(workspaceName);
    db.prepare('DELETE FROM history WHERE workspace_name = ?').run(workspaceName);
    return { success: true };
  } catch (err) { return { success: false, error: err.message }; }
}

function renameWorkspaceProject(oldName, newName) {
  const db = _ctx.db;
  try {
    db.prepare('INSERT OR REPLACE INTO name_overrides (workspace_name, display_name) VALUES (?, ?)').run(oldName, newName);
    db.prepare('UPDATE history SET project_name = ? WHERE workspace_name = ?').run(newName, oldName);
    return { success: true };
  } catch (err) { return { success: false, error: err.message }; }
}

module.exports = {
  init, saveHistoryEntry, listHistory, deleteHistoryEntry, renameHistoryEntry,
  clearHistory, scanWorkspaceProjects, cleanupUncommitted, deleteTempWorkspace,
  deleteWorkspaceProject, renameWorkspaceProject,
};
