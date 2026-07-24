// Mrite v2.0 — 路径安全工具（处理中文路径问题）
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

let _shortPathCache = {};

/**
 * 将路径转为 Windows 短路径名（8.3 格式），避免中文字符导致的问题。
 * 如果转换失败或不是 Windows，返回原路径。
 */
function toShortPath(p) {
  if (!p || typeof p !== 'string') return p;
  // 已经是 ASCII 的不需要转换
  if (/^[\x20-\x7E]+$/.test(p)) return p;
  if (_shortPathCache[p]) return _shortPathCache[p];
  try {
    // Windows: 用 cmd 的 %~sI 获取短路径
    const short = execSync(`cmd /c "for %I in ("${p}") do @echo %~sI"`, {
      encoding: 'utf-8',
      timeout: 3000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    // 验证转换结果：必须存在、不含中文、不含 %（转换失败标记）
    if (short && short !== p && !short.includes('%') && !/[^\x20-\x7E]/.test(short) && fs.existsSync(short)) {
      _shortPathCache[p] = short;
      return short;
    }
  } catch {}
  // 转换失败（8.3 被禁用等），回退到原路径
  return p;
}

/**
 * 获取安全的 userData 路径（短路径格式，避免中文）
 */
function getSafeUserData() {
  try {
    const { app } = require('electron');
    return toShortPath(app.getPath('userData'));
  } catch {
    return null;
  }
}

module.exports = { toShortPath, getSafeUserData };
