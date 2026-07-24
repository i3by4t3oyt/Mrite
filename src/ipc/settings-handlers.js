// Mrite v2.0 — 设置 IPC 路由
const { ipcMain } = require('electron');
const dbModule = require('../core/database');
const latexEnv = require('../core/latex-env');

function register(ctx) {
  ipcMain.handle('db-get-settings', async () => {
    try { return { success: true, settings: dbModule.getAllSettings() }; }
    catch (err) { return { success: false, error: err.message }; }
  });

  ipcMain.handle('db-save-settings', async (event, settings) => {
    try {
      const protectedKeys = []; // 激活状态需要保存到数据库
      for (const [key, value] of Object.entries(settings)) {
        if (protectedKeys.includes(key)) continue;
        dbModule.setSetting(key, value);
      }
      return { success: true };
    } catch (err) { return { success: false, error: err.message }; }
  });

  ipcMain.handle('db-get-setting', async (event, key) => {
    try { return { success: true, value: dbModule.getSetting(key, ''), settings: dbModule.getAllSettings() }; }
    catch (err) { return { success: false, error: err.message }; }
  });

  ipcMain.handle('record-usage', async (event, entry) => {
    try {
      dbModule.recordUsage({
        date: entry.date || new Date().toISOString().split('T')[0],
        inputTokens: entry.inputTokens || entry.input || 0,
        outputTokens: entry.outputTokens || entry.output || 0,
        durationMs: entry.durationMs || 0,
      });
      return { success: true };
    } catch (err) { return { success: false, error: err.message }; }
  });

  ipcMain.handle('get-usage-stats', async () => {
    try { return { success: true, ...dbModule.getUsageStats() }; }
    catch (err) { return { success: false, error: err.message }; }
  });

  ipcMain.handle('get-hourly-stats', async () => {
    try { return { success: true, rows: dbModule.getHourlyStats() }; }
    catch (err) { return { success: false, rows: [] }; }
  });

  ipcMain.handle('clear-usage', async () => {
    try { dbModule.clearUsage(); return { success: true }; }
    catch (err) { return { success: false, error: err.message }; }
  });

  ipcMain.handle('get-output-path', async () => {
    return { success: true, path: ctx.getOutputPath() };
  });

  ipcMain.handle('get-output-config', async () => {
    return { success: true, outputPath: ctx.getCustomOutputPath() };
  });

  ipcMain.handle('set-output-config', async (event, { outputPath }) => {
    try {
      ctx.setCustomOutputPath(outputPath);
      return { success: true };
    } catch (err) { return { success: false, error: err.message }; }
  });

  ipcMain.handle('select-output-path', async () => {
    const { dialog } = require('electron');
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'] });
    if (result.canceled) return { success: false };
    ctx.setCustomOutputPath(result.filePaths[0]);
    return { success: true, path: result.filePaths[0] };
  });

  // ── LaTeX 环境 ──
  ipcMain.handle('latex-get-status', async () => {
    return latexEnv.getStatus();
  });

  ipcMain.handle('latex-install', async (event) => {
    const win = ctx.getMainWindow();
    const onProgress = (msg) => {
      if (win && !win.isDestroyed()) {
        win.webContents.send('latex-install-progress', { message: msg });
      }
    };
    try {
      const result = await latexEnv.install(onProgress);
      return { success: true, ...result };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('latex-uninstall', async () => {
    return latexEnv.uninstall();
  });

  ipcMain.handle('latex-install-packages', async () => {
    const win = ctx.getMainWindow();
    const onProgress = (msg) => {
      if (win && !win.isDestroyed()) {
        win.webContents.send('latex-install-progress', { message: msg });
      }
    };
    try {
      await latexEnv.installPackages(onProgress);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
}

module.exports = { register };
