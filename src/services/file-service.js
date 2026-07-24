// Mrite v2.0 — 文件操作服务
const path = require('path');
const fs = require('fs');

let _ctx = null;

function init(ctx) {
  _ctx = ctx;
}

function prepareWorkspace() {
  const ctx = _ctx;
  ctx.setWorkspaceOverride('');
  ctx.workspace.prepareCleanWorkspace(ctx.getProjectPath());
  const workDir = ctx.getWorkDir();
  const customOut = ctx.getCustomOutputPath();
  if (customOut) {
    const folderName = path.basename(workDir);
    const targetDir = path.join(customOut, folderName);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
  }
  return { success: true, workDir };
}

function copyFileToProject(filePath, targetDir) {
  const workDir = _ctx.getWorkDir();
  if (!fs.existsSync(workDir)) {
    return { success: false, error: '工作区不存在，请先上传文件触发初始化' };
  }
  const fileName = path.basename(filePath);
  const destDir = path.join(workDir, targetDir);
  if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
  fs.copyFileSync(filePath, path.join(destDir, fileName));
  return { success: true, destPath: path.join(destDir, fileName), fileName };
}

function copyFolderToProject(folderPath, targetDir) {
  const workDir = _ctx.getWorkDir();
  if (!fs.existsSync(workDir)) {
    return { success: false, error: '工作区不存在，请先上传文件触发初始化' };
  }
  const folderName = path.basename(folderPath);
  const dir = path.join(workDir, targetDir);
  const destPath = path.join(dir, folderName);
  fs.cpSync(folderPath, destPath, { recursive: true });
  let fileCount = 0;
  function count(d, depth) {
    if (depth > 8) return;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.name.startsWith('.')) continue;
      if (e.isFile()) fileCount++;
      else if (e.isDirectory()) count(path.join(d, e.name), depth + 1);
    }
  }
  count(destPath, 0);
  return { success: true, destPath, folderName, fileCount };
}

function listProjectFiles(targetDir) {
  const dir = path.join(_ctx.getWorkDir(), targetDir);
  if (!fs.existsSync(dir)) return { success: true, files: [] };
  function build(d, depth = 0) {
    if (depth > 4) return [];
    const result = [];
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.name.startsWith('.')) continue;
      const full = path.join(d, e.name);
      if (e.isDirectory()) {
        const children = build(full, depth + 1);
        let fc = 0;
        children.forEach(c => { if (c.isDir) c.children.forEach(x => fc++); else fc++; });
        result.push({ name: e.name, path: full, isDir: true, fileCount: fc, children });
      } else {
        result.push({ name: e.name, path: full, isDir: false, fileCount: 1 });
      }
    }
    return result;
  }
  return { success: true, files: build(dir) };
}

function clearProjectDir(targetDir) {
  const dir = path.join(_ctx.getWorkDir(), targetDir);
  if (fs.existsSync(dir)) {
    for (const e of fs.readdirSync(dir)) {
      if (e === '.DS_Store') continue;
      fs.rmSync(path.join(dir, e), { recursive: true, force: true });
    }
  }
  return { success: true };
}

function removeProjectFile(filePath, targetDir) {
  const workDir = _ctx.getWorkDir();
  const root = path.resolve(path.join(workDir, targetDir));
  const target = path.resolve(filePath || '');
  if (!target || (target !== root && !target.startsWith(root + path.sep))) {
    return { success: false, error: '路径不在允许范围内' };
  }
  if (fs.existsSync(target)) {
    fs.rmSync(target, { recursive: true, force: true });
  }
  return { success: true };
}

function syncOutput() {
  const ctx = _ctx;
  const workDir = ctx.getWorkDir();
  const customOut = ctx.getCustomOutputPath();
  if (!customOut) return { success: true, targetDir: workDir, skipped: true };
  if (!fs.existsSync(workDir)) return { success: false, error: 'workspace not found' };
  if (!fs.existsSync(customOut)) fs.mkdirSync(customOut, { recursive: true });

  const folderName = path.basename(workDir);
  const targetDir = path.join(customOut, folderName);
  if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

  ['求解', '论文'].forEach(dir => {
    const src = path.join(workDir, dir);
    const dst = path.join(targetDir, dir);
    if (fs.existsSync(src)) {
      if (fs.existsSync(dst)) fs.rmSync(dst, { recursive: true, force: true });
      try { fs.cpSync(src, dst, { recursive: true, force: true }); } catch {}
    }
  });
  return { success: true, targetDir };
}

