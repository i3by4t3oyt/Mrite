// Mrite v2.0 — LaTeX 环境管理（支持内置 TinyTeX + 本地 TeXLive）
const { app } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { toShortPath } = require('./safe-path');
const { execSync, exec, spawn } = require('child_process');

// ── 检测本地 TeXLive 安装 ──
function getSystemTexLiveDir() {
  const candidates = [];
  // Windows: C:\texlive\2025\bin\windows
  const years = ['2026', '2025', '2024', '2023'];
  for (const y of years) {
    candidates.push(path.join('C:\\texlive', y, 'bin', 'windows'));
    candidates.push(path.join('C:\\Program Files', 'texlive', y, 'bin', 'win32'));
    candidates.push(path.join('C:\\Program Files', 'texlive', y, 'bin', 'windows'));
  }
  for (const dir of candidates) {
    const exe = path.join(dir, 'xelatex.exe');
    if (fs.existsSync(exe)) return dir;
  }
  return null;
}

const REQUIRED_PACKAGES = [
  'amsfonts', 'amsmath', 'amssymb', 'appendix', 'array', 'bigdelim', 'bigstrut',
  'bm', 'booktabs', 'calc', 'caption', 'cleveref', 'cprotect', 'ctex',
  'enumitem', 'etoolbox', 'float', 'fontspec', 'geometry', 'graphicx',
  'hyperref', 'ifxetex', 'indentfirst', 'listings', 'longtable', 'mdframed',
  'multirow', 'subcaption', 'tabularx', 'tikz', 'titlesec', 'titletoc',
  'tocloft', 'ulem', 'url', 'xcolor',
  // 依赖项（自动补全时会安装，但预装更稳）
  'zref', 'etoolbox', 'pgf', 'unicode-math', 'fancyhdr', 'auxhook',
  'infwarerr', 'ltxcmds', 'kvsetkeys', 'kvdefinekeys', 'stringenc',
  'pdftexcmds', 'atveryend', 'rerunfilecheck'
];

function getAssetCandidates(relativeAssetPath, options = {}) {
  const includeAsar = options.includeAsar === true;
  const candidates = [];
  const add = (p) => {
    if (p && !candidates.includes(p)) candidates.push(p);
  };

  try {
    if (process.resourcesPath) {
      add(path.join(process.resourcesPath, 'assets', relativeAssetPath));
      if (includeAsar) {
        add(path.join(process.resourcesPath, 'app.asar', 'assets', relativeAssetPath));
      }
      add(path.join(process.resourcesPath, 'app.asar.unpacked', 'assets', relativeAssetPath));
      add(path.join(process.resourcesPath, 'app', 'assets', relativeAssetPath));
    }
  } catch {}

  add(path.join(__dirname, '..', '..', 'assets', relativeAssetPath));

  return candidates;
}

function getTinyTexDir() {
  const candidates = getAssetCandidates('TinyTeX', { includeAsar: false });
  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) continue;
    try {
      const realPath = fs.realpathSync(candidate);
      if (realPath) return realPath;
    } catch {}
    return candidate;
  }
  return candidates[0];
}

function getBinDir() {
  // 始终使用内置 TinyTeX，不回退到系统 TeXLive
  const dir = getTinyTexDir();
  const bundledBin = path.join(dir, 'bin', 'windows');
  return bundledBin;
}

function getXelatexPath() {
  return path.join(getBinDir(), 'xelatex.exe');
}

function getTlmgrPath() {
  return path.join(getBinDir(), 'tlmgr.bat');
}

function isInstalled() {
  const xelatex = getXelatexPath();
  return fs.existsSync(xelatex);
}

function isSystemTexLive() {
  return getSystemTexLiveDir() !== null;
}

function isPackagesInstalled() {
  if (!isInstalled()) return false;
  const tinyTexDir = getTinyTexDir();
  const flagFile = path.join(tinyTexDir, '.mrite-packages-installed');
  return fs.existsSync(flagFile);
}

