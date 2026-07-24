// Mrite v2.0 — 内置 Python 运行环境
const { app } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { toShortPath } = require('./safe-path');
const { execSync, spawn } = require('child_process');

// ── 基础依赖清单 ──
const BASE_REQUIREMENTS = [
  'numpy', 'pandas', 'scipy', 'scikit-learn', 'matplotlib',
  'seaborn', 'statsmodels', 'sympy', 'openpyxl', 'xlrd',
  'networkx', 'pillow', 'python-docx', 'pdfplumber',
];

// ── 自动安装白名单 ──
const AUTO_INSTALL_WHITELIST = [
  'numpy', 'pandas', 'scipy', 'scikit-learn', 'matplotlib',
  'seaborn', 'statsmodels', 'sympy', 'openpyxl', 'xlrd',
  'networkx', 'pillow', 'opencv-python', 'pyyaml',
  'beautifulsoup4', 'lxml', 'requests', 'tqdm', 'joblib',
  'python-docx', 'pdfplumber',
];

// ── 模块名 → 包名映射 ──
const MODULE_TO_PACKAGE = {
  sklearn: 'scikit-learn',
  cv2: 'opencv-python',
  PIL: 'pillow',
  yaml: 'pyyaml',
  bs4: 'beautifulsoup4',
  lxml: 'lxml',
  np: 'numpy',
  pd: 'pandas',
  plt: 'matplotlib',
  sns: 'seaborn',
  sp: 'sympy',
  scipy: 'scipy',
  stats: 'statsmodels',
  docx: 'python-docx',
};

// ── 平台检测 ──
function getRuntimePlatform() {
  return 'win-x64';
}

// ── 安装包内 Python runtime 源目录 ──
function getPythonRuntimeSourceDir() {
  const platform = getRuntimePlatform();
  const candidates = getAssetCandidates(path.join('python-runtime', platform), { includeAsar: false });
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return candidates[0];
}

// ── 安装包内预构建 Python 环境源目录 ──
function getPrebuiltPythonEnvSourceDir() {
  const platform = getRuntimePlatform();
  const candidates = getAssetCandidates(path.join('python-env', platform), { includeAsar: false });
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return candidates[0];
}

// ── 安装包内 wheelhouse 源目录 ──
function getWheelhouseSourceDir() {
  const platform = getRuntimePlatform();
  const candidates = getAssetCandidates(path.join('python-wheels', platform), { includeAsar: false });
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return candidates[0];
}

// ── requirements 文件路径 ──
function getRequirementsPath() {
  const candidates = getAssetCandidates('python-requirements-base.txt', { includeAsar: true });
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return candidates[0];
}

// ── assets 资源候选路径：开发环境 + electron-builder asar/unpack 环境 ──
function getAssetCandidates(relativeAssetPath, options = {}) {
  const includeAsar = options.includeAsar === true;
  const candidates = [];
  const add = (p) => {
    if (p && !candidates.includes(p)) candidates.push(p);
  };

  try {
    if (process.resourcesPath) {
      // extraResources 或未打进 asar 时常见位置
      add(path.join(process.resourcesPath, 'assets', relativeAssetPath));
      // 仅文本/配置类资源允许直接从 app.asar 内读取
      if (includeAsar) {
        add(path.join(process.resourcesPath, 'app.asar', 'assets', relativeAssetPath));
      }
      // asarUnpack 后的真实可执行资源位置
      add(path.join(process.resourcesPath, 'app.asar.unpacked', 'assets', relativeAssetPath));
      // 某些打包配置会把 app 目录完整放在 resources/app
      add(path.join(process.resourcesPath, 'app', 'assets', relativeAssetPath));
    }
  } catch {}

  // 开发环境：src/core/python-env.js -> 项目根/assets
  add(path.join(__dirname, '..', '..', 'assets', relativeAssetPath));

  return candidates;
}

// ── Python 环境目录（直接使用 assets 内的独立 Python，无需复制） ──
function getPythonEnvDir() {
  // 优先从 assets 目录获取（和 TinyTeX 一样直接用）
  const candidates = getAssetCandidates(path.join('python-env', getRuntimePlatform()), { includeAsar: false });
  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, 'python.exe'))) return candidate;
  }
  // 回退到 userData 目录（兼容旧部署）
  let userDataDir;
  if (app && app.getPath) {
    userDataDir = toShortPath(app.getPath('userData'));
  } else {
    userDataDir = toShortPath(path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'Mrite'));
  }
  return path.join(userDataDir, 'runtime', 'python-env');
}

// ── Python 可执行文件路径（独立发行版，python.exe 在根目录） ──
function getPythonPath() {
  const envDir = getPythonEnvDir();
  return path.join(envDir, 'python.exe');
}

