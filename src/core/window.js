// Mrite v2.0 — 窗口创建
const { BrowserWindow } = require('electron');
const path = require('path');

function createWindow(config, getIconPath) {
  const win = new BrowserWindow({
    width: config.windowWidth,
    height: config.windowHeightCollapsed,
    minWidth: 860,
    minHeight: 640,
    x: 40, y: 60,
    useContentSize: true,
    frame: false,
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#ffffff', symbolColor: '#18181b', height: 30 },
    icon: getIconPath(),
    title: '',
    webPreferences: {
      preload: path.join(__dirname, '..', '..', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    backgroundColor: '#ffffff',
    transparent: false,
    alwaysOnTop: false,
    resizable: true,
    fullscreenable: false,
    maximizable: true,
    show: true,
  });

  win.loadFile(path.join(__dirname, '..', '..', 'renderer', 'index.html'));

  // ★ 等比例缩放（使用 Electron 原生 API，稳定可靠）
  win.setAspectRatio(config.windowWidth / config.windowHeightCollapsed);

  win.webContents.on('did-fail-load', (event, code, desc, url) => {
    console.error('[Mrite] Page load failed:', code, desc, url);
  });

  if (process.argv.includes('--dev')) {
    win.webContents.openDevTools({ mode: 'detach' });
  }

  return win;
}

module.exports = { createWindow };
