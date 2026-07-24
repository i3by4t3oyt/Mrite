// Mrite v2.0 — 系统 IPC 路由
const { ipcMain, shell, Notification, app, dialog } = require('electron');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const latexEnv = require('../core/latex-env');
const pythonEnv = require('../core/python-env');
const taskService = require('../services/task-service');

function readLatestWorkspaceState(wsRoot, currentWorkDir) {
  const candidates = [];
  const pushStatePath = (statePath, source) => {
    if (!statePath || !fs.existsSync(statePath)) return;
    try {
      const stat = fs.statSync(statePath);
      if (!stat.isFile()) return;
      candidates.push({ statePath, source, mtimeMs: stat.mtimeMs });
    } catch {}
  };

  pushStatePath(currentWorkDir ? path.join(currentWorkDir, '.mrite-ws.json') : '', 'currentWorkDir');

  try {
    if (fs.existsSync(wsRoot)) {
      fs.readdirSync(wsRoot, { withFileTypes: true })
        .filter(d => d.isDirectory() && !d.name.startsWith('.'))
        .forEach(d => pushStatePath(path.join(wsRoot, d.name, '.mrite-ws.json'), 'workspaceRoot'));
    }
  } catch {}

  if (!candidates.length) return null;

  candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);
  const selected = candidates[0];
  try {
    const raw = fs.readFileSync(selected.statePath, 'utf-8');
    return {
      path: selected.statePath,
      source: selected.source,
      mtime: new Date(selected.mtimeMs).toISOString(),
      raw,
      parsed: JSON.parse(raw)
    };
  } catch (err) {
    return {
      path: selected.statePath,
      source: selected.source,
      mtime: new Date(selected.mtimeMs).toISOString(),
      error: err.message
    };
  }
}

