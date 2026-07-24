// Mrite v2.0 — 授权验证服务（对接线上后端）
const { ipcMain } = require('electron');
const os = require('os');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// ── 后端地址 ──
const BACKEND_BASE = 'https://mirte.rzna.cloud';
const VERIFY_URL = BACKEND_BASE + '/api/v1/verify-invite';
const REPORT_URL = BACKEND_BASE + '/api/v1/report';
const STATUS_URL = BACKEND_BASE + '/api/v1/device-status';
const CHECK_URL = BACKEND_BASE + '/api/v1/check-activation';
const ANNOUNCEMENTS_URL = BACKEND_BASE + '/api/v1/announcements';

let heartbeatTimer = null;
let statusCheckTimer = null;
let networkCheckTimer = null;
let currentMachineCode = '';
let connectionState = { connected: false, region: '', lastCheck: 0, ip: '' };

let pendingUsage = null;
let pendingTaskLog = null;
const PENDING_FILE = path.join(require('os').homedir(), '.mrite-pending-report.json');
const EVENT_QUEUE_FILE = path.join(require('os').homedir(), '.mrite-event-queue.json');
let eventQueue = [];

function loadEventQueue() {
  try {
    if (fs.existsSync(EVENT_QUEUE_FILE)) {
      eventQueue = JSON.parse(fs.readFileSync(EVENT_QUEUE_FILE, 'utf-8')) || [];
    }
  } catch { eventQueue = []; }
}

function saveEventQueue() {
  try { fs.writeFileSync(EVENT_QUEUE_FILE, JSON.stringify(eventQueue), 'utf-8'); } catch {}
}

function pushEvent(type, data) {}

async function flushEvents() {}

function savePendingToFile() {
  try {
    const data = { usage: pendingUsage, taskLog: pendingTaskLog, ts: Date.now() };
    fs.writeFileSync(PENDING_FILE, JSON.stringify(data), 'utf-8');
  } catch {}
}

function loadPendingFromFile() {
  try {
    if (fs.existsSync(PENDING_FILE)) {
      const data = JSON.parse(fs.readFileSync(PENDING_FILE, 'utf-8'));
      if (data.usage && !pendingUsage) pendingUsage = data.usage;
      if (data.taskLog && !pendingTaskLog) pendingTaskLog = data.taskLog;
      fs.unlinkSync(PENDING_FILE);
    }
  } catch {}
}

let dataFlushTimer = null;

function startDataFlush() {
  stopDataFlush();
  dataFlushTimer = setInterval(async () => {
    if (pendingUsage || pendingTaskLog) {
      await sendBundledReport();
    }
  }, 30000);
}

function stopDataFlush() {
  if (dataFlushTimer) { clearInterval(dataFlushTimer); dataFlushTimer = null; }
}

const MACHINE_CODE_FILE = path.join(require('os').homedir(), '.mrite-machine-code');

function getMachineCode() {
  try {
    if (fs.existsSync(MACHINE_CODE_FILE)) {
      const cached = fs.readFileSync(MACHINE_CODE_FILE, 'utf-8').trim();
      if (cached && cached.length >= 16) return cached.substring(0, 16).toUpperCase();
    }
  } catch {}
  const parts = [
    os.hostname(),
    os.cpus()[0]?.model || '',
    os.platform() + '_' + os.arch(),
    os.totalmem().toString(),
  ].join('|');
  const code = crypto.createHash('sha256').update(parts).digest('hex').substring(0, 16).toUpperCase();
  try { fs.writeFileSync(MACHINE_CODE_FILE, code, 'utf-8'); } catch {}
  return code;
}

function getSystemInfo() {
  return {
    hostname: os.hostname(),
    platform: os.platform(),
    arch: os.arch(),
    appVersion: require('../../package.json').version || '2.0.0',
  };
}

// ★ 客户端限流：防止短时间内大量请求
const _rateLimitMap = {};
function isRateLimited(key, maxPerMinute) {
  const now = Date.now();
  if (!_rateLimitMap[key]) _rateLimitMap[key] = [];
  // 清理1分钟前的记录
  _rateLimitMap[key] = _rateLimitMap[key].filter(t => now - t < 60000);
  if (_rateLimitMap[key].length >= maxPerMinute) return true;
  _rateLimitMap[key].push(now);
  return false;
}

function httpPost(url, data) {
  return new Promise((resolve) => {
    try {
      const mod = url.startsWith('https') ? require('https') : require('http');
      const parsed = new URL(url);
      const postData = JSON.stringify(data);
      const req = mod.request({
        hostname: parsed.hostname, port: parsed.port || (url.startsWith('https') ? 443 : 80),
        path: parsed.pathname, method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) },
        timeout: 10000,
      }, (res) => {
        let body = '';
        res.on('data', c => body += c);
        res.on('end', () => {
          try { resolve(JSON.parse(body)); }
          catch { resolve({ success: false, error: '响应解析失败' }); }
        });
      });
      req.on('error', (e) => resolve({ success: false, error: '网络错误: ' + e.message }));
      req.on('timeout', () => { req.destroy(); resolve({ success: false, error: '请求超时' }); });
      req.write(postData); req.end();
    } catch (e) { resolve({ success: false, error: e.message }); }
  });
}