// ── 检查 xelatex.fmt 是否存在且与当前 xetex 版本匹配 ──
function isFmtValid() {
  const tinyTexDir = getTinyTexDir();
  const fmtPath = path.join(tinyTexDir, 'texmf-var', 'web2c', 'xetex', 'xelatex.fmt');
  if (!fs.existsSync(fmtPath)) return false;
  // 检查 fmt 文件是否由当前版本的 xetex 生成
  try {
    const xelatexPath = getXelatexPath();
    const versionOutput = execSync(`"${xelatexPath}" --version`, { encoding: 'utf-8', timeout: 5000 });
    const versionMatch = versionOutput.match(/TeX Live (\d+)/);
    if (!versionMatch) return true; // 无法判断，假设有效
    const currentVersion = versionMatch[1];
    // 检查 fmt 文件的生成日志
    const logPath = path.join(tinyTexDir, 'texmf-var', 'web2c', 'xetex', 'xelatex.log');
    if (fs.existsSync(logPath)) {
      const logContent = fs.readFileSync(logPath, 'utf-8');
      const fmtVersionMatch = logContent.match(/TeX Live (\d+)/);
      if (fmtVersionMatch && fmtVersionMatch[1] !== currentVersion) return false;
    }
  } catch {}
  return true;
}

// ── 重建 xelatex.fmt（直接用内置 xetex -ini 生成，不依赖 fmtutil） ──
function rebuildFmt() {
  const tinyTexDir = getTinyTexDir();
  // ★ 使用短路径避免中文路径导致 Lua 脚本乱码
  const safeTinyTexDir = toShortPath(tinyTexDir);
  const xetexPath = path.join(safeTinyTexDir, 'bin', 'windows', 'xetex.exe');
  if (!fs.existsSync(xetexPath)) return false;
  const fmtDir = path.join(safeTinyTexDir, 'texmf-var', 'web2c', 'xetex');
  try { fs.mkdirSync(fmtDir, { recursive: true }); } catch {}
  try {
    execSync(`"${xetexPath}" -ini -jobname=xelatex -progname=xelatex -etex xelatex.ini`, {
      encoding: 'utf-8',
      timeout: 120000,
      cwd: fmtDir,
      env: {
        ...process.env,
        TEXMFSYSCONFIG: path.join(safeTinyTexDir, 'texmf-config'),
        TEXMFVAR: path.join(safeTinyTexDir, 'texmf-var'),
        TEXMFDIST: path.join(safeTinyTexDir, 'texmf-dist'),
        TEXMFLOCAL: path.join(safeTinyTexDir, 'texmf-local'),
        TEXMFROOT: safeTinyTexDir,
        PATH: path.join(safeTinyTexDir, 'bin', 'windows') + path.delimiter + process.env.PATH,
      },
      stdio: 'pipe',
    });
    return fs.existsSync(path.join(fmtDir, 'xelatex.fmt'));
  } catch {
    return false;
  }
}

function getVersion() {
  if (!isInstalled()) return null;
  try {
    const out = execSync(`"${getXelatexPath()}" --version`, { encoding: 'utf-8', timeout: 5000 });
    const m = out.match(/TeX Live (\d+)/);
    return m ? m[1] : 'unknown';
  } catch {
    return null;
  }
}

