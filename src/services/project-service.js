// Mrite v2.0 — 项目管理服务
const path = require('path');
const fs = require('fs');

let _ctx = null;

function init(ctx) {
  _ctx = ctx;
}

function listProjects() {
  const ctx = _ctx;
  const { projectsDir, getProjectPath } = ctx;
  try {
    if (!fs.existsSync(projectsDir)) {
      fs.mkdirSync(projectsDir, { recursive: true });
      return { success: true, projects: [], currentProjectPath: getProjectPath() };
    }
    const projects = [];
    for (const e of fs.readdirSync(projectsDir, { withFileTypes: true })) {
      if (e.name.startsWith('.')) continue;
      if (e.isDirectory()) {
        const p = path.join(projectsDir, e.name);
        projects.push({
          name: e.name, path: p,
          hasTopic: fs.existsSync(path.join(p, '题目')),
          hasData: fs.existsSync(path.join(p, '数据')),
          isCurrent: p === getProjectPath()
        });
      }
    }
    projects.sort(function(a, b) {
      if (a.name === '默认') return -1;
      if (b.name === '默认') return 1;
      try { return fs.statSync(a.path).birthtimeMs - fs.statSync(b.path).birthtimeMs; }
      catch { return 0; }
    });
    return { success: true, projects, currentProjectPath: getProjectPath() };
  } catch (err) { return { success: false, error: err.message }; }
}

function createProject(projectName) {
  const ctx = _ctx;
  try {
    const newPath = path.join(ctx.projectsDir, projectName);
    if (fs.existsSync(newPath)) return { success: false, error: '项目已存在' };
    ['题目', '数据', '求解', '论文'].forEach(d =>
      fs.mkdirSync(path.join(newPath, d), { recursive: true }));
    return { success: true, path: newPath };
  } catch (err) { return { success: false, error: err.message }; }
}

function switchProject(newPath) {
  const ctx = _ctx;
  if (ctx.isRunning && ctx.isRunning()) {
    return { success: false, error: '运行中无法切换模板，请先中止任务' };
  }
  if (!fs.existsSync(newPath)) return { success: false, error: '项目路径不存在' };
  ctx.setProjectPath(newPath);
  try {
    const db = ctx.db;
    if (db) db.prepare('INSERT OR REPLACE INTO app_state (key, value) VALUES (?, ?)').run('current_project', path.basename(newPath));
  } catch {}
  return { success: true, projectPath: newPath };
}

function injectTeamInfo(teamCode, problemNumber) {
  const ctx = _ctx;
  try {
    const paperTex = path.join(ctx.getWorkDir(), '论文', '论文.tex');
    if (!fs.existsSync(paperTex)) return { success: false, error: '论文模板不存在' };
    let content = fs.readFileSync(paperTex, 'utf-8');
    content = content.replace(/\\teamcode\{[^}]*\}/, `\\teamcode{${teamCode}}`);
    content = content.replace(/\\problemnumber\{[^}]*\}/, `\\problemnumber{${problemNumber}}`);
    fs.writeFileSync(paperTex, content, 'utf-8');
    return { success: true };
  } catch (err) { return { success: false, error: err.message }; }
}

function writeTask(task) {
  const ctx = _ctx;
  try {
    const workDir = ctx.getWorkDir();
    if (fs.existsSync(workDir)) {
      fs.writeFileSync(path.join(workDir, 'task.json'), JSON.stringify(task, null, 2), 'utf-8');
    }
    return { success: true };
  } catch (err) { return { success: false, error: err.message }; }
}

function deleteProject(projectName) {
  const ctx = _ctx;
  try {
    if (projectName === '默认') return { success: false, error: '不能删除默认项目' };
    const targetPath = path.join(ctx.projectsDir, projectName);
    if (!fs.existsSync(targetPath)) return { success: false, error: '项目不存在' };
    if (ctx.isRunning && ctx.isRunning()) return { success: false, error: '运行中无法删除' };
    fs.rmSync(targetPath, { recursive: true, force: true });
    // 如果删的是当前项目，切换到默认
    if (ctx.getProjectPath() === targetPath) {
      const defaultPath = path.join(ctx.projectsDir, '默认');
      if (fs.existsSync(defaultPath)) ctx.setProjectPath(defaultPath);
    }
    return { success: true };
  } catch (err) { return { success: false, error: err.message }; }
}

module.exports = { init, listProjects, createProject, switchProject, deleteProject, injectTeamInfo, writeTask };
