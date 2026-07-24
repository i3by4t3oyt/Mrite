// Mrite v2.0 — 模块化入口（前后端分离架构）
const { app, BrowserWindow, Notification, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

// ── 单实例锁：同一设备只能运行一个窗口 ──
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
  // 注意：app.quit() 后进程不会立即退出，但后续 module 加载仍会执行
  // 此处 return 不生效（顶层代码），用 process.exit 确保退出
  process.exit(0);
}
app.on('second-instance', () => {
  try {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  } catch(e) {}
});

// ── 启动时清理 PATH 中的外部 TeX 路径（避免与内置 TinyTeX 版本冲突）──
(function cleanTexFromPath() {
  const sep = path.delimiter;
  const isExternalTex = (dir) => {
    if (!dir || typeof dir !== 'string') return false;
    const n = dir.replace(/\\/g, '/').toLowerCase();
    if (n.includes('/assets/tinytex/')) return false;
    return n.includes('/texlive/') || n.endsWith('/texbin')
      || n.includes('/tinytex/bin/') || n.includes('/miktex/') || n.includes('/texmf/');
  };
  const cleaned = (process.env.PATH || '').split(sep).filter(d => !isExternalTex(d)).join(sep);
  process.env.PATH = cleaned;
  process.env.Path = cleaned;
})();

