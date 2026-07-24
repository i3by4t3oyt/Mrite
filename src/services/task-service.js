// Mrite v2.0 — 任务控制服务（Claude Agent SDK）
const path = require('path');
const fs = require('fs');
const os = require('os');
const { app } = require('electron');
const { loadApiConfig } = require('../core/api-config');
const { toShortPath } = require('../core/safe-path');
const latexEnv = require('../core/latex-env');
const pythonEnv = require('../core/python-env');
const apiProxy = require('./api-proxy');

let isRunning = false;
let abortController = null;
let agentSdk = null;
let _ctx = null;

async function getAgentSdk() {
  if (!agentSdk) agentSdk = await import('@anthropic-ai/claude-agent-sdk');
  return agentSdk;
}

function getState() {
  return { isRunning, aborted: abortController?.signal.aborted || false };
}

function isUsablePathDir(dir) {
  if (!dir || typeof dir !== 'string') return false;
  // 只排除 asar 归档内的路径，允许 .asar.unpacked 路径
  if (dir.includes('.asar') && !dir.includes('.asar.unpacked')) return false;
  try {
    return fs.existsSync(dir) && fs.statSync(dir).isDirectory();
  } catch {
    return false;
  }
}

function isExternalTexPath(dir) {
  if (!dir || typeof dir !== 'string') return false;
  const normalized = dir.replace(/\\/g, '/').toLowerCase();
  if (normalized.includes('/assets/tinytex/')) return false;
  return normalized.includes('/texlive/')
    || normalized.endsWith('/texbin')
    || normalized.includes('/tinytex/bin/')
    || normalized.includes('/miktex/')
    || normalized.includes('/texmf/');
}

function isExternalPythonPath(dir) {
  if (!dir || typeof dir !== 'string') return false;
  const normalized = dir.replace(/\\/g, '/').toLowerCase();
  // 内置 Python 路径不能过滤（/assets/python-env/ 或 /python-env/ 是内置的）
  if (normalized.includes('/assets/python-env/') || normalized.includes('mrite') && normalized.includes('python-env')) return false;
  // 过滤系统 Python
  return normalized.includes('/python3')
    || normalized.includes('/python/python')
    || normalized.includes('/python310/')
    || normalized.includes('/python311/')
    || normalized.includes('/python312/')
    || normalized.includes('/python313/')
    || normalized.includes('/windowsapps/');  // Windows Store stub
}

function buildEffectivePath(extraDirs = []) {
  const systemPath = process.env.PATH || process.env.Path || '';
  const systemDirs = systemPath.split(path.delimiter).filter(Boolean)
    .filter(dir => !isExternalTexPath(dir))
    .filter(dir => !isExternalPythonPath(dir));
  const seen = new Set();
  const dirs = [];

  for (const dir of [...extraDirs, ...systemDirs]) {
    if (!isUsablePathDir(dir)) continue;
    const key = dir.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    dirs.push(dir);
  }

  return dirs.join(path.delimiter);
}

function normalizeTaskErrorMessage(err) {
  const raw = err?.message || String(err || '未知错误');

  // 引擎启动失败
  if (err?.code === 'ENOTDIR' || raw.includes('ENOTDIR')) {
    return '⚙️ **求解引擎启动失败**\n\n原因：打包资源路径异常\n\n💡 **解决方法：** 重新安装软件';
  }

  // API 错误码翻译（带解决方法）
  if (raw.includes('401') || raw.includes('unauthorized')) {
    return '❌ **API Key 无效或已过期**\n\n💡 **解决方法：** 进入「设置」检查并更新 API Key';
  }
  if (raw.includes('402') || raw.includes('insufficient') || raw.includes('balance')) {
    return '❌ **API 账户余额不足**\n\n💡 **解决方法：** 登录 API 服务商后台充值，然后点击「继续」重试';
  }
  if (raw.includes('403') || raw.includes('forbidden')) {
    return '🔒 **API 访问被拒绝**\n\n💡 **解决方法：** 检查 API Key 是否有权限访问该模型';
  }
  if (raw.includes('429') || raw.includes('rate.*limit')) {
    return '⚠️ **API 请求过于频繁**\n\n💡 **解决方法：** 等待 1-2 分钟后点击「继续」重试';
  }
  if (raw.includes('500') || raw.includes('502') || raw.includes('503') || raw.includes('529')) {
    return '🔧 **API 服务器暂时不可用**\n\n💡 **解决方法：** 等待几分钟后点击「继续」重试';
  }
  if (raw.includes('quota') || raw.includes('exceeded')) {
    return '📊 **API 配额已用完**\n\n💡 **解决方法：** 登录 API 服务商后台升级套餐或充值';
  }
  if (raw.includes('model') && (raw.includes('not') || raw.includes('invalid'))) {
    return '❌ **模型不可用**\n\n💡 **解决方法：** 进入「设置」检查模型名称，或切换其他模型';
  }
  if (raw.includes('timeout') || raw.includes('超时')) {
    return '⏱️ **请求超时**\n\n💡 **解决方法：** 检查网络连接，稍后点击「继续」重试';
  }
  if (raw.includes('ECONNREFUSED') || raw.includes('ENOTFOUND') || raw.includes('fetch failed')) {
    return '🌐 **网络连接失败**\n\n💡 **解决方法：**\n' +
      '- 检查网络是否正常\n' +
      '- 确认 API 端点地址是否正确';
  }

  return raw;
}

function getClaudePlatformPackagePrefixes() {
  return ['@anthropic-ai/claude-agent-sdk-win32-', '@anthropic-ai/claude-code-win32-'];
}

function getClaudePreferredArchSuffixes() {
  const arch = process.arch === 'x64' ? 'x64' : process.arch === 'arm64' ? 'arm64' : process.arch;
  return [arch];
}

function pushExistingClaudeBinariesFromDir(baseDir, exeName, candidates) {
  try {
    if (!baseDir || !fs.existsSync(baseDir) || !fs.statSync(baseDir).isDirectory()) return;
    const prefixes = getClaudePlatformPackagePrefixes();
    const preferred = getClaudePreferredArchSuffixes();
    const entries = fs.readdirSync(baseDir, { withFileTypes: true });
    const matches = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const scopedName = `@anthropic-ai/${entry.name}`;
      if (!prefixes.some(prefix => scopedName.startsWith(prefix))) continue;
      const exe = path.join(baseDir, entry.name, exeName);
      if (!fs.existsSync(exe)) continue;
      const rank = preferred.some(suffix => scopedName.endsWith(suffix)) ? 0 : 1;
      matches.push({ exe, rank });
    }

    matches.sort((a, b) => a.rank - b.rank);
    matches.forEach(match => candidates.push(match.exe));
  } catch {}
}

