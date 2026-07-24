// Mrite v2.0 — 任务控制 IPC 路由
const { ipcMain } = require('electron');
const taskService = require('../services/task-service');

function register(ctx) {
  taskService.init(ctx);

  ipcMain.handle('launch-task', async (event, opts = {}) => {
    return taskService.launch(opts);
  });

  ipcMain.handle('abort-task', async () => {
    return taskService.abort();
  });

  ipcMain.handle('get-task-state', async () => {
    return taskService.getState();
  });
}

module.exports = { register };
