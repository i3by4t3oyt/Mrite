// Mrite v2.0 — IPC 路由统一注册
const { ipcMain } = require('electron');
const fileHandlers = require('./file-handlers');
const taskHandlers = require('./task-handlers');
const projectHandlers = require('./project-handlers');
const settingsHandlers = require('./settings-handlers');
const systemHandlers = require('./system-handlers');

function registerAll(ctx) {
  fileHandlers.register(ctx);
  taskHandlers.register(ctx);
  projectHandlers.register(ctx);
  settingsHandlers.register(ctx);
  systemHandlers.register(ctx);
}

module.exports = { registerAll };