function readDirectoryTree(dirPath, maxDepth = 5) {
  function build(dir, depth) {
    if (depth > maxDepth) return null;
    if (!fs.existsSync(dir)) return null;
    const children = [];
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name.startsWith('.')) continue;
      if (e.isDirectory()) {
        const sub = build(path.join(dir, e.name), depth + 1);
        children.push({ name: e.name, type: 'directory', path: path.join(dir, e.name), children: sub?.children || [] });
      } else {
        children.push({ name: e.name, type: 'file', path: path.join(dir, e.name) });
      }
    }
    children.sort((a, b) => a.type !== b.type ? (a.type === 'directory' ? -1 : 1) : a.name.localeCompare(b.name, 'zh'));
    return { name: path.basename(dir), type: 'directory', path: dir, children };
  }
  try { return { success: true, tree: build(dirPath, 0) }; }
  catch (err) { return { success: false, error: err.message }; }
}

// ★ 等待文件写入完成：轮询文件大小，连续两次一致则认为写完
function waitForFileStable(filePath, maxWaitMs = 3000) {
  return new Promise(resolve => {
    const start = Date.now();
    let lastSize = -1;
    let stableCount = 0;
    const check = () => {
      try {
        const stat = fs.statSync(filePath);
        if (stat.size > 0 && stat.size === lastSize) {
          stableCount++;
          if (stableCount >= 2) { resolve(stat.size); return; }
        } else {
          stableCount = 0;
        }
        lastSize = stat.size;
      } catch {}
      if (Date.now() - start < maxWaitMs) {
        setTimeout(check, 150);
      } else {
        resolve(lastSize);
      }
    };
    check();
  });
}

async function readFileContent(filePath) {
  try {
    if (!fs.existsSync(filePath)) return { success: false, error: '文件不存在' };
    const ext = path.extname(filePath).toLowerCase();
    const imageMime = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.svg': 'image/svg+xml',
      '.webp': 'image/webp',
    };
    if (imageMime[ext]) {
      // ★ 等待文件写入完成（大小稳定）
      const fileSize = await waitForFileStable(filePath);
      const MAX_IMAGE_SIZE = 20 * 1024 * 1024; // 20MB
      if (fileSize > MAX_IMAGE_SIZE) {
        return { success: false, error: '图片文件过大（' + Math.round(fileSize / 1024 / 1024) + 'MB），超过 20MB 限制' };
      }
      if (fileSize <= 0) {
        return { success: false, error: '图片文件为空或写入超时' };
      }
      const buf = fs.readFileSync(filePath);
      return {
        success: true,
        binary: true,
        image: true,
        ext,
        path: filePath,
        dataUrl: 'data:' + imageMime[ext] + ';base64,' + buf.toString('base64'),
      };
    }
    // Excel 文件解析
    if (['.xlsx', '.xls'].includes(ext)) {
      try {
        const XLSX = require('xlsx');
        const workbook = XLSX.readFile(filePath);
        const sheets = {};
        workbook.SheetNames.forEach(name => {
          const sheet = workbook.Sheets[name];
          const csv = XLSX.utils.sheet_to_csv(sheet);
          sheets[name] = csv;
        });
        return { success: true, binary: true, excel: true, ext, path: filePath, sheets };
      } catch (e) {
        return { success: true, binary: true, ext, path: filePath };
      }
    }
    if (ext === '.pdf') {
      const buf = fs.readFileSync(filePath);
      return { success: true, binary: true, ext, path: filePath, dataUrl: 'data:application/pdf;base64,' + buf.toString('base64') };
    }
    const raw = fs.readFileSync(filePath, 'utf-8');
    return { success: true, text: raw, ext, path: filePath };
  } catch (err) { return { success: false, error: err.message }; }
}

function renderPdfPage(filePath, pageNum) {
  try {
    pageNum = pageNum || 1;
    if (!fs.existsSync(filePath)) return { success: false, error: 'PDF 文件不存在' };
    // 返回 PDF 的 data URL，由渲染进程用 pdfjs-dist 渲染
    const buf = fs.readFileSync(filePath);
    const b64 = buf.toString('base64');
    return { success: true, page: pageNum, totalPages: 0, dataUrl: 'data:application/pdf;base64,' + b64 };
  } catch (err) { return { success: false, error: err.message }; }
}

function isPathSafe(p) {
  if (!p) return false;
  try {
    var abs = path.resolve(p);
    var allowed = [
      path.resolve(_ctx.getWorkDir()),
      path.resolve(_ctx.getProjectPath()),
      _ctx.getCustomOutputPath() ? path.resolve(_ctx.getCustomOutputPath()) : null,
    ].filter(Boolean);
    return allowed.some(function(a) { return abs.startsWith(a); });
  } catch(e) { return false; }
}

async function writeFileContent(filePath, content) {
  try {
    if (!isPathSafe(filePath)) return { success: false, error: '路径不在允许范围内' };
    fs.writeFileSync(filePath, content, 'utf-8');
    return { success: true };
  } catch(e) { return { success: false, error: e.message }; }
}

module.exports = {
  init, prepareWorkspace, copyFileToProject, copyFolderToProject,
  listProjectFiles, clearProjectDir, removeProjectFile, syncOutput, readDirectoryTree,
  readFileContent, writeFileContent, renderPdfPage, isPathSafe,
};