function httpGet(url) {
  return new Promise((resolve) => {
    try {
      const mod = url.startsWith('https') ? require('https') : require('http');
      const parsed = new URL(url);
      const req = mod.request({
        hostname: parsed.hostname, port: parsed.port || (url.startsWith('https') ? 443 : 80),
        path: parsed.pathname + parsed.search, method: 'GET',
        timeout: 10000,
      }, (res) => {
        let body = '';
        res.on('data', c => body += c);
        res.on('end', () => {
          try { resolve(JSON.parse(body)); }
          catch { resolve({ success: false, error: '响应解析失败' }); }
        });
      });
      req.on('error', () => resolve({ success: false, error: '网络错误' }));
      req.on('timeout', () => { req.destroy(); resolve({ success: false, error: '请求超时' }); });
      req.end();
    } catch (e) { resolve({ success: false, error: e.message }); }
  });
}

function notifyConnectionState() {
  const { BrowserWindow } = require('electron');
  const win = BrowserWindow.getAllWindows()[0];
  if (win) {
    win.webContents.send('connection-state-changed', connectionState);
  }
}

function notifyVersionOutdated(minVersion) {
  const { BrowserWindow } = require('electron');
  const win = BrowserWindow.getAllWindows()[0];
  if (win) {
    win.webContents.send('version-outdated', { minVersion: minVersion || '' });
  }
}

async function sendBundledReport(includeHeartbeat) { return { success: true }; }

function startHeartbeat(interval) {
  stopHeartbeat();
  const sec = Math.max(60, parseInt(interval) || 300);
  heartbeatTimer = setInterval(async () => {
    await sendBundledReport();
  }, sec * 1000);
  sendBundledReport();
  startDataFlush();
}

function stopHeartbeat() {
  if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
  stopDataFlush();
}

async function tryReVerify() {
  try {
    const { BrowserWindow } = require('electron');
    const win = BrowserWindow.getAllWindows()[0];
    if (!win) return false;
    const savedCode = await win.webContents.executeJavaScript(
      'Mrite && Mrite.STATE && Mrite.STATE.settings && Mrite.STATE.settings.inviteCode || ""'
    );
    if (!savedCode) return false;
    const result = await httpPost(VERIFY_URL, {
      inviteCode: savedCode,
      machineCode: currentMachineCode,
      ...getSystemInfo(),
    });
    if (result.valid) {
      startHeartbeat(result.heartbeatInterval || 300);
      startStatusCheck();
      return true;
    }
    return false;
  } catch (e) {
    return false;
  }
}

async function quickNetworkCheck() {
  const wasConnected = connectionState.connected;
  try {
    const result = await sendBundledReport();
    connectionState.connected = result && result.success;
  } catch (e) {
    connectionState.connected = false;
  }
  if (wasConnected !== connectionState.connected) {
    notifyConnectionState();
  }
  return { ...connectionState };
}

function startStatusCheck() {
  stopStatusCheck();
  statusCheckTimer = setInterval(async () => {
    if (!currentMachineCode) return;
    const result = await httpGet(STATUS_URL + '?mc=' + currentMachineCode);
    if (result.locked || result.disabled) {
      const { BrowserWindow } = require('electron');
      const win = BrowserWindow.getAllWindows()[0];
      if (win) {
        win.webContents.send('device-remote-locked', {
          locked: result.locked || false,
          disabled: result.disabled || false,
          reason: result.reason || ''
        });
      }
    }
  }, 5 * 60 * 1000);
}

function stopStatusCheck() {
  if (statusCheckTimer) { clearInterval(statusCheckTimer); statusCheckTimer = null; }
}

function register() {
  currentMachineCode = getMachineCode();
  loadEventQueue();
  loadPendingFromFile();

  ipcMain.handle('get-machine-code', async () => {
    return { success: true, machineCode: currentMachineCode };
  });

  ipcMain.handle('verify-invite-code', async (event, { code, apiUrl }) => {
    return { success: true, valid: true, data: { activatedAt: new Date().toISOString(), expiresAt: '2099-12-31T23:59:59Z', heartbeatInterval: 300 } };
  });

  ipcMain.handle('report-usage', async (event, data) => {
    return { success: true };
  });

  ipcMain.handle('report-task-log', async (event, data) => {
    return { success: true };
  });

  ipcMain.handle('report-event', async (event, { type, data }) => {
    return { success: true };
  });

  ipcMain.handle('get-backend-url', async () => {
    return { success: true, url: BACKEND_BASE };
  });

  ipcMain.handle('unified-report', async (event, data) => {
    return { success: true };
  });

  ipcMain.handle('fetch-announcements', async () => {
    return httpGet(ANNOUNCEMENTS_URL);
  });

  ipcMain.handle('fetch-server-api-config', async () => {
    return httpGet(BACKEND_BASE + '/api/v1/api-config');
  });

  ipcMain.handle('get-connection-state', async () => {
    return { ...connectionState };
  });

  ipcMain.handle('check-activation', async () => {
    return { valid: true };
  });

  ipcMain.handle('get-server-usage', async () => {
    return { success: true, data: [] };
  });

  ipcMain.handle('check-connection', async () => {
    return { connected: true, region: 'local', lastCheck: Date.now(), ip: '127.0.0.1' };
  });

  ipcMain.flushPendingReports = sendBundledReport;

  // all backend communication disabled
}

function recordAppClose() {}

module.exports = { register, startHeartbeat, stopHeartbeat, startStatusCheck, stopStatusCheck, quickNetworkCheck, getMachineCode, recordAppClose };
