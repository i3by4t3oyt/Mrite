// Mrite v2.0 — 文件操作 IPC 路由
const { ipcMain, dialog, shell } = require('electron');
const fileService = require('../services/file-service');

function register(ctx) {
  fileService.init(ctx);

  // ★ 路径安全校验（防止任意文件访问）— 在 register 内部定义以访问 ctx
  const pathModule = require('path');
  const osModule = require('os');
  function isPathAllowed(filePath) {
    if (!filePath || typeof filePath !== 'string') return false;
    const resolved = pathModule.resolve(filePath);
    // 允许的目录：工作区、项目目录、自定义输出、workspace 目录、应用目录、桌面/文档
    const appDir = pathModule.resolve(__dirname, '../..');
    const allowedPrefixes = [
      ctx?.getWorkDir?.(),
      ctx?.getProjectPath?.(),
      ctx?.getCustomOutputPath?.(),
      appDir, // 应用根目录（包含 workspace）
      pathModule.join(appDir, 'workspace'),
      pathModule.join(appDir, 'projects'),
      osModule.homedir() + '\\Desktop',
      osModule.homedir() + '\\Documents',
      osModule.homedir() + '/Desktop',
      osModule.homedir() + '/Documents',
    ].filter(Boolean);
    return allowedPrefixes.some(prefix => resolved.startsWith(pathModule.resolve(prefix)));
  }

  ipcMain.handle('open-file-dialog', async (event, options) => {
    const dialogOptions = {
      title: options.title || '选择文件',
      properties: options.properties || ['openFile', 'multiSelections'],
    };
    if (options.filters && options.filters.length > 0) {
      dialogOptions.filters = options.filters;
    }
    const result = await dialog.showOpenDialog(dialogOptions);
    return result.canceled ? [] : result.filePaths;
  });

  ipcMain.handle('open-folder-dialog', async (event, options) => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      filters: options?.filters || [],
    });
    return result.canceled ? [] : result.filePaths;
  });

  ipcMain.handle('prepare-workspace', async () => {
    try { return fileService.prepareWorkspace(); }
    catch (err) { return { success: false, error: err.message }; }
  });

  ipcMain.handle('copy-file-to-project', async (event, { filePath, targetDir }) => {
    try { return fileService.copyFileToProject(filePath, targetDir); }
    catch (err) { return { success: false, error: err.message }; }
  });

  ipcMain.handle('copy-folder-to-project', async (event, { folderPath, targetDir }) => {
    try { return fileService.copyFolderToProject(folderPath, targetDir); }
    catch (err) { return { success: false, error: err.message }; }
  });

  ipcMain.handle('list-project-files', async (event, { targetDir }) => {
    try { return fileService.listProjectFiles(targetDir); }
    catch (err) { return { success: false, error: err.message }; }
  });

  ipcMain.handle('clear-project-dir', async (event, { targetDir }) => {
    try { return fileService.clearProjectDir(targetDir); }
    catch (err) { return { success: false, error: err.message }; }
  });

  ipcMain.handle('remove-project-file', async (event, { filePath, targetDir }) => {
    try { return fileService.removeProjectFile(filePath, targetDir); }
    catch (err) { return { success: false, error: err.message }; }
  });

  ipcMain.handle('sync-output', async () => {
    try { return fileService.syncOutput(); }
    catch (err) { return { success: false, error: err.message }; }
  });

  ipcMain.handle('rename-output-folder', async (event, oldName, newName) => {
    try {
      const customOut = ctx.getCustomOutputPath();
      if (!customOut || !require('fs').existsSync(customOut)) return { success: false, error: 'no output path' };
      const existing = require('fs').readdirSync(customOut, { withFileTypes: true })
        .filter(d => d.isDirectory() && d.name.startsWith(oldName + '_'));
      for (const d of existing) {
        const newDirName = d.name.replace(oldName, newName);
        require('fs').renameSync(require('path').join(customOut, d.name), require('path').join(customOut, newDirName));
      }
      return { success: true };
    } catch (err) { return { success: false, error: err.message }; }
  });

  ipcMain.handle('read-directory-tree', async (event, { dirPath, maxDepth = 5 }) => {
    // ★ 安全校验：限制只能访问允许的目录
    if (!isPathAllowed(dirPath)) return { success: false, error: '路径不在允许范围内', files: [] };
    return fileService.readDirectoryTree(dirPath, maxDepth);
  });

  ipcMain.handle('list-dir-files', async (event, dirPath) => {
    // ★ 安全校验：限制只能访问允许的目录
    if (!isPathAllowed(dirPath)) return { files: [], error: '路径不在允许范围内' };
    try {
      const fs = require('fs');
      const path = require('path');
      if (!fs.existsSync(dirPath)) return { files: [] };
      const files = [];
      let fileCount = 0;
      const MAX_FILES = 1000; // 限制最大文件数
      function scanDir(dir) {
        if (fileCount >= MAX_FILES) return;
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (fileCount >= MAX_FILES) break;
          const full = path.join(dir, entry.name);
          if (entry.isFile()) {
            let size = 0;
            try { size = fs.statSync(full).size; } catch {}
            files.push({ name: entry.name, path: full, size });
            fileCount++;
          } else if (entry.isDirectory() && !entry.name.startsWith('.')) {
            scanDir(full);
          }
        }
      }
      scanDir(dirPath);
      return { files };
    } catch (err) {
      return { files: [], error: err.message };
    }
  });

  ipcMain.handle('copy-to-output', async (event, filePath) => {
    try {
      const customOut = ctx.getCustomOutputPath();
      if (!customOut) return { success: false, error: '未配置输出路径' };
      const workDir = ctx.getWorkDir();
      const folderName = require('path').basename(workDir);
      const targetDir = require('path').join(customOut, folderName);
      if (!require('fs').existsSync(targetDir)) require('fs').mkdirSync(targetDir, { recursive: true });
      const fileName = require('path').basename(filePath);
      const dst = require('path').join(targetDir, fileName);
      require('fs').copyFileSync(filePath, dst);
      return { success: true, dest: dst };
    } catch (err) { return { success: false, error: err.message }; }
  });

  ipcMain.handle('render-pdf-page', async (event, filePath, pageNum) => {
    return fileService.renderPdfPage(filePath, pageNum);
  });

  ipcMain.handle('read-file-content', async (event, filePath) => {
    // ★ 安全校验：限制只能访问允许的目录
    if (!isPathAllowed(filePath)) return { success: false, error: '路径不在允许范围内' };
    return fileService.readFileContent(filePath);
  });

  ipcMain.handle('write-file-content', async (event, filePath, content) => {
    if (!isPathAllowed(filePath)) return { success: false, error: '路径不在允许范围内' };
    return fileService.writeFileContent(filePath, content);
  });

  ipcMain.handle('open-file', async (event, filePath) => {
    if (!fileService.isPathSafe(filePath)) return { success: false, error: '路径不在允许范围内' };
    try { await shell.openPath(filePath); return { success: true }; }
    catch (err) { return { success: false, error: err.message }; }
  });

  ipcMain.handle('open-in-finder', async (event, dirPath) => {
    if (!fileService.isPathSafe(dirPath)) return { success: false, error: '路径不在允许范围内' };
    try { await shell.openPath(dirPath); return { success: true }; }
    catch (err) { return { success: false, error: err.message }; }
  });

  ipcMain.handle('check-problem-dir', async (event, problemName) => {
    try {
      const probDir = require('path').join(ctx.getWorkDir(), '求解', problemName);
      if (!require('fs').existsSync(probDir)) return { hasContent: false };
      function has(dir, depth) {
        if (depth > 4) return false;
        for (const e of require('fs').readdirSync(dir, { withFileTypes: true })) {
          if (e.name.startsWith('.')) continue;
          if (e.isFile()) return true;
          if (e.isDirectory() && has(require('path').join(dir, e.name), depth + 1)) return true;
        }
        return false;
      }
      return { hasContent: has(probDir, 0) };
    } catch { return { hasContent: false }; }
  });

  // 保存文件对话框
  ipcMain.handle('save-file-dialog', async (event, defaultName) => {
    const win = ctx.getMainWindow();
    const result = await dialog.showSaveDialog(win, {
      defaultPath: defaultName,
      filters: [{ name: 'All Files', extensions: ['*'] }]
    });
    return result;
  });

  // 复制文件到指定路径
  ipcMain.handle('copy-file-to-path', async (event, src, dest) => {
    // ★ 安全校验：源文件和目标路径都必须在允许范围内
    if (!isPathAllowed(src)) return { success: false, error: '源路径不在允许范围内' };
    if (!isPathAllowed(dest)) return { success: false, error: '目标路径不在允许范围内' };
    try {
      const fs = require('fs');
      const path = require('path');
      // 确保目标目录存在
      const destDir = path.dirname(dest);
      if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
      fs.copyFileSync(src, dest);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
}

module.exports = { register };
