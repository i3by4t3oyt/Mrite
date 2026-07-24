// Mrite v2.1 — 模板加密/解密模块（.mrtpl 格式）
// AES-256-CBC + JSON-manifest + gzip，文件头带 magic + salt + IV
const crypto = require('crypto');
const zlib = require('zlib');
const path = require('path');
const fs = require('fs');

const MAGIC = Buffer.from('MRTPL');
const VERSION = 1;
const SALT_LEN = 32, IV_LEN = 16, KEY_LEN = 32, PBKDF2_ITER = 200000;
const HEADER_LEN = 5 + 1 + SALT_LEN + IV_LEN; // 54
const BUILTIN_SECRET = 'MriteTemplateV2.1-SecretKey-2026!@#$%^&*()_Internal';

function deriveKey(salt) {
  return crypto.pbkdf2Sync(BUILTIN_SECRET, salt, PBKDF2_ITER, KEY_LEN, 'sha512');
}

// ── 打包：遍历目录 → { 'rel/path': base64 } → gzip ──
function packDir(dirPath) {
  const manifest = { files: {}, root: path.basename(dirPath) };

  function walk(dir, rel) {
    const items = fs.readdirSync(dir);
    for (const item of items) {
      const fp = path.join(dir, item);
      const rp = rel ? rel + '/' + item : item;
      const st = fs.statSync(fp);
      if (st.isDirectory()) {
        walk(fp, rp);
      } else {
        manifest.files[rp] = fs.readFileSync(fp).toString('base64');
      }
    }
  }

  walk(dirPath, '');
  return zlib.gzipSync(Buffer.from(JSON.stringify(manifest), 'utf8'));
}

// ── 解包：gzip → JSON → 写文件 ──
function unpackDir(tgzBuffer, destDir) {
  const json = zlib.gunzipSync(tgzBuffer).toString('utf8');
  const manifest = JSON.parse(json);

  for (const [relPath, b64] of Object.entries(manifest.files)) {
    const outPath = path.join(destDir, manifest.root, relPath);
    const parent = path.dirname(outPath);
    if (!fs.existsSync(parent)) fs.mkdirSync(parent, { recursive: true });
    fs.writeFileSync(outPath, Buffer.from(b64, 'base64'));
  }
}

// ── 加密 ──
function encryptDir(dirPath) {
  if (!fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory()) {
    throw new Error('路径不存在或不是文件夹: ' + dirPath);
  }
  const salt = crypto.randomBytes(SALT_LEN);
  const iv = crypto.randomBytes(IV_LEN);
  const key = deriveKey(salt);
  const tgz = packDir(dirPath);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  const encrypted = Buffer.concat([cipher.update(tgz), cipher.final()]);
  const header = Buffer.alloc(HEADER_LEN);
  MAGIC.copy(header, 0); header[5] = VERSION;
  salt.copy(header, 6); iv.copy(header, 6 + SALT_LEN);
  return Buffer.concat([header, encrypted]);
}

function decryptToDir(buffer, destDir) {
  if (!Buffer.isBuffer(buffer) || buffer.length < HEADER_LEN) {
    throw new Error('无效的模板文件');
  }
  const magic = buffer.slice(0, 5);
  if (!magic.equals(MAGIC)) throw new Error('不是有效的 .mrtpl 模板文件');
  const version = buffer[5];
  if (version !== VERSION) throw new Error('模板版本不兼容: v' + version);
  const salt = buffer.slice(6, 6 + SALT_LEN);
  const iv = buffer.slice(6 + SALT_LEN, HEADER_LEN);
  const encrypted = buffer.slice(HEADER_LEN);
  const key = deriveKey(salt);
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  const tgz = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
  unpackDir(tgz, destDir);
}

function encryptFile(inputDir, outputFile) {
  const buf = encryptDir(inputDir);
  fs.writeFileSync(outputFile, buf);
  return { success: true, output: outputFile, size: buf.length };
}

function decryptFile(inputFile, destDir) {
  const buf = fs.readFileSync(inputFile);
  decryptToDir(buf, destDir);
  return { success: true, dest: destDir };
}

module.exports = { encryptDir, decryptToDir, encryptFile, decryptFile, MAGIC, VERSION, HEADER_LEN };