function register(ctx) {
  // ── 强制关闭应用（忽略任务状态）──
  ipcMain.handle('force-close-app', async () => {
    try {
      // 强制清除任务状态
      ctx.setTaskState(false, null);
      // 关闭主窗口
      const win = ctx.getMainWindow();
      if (win && !win.isDestroyed()) {
        win.destroy();
      }
      // 退出应用
      app.quit();
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
  ipcMain.handle('open-external', async (event, url) => {
    try { await shell.openExternal(url); return { success: true }; }
    catch (err) { return { success: false, error: err.message }; }
  });

  ipcMain.handle('reset-project', async () => {
    try {
      const claudeSessions = require('path').join(require('os').homedir(), '.claude', 'projects');
      if (fs.existsSync(claudeSessions)) fs.rmSync(claudeSessions, { recursive: true, force: true });
      return { success: true };
    }
    catch (err) { return { success: false, error: err.message }; }
  });

  ipcMain.handle('path-exists', async (event, p) => {
    try { return fs.existsSync(p); } catch { return false; }
  });

  ipcMain.handle('send-notification', async (event, { title, body }) => {
    if (Notification.isSupported()) new Notification({ title, body }).show();
    return { success: true };
  });

  ipcMain.handle('set-content-size', async (event, { width, height }) => {
    const win = ctx.getMainWindow();
    if (!win) return;
    const cfg = require('../core/config');
    const maxW = cfg.windowWidth || 1000;
    const maxH = cfg.windowHeightCollapsed || 800;
    const w = Math.min(width || maxW, maxW);
    const h = Math.min(height || maxH, maxH);
    win.setContentSize(w, h);
  });

  ipcMain.handle('export-diagnostics-log', async () => {
    try {
      const userData = app.getPath('userData');
      const wsRoot = path.join(path.dirname(ctx.projectsDir), 'workspace');
      const pythonStatus = pythonEnv.getStatus();
      const latexStatus = latexEnv.getStatus();
      const db = ctx.db;
      let taskLogs = [];
      let appState = {};
      let settings = {};
      try {
        if (db) {
          taskLogs = db.prepare(`SELECT id, task_type, status, project_name, workspace_name, started_at, finished_at, duration_ms, input_tokens, output_tokens, error_msg
            FROM task_logs ORDER BY started_at DESC LIMIT 30`).all();
          const rows = db.prepare('SELECT key, value FROM app_state').all();
          rows.forEach(function(row) { appState[row.key] = row.value; });
          const setRows = db.prepare('SELECT key, value FROM settings').all();
          setRows.forEach(function(row) {
            if (row.key === 'apiKey' || row.key === 'inviteCode') return;
            settings[row.key] = row.value;
          });
        }
      } catch (_) {}

      let workspaceStates = [];
      const currentWorkDir = ctx.getWorkDir ? ctx.getWorkDir() : '';
      const latestWorkspaceState = readLatestWorkspaceState(wsRoot, currentWorkDir);
      const solverExecutableProbe = taskService.getSolverExecutableProbeResult
        ? taskService.getSolverExecutableProbeResult()
        : null;
      try {
        if (fs.existsSync(wsRoot)) {
          workspaceStates = fs.readdirSync(wsRoot, { withFileTypes: true })
            .filter(d => d.isDirectory() && !d.name.startsWith('.'))
            .slice(0, 50)
            .map(d => {
              const wsPath = path.join(wsRoot, d.name);
              const statePath = path.join(wsPath, '.mrite-ws.json');
              let state = null;
              try {
                if (fs.existsSync(statePath)) {
                  state = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
                }
              } catch (_) {}
              return {
                workspaceName: d.name,
                path: wsPath,
                status: state && state.status,
                progress: state && state.progress,
                runStartedAt: state && state.runStartedAt,
                runCompletedAt: state && state.runCompletedAt,
                updatedAt: state && state._updated
              };
            });
        }
      } catch (_) {}

      const payload = {
        exportedAt: new Date().toISOString(),
        appVersion: app.getVersion(),
        platform: process.platform,
        arch: process.arch,
        userData,
        resourcesPath: process.resourcesPath || '',
        currentProjectPath: ctx.getProjectPath ? ctx.getProjectPath() : '',
        currentWorkDir,
        outputPath: ctx.getOutputPath ? ctx.getOutputPath() : '',
        pythonStatus,
        latexStatus,
        solverExecutableProbe,
        appState,
        settings,
        latestWorkspaceState,
        workspaceStates,
        taskLogs
      };

      const win = ctx.getMainWindow();
      const defaultName = 'mrite-diagnostics-' + new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19) + '.txt';
      const saveResult = await dialog.showSaveDialog(win, {
        defaultPath: path.join(app.getPath('desktop'), defaultName),
        filters: [{ name: 'Text Files', extensions: ['txt'] }]
      });
      if (saveResult.canceled || !saveResult.filePath) {
        return { success: false, canceled: true };
      }

      fs.writeFileSync(saveResult.filePath, JSON.stringify(payload, null, 2), 'utf-8');
      return { success: true, path: saveResult.filePath };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // ── 环境检测 ──
  ipcMain.handle('check-environment', async () => {
    const results = { python: { ok: false, version: '' }, latex: { ok: false, version: '', source: 'none' } };

    // 检测内置 Python
    const pythonStatus = pythonEnv.getStatus();
    if (pythonStatus.ready) {
      results.python = { ok: true, version: '内置 Python ' + (pythonStatus.version || 'unknown') };
    } else {
      results.python = { ok: false, version: '内置 Python 环境未就绪' };
    }

    // 检测内置 LaTeX
    const latexStatus = latexEnv.getStatus();
    if (latexStatus.installed) {
      results.latex = {
        ok: true,
        version: latexStatus.version
          ? ('内置 TinyTeX / TeX Live ' + latexStatus.version)
          : '内置 TinyTeX 已就绪',
        path: latexStatus.binDir || latexStatus.dir || '',
        packagesReady: latexStatus.packagesReady
      };
    } else {
      results.latex = { ok: false, version: '未安装' };
    }

    return { success: true, results, latexStatus, pythonStatus };
  });

  // ── Python 环境管理 ──
  ipcMain.handle('python-get-status', async () => {
    return pythonEnv.getStatus();
  });

  ipcMain.handle('python-ensure', async (event) => {
    return pythonEnv.ensure((msg) => {
      const win = ctx.getMainWindow();
      if (win && !win.isDestroyed()) {
        win.webContents.send('python-progress', msg);
      }
    });
  });

  ipcMain.handle('python-install-package', async (event, pkg) => {
    return pythonEnv.installPackage(pkg, (msg) => {
      const win = ctx.getMainWindow();
      if (win && !win.isDestroyed()) {
        win.webContents.send('python-progress', msg);
      }
    });
  });

  ipcMain.handle('python-reset-env', async (event) => {
    return pythonEnv.resetEnv((msg) => {
      const win = ctx.getMainWindow();
      if (win && !win.isDestroyed()) {
        win.webContents.send('python-progress', msg);
      }
    });
  });

  // ── 测试 API 连通性 ──
  ipcMain.handle('test-api', async (event, { baseURL, apiKey }) => {
    try {
      const https = baseURL.startsWith('https') ? require('https') : require('http');
      const url = new URL(baseURL);
      const startTime = Date.now();
      return new Promise((resolve) => {
        const req = https.request({
          hostname: url.hostname,
          port: url.port || (baseURL.startsWith('https') ? 443 : 80),
          path: url.pathname,
          method: 'GET',
          timeout: 10000,
          headers: apiKey ? { 'Authorization': 'Bearer ' + apiKey } : {},
        }, (res) => {
          const latency = Date.now() - startTime;
          resolve({ success: true, status: res.statusCode, latency });
        });
        req.on('error', (e) => resolve({ success: false, error: e.message }));
        req.on('timeout', () => { req.destroy(); resolve({ success: false, error: '超时' }); });
        req.end();
      });
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
}

module.exports = { register };
