// Mrite v2.0 — 进程管理器（跟踪并清理子进程）
const { execSync } = require('child_process');

// 跟踪所有子进程
const tracked = new Set();

// 注册子进程
function track(proc) {
  if (!proc || !proc.pid) return;
  tracked.add(proc);
  const cleanup = () => { tracked.delete(proc); };
  proc.on('close', cleanup);
  proc.on('error', cleanup);
  proc.on('exit', cleanup);
}

// 终止所有跟踪的进程（同步，用于退出时清理）
function killAll() {
  for (const proc of tracked) {
    try {
      if (proc.pid && !proc.killed) {
        // Windows: 用 taskkill 杀掉整个进程树
        try {
          execSync(`taskkill /F /T /PID ${proc.pid}`, { stdio: 'ignore', timeout: 3000 });
        } catch {
          // 回退：直接 kill
          try { proc.kill('SIGKILL'); } catch {}
        }
      }
    } catch {}
  }
  tracked.clear();
}

// 清理系统中残留的 Mrite 相关进程
function killOrphans() {
  const patterns = ['claude.exe', 'python.exe', 'xelatex.exe', 'xdvipdfmx.exe'];
  for (const name of patterns) {
    try {
      execSync(`taskkill /F /IM ${name}`, { stdio: 'ignore', timeout: 3000 });
    } catch {}
  }
}

// 获取当前跟踪的进程信息
function getInfo() {
  return {
    count: tracked.size,
    pids: [...tracked].map(p => p.pid).filter(Boolean),
  };
}

module.exports = { track, killAll, killOrphans, getInfo };