// ── 递归复制目录 ──
function copyDirSync(src, dest) {
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
  const items = fs.readdirSync(src, { withFileTypes: true });
  for (const item of items) {
    const srcPath = path.join(src, item.name);
    const destPath = path.join(dest, item.name);
    if (item.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

const config = require('./src/core/config');
const { createWindow } = require('./src/core/window');
const { create: createWorkspace } = require('./src/core/workspace');
const dbModule = require('./src/core/database');
const { registerAll } = require('./src/ipc/index');
const authService = require('./src/services/auth-service');
const apiProxy = require('./src/services/api-proxy');
const taskService = require('./src/services/task-service');
const procMgr = require('./src/core/process-manager');

// ── 确定根目录（打包后使用用户数据目录，可写）──
function getRootDir() {
  if (app.isPackaged) {
    // 打包后使用用户数据目录 ~/Library/Application Support/mrite-v2/
    return app.getPath('userData');
  }
  // 开发模式使用 __dirname
  return __dirname;
}

const rootDir = getRootDir();
console.log('Root directory:', rootDir);

// ── 数据库初始化 ──
let dbInstance = null;
let dataDir = '';

function initDB() {
  const result = dbModule.init(rootDir);
  dbInstance = result.db;
  dataDir = result.dataDir;
  dbModule.migrateIfNeeded(rootDir);
}

// ── 初始化 ──
initDB();
const workspace = createWorkspace(rootDir, config.projectsDirName);
let mainWindow = null;

// ── 确保项目目录存在 ──
function ensureProjectsDir() {
  const projectsDir = workspace.projectsDir;
  if (!fs.existsSync(projectsDir)) {
    fs.mkdirSync(projectsDir, { recursive: true });
  }
  // ★ 打包后首次启动：从 asar 复制默认模板到用户数据目录
  if (app.isPackaged) {
    const bundledProjectsDir = path.join(process.resourcesPath, 'app.asar', 'projects');
    const altBundledDir = path.join(process.resourcesPath, 'app.asar.unpacked', 'projects');
    const sourceDir = fs.existsSync(altBundledDir) ? altBundledDir : (fs.existsSync(bundledProjectsDir) ? bundledProjectsDir : null);
    if (sourceDir) {
      try {
        const items = fs.readdirSync(sourceDir, { withFileTypes: true });
        for (const item of items) {
          if (item.isDirectory() && !item.name.startsWith('.')) {
            const targetDir = path.join(projectsDir, item.name);
            if (!fs.existsSync(targetDir)) {
              fs.mkdirSync(targetDir, { recursive: true });
              copyDirSync(path.join(sourceDir, item.name), targetDir);
              console.log('已复制模板:', item.name);
            }
          }
        }
      } catch(e) {
        console.warn('复制模板失败:', e.message);
      }
    }
  }
}

// ── 启动时恢复上次选择的项目 ──
function resolveInitialProject() {
  ensureProjectsDir();
  try {
    const savedName = dbModule.getState('current_project');
    if (savedName) {
      const savedPath = path.join(workspace.projectsDir, savedName);
      if (fs.existsSync(savedPath)) return savedPath;
    }
  } catch {}
  // ★ 返回第一个可用的项目目录，不自动创建默认项目
  const projectsDir = workspace.projectsDir;
  if (fs.existsSync(projectsDir)) {
    const dirs = fs.readdirSync(projectsDir, { withFileTypes: true })
      .filter(d => d.isDirectory() && !d.name.startsWith('.'));
    if (dirs.length > 0) {
      return path.join(projectsDir, dirs[0].name);
    }
  }
  // 如果没有任何项目，返回空字符串
  return '';
}

let projectPath = resolveInitialProject();
let workspaceOverride = '';
let customOutputPath = '';

function getIconPath() {
  return path.join(__dirname, 'assets', 'icons', 'icon_256.png');
}

// ── 任务状态（供 ctx 使用）──
let taskIsRunning = false;
let taskAbortController = null;

// ── 上下文（注入到各 IPC 模块）──
const ctx = {
  config,
  db: dbInstance,
  dataDir,
  getMainWindow: () => mainWindow,
  getProjectPath: () => projectPath,
  setProjectPath: (p) => {
    projectPath = p;
    workspaceOverride = '';
    try { workspace.resetWorkspacePointer(); } catch {}
  },
  getWorkDir: () => workspaceOverride ? workspaceOverride : workspace.getWorkDir(projectPath),
  getOutputPath: () => customOutputPath || (workspaceOverride || workspace.getWorkDir(projectPath)),
  getCustomOutputPath: () => customOutputPath,
  setCustomOutputPath: (p) => { customOutputPath = p || ''; },
  setWorkspaceOverride: (p) => {
    workspaceOverride = p || '';
    if (!workspaceOverride) {
      try { workspace.resetWorkspacePointer(); } catch {}
    }
  },
  getWorkspaceTimestamp: () => workspace.getWorkspaceTimestamp(),
  workspace,
  projectsDir: workspace.projectsDir,
  isRunning: () => taskIsRunning,
  getAbortController: () => taskAbortController,
  setTaskState: (running, controller) => { taskIsRunning = running; taskAbortController = controller; },
};

// ── 注册 IPC 模块（统一入口）──
registerAll(ctx);
authService.register();

// ── 清理未提交的临时工作区 ──
function cleanupUncommitted() {
  try {
    const wsDir = path.join(rootDir, 'workspace');
    if (!fs.existsSync(wsDir)) return;
    const committed = new Set();
    try {
      const entries = dbInstance.prepare('SELECT workspace_name FROM history').all();
      for (const e of entries) { if (e.workspace_name) committed.add(e.workspace_name); }
    } catch {}
    try {
      const overrides = dbInstance.prepare('SELECT workspace_name FROM name_overrides').all();
      for (const o of overrides) committed.add(o.workspace_name);
    } catch {}
    const dirs = fs.readdirSync(wsDir, { withFileTypes: true })
      .filter(d => d.isDirectory() && !d.name.startsWith('.') && d.name !== '_qa_session');
    for (const d of dirs) {
      try {
        const sf = path.join(wsDir, d.name, '.mrite-ws.json');
        if (fs.existsSync(sf)) {
          const ws = JSON.parse(fs.readFileSync(sf, 'utf-8'));
          if (ws.inputLoaded) { committed.add(d.name); continue; }
        }
        const dPath = path.join(wsDir, d.name);
        for (const sub of ['求解', '论文']) {
          const subDir = path.join(dPath, sub);
          if (fs.existsSync(subDir)) {
            const files = fs.readdirSync(subDir).filter(f => !f.startsWith('.'));
            if (files.length > 0) { committed.add(d.name); break; }
          }
        }
      } catch {}
    }
    for (const d of dirs) {
      if (!committed.has(d.name)) {
        fs.rmSync(path.join(wsDir, d.name), { recursive: true, force: true });
      }
    }
  } catch {}
}

// ── 安全加固：禁用 DevTools + 反调试 ──
const isDev = process.argv.includes('--dev');

function applySecurity(win) {
  if (isDev) return; // 开发模式不启用

  // 1. 禁用 F12 / Ctrl+Shift+I / Cmd+Option+I 打开 DevTools
  win.webContents.on('before-input-event', (event, input) => {
    // F12
    if (input.key === 'F12') { event.preventDefault(); return; }
    // Ctrl+Shift+I / Cmd+Option+I
    if ((input.control || input.meta) && input.shift && input.key.toLowerCase() === 'i') {
      event.preventDefault(); return;
    }
    // Ctrl+Shift+J / Cmd+Option+J (Console)
    if ((input.control || input.meta) && input.shift && input.key.toLowerCase() === 'j') {
      event.preventDefault(); return;
    }
    // Ctrl+U / Cmd+U (查看源码)
    if ((input.control || input.meta) && input.key.toLowerCase() === 'u') {
      event.preventDefault(); return;
    }
  });

  // 2. 如果被强制打开 DevTools，立即关闭
  win.webContents.on('devtools-opened', () => {
    if (!isDev) win.webContents.closeDevTools();
  });

  // 3. 禁用右键菜单
  win.webContents.on('context-menu', (e) => e.preventDefault());

  // 4. 禁用渲染进程的 eval 和 Function 构造器
  win.webContents.executeJavaScript(`
    (function() {
      // 禁用 eval
      window.eval = function() { throw new Error('eval is disabled'); };
      // 禁用 Function 构造器
      window.Function = function() { throw new Error('Function constructor is disabled'); };
      // 禁用右键
      document.addEventListener('contextmenu', e => e.preventDefault());
      // 禁用拖拽（防止拖出文件）
      document.addEventListener('dragstart', e => e.preventDefault());
      // 检测 DevTools 是否打开（通过尺寸检测）
      let devToolsDetected = false;
      setInterval(function() {
        if (devToolsDetected) return;
        const widthThreshold = window.outerWidth - window.innerWidth > 160;
        const heightThreshold = window.outerHeight - window.innerHeight > 160;
        if (widthThreshold || heightThreshold) {
          devToolsDetected = true;
          document.body.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100vh;font-size:24px;color:#666;">检测到开发者工具，请关闭后重启应用</div>';
        }
      }, 1000);
    })();
  `).catch(() => {});
}

// ── 启动 ──
app.whenReady().then(() => {
  setImmediate(() => { try { cleanupUncommitted(); } catch {} });
  mainWindow = createWindow(config, getIconPath);

  // 安全加固已禁用
  // // 安全加固已禁用
  // applySecurity(mainWindow);

  mainWindow.on('page-title-updated', (event) => { event.preventDefault(); });

  mainWindow.on('close', (event) => {
    if (ctx.isRunning()) {
      event.preventDefault();
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('app-close-blocked', { reason: 'running' });
      }
      return;
    }
    cleanupUncommitted();
  });

  mainWindow.on('closed', () => { mainWindow = null; });
});

// ── 统一退出清理（终止 AI 任务 + 杀掉所有子进程）──
function cleanupOnExit() {
  try { taskService.abort(); } catch {}
  try { procMgr.killAll(); } catch {}
  try { apiProxy.stop(); } catch {}
  try { dbModule.close(); } catch {}
}

app.on('before-quit', () => { cleanupOnExit(); });
app.on('window-all-closed', () => {
  try { authService.recordAppClose?.(); } catch {}
  cleanupOnExit();
  app.quit();
});

// 异常退出兜底：崩溃 / 未捕获异常 / 系统信号
process.on('uncaughtException', (err) => {
  console.error('[Mrite] uncaughtException:', err);
  cleanupOnExit();
});
process.on('unhandledRejection', (reason) => {
  console.error('[Mrite] unhandledRejection:', reason);
});
process.on('SIGTERM', () => { cleanupOnExit(); process.exit(0); });
process.on('SIGINT', () => { cleanupOnExit(); process.exit(0); });

// Windows: 监听 Ctrl+C 和窗口关闭
if (process.platform === 'win32') {
  const readline = require('readline');
  try {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.on('SIGINT', () => { cleanupOnExit(); process.exit(0); });
  } catch {}
}

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    mainWindow = createWindow(config, getIconPath);
  }
});