function getLatexEnv() {
  // ★ 先将 TinyTeX 根目录转为短路径，避免中文路径导致 TeX Live Lua 脚本乱码
  const tinyTexDir = getTinyTexDir();
  const safeTinyTexDir = toShortPath(tinyTexDir);
  const safeBinDir = path.join(safeTinyTexDir, 'bin', 'windows');

  // 过滤 PATH 中的外部 TeX 路径，避免版本冲突
  const systemPath = process.env.PATH || process.env.Path || '';
  const filteredPath = systemPath.split(path.delimiter).filter(Boolean).filter(dir => {
    const normalized = dir.replace(/\\/g, '/').toLowerCase();
    // 保留内置 TinyTeX（也匹配短路径中的大写形式）
    if (normalized.includes('/assets/tinytex/')) return true;
    if (normalized.includes('~1')) return true; // 短路径形式
    // 过滤外部 TeX 安装
    if (normalized.includes('/texlive/')) return false;
    if (normalized.endsWith('/texbin')) return false;
    if (normalized.includes('/tinytex/bin/')) return false;
    if (normalized.includes('/miktex/')) return false;
    if (normalized.includes('/texmf/')) return false;
    return true;
  }).join(path.delimiter);
  const env = {
    PATH: safeBinDir + path.delimiter + filteredPath,
    HOME: toShortPath(process.env.HOME || process.env.USERPROFILE),
  };
  // 仅当实际使用内置 TinyTeX 时才设置 TEXMF 变量（全部使用短路径）
  const binDir = getBinDir();
  const isUsingBundled = binDir.startsWith(tinyTexDir);
  if (isUsingBundled) {
    // ★ 所有 TEXMF 路径必须使用短路径（8.3 格式），避免中文路径导致 Lua 脚本乱码
    // TEXMFROOT 是 kpathsea 的根变量，覆盖 texmf.cnf 中的 $SELFAUTOPARENT
    env.TEXMFROOT = safeTinyTexDir;
    env.TEXMFDIST = path.join(safeTinyTexDir, 'texmf-dist');
    env.TEXMFLOCAL = path.join(safeTinyTexDir, 'texmf-local');
    env.TEXMFSYSCONFIG = path.join(safeTinyTexDir, 'texmf-config');
    env.TEXMFVAR = path.join(safeTinyTexDir, 'texmf-var');
    env.TEXMFHOME = toShortPath(path.join(os.homedir(), 'texmf'));
    // fontconfig 字体配置（xelatex 需要）
    const fontConfDir = path.join(tinyTexDir, 'texmf-var', 'fonts', 'conf');
    if (fs.existsSync(fontConfDir)) {
      env.FONTCONFIG_PATH = path.join(safeTinyTexDir, 'texmf-var', 'fonts', 'conf');
    }
  }
  return env;
}

async function install(onProgress) {
  const tinyTexDir = getTinyTexDir();
  const report = (msg) => { if (onProgress) onProgress(msg); };

  if (isInstalled()) {
    report('TinyTeX 已安装');
    if (!isPackagesInstalled()) {
      await installPackages(onProgress);
    }
    // 确保 xelatex.fmt 存在且版本匹配
    if (!isFmtValid()) {
      report('正在重建 xelatex.fmt...');
      if (!rebuildFmt()) {
        report('警告：xelatex.fmt 重建失败，可能需要手动修复');
      }
    }
    return { success: true, path: getXelatexPath() };
  }

  const url = 'https://yihui.org/tinytex/install-bin-windows.bat';
  const archiveName = 'install-windows.bat';

  report('正在下载 TinyTeX...');

  const fsExtra = require('fs');
  const tmpDir = path.join(os.tmpdir(), 'mrite-tinytex-install');
  if (!fsExtra.existsSync(tmpDir)) fsExtra.mkdirSync(tmpDir, { recursive: true });

  const scriptPath = path.join(tmpDir, archiveName);

  return new Promise((resolve, reject) => {
    const https = require('https');
    const http = require('http');

    function download(url, dest, cb) {
      const client = url.startsWith('https') ? https : http;
      const file = fsExtra.createWriteStream(dest);
      client.get(url, (response) => {
        if (response.statusCode === 302 || response.statusCode === 301) {
          download(response.headers.location, dest, cb);
          return;
        }
        response.pipe(file);
        file.on('finish', () => { file.close(cb); });
      }).on('error', (err) => {
        fsExtra.unlinkSync(dest);
        cb(err);
      });
    }

    download(url, scriptPath, async (err) => {
      if (err) {
        report('下载失败: ' + err.message);
        reject(err);
        return;
      }

      report('正在安装 TinyTeX...');

      const env = {
        ...process.env,
        TMPDIR: tmpDir,
        TEXLIVE_INSTALL_PREFIX: tinyTexDir,
        TINYTEX_INSTALL_DIR: tinyTexDir,
      };

      let cmd;
      cmd = exec(`cmd /c "${scriptPath}"`, { env, cwd: tmpDir, timeout: 600000 });

      cmd.stdout.on('data', (data) => {
        const lines = data.toString().split('\n').filter(l => l.trim());
        for (const line of lines) report(line);
      });
      cmd.stderr.on('data', (data) => {
        const lines = data.toString().split('\n').filter(l => l.trim());
        for (const line of lines) report('[stderr] ' + line);
      });

      cmd.on('close', async (code) => {
        if (code !== 0) {
          report('TinyTeX 安装退出码: ' + code);
          // 尝试备用方案
          const altDir = path.join(os.homedir(), '.TinyTeX');
          if (fs.existsSync(altDir)) {
            report('检测到备用安装路径，尝试迁移...');
            try {
              if (!fs.existsSync(tinyTexDir)) {
                fs.mkdirSync(path.dirname(tinyTexDir), { recursive: true });
                fs.renameSync(altDir, tinyTexDir);
              }
            } catch (e) {
              report('迁移失败: ' + e.message);
            }
          }
        }

        if (!isInstalled()) {
          report('TinyTeX 安装失败');
          reject(new Error('TinyTeX 安装失败'));
          return;
        }

        report('TinyTeX 安装完成');
        try {
          await installPackages(onProgress);
        } catch (e) {
          report('宏包安装失败: ' + e.message);
          reject(e);
          return;
        }
        resolve({ success: true, path: getXelatexPath() });
      });
    });
  });
}