function resolveClaudeCodeExecutable() {
  const exeName = 'claude.exe';
  const candidates = [];
  const prefixes = getClaudePlatformPackagePrefixes();
  const suffixes = getClaudePreferredArchSuffixes();
  const packageNames = [];
  const packageFolderNames = [];

  for (const prefix of prefixes) {
    for (const suffix of suffixes) {
      const scopedName = prefix + suffix;
      packageNames.push(scopedName);
      packageFolderNames.push(scopedName.replace(/^@anthropic-ai\//, ''));
    }
  }

  if (process.resourcesPath) {
    for (const pkg of packageFolderNames) {
      candidates.push(
        path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', '@anthropic-ai', 'claude-agent-sdk', 'node_modules', pkg, exeName),
        path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', '@anthropic-ai', 'claude-code', 'node_modules', pkg, exeName),
        path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', '@anthropic-ai', pkg, exeName),
        path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', pkg, exeName),
        path.join(process.resourcesPath, 'app', 'node_modules', '@anthropic-ai', 'claude-agent-sdk', 'node_modules', pkg, exeName),
        path.join(process.resourcesPath, 'app', 'node_modules', '@anthropic-ai', 'claude-code', 'node_modules', pkg, exeName),
        path.join(process.resourcesPath, 'app', 'node_modules', '@anthropic-ai', pkg, exeName),
        path.join(process.resourcesPath, 'app', 'node_modules', pkg, exeName)
      );
    }

    pushExistingClaudeBinariesFromDir(path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', '@anthropic-ai', 'claude-agent-sdk', 'node_modules', '@anthropic-ai'), exeName, candidates);
    pushExistingClaudeBinariesFromDir(path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', '@anthropic-ai', 'claude-code', 'node_modules', '@anthropic-ai'), exeName, candidates);
  }

  for (const pkg of packageNames) {
    try {
      const resolved = require.resolve(`${pkg}/${exeName}`);
      candidates.push(resolved);
      if (resolved.includes('.asar')) {
        candidates.push(resolved.replace('.asar', '.asar.unpacked'));
      }
    } catch {}
  }

  if (__dirname.includes('.asar')) {
    for (const pkg of packageFolderNames) {
      candidates.push(
        path.join(__dirname.replace('.asar', '.asar.unpacked'), '..', '..', 'node_modules', '@anthropic-ai', pkg, exeName),
        path.join(__dirname.replace('.asar', '.asar.unpacked'), '..', '..', 'node_modules', '@anthropic-ai', 'claude-agent-sdk', 'node_modules', pkg, exeName),
        path.join(__dirname.replace('.asar', '.asar.unpacked'), '..', '..', 'node_modules', '@anthropic-ai', 'claude-code', 'node_modules', pkg, exeName)
      );
    }
  }

  for (const candidate of candidates) {
    if (!candidate) continue;
    // 只排除 asar 归档内的路径，允许 .asar.unpacked 路径
    if (candidate.includes('.asar') && !candidate.includes('.asar.unpacked')) continue;
    try {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
    } catch {}
  }

  return null;
}

function collectClaudeExecutableCandidates() {
  const exeName = 'claude.exe';
  const candidates = [];
  const seen = new Set();
  const prefixes = getClaudePlatformPackagePrefixes();
  const suffixes = getClaudePreferredArchSuffixes();
  const packageNames = [];
  const packageFolderNames = [];

  const pushCandidate = (candidate) => {
    if (!candidate || typeof candidate !== 'string') return;
    const key = process.platform === 'win32' ? candidate.toLowerCase() : candidate;
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push(candidate);
  };

  for (const prefix of prefixes) {
    for (const suffix of suffixes) {
      const scopedName = prefix + suffix;
      packageNames.push(scopedName);
      packageFolderNames.push(scopedName.replace(/^@anthropic-ai\//, ''));
    }
  }

  if (process.resourcesPath) {
    for (const pkg of packageFolderNames) {
      [
        path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', '@anthropic-ai', 'claude-agent-sdk', 'node_modules', pkg, exeName),
        path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', '@anthropic-ai', 'claude-code', 'node_modules', pkg, exeName),
        path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', '@anthropic-ai', pkg, exeName),
        path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', pkg, exeName),
        path.join(process.resourcesPath, 'app', 'node_modules', '@anthropic-ai', 'claude-agent-sdk', 'node_modules', pkg, exeName),
        path.join(process.resourcesPath, 'app', 'node_modules', '@anthropic-ai', 'claude-code', 'node_modules', pkg, exeName),
        path.join(process.resourcesPath, 'app', 'node_modules', '@anthropic-ai', pkg, exeName),
        path.join(process.resourcesPath, 'app', 'node_modules', pkg, exeName)
      ].forEach(pushCandidate);
    }
  }

  for (const pkg of packageNames) {
    try {
      const resolved = require.resolve(`${pkg}/${exeName}`);
      pushCandidate(resolved);
      if (resolved.includes('.asar')) {
        pushCandidate(resolved.replace('.asar', '.asar.unpacked'));
      }
    } catch {}
  }

  if (__dirname.includes('.asar')) {
    for (const pkg of packageFolderNames) {
      [
        path.join(__dirname.replace('.asar', '.asar.unpacked'), '..', '..', 'node_modules', '@anthropic-ai', pkg, exeName),
        path.join(__dirname.replace('.asar', '.asar.unpacked'), '..', '..', 'node_modules', '@anthropic-ai', 'claude-agent-sdk', 'node_modules', pkg, exeName),
        path.join(__dirname.replace('.asar', '.asar.unpacked'), '..', '..', 'node_modules', '@anthropic-ai', 'claude-code', 'node_modules', pkg, exeName)
      ].forEach(pushCandidate);
    }
  }

  return candidates;
}

function getClaudeExecutableDiagnostics() {
  const exeName = 'claude.exe';
  const bits = [
    `platform=${process.platform}`,
    `arch=${process.arch}`,
    `resourcesPath=${process.resourcesPath || ''}`,
    `dirname=${__dirname}`,
  ];

  if (process.resourcesPath) {
    const roots = [
      path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', '@anthropic-ai', 'claude-agent-sdk', 'node_modules', '@anthropic-ai'),
      path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', '@anthropic-ai', 'claude-code', 'node_modules', '@anthropic-ai'),
    ];
    for (const root of roots) {
      try {
        const names = fs.existsSync(root) ? fs.readdirSync(root).filter(name => name.includes('claude')) : [];
        bits.push(`${root} => ${names.join(',') || 'empty/missing'}`);
      } catch (e) {
        bits.push(`${root} => ${e.message}`);
      }
    }
  }

  bits.push(`exe=${exeName}`);
  return bits.join(' | ');
}

function getSolverExecutableProbeResult() {
  const candidates = collectClaudeExecutableCandidates();
  const candidateStatuses = candidates.map(candidate => {
    const item = { path: candidate, insideAsarArchive: candidate.includes('.asar') && !candidate.includes('.asar.unpacked') };
    try {
      if (!fs.existsSync(candidate)) {
        item.status = 'missing';
        return item;
      }
      const stat = fs.statSync(candidate);
      if (!stat.isFile()) {
        item.status = 'not_file';
        return item;
      }
      item.status = 'ok';
      item.size = stat.size;
      return item;
    } catch (e) {
      item.status = 'error';
      item.error = e.message;
      return item;
    }
  });

  return {
    platform: process.platform,
    arch: process.arch,
    resourcesPath: process.resourcesPath || '',
    dirname: __dirname,
    packagedAsarRuntime: isPackagedAsarRuntime(),
    resolvedExecutable: resolveClaudeCodeExecutable(),
    executableName: process.platform === 'win32' ? 'claude.exe' : 'claude',
    diagnostics: getClaudeExecutableDiagnostics(),
    candidateStatuses
  };
}

function isPackagedAsarRuntime() {
  return __dirname.includes('.asar') || Boolean(process.resourcesPath && fs.existsSync(path.join(process.resourcesPath, 'app.asar')));
}

function abort() {
  abortController?.abort();
  isRunning = false;
  _stopFileWatcher();
  if (_ctx?.setTaskState) _ctx.setTaskState(false, null);
  if (_ctx?.workspace) {
    _ctx.workspace.markTaskError(_ctx.getProjectPath(), { message: '用户主动终止' });
  }
  return { success: true };
}

function resolveDisplayProjectName(ctx, opts, workDir, projectPath) {
  const fromOpts = opts?.apiConfig?.projectName || opts?.projectName || '';
  if (fromOpts && String(fromOpts).trim()) return String(fromOpts).trim();

  try {
    const sf = path.join(workDir, '.mrite-ws.json');
    if (fs.existsSync(sf)) {
      const ws = JSON.parse(fs.readFileSync(sf, 'utf-8'));
      const name = ws.projectName || ws.displayName || '';
      if (name && String(name).trim()) return String(name).trim();
    }
  } catch {}

  try {
    const wsName = path.basename(workDir || '');
    const row = ctx.db?.prepare('SELECT display_name FROM name_overrides WHERE workspace_name = ?').get(wsName);
    if (row && row.display_name) return row.display_name;
  } catch {}

  return path.basename(projectPath || '') || '';
}

// ★ 文件监听器：实时检测新生成的图片和表格
let _fileWatcher = null;
let _watchedFiles = new Set();

function _startFileWatcher(workDir, win) {
  // 清除旧的监听器
  _stopFileWatcher();

  const solveDir = path.join(workDir, '求解');
  if (!fs.existsSync(solveDir)) {
    fs.mkdirSync(solveDir, { recursive: true });
  }

  // 图片和表格的扩展名
  const imageExts = new Set(['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp']);
  const tableExts = new Set(['.csv', '.xlsx', '.xls']);
  const codeExts = new Set(['.py', '.m', '.r']);

  try {
    // 使用 fs.watch 递归监听目录
    _fileWatcher = fs.watch(solveDir, { recursive: true }, (eventType, filename) => {
      if (!filename) return;

      const ext = path.extname(filename).toLowerCase();
      const isImage = imageExts.has(ext);
      const isTable = tableExts.has(ext);
      const isCode = codeExts.has(ext);

      if (!isImage && !isTable && !isCode) return;

      // 构建完整路径
      const filePath = path.join(solveDir, filename);
      const fileKey = `${eventType}:${filename}`;

      // 去重：避免同一事件重复发送
      if (_watchedFiles.has(fileKey)) return;
      _watchedFiles.add(fileKey);
      setTimeout(() => _watchedFiles.delete(fileKey), 1000);

      // 检查文件是否存在（可能是删除事件）
      let fileExists = false;
      let fileSize = 0;
      try {
        if (fs.existsSync(filePath)) {
          const stat = fs.statSync(filePath);
          fileExists = stat.isFile();
          fileSize = stat.size;
        }
      } catch {}

      if (!fileExists) return;

      // 发送事件到渲染进程
      if (win && !win.isDestroyed()) {
        const fileData = {
          name: path.basename(filename),
          path: filePath,
          size: fileSize,
          type: isImage ? 'image' : isTable ? 'table' : 'code'
        };

        console.log(`[FileWatcher] 检测到新文件: ${fileData.name} (${fileData.type})`);
        win.webContents.send('agent-event', {
          type: 'file_update',
          payload: fileData
        });
      }
    });

    console.log(`[FileWatcher] 开始监听: ${solveDir}`);
  } catch (err) {
    console.error('[FileWatcher] 监听失败:', err);
  }
}

function _stopFileWatcher() {
  if (_fileWatcher) {
    try {
      _fileWatcher.close();
    } catch {}
    _fileWatcher = null;
    _watchedFiles.clear();
    console.log('[FileWatcher] 已停止监听');
  }
}

// ★ 预读输入文件（PDF/Excel/CSV），生成摘要文件供 agent 直接读取
function preReadInputs(workDir) {
  const topicDir = path.join(workDir, '题目');
  const dataDir = path.join(workDir, '数据');
  const summaryLines = [];

  // ★ 如果预读文件已存在，跳过（重新加载时复用）
  const topicOut = path.join(topicDir, '题目内容.txt');
  const dataOut = path.join(dataDir, '数据摘要.txt');
  if (fs.existsSync(topicOut) && fs.existsSync(dataOut)) {
    console.log('[preRead] 预读文件已存在，跳过');
    return;
  }

  // 预读题目文件（PDF + Word + 其他文本）
  if (fs.existsSync(topicDir)) {
    const topicFiles = fs.readdirSync(topicDir);
    const texts = [];
    const { execSync } = require('child_process');
    const envDir = pythonEnv.getPythonEnvDir ? pythonEnv.getPythonEnvDir() : '';
    const pythonExe = envDir ? path.join(envDir, 'python.exe') : 'python';
    const pyEnv = envDir ? { ...process.env, PYTHONHOME: envDir, PYTHONNOUSERSITE: '1', PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1', LANG: 'zh_CN.UTF-8' } : { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1', LANG: 'zh_CN.UTF-8' };

    for (const file of topicFiles) {
      const filePath = path.join(topicDir, file);
      const ext = path.extname(file).toLowerCase();
      try {
        if (ext === '.pdf') {
          const tmpOut = filePath + '.txt';
          const pyScript = path.join(topicDir, '_pre_read_pdf.py');
          fs.writeFileSync(pyScript, [
            'import pdfplumber, os, sys',
            'sys.stdout.reconfigure(encoding="utf-8")',
            'topic_dir = os.path.dirname(sys.argv[0])',
            'for f in os.listdir(topic_dir):',
            '  if f.endswith(".pdf"):',
            '    pdf_path = os.path.join(topic_dir, f)',
            '    out_path = pdf_path + ".txt"',
            '    pdf = pdfplumber.open(pdf_path)',
            '    o = open(out_path, "w", encoding="utf-8")',
            '    for i, p in enumerate(pdf.pages):',
            '      t = p.extract_text() or ""',
            '      if t.strip(): o.write("=== 第" + str(i+1) + "页 ===\\n" + t + "\\n")',
            '    pdf.close()',
            '    o.close()',
          ].join('\n'), 'utf-8');
          try { execSync(`"${pythonExe}" "${pyScript}"`, { timeout: 30000, env: pyEnv, stdio: 'pipe' }); } catch {}
          try { fs.unlinkSync(pyScript); } catch {}
          if (fs.existsSync(tmpOut)) {
            const r = fs.readFileSync(tmpOut, 'utf-8');
            if (r.trim()) texts.push(r.trim());
            try { fs.unlinkSync(tmpOut); } catch {}
          }
        } else if (ext === '.docx') {
          const pyScript = path.join(topicDir, '_pre_read_docx.py');
          fs.writeFileSync(pyScript, [
            'import sys, io, os',
            'sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")',
            'from docx import Document',
            'topic_dir = os.path.dirname(sys.argv[0])',
            'for f in os.listdir(topic_dir):',
            '  if f.endswith(".docx"):',
            '    doc = Document(os.path.join(topic_dir, f))',
            '    for p in doc.paragraphs:',
            '      if p.text.strip(): print(p.text)',
            '    for t in doc.tables:',
            '      print("\\n--- Table ---")',
            '      for row in t.rows:',
            '        cells = [c.text for c in row.cells]',
            '        print(str(cells))',
          ].join('\n'), 'utf-8');
          const r = execSync(`"${pythonExe}" "${pyScript}"`, { encoding: 'utf-8', timeout: 30000, env: pyEnv, stdio: 'pipe' });
          try { fs.unlinkSync(pyScript); } catch {}
          if (r.trim()) texts.push(r.trim());
        } else if (ext === '.txt' || ext === '.md') {
          const r = fs.readFileSync(filePath, 'utf-8');
          if (r.trim()) texts.push(r.trim());
        }
      } catch (e) {
        console.warn('[preRead] 题目预读失败:', file, e.message);
      }
    }
    if (texts.length) {
      const outPath = path.join(topicDir, '题目内容.txt');
      fs.writeFileSync(outPath, texts.join('\n\n'), 'utf-8');
      summaryLines.push('题目已预读 → 题目/题目内容.txt');
    }
  }

  // 预读 Excel / CSV 文件
  if (fs.existsSync(dataDir)) {
    const allFiles = fs.readdirSync(dataDir);
    const excelFiles = allFiles.filter(f => /\.(xlsx?|csv)$/i.test(f));
    const summaries = [];
    for (const file of excelFiles) {
      try {
        const filePath = path.join(dataDir, file);
        const ext = path.extname(file).toLowerCase();
        if (ext === '.csv') {
          const content = fs.readFileSync(filePath, 'utf-8');
          const lines = content.split('\n').slice(0, 21);
          summaries.push(`\n## ${file}（CSV，共 ${content.split('\n').length} 行）`);
          summaries.push(lines.join('\n'));
        } else {
          const XLSX = require('xlsx');
          const wb = XLSX.readFile(filePath);
          for (const sheetName of wb.SheetNames.slice(0, 3)) {
            const ws = wb.Sheets[sheetName];
            const data = XLSX.utils.sheet_to_csv(ws);
            const lines = data.split('\n').slice(0, 21);
            summaries.push(`\n## ${file} → Sheet: ${sheetName}（共 ${data.split('\n').length} 行）`);
            summaries.push(lines.join('\n'));
          }
        }
      } catch (e) {
        console.warn('[preRead] 数据预读失败:', file, e.message);
      }
    }
    if (summaries.length) {
      const outPath = path.join(dataDir, '数据摘要.txt');
      fs.writeFileSync(outPath, summaries.join('\n'), 'utf-8');
      summaryLines.push('数据文件已预读 → 数据/数据摘要.txt（共 ' + excelFiles.length + ' 个文件）');
    }
  }

  if (summaryLines.length) {
    console.log('[preRead]', summaryLines.join(' | '));
  }
}

/**
 * 判断 API 端点是否原生支持 Anthropic Messages API 格式
 * - 官方 Anthropic API (api.anthropic.com)
 * - 包含 /anthropic 路径的端点（如 DeepSeek /anthropic、GLM /anthropic）
 */
function isAnthropicEndpoint(baseURL, apiFormat) {
  // 自动检测优先：URL 中包含 /anthropic 或 api.anthropic.com → 必须走 Anthropic 格式
  if (!baseURL) return true;
  const url = baseURL.toLowerCase();
  const isAnthrUrl = url.includes('api.anthropic.com') || url.includes('/anthropic');

  // URL 明确是 Anthropic 端点时，强制使用 Anthropic 格式（忽略用户选择的 openai）
  if (isAnthrUrl) return true;

  // 用户手动指定
  if (apiFormat === 'anthropic') return true;
  if (apiFormat === 'openai') return false;

  // 默认走 Anthropic
  return true;
}

async function launch(opts = {}) {
  const ctx = _ctx;
  if (!ctx) throw new Error('TaskService not initialized');

  const db = ctx.db;
  if (db) {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('inviteVerified');
    if (!row || row.value !== 'true') {
      isRunning = false; abortController = null;
      if (ctx.setTaskState) ctx.setTaskState(false, null);
      return { success: false, error: '软件未激活，请先验证激活码' };
    }
  }

  const projectPath = opts.projectPath || '';
  if (projectPath && (projectPath.includes('..') || projectPath.includes('~'))) {
    return { success: false, error: '非法项目路径' };
  }

  if (isRunning) { abortController?.abort(); isRunning = false; }
  abortController = new AbortController();
  isRunning = true;
  if (ctx.setTaskState) ctx.setTaskState(true, abortController);

  const { query } = await getAgentSdk();
  // ★ 不读取系统默认配置，完全使用用户在软件中添加的配置
  // const def = loadApiConfig();  // 已禁用：避免系统配置干扰

  // ★ 读取用户选择的 API 配置
  // 前端传参格式：opts.apiConfig = { apiBase, apiKey, apiModel, apiFormat }
  // preload 打包后：{ projectPath, apiConfig: { apiBase, apiKey, apiModel, apiFormat, ... }, prompt, modifyMode }
  const userCfg = opts.apiConfig || {};
  const userBase = (userCfg.apiBase || '').trim();
  const userKey = (userCfg.apiKey || '').trim();
  const userModel = (userCfg.apiModel || '').trim();

  // ★ 直接使用用户配置，不使用系统默认配置
  const apiConfig = {
    baseURL: userBase,
    apiKey: userKey,
    model: userModel,
  };
  console.log('[Mrite] API Config:', {
    model: apiConfig.model,
    baseURL: apiConfig.baseURL,
    hasKey: !!apiConfig.apiKey,
    apiFormat: userCfg.apiFormat || 'auto'
  });

  // ★ 判断是否为 Anthropic 原生端点，非 Anthropic 端点走翻译代理
  const isAnthropicNative = isAnthropicEndpoint(apiConfig.baseURL, userCfg.apiFormat);
  if (!isAnthropicNative && apiConfig.baseURL) {
    // 启动翻译代理，将 Anthropic 格式转为 OpenAI 格式
    console.log('[Mrite] Starting API proxy for OpenAI-format endpoint...');
    console.log('[Mrite] Target:', {
      baseURL: apiConfig.baseURL,
      model: apiConfig.model,
      hasKey: !!apiConfig.apiKey
    });

    try {
      apiProxy.setTarget(apiConfig.baseURL, apiConfig.apiKey, apiConfig.model);
      const proxyPort = apiProxy.start();
      apiConfig.baseURL = apiProxy.getProxyURL();
      console.log('[Mrite] API proxy started successfully on port', proxyPort);
      console.log('[Mrite] Using API proxy URL:', apiConfig.baseURL);
    } catch (err) {
      console.error('[Mrite] Failed to start API proxy:', err.message);
      return { success: false, error: '无法启动 API 代理：' + err.message };
    }
  } else {
    console.log('[Mrite] Using direct Anthropic endpoint:', apiConfig.baseURL);
  }
  const rawPrompt = opts.prompt?.trim() || '开始求解';
  const prompt = rawPrompt.length > 2000 ? rawPrompt.slice(0, 2000) + '…' : rawPrompt;
  const isModify = opts.modifyMode === true;

  let effectivePrompt = prompt;

  const hasProject = opts.projectPath && fs.existsSync(opts.projectPath);
  let workDir;

  workDir = ctx.getWorkDir();
  if (!fs.existsSync(workDir)) {
    try {
      fs.mkdirSync(workDir, { recursive: true });
      ['题目', '数据', '求解', '论文'].forEach(d => {
        const dir = path.join(workDir, d);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      });
    } catch (e) {
      console.error('创建工作区失败:', e);
      return { success: false, error: '无法创建工作区目录' };
    }
  }

  // 直接使用工作目录（目录名已不含空格）
  let effectiveWorkDir = workDir;
  let promptWithContext = prompt;
  let isResume = false;
  let resumeSessionId = null;
  if (!isModify && ctx.workspace) {
    try {
      const wsState = ctx.workspace.readWsState(projectPath || ctx.getProjectPath());
      if (wsState && (wsState.status === 'stopped' || wsState.status === 'error' || Number(wsState.progress || 0) > 0)) {
        isResume = true;
        // ★ 优先用 SDK resume（记忆功能），无需手动拼接上下文
        if (wsState.sessionId) {
          resumeSessionId = wsState.sessionId;
          console.log('[Mrite] 将使用 SDK resume 恢复会话:', resumeSessionId);
          // 只加简短提示，不需要完整上下文
          var errorMsg = wsState.errorMessage || '';
          var isApiError = /余额|欠费|402|401|429|500|502|503|Key|quota|insufficient|balance/i.test(errorMsg);
          promptWithContext = [
            '═══ 【继续求解 — 不要从头开始！】 ═══',
            isApiError ? '上次因 API 问题中断，现在应已恢复，直接继续。' : '',
            '1. 先 ls 查看求解/目录，确认已有哪些问题目录和文件',
            '2. 已完成的问题不要重做，只处理未完成的部分',
            '3. 直接从上次中断的位置继续',
            '═══ 用户指令 ═══',
            prompt,
          ].filter(Boolean).join('\n');
        } else {
          // 降级：没有 sessionId，用旧方式拼接上下文
          const resumeContext = buildResumeContext(wsState);
          if (resumeContext) {
            promptWithContext = [
              '═══ 【继续求解 — 不要从头开始！】 ═══',
              resumeContext,
              '═══ 继续规则 ═══',
              '1. 先 ls 查看求解/目录，确认已有哪些问题目录和文件',
              '2. 已完成的问题不要重做，只处理未完成的部分',
              '3. 直接从上次中断的位置继续，不要重新读题',
              '═══ 用户指令 ═══',
              prompt,
            ].filter(Boolean).join('\n');
          }
        }
      }
    } catch {}
  }
  // ★ 预读输入文件（仅在首次运行且预读文件不存在时执行）
  // agent 的 prompt 已包含读题流程，此处仅作为加速手段
  if (!isResume && !isModify) {
    const topicOut = path.join(effectiveWorkDir, '题目', '题目内容.txt');
    const dataOut = path.join(effectiveWorkDir, '数据', '数据摘要.txt');
    if (!fs.existsSync(topicOut) || !fs.existsSync(dataOut)) {
      try { preReadInputs(effectiveWorkDir); } catch (e) { console.warn('[preRead] 预读失败，agent 将自行处理:', e.message); }
    }
  }
  // ★ 获取最近聊天历史（仅修改模式）
  var recentChat = isModify ? (opts._recentChat || []) : [];
  effectivePrompt = _buildPrompt({ isModify, hasProject, workDir: effectiveWorkDir, prompt: promptWithContext, isResume, recentChat });

  if (!isModify && hasProject) {
    try {
      var mdPath = path.join(workDir, 'CLAUDE.md');
      if (fs.existsSync(mdPath)) {
        var md = fs.readFileSync(mdPath, 'utf-8');
        if (!md.includes('## 赛题信息')) {
          var infoLines = [];
          var s = {};
          try {
            var settingsDb = ctx.db;
            if (settingsDb) {
              var rows = settingsDb.prepare('SELECT key, value FROM settings').all();
              for (var i = 0; i < rows.length; i++) {
                var v = rows[i].value;
                if (v === 'true') v = true; else if (v === 'false') v = false;
                s[rows[i].key] = v;
              }
            }
          } catch(e) {}
          if (s.enableTeamCode && s.teamCode) infoLines.push('- 队伍编号：' + s.teamCode);
          if (s.enableProblemNum && s.problemNumber) infoLines.push('- 题号：' + s.problemNumber);
          if (s.enableSchool && s.school) infoLines.push('- 学校：' + s.school);
          if (s.enableMembers && s.members) infoLines.push('- 队员：' + s.members);
          if (s.enableAdvisor && s.advisor) infoLines.push('- 指导老师：' + s.advisor);
          if (s.writingLang === 'en') infoLines.push('- 写作语言：English — 全文使用英文撰写');
          if (s.enableStyle && s.stylePrompt) {
            infoLines.push('');
            infoLines.push('## 生成风格（Beta 实验室功能）');
            infoLines.push(s.stylePrompt);
          }
          if (infoLines.length > 0) {
            md += '\n\n## 赛题信息\n' + infoLines.join('\n') + '\n';
            fs.writeFileSync(mdPath, md, 'utf-8');
          }
        }
      }
    } catch(e) {}
  }

  // ★ 获取主窗口引用
  const win = ctx.getMainWindow();
  if (win && !win.isDestroyed()) {
    win.webContents.send('agent-event', { type: 'state', payload: { status: 'running', workDir: workDir } });
  }

  // ★ 启动文件监听：实时推送新生成的图片和表格
  _startFileWatcher(workDir, win);

  const taskLogId = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const displayProjectName = resolveDisplayProjectName(ctx, opts, workDir, projectPath);
  
  if (ctx.db) {
    ctx.db.prepare(`INSERT INTO task_logs (id, task_type, status, project_name, workspace_name, started_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))`).run(
      taskLogId,
      isModify ? 'modify' : 'solve',
      'running',
      displayProjectName,
      path.basename(workDir)
    );
  }

  if (ctx.workspace) {
    ctx.workspace.markTaskStarted(projectPath || ctx.getProjectPath(), {
      taskType: isModify ? 'modify' : 'solve',
      model: apiConfig.model,
      projectName: displayProjectName,
      inputFiles: opts.inputFiles || []
    });
  }

  _run({ query, apiConfig, workDir, effectiveWorkDir, prompt: effectivePrompt, isModify, hasProject, taskLogId, resumeSessionId }).catch(err => {
    console.error('Mrite: 未捕获异常', err);
    const rawMessage = err?.message || String(err || '未知错误');
    const message = normalizeTaskErrorMessage(err);
    isRunning = false; abortController = null;
    if (ctx.workspace) {
      ctx.workspace.markTaskError(projectPath || ctx.getProjectPath(), { message });
    }
    const w = ctx.getMainWindow();
    if (w && !w.isDestroyed()) {
      // API 错误提示用户可以充值后继续
      var hint = /余额|402|insufficient|balance|quota/i.test(rawMessage) ? '（充值后可点击"继续"恢复）' : '';
      w.webContents.send('agent-event', { type: 'error', payload: { message: message + hint, fatal: true } });
    }
  });

  return { success: true };
}

function _buildPrompt({ isModify, hasProject, workDir, prompt, isResume, recentChat }) {
  // ★ 极简系统提示词：只负责流程控制，详细规则由 CLAUDE.md 定义
  if (isModify) {
    // 构建上下文摘要
    var contextLines = [];
    if (Array.isArray(recentChat) && recentChat.length > 0) {
      contextLines.push('## 最近对话（仅作参考，不要重复执行已完成的操作）');
      recentChat.forEach(function(msg) {
        var role = msg.role === 'user' ? '用户' : 'AI';
        var text = msg.text.replace(/\n/g, ' ').substring(0, 150);
        contextLines.push(role + '：' + text);
      });
    }
    return [
      '【修改模式】工作目录：' + workDir,
      '',
      '## 规则',
      '1. 禁止访问工作区之外的路径',
      '2. 禁止修改 题目/ 和 数据/ 目录',
      '3. 与用户交流使用中文',
      '',
      '## ★ 重要',
      '这是修改模式，不是求解模式。不要执行读题、求解等流程。',
      '直接根据用户指令定位文件并修改，修改后编译检查。',
      '',
      contextLines.join('\n'),
      '',
      '## ★ 用户指令（最高优先级，精确执行）',
      prompt,
    ].filter(Boolean).join('\n');
  }

  // 求解模式
  return [
    '【求解模式】工作目录：' + workDir,
    '',
    '## 规则',
    '1. 禁止访问工作区之外的路径',
    '2. 与用户交流使用中文',
    '3. 遵循 CLAUDE.md 中的执行流程和论文规范',
    '',
    isResume
      ? '## 继续模式\n从上次中断位置继续，不要重新读题。'
      : '',
    '## ★ 用户指令（最高优先级）',
    prompt,
  ].filter(Boolean).join('\n');
}

function getResultErrorMessage(msg) {
  // ★ 详细错误诊断：根据错误类型给出原因和解决方法
  const rawError = (msg && (msg.error || msg.message)) || '';
  const rawStr = String(rawError);

  // 模型不存在或无权限
  if (/model.*not.*found|not.*exist|不存在|invalid.*model|issue.*selected.*model/i.test(rawStr)) {
    return '❌ **模型不可用**\n\n' +
      '原因：' + rawStr.split('\n')[0] + '\n\n' +
      '💡 **解决方法：**\n' +
      '- 进入「设置」检查模型名称是否正确\n' +
      '- 确认你的 API 账户有权限使用该模型\n' +
      '- 尝试切换其他模型（如 gpt-4o、claude-sonnet 等）';
  }

  // API Key 问题
  if (/invalid.*key|api.*key|认证|auth|unauthorized|401/i.test(rawStr)) {
    return '❌ **API Key 无效或已过期**\n\n' +
      '💡 **解决方法：**\n' +
      '- 进入「设置」检查 API Key 是否正确\n' +
      '- 确认 Key 没有过期或被禁用\n' +
      '- 到 API 服务商后台重新生成 Key';
  }

  // 余额不足
  if (/insufficient|balance|余额|欠费|billing|quota|配额/i.test(rawStr)) {
    return '❌ **账户余额不足**\n\n' +
      '💡 **解决方法：**\n' +
      '- 登录 API 服务商后台充值\n' +
      '- 检查套餐是否已用完\n' +
      '- 充值后点击「继续」重试';
  }

  // 请求频率限制
  if (/rate.*limit|频率|too many|429/i.test(rawStr)) {
    return '⚠️ **请求过于频繁**\n\n' +
      '💡 **解决方法：**\n' +
      '- 等待 1-2 分钟后点击「继续」重试\n' +
      '- 减少并发任务数量';
  }

  // 超时
  if (/timeout|超时|timed.*out/i.test(rawStr)) {
    return '⏱️ **请求超时**\n\n' +
      '原因：API 服务器响应太慢\n\n' +
      '💡 **解决方法：**\n' +
      '- 检查网络连接是否正常\n' +
      '- 稍后点击「继续」重试（可能是服务商临时拥堵）\n' +
      '- 如果持续超时，尝试切换其他 API 端点';
  }

  // 服务器错误
  if (/500|502|503|529|overloaded|过载|server.*error/i.test(rawStr)) {
    return '🔧 **API 服务器暂时不可用**\n\n' +
      '💡 **解决方法：**\n' +
      '- 等待几分钟后点击「继续」重试\n' +
      '- 检查服务商状态页面是否有公告\n' +
      '- 尝试切换其他 API 端点';
  }

  // 网络问题
  if (/network|fetch|ECONNREFUSED|ENOTFOUND|连接/i.test(rawStr)) {
    return '🌐 **网络连接失败**\n\n' +
      '💡 **解决方法：**\n' +
      '- 检查网络是否正常\n' +
      '- 确认 API 端点地址是否正确\n' +
      '- 如果使用代理，检查代理设置';
  }

  // 通用错误处理
  if (msg && msg.is_error) {
    const brief = rawStr.split('\n')[0] || '未知原因';
    return '❌ **任务执行出错**\n\n' +
      '原因：' + brief + '\n\n' +
      '💡 **解决方法：** 点击「继续」重试，如反复出现请检查 API 设置';
  }
  if (msg && msg.error) return String(msg.error);

  const subtype = msg && msg.subtype;
  if (!subtype || subtype === 'success') return '';
  const map = {
    error_max_turns: '🔄 **任务达到最大轮数限制**\n\n' +
      '原因：问题过于复杂，AI 处理步骤过多\n\n' +
      '💡 **解决方法：**\n' +
      '- 简化问题描述后重试\n' +
      '- 尝试分步求解，先处理部分问题',
    error_during_execution: '❌ **任务执行过程中出错**\n\n' +
      '💡 **解决方法：** 点击「继续」重试，如反复出现请检查 API 设置和网络连接',
    error: '❌ **任务执行出错**\n\n' +
      '💡 **解决方法：** 点击「继续」重试，如反复出现请检查 API 设置',
    cancelled: '任务已取消',
    aborted: '任务已终止',
  };
  return map[subtype] || ('❌ **任务异常终止**（' + subtype + '）\n\n💡 **解决方法：** 点击「继续」重试，如反复出现请联系技术支持');
}

function buildResumeContext(wsState) {
  if (!wsState) return '';

  const lines = [];
  const progress = Number(wsState.progress || 0);
  const currentStage = wsState.currentStage || '';
  const taskSteps = Array.isArray(wsState.taskSteps)
    ? wsState.taskSteps
    : (Array.isArray(wsState.steps) ? wsState.steps : []);
  const fileOps = Array.isArray(wsState.fileOps) ? wsState.fileOps : [];
  const chatHistory = Array.isArray(wsState.chatHistory) ? wsState.chatHistory : [];

  if (progress > 0) {
    lines.push('上次中断前的进度约为 ' + progress + '%。');
  }
  if (currentStage) {
    lines.push('当前记录的阶段：' + currentStage + '。');
  }

  const recentSteps = taskSteps
    .filter(step => step && (step.name || step.label))
    .slice(-5)
    .map(step => {
      const label = step.name || step.label || '未知步骤';
      const status = step.status || 'unknown';
      return '- ' + label + '（' + status + '）';
    });
  if (recentSteps.length) {
    lines.push('最近操作步骤：');
    lines.push(...recentSteps);
  }

  const recentFileOps = fileOps
    .filter(op => op && (op.filePath || op.file_path || op.label))
    .slice(-5)
    .map(op => {
      const opName = op.operation || op.op || '操作';
      const target = op.filePath || op.file_path || op.label || '';
      return '- ' + opName + ' ' + String(target).slice(0, 160);
    });
  if (recentFileOps.length) {
    lines.push('最近涉及文件：');
    lines.push(...recentFileOps);
  }

  const recentUserRequests = chatHistory
    .filter(msg => msg && msg.role === 'user' && msg.text)
    .slice(-5)
    .map(msg => '- ' + String(msg.text).replace(/\s+/g, ' ').slice(0, 220));
  if (recentUserRequests.length) {
    lines.push('最近用户要求：');
    lines.push(...recentUserRequests);
  }

  if (!lines.length) return '';

  return [
    '═══ 恢复执行上下文（精简版） ═══',
    '你现在是在继续一个中断的求解任务。请优先基于当前工作区里已经存在的文件、结果、操作进度继续执行，不要从零重新求解。',
    ...lines,
    '如果最新用户要求和历史记录冲突，以最新用户要求为准。',
  ].join('\n');
}

async function _run({ query, apiConfig, workDir, effectiveWorkDir, prompt, isModify, hasProject, taskLogId, resumeSessionId }) {
  const ctx = _ctx;
  const cfg = ctx.config;
  const projectPath = ctx.getProjectPath();
  // ★ 本地引用，防止终止时被清 null
  const _ac = abortController;
  const startedAt = Date.now();
  let stepCount = 0, inputTokens = 0, outputTokens = 0, lastActivity = Date.now();
  let totalOutputChars = 0;
  let activeTool = null;

  const send = (type, payload) => {
    const w = ctx.getMainWindow();
    if (w && !w.isDestroyed()) w.webContents.send('agent-event', { type, payload });
  };

  const logStep = (label, status = 'running') => {
    if (ctx.workspace) {
      ctx.workspace.recordStep(projectPath, { label, status, stepNumber: stepCount });
    }
  };

  const logFileOp = (operation, filePath, fileSize = 0) => {
    if (ctx.workspace) {
      ctx.workspace.recordFileOp(projectPath, { operation, filePath, fileSize });
    }
    if (ctx.db) {
      ctx.db.prepare('INSERT INTO file_operations (task_id, operation, file_path, file_size) VALUES (?, ?, ?, ?)')
        .run(taskLogId, operation, filePath, fileSize);
    }
  };

  const updateStage = (stage) => {
    if (ctx.workspace) {
      ctx.workspace.markTaskStage(projectPath, stage);
    }
  };

  if (!workDir || typeof workDir !== 'string') {
    send('error', { message: '无效的工作目录', fatal: true });
    isRunning = false; abortController = null;
    if (ctx.setTaskState) ctx.setTaskState(false, null);
    return;
  }

  try {
    if (!fs.existsSync(workDir)) {
      fs.mkdirSync(workDir, { recursive: true });
    }
    const stat = fs.statSync(workDir);
    if (!stat.isDirectory()) {
      send('error', { message: '工作目录不是有效目录: ' + workDir, fatal: true });
      isRunning = false; abortController = null;
      if (ctx.setTaskState) ctx.setTaskState(false, null);
      return;
    }
  } catch (e) {
    send('error', { message: '工作目录验证失败: ' + e.message, fatal: true });
    isRunning = false; abortController = null;
    if (ctx.setTaskState) ctx.setTaskState(false, null);
    return;
  }

  const totalTimer = setTimeout(() => {
    if (isRunning) { _ac.abort(); send('error', { message: '超过 ' + (cfg.totalTimeoutMs / 60000) + ' 分钟自动中止', fatal: true }); }
  }, cfg.totalTimeoutMs);

  const stuckTimer = setInterval(() => {
    if (!isRunning) return;
    // ★ 工具运行中：检查工具是否超时（默认30分钟）
    if (activeTool) {
      var toolElapsed = Date.now() - (activeTool.startedAt || lastActivity);
      var toolTimeoutMs = cfg.stuckTimeoutMs * 3; // 工具超时 = 3倍 stuck timeout
      if (toolElapsed > toolTimeoutMs) {
        _ac.abort(); send('error', { message: '工具 ' + (activeTool.name || '未知') + ' 运行超过 ' + Math.round(toolTimeoutMs / 60000) + ' 分钟，自动中止', fatal: true });
      }
      return;
    }
    // ★ 无工具运行：检查是否无响应
    if (Date.now() - lastActivity > cfg.stuckTimeoutMs) {
      _ac.abort(); send('error', { message: '超过 ' + (cfg.stuckTimeoutMs / 60000) + ' 分钟无响应', fatal: true });
    }
  }, 30000);

  const cleanup = () => {
    clearTimeout(totalTimer);
    clearInterval(stuckTimer);
    if (ctx.workspace) ctx.workspace.stopCheckpoint();
    // 停止 API 翻译代理（如果启动了）
    try { apiProxy.stop(); } catch {}
  };

  try {
    // 确保 Python 环境就绪
    try {
      await pythonEnv.ensure((msg) => {
        send('agent-event', { type: 'python-init', payload: { message: msg } });
      });
    } catch (e) {
      console.warn('Python 环境初始化失败（可继续）:', e.message);
    }

    // 构建环境变量：内置 Python + TinyTeX
    const latexStatus = latexEnv.getStatus();
    const latexBinDir = latexStatus.installed ? latexStatus.binDir : null;
    const pythonStatus = pythonEnv.getStatus();
    // ★ 即使 getStatus().ready 为 false，也把 Python 目录加进 PATH
    //   （ensure 可能已复制文件但 isReady 检查失败，Python 仍然可用）
    const pythonBinDir = pythonEnv.getPythonEnvDir ? pythonEnv.getPythonEnvDir() : (pythonStatus.ready ? pythonStatus.binDir : null);
    const claudeExecutable = resolveClaudeCodeExecutable();
    if (isPackagedAsarRuntime() && !claudeExecutable) {
      throw new Error('求解引擎启动失败：未找到 app.asar.unpacked 中的 Claude 可执行文件。诊断信息：' + getClaudeExecutableDiagnostics());
    }
    if (claudeExecutable) {
      console.log('Mrite: Claude executable resolved:', claudeExecutable);
    }

    // PATH 优先级：python-env > latex-bin > system。过滤 app.asar/文件路径，避免打包后 spawn ENOTDIR。
    const effectivePath = buildEffectivePath([pythonBinDir, latexBinDir]);

    const q = query({
      prompt: prompt,
      options: {
        model: apiConfig.model,
        cwd: effectiveWorkDir,
        includePartialMessages: true,  // ★ 启用 token 级流式输出
        ...(resumeSessionId ? { resume: resumeSessionId } : {}),
        ...(claudeExecutable ? { pathToClaudeCodeExecutable: claudeExecutable } : {}),
        env: (() => {
          // ★ 隔离 Claude Code 配置目录，防止读取系统 ~/.claude/ 中的登录凭证
          const isolatedHome = path.join(toShortPath(app.getPath('userData')), '.claude-home');
          if (!fs.existsSync(isolatedHome)) fs.mkdirSync(isolatedHome, { recursive: true });
          const cleanEnv = {};
          const blockedKeys = ['CLAUDE_', 'ANTHROPIC_'];
          for (const [k, v] of Object.entries(process.env)) {
            if (!blockedKeys.some(prefix => k.startsWith(prefix))) cleanEnv[k] = v;
          }
          return {
            ...cleanEnv,
            HOME: isolatedHome,
            USERPROFILE: isolatedHome,
            LANG: process.env.LANG || 'zh_CN.UTF-8',
            ANTHROPIC_BASE_URL: apiConfig.baseURL,
            ANTHROPIC_API_KEY: apiConfig.apiKey,
            ANTHROPIC_AUTH_TOKEN: apiConfig.apiKey,
            CLAUDE_API_KEY: apiConfig.apiKey,
            ANTHROPIC_MODEL: apiConfig.model,
            ...(latexBinDir ? latexEnv.getLatexEnv() : {}),
            ...(pythonBinDir ? pythonEnv.getPythonEnv() : {}),
            PATH: effectivePath,
            Path: effectivePath,
          };
        })(),
        permissionMode: 'bypassPermissions', allowDangerouslySkipPermissions: true,
        maxTurns: isModify ? (cfg.modifyMaxTurns || cfg.maxTurns) : cfg.maxTurns, abortController: _ac,
        toolConfig: { bash: { timeout: cfg.bashToolTimeoutMs } },
      },
    });

    let lastToolName = null;
    let capturedSessionId = null;
    for await (const msg of q) {
      if (_ac.signal.aborted) break;
      lastActivity = Date.now();

      // ★ 上下文自动压缩通知
      if (msg.type === 'system' && msg.subtype === 'compact_boundary') {
        const pre = msg.compact_metadata?.pre_tokens || 0;
        const post = msg.compact_metadata?.post_tokens || 0;
        const saved = pre > post ? Math.round((pre - post) / 1000) : 0;
        send('text', { content: `\n> 📦 上下文已自动压缩（节省约 ${saved}k tokens）\n\n` });
      }

      // ★ 捕获 session_id 用于记忆功能
      if (msg.type === 'system' && msg.subtype === 'status' && msg.session_id) {
        capturedSessionId = msg.session_id;
        // 保存到工作区状态，下次可继续
        try {
          const wsState = ctx.workspace.readWsState(workDir) || {};
          if (!wsState.sessionId) {
            ctx.workspace.writeWsState(workDir, { sessionId: msg.session_id });
          }
        } catch {}
      }

      // ★ 流式文本增量（token 级流式输出）
      if (msg.type === 'stream_event' && msg.event) {
        const event = msg.event;
        // 处理文本增量事件
        if (event.type === 'content_block_delta') {
          const delta = event.delta;
          if (delta) {
            // 文本增量
            if (delta.type === 'text_delta' && delta.text) {
              send('stream_text', {
                content: delta.text,
                index: event.index || 0,
                deltaType: 'text'
              });
            }
            // ★ 思考过程增量（新增）
            else if (delta.type === 'thinking_delta' && delta.thinking) {
              send('stream_text', {
                content: delta.thinking,
                index: event.index || 0,
                deltaType: 'thinking'
              });
            }
          }
        }
        continue; // 流式事件不需要后续处理
      }

      if (msg.type === 'assistant' && msg.message?.content) {
        const content = Array.isArray(msg.message.content) ? msg.message.content : [msg.message.content];
        for (const block of content) {
          if (block.type === 'text' && block.text) {
            totalOutputChars += block.text.length;
            send('text', { content: block.text });
          }
          else if (block.type === 'tool_use') {
            stepCount++; lastToolName = block.name;
            activeTool = {
              name: block.name,
              startedAt: Date.now()
            };
            totalOutputChars += JSON.stringify(block.input || '').length;
            
            const input = block.input || {};
            const filePath = input.file_path || input.filePath || input.path || '';
            const command = input.command || '';
            
            if (filePath) {
              let opType = block.name;
              if (block.name === 'Bash') {
                if (command.indexOf('xelatex') !== -1) opType = 'compile';
                else if (command.indexOf('python') !== -1) opType = 'run_python';
              }
              logFileOp(opType, filePath);
            }
            
            if (command && command.indexOf('xelatex') !== -1) {
              updateStage('compiling');
            } else if (filePath.includes('求解计划')) {
              updateStage('planning');
            } else if (filePath.includes('问题')) {
              updateStage('solving');
            } else if (filePath.includes('论文') && filePath.endsWith('.tex')) {
              updateStage('writing');
            }

            logStep(block.name + (filePath ? ': ' + path.basename(filePath) : ''), 'active');
            send('tool_use', { toolName: block.name, input: block.input, step: stepCount });
          }
        }
      } else if (msg.type === 'user' && msg.message?.content) {
        const content = Array.isArray(msg.message.content) ? msg.message.content : [msg.message.content];
        for (const block of content) {
          if (block.type === 'tool_result') {
            const outputText = typeof block.content === 'string' ? block.content : JSON.stringify(block.content || '');
            const isError = block.is_error || false;
            activeTool = null;

            // ★ 缺库自动安装：检测 ModuleNotFoundError 并自动 pip install
            if (isError && outputText.includes('ModuleNotFoundError')) {
              const missingModule = pythonEnv.parseMissingModule(outputText);
              if (missingModule) {
                const pkg = pythonEnv.mapModuleToPackage(missingModule);
                if (pkg) {
                  send('tool_result', {
                    toolName: 'System',
                    output: `检测到缺少 Python 库: ${missingModule} → 正在自动安装 ${pkg}...`,
                    isError: false,
                  });
                  try {
                    const installResult = pythonEnv.installPackage(pkg, (m) => {
                      send('agent-event', { type: 'python-auto-install', payload: { message: m } });
                    });
                    if (installResult.success) {
                      send('tool_result', {
                        toolName: 'System',
                        output: `${pkg} 安装成功！请重新运行刚才的 Python 脚本。`,
                        isError: false,
                      });
                    } else {
                      send('tool_result', {
                        toolName: 'System',
                        output: `${pkg} 自动安装失败: ${installResult.error}。请手动安装: python -m pip install ${pkg}`,
                        isError: true,
                      });
                    }
                  } catch (e) {
                    send('tool_result', {
                      toolName: 'System',
                      output: `自动安装异常: ${e.message}`,
                      isError: true,
                    });
                  }
                }
              }
            }

            send('tool_result', {
              toolName: lastToolName || 'Bash',
              output: outputText,
              isError: isError,
            });
            logStep(lastToolName || 'Bash', isError ? 'error' : 'completed');
          }
        }
      } else if (msg.type === 'result') {
        cleanup(); isRunning = false; abortController = null;
        _stopFileWatcher();
        if (ctx.setTaskState) ctx.setTaskState(false, null);
        try {
          if (typeof q.usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET === 'function') {
            var sdkUsage = await q.usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET();
            if (sdkUsage && sdkUsage.session) {
              var su = sdkUsage.session;
              if (su.model_usage) {
                for (var model in su.model_usage) {
                  var mu = su.model_usage[model];
                  if (mu) {
                    inputTokens += (mu.inputTokens || mu.input_tokens || 0);
                    outputTokens += (mu.outputTokens || mu.output_tokens || 0);
                  }
                }
              }
            }
          }
        } catch (e) { /* 第三方 API 不支持 */ }
        // Token 估算：中文约 1.5 字符/token，英文约 4 字符/token
        if (inputTokens === 0) inputTokens = Math.round(prompt.length / 3.0);
        if (outputTokens === 0) outputTokens = Math.round(totalOutputChars / 3.0);
        send('tokens', { input: inputTokens, output: outputTokens });

        const resultError = getResultErrorMessage(msg);
        if (resultError) {
          if (ctx.workspace) {
            ctx.workspace.markTaskError(projectPath, { message: resultError });
          }
          if (taskLogId && ctx.db) {
            try {
              ctx.db.prepare('UPDATE task_logs SET status = ?, finished_at = datetime(\'now\'), error_msg = ? WHERE id = ?')
                .run('error', resultError, taskLogId);
            } catch {}
          }
          send('error', { message: resultError, fatal: true, step: stepCount, subtype: msg.subtype });
          send('state', { status: 'error', error: resultError });
          return;
        }

        let outputTimestampDir = null;
        if (!isModify && hasProject) {
          try { ctx.workspace.flattenNestedProblemDirs(ctx.getProjectPath()); } catch (e) {
            console.error('Mrite: 嵌套目录修正失败', e.message);
          }
          outputTimestampDir = ctx.workspace.exportResults(ctx.getProjectPath(), ctx.getCustomOutputPath());
        }
        
        const durationMs = Date.now() - startedAt;
        if (ctx.workspace) {
          ctx.workspace.markTaskCompleted(projectPath, {
            durationMs,
            inputTokens,
            outputTokens,
            steps: stepCount,
            outputPath: outputTimestampDir || ''
          });
        }

        send('done', { steps: stepCount, tokens: { input: inputTokens, output: outputTokens }, subtype: msg.subtype, outputTimestampDir });
        send('state', { status: 'done' });

        if (taskLogId && ctx.db) {
          try {
            ctx.db.prepare('UPDATE task_logs SET status = ?, finished_at = datetime(\'now\'), duration_ms = ?, input_tokens = ?, output_tokens = ? WHERE id = ?')
              .run('completed', durationMs, inputTokens, outputTokens, taskLogId);
          } catch {}
        }
        return;
      }
    }
    cleanup();
    isRunning = false; abortController = null;
    _stopFileWatcher();
    if (ctx.setTaskState) ctx.setTaskState(false, null);
    // ★ 检查是否是用户主动终止
    if (_ac?.signal.aborted) {
      if (ctx.workspace) {
        ctx.workspace.markTaskError(projectPath, { message: '用户主动终止' });
      }
      send('state', { status: 'idle' });
      return;
    }
    // ★ 流异常结束：标记为可恢复错误，用户可点击"继续"重试
    var streamErrMsg = '任务流异常结束（可能是网络波动），请点击"继续"恢复';
    send('error', { message: streamErrMsg, fatal: false, step: stepCount });
    if (ctx.workspace) {
      ctx.workspace.markTaskError(projectPath, { message: streamErrMsg });
    }
    if (taskLogId && ctx.db) {
      try {
        ctx.db.prepare('UPDATE task_logs SET status = ?, finished_at = datetime(\'now\'), error_msg = ? WHERE id = ?')
          .run('error', streamErrMsg, taskLogId);
      } catch {}
    }
  } catch (err) {
    cleanup();
    if (err.name === 'AbortError' || _ac?.signal.aborted) {
      isRunning = false; abortController = null;
      _stopFileWatcher();
      if (ctx.setTaskState) ctx.setTaskState(false, null);
      if (ctx.workspace) {
        ctx.workspace.markTaskError(projectPath, { message: '用户主动终止' });
      }
      send('state', { status: 'idle' });
      return;
    }
    isRunning = false; abortController = null;
    if (ctx.setTaskState) ctx.setTaskState(false, null);
    const message = normalizeTaskErrorMessage(err);
    send('error', { message, fatal: true, step: stepCount });
    send('state', { status: 'error', error: message });

    if (ctx.workspace) {
      ctx.workspace.markTaskError(projectPath, { message, stack: err.stack || '' });
    }

    if (taskLogId && ctx.db) {
      try {
        ctx.db.prepare('UPDATE task_logs SET status = ?, finished_at = datetime(\'now\'), error_msg = ? WHERE id = ?')
          .run('error', message, taskLogId);
      } catch {}
    }
  }
}

function init(ctx) {
  _ctx = ctx;
}

module.exports = { init, launch, abort, getState, getSolverExecutableProbeResult, getClaudeExecutableDiagnostics };
