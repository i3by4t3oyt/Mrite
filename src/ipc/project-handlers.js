// Mrite v2.0 — 项目管理 IPC 路由（增强状态查询和恢复）
const { ipcMain } = require('electron');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const projectService = require('../services/project-service');
const historyService = require('../services/history-service');
const latexEnv = require('../core/latex-env');
const procMgr = require('../core/process-manager');

function register(ctx) {
  projectService.init(ctx);
  historyService.init(ctx);

  ipcMain.handle('get-project-path', async () => ctx.getProjectPath());

  ipcMain.handle('set-workspace-override', async (event, wsPath) => {
    const fs = require('fs');
    if (fs.existsSync(wsPath)) { ctx.setWorkspaceOverride(wsPath); return { success: true }; }
    return { success: false, error: '路径不存在' };
  });

  ipcMain.handle('set-project-path', async (event, newPath) => {
    const fs = require('fs');
    if (fs.existsSync(newPath)) { ctx.setProjectPath(newPath); return { success: true, projectPath: newPath }; }
    return { success: false, error: '路径不存在' };
  });

  ipcMain.handle('list-projects', async () => projectService.listProjects());
  ipcMain.handle('create-project', async (event, { projectName }) => projectService.createProject(projectName));
  ipcMain.handle('switch-project', async (event, { projectPath: newPath }) => projectService.switchProject(newPath));
  ipcMain.handle('delete-project', async (event, { projectName }) => projectService.deleteProject(projectName));

  // 导入模板（从外部文件夹复制到 projects 目录）
  ipcMain.handle('import-template', async (event, { sourcePath }) => {
    try {
      if (!fs.existsSync(sourcePath)) return { success: false, error: '源路径不存在' };
      const stat = fs.statSync(sourcePath);
      if (!stat.isDirectory()) return { success: false, error: '请选择文件夹' };
      const folderName = path.basename(sourcePath);
      const destPath = path.join(ctx.projectsDir, folderName);
      if (fs.existsSync(destPath)) return { success: false, error: '模板 "' + folderName + '" 已存在' };
      // 递归复制
      fs.cpSync(sourcePath, destPath, { recursive: true });
      // 确保有标准子目录
      ['题目', '数据', '求解', '论文'].forEach(d => {
        fs.mkdirSync(path.join(destPath, d), { recursive: true });
      });
      return { success: true, name: folderName, path: destPath };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // ★ 安装 .mrtpl 加密模板（解密后放入 projects 目录）
  ipcMain.handle('install-mrtpl-template', async (event, { sourcePath }) => {
    try {
      // ★ 清除缓存确保使用最新模块
      delete require.cache[require.resolve('../core/template-crypto')];
      const { decryptToDir, MAGIC } = require('../core/template-crypto');

      // 规范化路径（Windows 兼容）
      const srcPath = path.normalize(sourcePath);
      if (!fs.existsSync(srcPath)) return { success: false, error: '文件不存在' };

      // 验证扩展名
      const ext = path.extname(srcPath).toLowerCase();
      if (ext !== '.mrtpl') return { success: false, error: '仅支持 .mrtpl 加密模板文件' };

      // 验证文件头
      const buf = fs.readFileSync(srcPath);
      if (buf.length < 5) return { success: false, error: '文件太小' };
      const hdr = buf.slice(0, 5);
      if (!hdr.equals(MAGIC)) return { success: false, error: '不是有效的 .mrtpl 模板（文件头不匹配）' };
      const tmp = path.join(require('os').tmpdir(), 'mrtpl-' + Date.now());
      decryptToDir(buf, tmp);

      // 找到模板文件夹
      const items = fs.readdirSync(tmp);
      const dir = items.find(i => fs.statSync(path.join(tmp, i)).isDirectory());
      if (!dir) { fs.rmSync(tmp, { recursive: true, force: true }); return { success: false, error: '模板内容无效' }; }

      const dest = path.join(ctx.projectsDir, dir);
      if (fs.existsSync(dest)) { fs.rmSync(tmp, { recursive: true, force: true }); return { success: false, error: '模板已存在: ' + dir }; }

      fs.cpSync(path.join(tmp, dir), dest, { recursive: true });
      ['题目','数据','求解','论文'].forEach(d => { try { fs.mkdirSync(path.join(dest, d), { recursive: true }); } catch (_) {} });
      fs.rmSync(tmp, { recursive: true, force: true });

      return { success: true, name: dir, path: dest };
    } catch (err) {
      return { success: false, error: err.message || String(err) };
    }
  });
  ipcMain.handle('inject-team-info', async (event, { teamCode, problemNumber }) => projectService.injectTeamInfo(teamCode, problemNumber));
  ipcMain.handle('read-status', async () => {
    const fs = require('fs');
    const path = require('path');
    try {
      const sp = path.join(ctx.getProjectPath(), 'status.json');
      return fs.existsSync(sp) ? JSON.parse(fs.readFileSync(sp, 'utf-8')) : null;
    } catch { return null; }
  });
  ipcMain.handle('write-task', async (event, task) => projectService.writeTask(task));

  ipcMain.handle('update-ws-state', async (event, updates) => {
    if (ctx.workspace) {
      ctx.workspace.writeWsState(ctx.getProjectPath(), updates);
    }
    return { success: true };
  });

  ipcMain.handle('get-recovery-state', async () => {
    if (ctx.workspace) {
      return ctx.workspace.getRecoveryState(ctx.getProjectPath());
    }
    return { canRecover: false };
  });

  ipcMain.handle('get-ws-state', async () => {
    if (ctx.workspace) {
      return ctx.workspace.readWsState(ctx.getProjectPath());
    }
    return null;
  });

  // ★ 读取指定工作区的完整状态（用于历史恢复）
  ipcMain.handle('read-ws-state-by-path', async (event, projectPath) => {
    if (ctx.workspace) {
      return ctx.workspace.readWsState(projectPath);
    }
    return null;
  });

  // 历史记录
  ipcMain.handle('save-history-entry', async (event, entry) => historyService.saveHistoryEntry(entry));
  ipcMain.handle('list-history', async () => historyService.listHistory());
  ipcMain.handle('delete-history-entry', async (event, entryId) => historyService.deleteHistoryEntry(entryId));
  ipcMain.handle('rename-history-entry', async (event, entryId, newName) => historyService.renameHistoryEntry(entryId, newName));
  ipcMain.handle('clear-history', async () => historyService.clearHistory());
  ipcMain.handle('scan-workspace-projects', async () => historyService.scanWorkspaceProjects());
  ipcMain.handle('cleanup-uncommitted', async () => historyService.cleanupUncommitted());
  ipcMain.handle('delete-temp-workspace', async (event, options = {}) => historyService.deleteTempWorkspace(!!options.force));
  ipcMain.handle('delete-workspace-project', async (event, name) => historyService.deleteWorkspaceProject(name));
  ipcMain.handle('rename-workspace-project', async (event, oldName, newName) => historyService.renameWorkspaceProject(oldName, newName));

  // ★ 直接编译（绕过 AI，直接运行内置 TinyTeX xelatex）
  // ★ 清理编译中间产物
  const cleanAuxFiles = (compileDir, texFile) => {
    const base = texFile.replace(/\.tex$/i, '');
    const exts = ['.log', '.aux', '.out', '.toc', '.synctex.gz', '.nav', '.snm', '.vrb', '.xdv', '.fls', '.fdb_latexmk'];
    exts.forEach(ext => {
      const fp = path.join(compileDir, base + ext);
      try { if (fs.existsSync(fp)) fs.unlinkSync(fp); } catch (_) {}
    });
  };

  ipcMain.handle('direct-compile', async (event, { texPath, workDir, singlePass }) => {
    return new Promise((resolve) => {
      if (!texPath || !fs.existsSync(texPath)) {
        resolve({ success: false, error: 'tex 文件不存在' });
        return;
      }

      const texFile = path.basename(texPath);
      const compileDir = workDir && fs.existsSync(path.join(workDir, texFile))
        ? workDir
        : path.dirname(texPath);

      const { spawn } = require('child_process');
      const xelatexPath = latexEnv.getXelatexPath();

      if (!fs.existsSync(xelatexPath)) {
        resolve({ success: false, error: '内置 TinyTeX 未找到，请先在设置中安装/修复 LaTeX 环境' });
        return;
      }

      // ★ 编译前确保 xelatex.fmt 有效，避免中文路径下 fmtutil 自动重建乱码
      if (!latexEnv.isFmtValid()) {
        console.log('[Mrite] xelatex.fmt 无效，编译前重建...');
        const rebuilt = latexEnv.rebuildFmt();
        if (!rebuilt) {
          console.log('[Mrite] fmt 重建失败，将尝试继续编译');
        }
      }

      // getLatexEnv() 已过滤外部 TeX 路径，直接使用
      const latexEnvVars = latexEnv.getLatexEnv();
      const env = {
        ...process.env,
        ...latexEnvVars,
        PATH: latexEnvVars.PATH,
        Path: latexEnvVars.PATH,
      };

      console.log('[Mrite] 编译目录:', compileDir);

      // ★ 编译前先清理旧中间文件，防止残留干扰
      cleanAuxFiles(compileDir, texFile);

      // ★ 记录编译前 PDF 的修改时间，用于判断编译是否真的生成了新 PDF
      const pdfPath = texPath.replace(/\.tex$/, '.pdf');
      const pdfMtimeBefore = fs.existsSync(pdfPath) ? fs.statSync(pdfPath).mtimeMs : 0;

      const args = ['-interaction=nonstopmode', '-halt-on-error', texFile];
      const proc1 = spawn(xelatexPath, args, {
        cwd: compileDir,
        timeout: 120000,
        env: env,
        stdio: ['pipe', 'pipe', 'pipe']
      });
      procMgr.track(proc1);

      let stdout1 = '';
      let stderr1 = '';
      proc1.stdout.on('data', d => stdout1 += d);
      proc1.stderr.on('data', d => stderr1 += d);

      proc1.on('close', (code1) => {
        if (code1 !== 0) {
          resolve({ success: false, error: (stderr1 || stdout1 || 'XeLaTeX 编译失败').trim().slice(-1200) });
          return;
        }

        // 快速编译只跑一次
        if (singlePass) {
          if (fs.existsSync(pdfPath) && fs.statSync(pdfPath).mtimeMs > pdfMtimeBefore) {
            resolve({ success: true, pdfPath });
          } else if (fs.existsSync(pdfPath)) {
            resolve({ success: false, error: '编译未生成新 PDF（源文件可能有 LaTeX 错误）' });
          } else {
            resolve({ success: false, error: '编译未生成 PDF' });
          }
          return;
        }

        // 完整编译跑两次（用于最终输出）
        const proc2 = spawn(xelatexPath, args, {
          cwd: compileDir,
          timeout: 120000,
          env: env,
          stdio: ['pipe', 'pipe', 'pipe']
        });
        procMgr.track(proc2);

        let stdout2 = '';
        let stderr2 = '';
        proc2.stdout.on('data', d => stdout2 += d);
        proc2.stderr.on('data', d => stderr2 += d);

        proc2.on('close', (code2) => {
          if (code2 !== 0) {
            resolve({ success: false, error: (stderr2 || stdout2 || 'XeLaTeX 第二次编译失败').trim().slice(-1200) });
            return;
          }
          if (fs.existsSync(pdfPath) && fs.statSync(pdfPath).mtimeMs > pdfMtimeBefore) {
            resolve({ success: true, pdfPath });
          } else if (fs.existsSync(pdfPath)) {
            resolve({ success: false, error: '第二次编译未生成新 PDF（源文件可能有 LaTeX 错误）' });
          } else {
            resolve({ success: false, error: '编译未生成 PDF' });
          }
        });

        proc2.on('error', (err) => resolve({ success: false, error: err.message }));
      });

      proc1.on('error', (err) => resolve({ success: false, error: err.message }));
    });
  });

  // ★ 查找论文目录中的主 tex 文件（优先 论文.tex）
  ipcMain.handle('find-tex-file', async (event, projectPath) => {
    try {
      const paperDir = path.join(projectPath, '论文');
      if (!fs.existsSync(paperDir)) return { success: false, error: '论文目录不存在' };
      const files = fs.readdirSync(paperDir);
      // 优先找主文件（论文.tex 或包含 \documentclass 的文件）
      const mainFile = files.find(f => f === '论文.tex') || files.find(f => f === 'main.tex');
      if (mainFile) {
        return { success: true, texPath: path.join(paperDir, mainFile) };
      }
      // 回退：找任意 tex 文件
      const texFile = files.find(f => f.endsWith('.tex'));
      if (texFile) {
        return { success: true, texPath: path.join(paperDir, texFile) };
      }
      return { success: false, error: '未找到 tex 文件' };
    } catch(e) {
      return { success: false, error: e.message };
    }
  });
}

module.exports = { register };