// ── pip 路径 ──
function getPipPath() {
  const envDir = getPythonEnvDir();
  return path.join(envDir, 'Scripts', 'pip.exe');
}

// ── bin 目录路径 ──
function getBinDir() {
  const envDir = getPythonEnvDir();
  return envDir;  // python.exe 在根目录
}

// ── 标记文件路径 ──
function getReadyFlagPath() {
  return path.join(getPythonEnvDir(), '.mrite-python-ready');
}

// ── 修正 pyvenv.cfg 中的硬编码路径 ──
function fixPyvenvCfg(envDir) {
  try {
    const cfgPath = path.join(envDir, 'pyvenv.cfg');
    if (!fs.existsSync(cfgPath)) return false;
    let cfg = fs.readFileSync(cfgPath, 'utf-8');
    // 检测是否包含不属于当前用户的路径（如 C:\Users\其他用户名\ 或明显的开发者路径）
    const needsFix = /^[a-z]\s*=\s*[A-Z]:\\Users\\(?!Public)/.test(cfg) &&
                     !cfg.includes(envDir.replace(/\//g, '\\'));
    if (!needsFix) return false;
    const pythonExe = path.join(envDir, 'python.exe');
    cfg = cfg.replace(/^(home\s*=\s*).+$/m, '$1' + envDir);
    cfg = cfg.replace(/^(executable\s*=\s*).+$/m, '$1' + pythonExe);
    cfg = cfg.replace(/^(command\s*=\s*).+$/m, '$1' + pythonExe + ' -m venv ' + envDir);
    fs.writeFileSync(cfgPath, cfg, 'utf-8');
    return true;
  } catch {
    return false;
  }
}

// ── 检查是否就绪 ──
function isReady() {
  const pythonPath = getPythonPath();
  if (!fs.existsSync(pythonPath)) return false;
  try {
    execSync(`"${pythonPath}" --version`, {
      encoding: 'utf-8',
      timeout: 15000,
      env: _getInternalPythonEnv(),
    });
    return true;
  } catch {
    return false;
  }
}

// ── 获取 Python 版本 ──
function getVersion() {
  const pythonPath = getPythonPath();
  if (!fs.existsSync(pythonPath)) return null;
  try {
    const out = execSync(`"${pythonPath}" --version`, {
      encoding: 'utf-8',
      timeout: 15000,
      env: _getInternalPythonEnv(),
    }).trim();
    const m = out.match(/Python\s+([\d.]+)/);
    return m ? m[1] : out;
  } catch {
    return null;
  }
}

// ── 获取状态 ──
function getStatus() {
  const ready = isReady();
  const version = getVersion();
  return {
    ready,
    version,
    pythonPath: ready ? getPythonPath() : null,
    binDir: ready ? getBinDir() : null,
    envDir: getPythonEnvDir(),
    platform: getRuntimePlatform(),
  };
}

// ── 获取注入的环境变量（给 agent 用，不设 PYTHONHOME 避免与系统 Python 冲突） ──
function getPythonEnv() {
  const envDir = getPythonEnvDir();
  const scriptsDir = path.join(envDir, 'Scripts');
  // 确保内置 Python 在 PATH 最前面，优先于系统 Python
  const systemPath = process.env.PATH || '';
  const systemPathWin = process.env.Path || '';
  // 过滤掉系统 PATH 中的 Python 路径，避免冲突
  const filteredSystemPath = systemPath.split(path.delimiter)
    .filter(d => !isSystemPythonPath(d))
    .join(path.delimiter);
  return {
    PATH: envDir + path.delimiter + scriptsDir + path.delimiter + filteredSystemPath,
    Path: envDir + path.delimiter + scriptsDir + path.delimiter + filteredSystemPath,
    PYTHONNOUSERSITE: '1',
    MPLBACKEND: 'Agg',
    PIP_DISABLE_PIP_VERSION_CHECK: '1',
  };
}

// 检测系统 Python 路径（排除我们的内置 Python）
function isSystemPythonPath(dir) {
  if (!dir || typeof dir !== 'string') return false;
  const n = dir.replace(/\\/g, '/').toLowerCase();
  if (n.includes('mrite') || n.includes('python-env')) return false;
  return n.includes('/python3') || n.includes('/python/python')
    || n.includes('/python310/') || n.includes('/python311/')
    || n.includes('/python312/') || n.includes('/python313/')
    || n.includes('/windowsapps/') || n.includes('/appdata/local/programs/python');
}

// ── 内部调用用的环境（带 PYTHONHOME，确保找到标准库） ──
function _getInternalPythonEnv() {
  const envDir = getPythonEnvDir();
  // 过滤掉系统 PATH 中的 Python 路径（含 Windows Store 重定向）
  const filteredPath = (process.env.PATH || '').split(path.delimiter)
    .filter(d => !isSystemPythonPath(d))
    .join(path.delimiter);
  return {
    ...process.env,
    PATH: envDir + path.delimiter + path.join(envDir, 'Scripts') + path.delimiter + filteredPath,
    Path: envDir + path.delimiter + path.join(envDir, 'Scripts') + path.delimiter + filteredPath,
    PYTHONHOME: envDir,
    PYTHONNOUSERSITE: '1',
    PIP_DISABLE_PIP_VERSION_CHECK: '1',
  };
}

// ── 执行 Python 命令（同步） ──
function execPython(args, opts = {}) {
  const pythonPath = getPythonPath();
  const env = {
    ..._getInternalPythonEnv(),
    ...(opts.env || {}),
  };
  return execSync(`"${pythonPath}" ${args}`, {
    encoding: 'utf-8',
    timeout: opts.timeout || 60000,
    env,
    cwd: opts.cwd || undefined,
    stdio: opts.stdio || 'pipe',
  });
}

// ── 执行 pip 命令（同步） ──
function execPip(args, opts = {}) {
  const pythonPath = getPythonPath();
  const env = {
    ..._getInternalPythonEnv(),
    ...(opts.env || {}),
  };
  // 用 python -m pip 比直接调用 pip 更稳定
  return execSync(`"${pythonPath}" -m pip ${args}`, {
    encoding: 'utf-8',
    timeout: opts.timeout || 300000,
    env,
    cwd: opts.cwd || undefined,
    stdio: opts.stdio || 'pipe',
  });
}

// ── 确保环境存在（直接使用 assets 内的 Python，无需部署） ──
async function ensure(onProgress) {
  const report = (msg) => { if (onProgress) onProgress(msg); };

  if (isReady()) {
    report('Python 环境已就绪');
    return { success: true };
  }

  // Python 不可用（assets 目录没有 python.exe）
  const searched = [
    ...getAssetCandidates(path.join('python-env', getRuntimePlatform()), { includeAsar: false }),
  ];
  report('错误：未找到内置 Python 环境');
  return {
    success: false,
    error: '未找到内置 Python 环境。已查找: ' + searched.join(' | '),
    searched,
  };
}

// ── 确保目录中有可用的 pip ──
function ensurePipInDir(dir) {
  const pipExe = path.join(dir, 'Scripts', 'pip.exe');
  if (fs.existsSync(pipExe)) return;
  const pythonExe = path.join(dir, 'python.exe');
  if (!fs.existsSync(pythonExe)) return;
  try {
    execSync(`"${pythonExe}" -m ensurepip --upgrade`, {
      encoding: 'utf-8',
      timeout: 60000,
      env: { ...process.env, PYTHONHOME: dir, PYTHONNOUSERSITE: '1' },
      stdio: 'pipe',
    });
  } catch {}
}

// ── 从 runtime 目录获取 Python 可执行文件路径 ──
function getRuntimePythonPath(runtimeDir) {
  // Windows: python.exe 在根目录或 Scripts
  const candidates = [
    path.join(runtimeDir, 'python.exe'),
    path.join(runtimeDir, 'Scripts', 'python.exe'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

// ── 从指定目录获取 Python 路径（独立发行版，python.exe 在根目录） ──
function getPythonPathFromDir(envDir) {
  return path.join(envDir, 'python.exe');
}

// ── 从指定目录获取版本 ──
function getVersionFromDir(envDir) {
  const pythonPath = getPythonPathFromDir(envDir);
  if (!fs.existsSync(pythonPath)) return null;
  try {
    const out = execSync(`"${pythonPath}" --version`, {
      encoding: 'utf-8',
      timeout: 5000,
      env: { ...process.env, PYTHONHOME: envDir, PYTHONNOUSERSITE: '1' },
    }).trim();
    const m = out.match(/Python\s+([\d.]+)/);
    return m ? m[1] : out;
  } catch {
    return null;
  }
}

// ── requirements hash（用于判断是否需要重新安装） ──
function getRequirementsHash() {
  try {
    const content = BASE_REQUIREMENTS.join('\n');
    const crypto = require('crypto');
    return crypto.createHash('md5').update(content).digest('hex').slice(0, 8);
  } catch {
    return '00000000';
  }
}

// ── 在指定目录安装基础库（独立发行版，直接装到 Lib/site-packages） ──
async function installBasePackagesInDir(envDir, onProgress) {
  const report = (msg) => { if (onProgress) onProgress(msg); };
  const pythonPath = getPythonPathFromDir(envDir);
  const wheelhouseDir = getWheelhouseSourceDir();
  const reqFile = getRequirementsPath();

  const env = {
    ...process.env,
    PATH: envDir + path.delimiter + path.join(envDir, 'Scripts') + path.delimiter + process.env.PATH,
    PYTHONHOME: envDir,
    PYTHONNOUSERSITE: '1',
    PIP_DISABLE_PIP_VERSION_CHECK: '1',
  };

  // 优先离线安装
  if (fs.existsSync(wheelhouseDir) && fs.existsSync(reqFile)) {
    report('正在离线安装基础库（使用内置 wheelhouse）...');
    try {
      execSync(`"${pythonPath}" -m pip install --no-index --find-links "${wheelhouseDir}" -r "${reqFile}"`, {
        encoding: 'utf-8',
        timeout: 600000,
        env,
        stdio: 'pipe',
      });
      report('基础库安装完成');
      return;
    } catch (e) {
      report('离线安装失败，尝试在线安装: ' + e.message);
    }
  }

  // 在线安装
  report('正在在线安装基础库...');
  for (let i = 0; i < BASE_REQUIREMENTS.length; i++) {
    const pkg = BASE_REQUIREMENTS[i];
    report(`[${i + 1}/${BASE_REQUIREMENTS.length}] 安装 ${pkg}...`);
    try {
      execSync(`"${pythonPath}" -m pip install ${pkg}`, {
        encoding: 'utf-8',
        timeout: 120000,
        env,
        stdio: 'pipe',
      });
    } catch (e) {
      report(`  ${pkg} 安装失败: ${e.message}`);
    }
  }
  report('基础库安装完成');
}

// ── 安装基础库（在已初始化的环境中） ──
async function installBasePackages(onProgress) {
  return installBasePackagesInDir(getPythonEnvDir(), onProgress);
}

// ── 安装单个包（联网） ──
async function installPackage(packageName, onProgress) {
  const report = (msg) => { if (onProgress) onProgress(msg); };
  const pythonPath = getPythonPath();
  if (!fs.existsSync(pythonPath)) {
    return { success: false, error: 'Python 环境未初始化' };
  }

  report('正在安装 ' + packageName + '...');
  try {
    execSync(`"${pythonPath}" -m pip install ${packageName} -i https://pypi.tuna.tsinghua.edu.cn/simple --trusted-host pypi.tuna.tsinghua.edu.cn`, {
      encoding: 'utf-8',
      timeout: 120000,
      env: _getInternalPythonEnv(),
      stdio: 'pipe',
    });
    report(packageName + ' 安装成功');
    return { success: true };
  } catch (e) {
    report(packageName + ' 安装失败: ' + e.message);
    return { success: false, error: e.message };
  }
}

// ── 从 stderr 解析缺失的模块名 ──
function parseMissingModule(stderr) {
  if (!stderr) return null;
  // "ModuleNotFoundError: No module named 'xxx'"
  const m = stderr.match(/ModuleNotFoundError:\s*No module named '([^']+)'/);
  return m ? m[1] : null;
}

// ── 模块名 → 包名映射 ──
function mapModuleToPackage(moduleName) {
  if (!moduleName) return null;
  // 已知映射
  if (MODULE_TO_PACKAGE[moduleName]) return MODULE_TO_PACKAGE[moduleName];
  // 如果模块名本身就是包名（如 numpy, pandas），直接返回
  if (BASE_REQUIREMENTS.includes(moduleName)) return moduleName;
  if (AUTO_INSTALL_WHITELIST.includes(moduleName)) return moduleName;
  return moduleName; // 返回原始名，由白名单判断
}

// ── 重置环境 ──
async function resetEnv(onProgress) {
  const report = (msg) => { if (onProgress) onProgress(msg); };
  const envDir = getPythonEnvDir();

  report('正在删除 Python 环境...');
  if (fs.existsSync(envDir)) {
    fs.rmSync(envDir, { recursive: true, force: true });
  }
  // 也清理临时目录
  const tmpDir = envDir + '.tmp';
  if (fs.existsSync(tmpDir)) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  report('Python 环境已删除，正在重新初始化...');
  return ensure(onProgress);
}

module.exports = {
  getRuntimePlatform,
  getPythonRuntimeSourceDir,
  getWheelhouseSourceDir,
  getPythonEnvDir,
  getPythonPath,
  getPipPath,
  getBinDir,
  isReady,
  getVersion,
  getStatus,
  getPythonEnv,
  ensure,
  installBasePackages,
  installPackage,
  parseMissingModule,
  mapModuleToPackage,
  resetEnv,
  execPython,
  execPip,
  BASE_REQUIREMENTS,
  AUTO_INSTALL_WHITELIST,
  MODULE_TO_PACKAGE,
};