async function installPackages(onProgress) {
  const report = (msg) => { if (onProgress) onProgress(msg); };
  const tlmgr = getTlmgrPath();

  if (!fs.existsSync(tlmgr)) {
    report('tlmgr 未找到，跳过宏包安装');
    return;
  }

  // ★ 使用短路径环境，避免中文路径导致 tlmgr 脚本乱码
  const safeEnv = getLatexEnv();

  report('正在更新 tlmgr...');
  try {
    execSync(`"${tlmgr}" update --self`, { encoding: 'utf-8', timeout: 120000, env: safeEnv });
  } catch (e) {
    report('tlmgr 更新失败（可继续）: ' + e.message);
  }

  report('正在安装所需宏包（共 ' + REQUIRED_PACKAGES.length + ' 个）...');

  for (let i = 0; i < REQUIRED_PACKAGES.length; i++) {
    const pkg = REQUIRED_PACKAGES[i];
    report(`[${i + 1}/${REQUIRED_PACKAGES.length}] 安装 ${pkg}...`);
    try {
      execSync(`"${tlmgr}" install ${pkg}`, { encoding: 'utf-8', timeout: 120000, stdio: 'pipe', env: safeEnv });
    } catch (e) {
      report(`  ${pkg} 安装失败（可能已包含在其他包中）`);
    }
  }

  // 安装中文字体支持
  report('安装中文支持包...');
  const cjkPackages = ['cjk', 'cjkpunct', 'zhnumber', 'ctex'];
  for (const pkg of cjkPackages) {
    try {
      execSync(`"${tlmgr}" install ${pkg}`, { encoding: 'utf-8', timeout: 120000, stdio: 'pipe', env: safeEnv });
    } catch {}
  }

  // 标记安装完成
  const flagFile = path.join(getTinyTexDir(), '.mrite-packages-installed');
  try {
    fs.writeFileSync(flagFile, JSON.stringify({
      installedAt: new Date().toISOString(),
      packages: REQUIRED_PACKAGES,
      version: getVersion()
    }, null, 2), 'utf-8');
  } catch {}

  report('宏包安装完成');
}

async function uninstall() {
  const tinyTexDir = getTinyTexDir();
  if (fs.existsSync(tinyTexDir)) {
    try { fs.rmSync(tinyTexDir, { recursive: true, force: true }); } catch {}
    return { success: true };
  }
  return { success: false, error: 'TinyTeX 未安装' };
}

function getStatus() {
  const installed = isInstalled();
  const tinyTexDir = getTinyTexDir();
  let cachedVersion = null;
  try {
    if (installed) {
      const out = execSync(`"${getXelatexPath()}" --version`, { encoding: 'utf-8', timeout: 5000 });
      const m = out.match(/TeX Live (\d+)/);
      cachedVersion = m ? m[1] : 'unknown';
    }
  } catch {}
  return {
    installed,
    source: 'bundled',
    path: installed ? getXelatexPath() : null,
    version: installed ? cachedVersion : null,
    packagesReady: installed && isPackagesInstalled(),
    fmtValid: installed && isFmtValid(),
    dir: tinyTexDir,
    binDir: installed ? getBinDir() : null,
  };
}

module.exports = {
  install,
  uninstall,
  installPackages,
  isInstalled,
  isSystemTexLive,
  isFmtValid,
  rebuildFmt,
  getStatus,
  getVersion,
  getXelatexPath,
  getTlmgrPath,
  getBinDir,
  getLatexEnv,
  REQUIRED_PACKAGES,
};
