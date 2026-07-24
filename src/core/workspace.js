// Mrite v2.0 — 工作区管理（增强状态持久化与断点恢复）
const path = require('path');
const fs = require('fs');
const os = require('os');

function create(rootDir, projectsDirName) {
  const workspaceDir = path.join(rootDir, 'workspace');
  const projectsDir = path.join(rootDir, projectsDirName);
  let currentTimestamp = null;
  let checkpointInterval = null;

  function makeTimestamp() {
    const now = new Date();
    return now.getFullYear() + '-' +
      String(now.getMonth() + 1).padStart(2, '0') + '-' +
      String(now.getDate()).padStart(2, '0') + '_' +
      String(now.getHours()).padStart(2, '0') + '-' +
      String(now.getMinutes()).padStart(2, '0') + '-' +
      String(now.getSeconds()).padStart(2, '0');
  }

  return {
    workspaceDir,
    projectsDir,

    resetWorkspacePointer() {
      currentTimestamp = null;
    },

    getProjectName(projectPath) {
      return path.basename(projectPath);
    },

    getWorkDir(projectPath) {
      const normalized = path.resolve(projectPath);
      const wsResolved = path.resolve(workspaceDir);
      if (normalized.startsWith(wsResolved + path.sep)) {
        const dirName = path.basename(normalized);
        const baseName = dirName.replace(/_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}$/, '');
        if (baseName !== dirName) {
          const ts = dirName.substring(baseName.length + 1);
          if (!currentTimestamp) currentTimestamp = ts;
        }
        return normalized;
      }

      const baseName = path.basename(projectPath);
      if (currentTimestamp) {
        return path.join(workspaceDir, baseName + '_' + currentTimestamp);
      }
      return path.join(workspaceDir, baseName);
    },

    getWorkspaceTimestamp() {
      return currentTimestamp;
    },

    readWsState(projectPath) {
      const wsDir = this.getWorkDir(projectPath);
      const sf = path.join(wsDir, '.mrite-ws.json');
      try { 
        if (fs.existsSync(sf)) {
          const data = JSON.parse(fs.readFileSync(sf, 'utf-8'));
          return data;
        }
      } catch (e) {
        console.error('Mrite: 读取工作区状态失败', e.message);
      }
      return null;
    },

    writeWsState(projectPath, updates) {
      const wsDir = this.getWorkDir(projectPath);
      if (!fs.existsSync(wsDir)) return;
      const sf = path.join(wsDir, '.mrite-ws.json');
      try {
        let state = this.readWsState(projectPath) || {};
        if (
          updates &&
          updates.status === 'stopped' &&
          ((state.status === 'completed' || state.status === 'modify') && state.runCompletedAt)
        ) {
          const { status, runStoppedAt, stoppedAt, ...rest } = updates;
          updates = rest;
        }
        Object.assign(state, updates, { _updated: new Date().toISOString() });
        fs.writeFileSync(sf, JSON.stringify(state, null, 2), 'utf-8');
      } catch (e) {
        console.error('Mrite: 写入工作区状态失败', e.message);
      }
    },

    startCheckpoint(projectPath, intervalMs = 30000) {
      this.stopCheckpoint();
      checkpointInterval = setInterval(() => {
        try {
          const state = this.readWsState(projectPath);
          if (state && state.status === 'running') {
            this.writeWsState(projectPath, {
              lastCheckpoint: new Date().toISOString(),
              checkpointCount: (state.checkpointCount || 0) + 1
            });
          }
        } catch {}
      }, intervalMs);
    },

    stopCheckpoint() {
      if (checkpointInterval) {
        clearInterval(checkpointInterval);
        checkpointInterval = null;
      }
    },

    recordStep(projectPath, stepInfo) {
      const state = this.readWsState(projectPath) || {};
      const steps = Array.isArray(state.steps) ? state.steps : [];
      steps.push({
        ...stepInfo,
        timestamp: new Date().toISOString()
      });
      this.writeWsState(projectPath, { steps });
    },

    recordFileOp(projectPath, op) {
      const state = this.readWsState(projectPath) || {};
      const fileOps = Array.isArray(state.fileOps) ? state.fileOps : [];
      fileOps.push({
        ...op,
        timestamp: new Date().toISOString()
      });
      if (fileOps.length > 500) fileOps.shift();
      this.writeWsState(projectPath, { fileOps });
    },

    getRecoveryState(projectPath) {
      const state = this.readWsState(projectPath);
      if (!state) return null;
      
      if (state.status === 'running' || state.status === 'error') {
        return {
          canRecover: true,
          status: state.status,
          startedAt: state.runStartedAt,
          lastCheckpoint: state.lastCheckpoint,
          projectTemplate: state.projectTemplate,
          steps: state.steps || [],
          fileOps: state.fileOps || [],
          inputFiles: state.inputFiles || [],
          currentStage: state.currentStage || 'unknown'
        };
      }
      return { canRecover: false };
    },

    prepareCleanWorkspace(projectPath) {
      currentTimestamp = makeTimestamp();
      const workDir = this.getWorkDir(projectPath);
      if (fs.existsSync(workDir)) {
        try { fs.rmSync(workDir, { recursive: true, force: true }); } catch {}
      }
      fs.mkdirSync(workDir, { recursive: true });
      if (fs.existsSync(projectPath)) {
        const entries = fs.readdirSync(projectPath);
        for (const entry of entries) {
          if (entry.startsWith('.')) continue;
          fs.cpSync(path.join(projectPath, entry), path.join(workDir, entry), { recursive: true });
        }
      }
      const now = new Date().toISOString();
      const sf = path.join(workDir, '.mrite-ws.json');
      try {
        fs.writeFileSync(sf, JSON.stringify({
          status: 'idle',
          inputLoaded: false,
          projectTemplate: path.basename(projectPath),
          createdAt: now,
          _updated: now,
          steps: [],
          fileOps: [],
          inputFiles: []
        }, null, 2), 'utf-8');
      } catch {}
      return workDir;
    },

    markTaskStarted(projectPath, opts = {}) {
      this.writeWsState(projectPath, {
        status: 'running',
        runStartedAt: new Date().toISOString(),
        taskType: opts.taskType || 'solve',
        model: opts.model || '',
        projectName: opts.projectName || '',
        displayName: opts.projectName || '',
        inputFiles: opts.inputFiles || [],
        currentStage: 'initializing'
      });
      this.startCheckpoint(projectPath);
    },

    markTaskStage(projectPath, stage) {
      this.writeWsState(projectPath, {
        currentStage: stage,
        stageChangedAt: new Date().toISOString()
      });
    },

    markTaskCompleted(projectPath, result = {}) {
      this.stopCheckpoint();
      this.writeWsState(projectPath, {
        status: 'completed',
        runCompletedAt: new Date().toISOString(),
        durationMs: result.durationMs || 0,
        inputTokens: result.inputTokens || 0,
        outputTokens: result.outputTokens || 0,
        steps: result.steps || [],
        outputPath: result.outputPath || ''
      });
    },

    markTaskError(projectPath, error = {}) {
      this.stopCheckpoint();
      this.writeWsState(projectPath, {
        status: 'error',
        runCompletedAt: new Date().toISOString(),
        errorMessage: error.message || '',
        errorStack: error.stack || ''
      });
    },

    flattenNestedProblemDirs(projectPath) {
      const workDir = this.getWorkDir(projectPath);
      const solveDir = path.join(workDir, '求解');
      if (!fs.existsSync(solveDir)) return;

      function findNestedSolveDirs(baseDir, depth) {
        if (depth > 10) return [];
        const results = [];
        try {
          const entries = fs.readdirSync(baseDir, { withFileTypes: true });
          for (const entry of entries) {
            if (!entry.isDirectory()) continue;
            const fullPath = path.join(baseDir, entry.name);
            if (entry.name === '求解') {
              results.push({ nestedSolveDir: fullPath, parentDir: baseDir });
            }
            if (entry.name.startsWith('问题')) {
              results.push(...findNestedSolveDirs(fullPath, depth + 1));
            }
          }
        } catch {}
        return results;
      }

      let maxRounds = 10;
      while (maxRounds-- > 0) {
        const nested = findNestedSolveDirs(solveDir, 0);
        if (nested.length === 0) break;

        for (const { nestedSolveDir } of nested) {
          try {
            const innerEntries = fs.readdirSync(nestedSolveDir, { withFileTypes: true });
            for (const entry of innerEntries) {
              if (!entry.isDirectory()) continue;
              const srcDir = path.join(nestedSolveDir, entry.name);
              const dstDir = path.join(solveDir, entry.name);
              if (!fs.existsSync(dstDir)) {
                fs.renameSync(srcDir, dstDir);
              } else {
                this._mergeDir(srcDir, dstDir);
                fs.rmSync(srcDir, { recursive: true, force: true });
              }
            }
            try { fs.rmdirSync(nestedSolveDir); } catch {}
          } catch (e) {
            console.error('Mrite: 修正嵌套目录失败', e.message);
          }
        }
      }

      const paperDir = path.join(workDir, '论文');
      if (!fs.existsSync(paperDir)) {
        function findPaperDir(dir, depth) {
          if (depth > 10) return null;
          try {
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
              if (entry.isDirectory() && entry.name === '论文') {
                const candidate = path.join(dir, entry.name);
                try {
                  const files = fs.readdirSync(candidate);
                  if (files.some(f => f.endsWith('.tex'))) return candidate;
                } catch {}
              }
              if (entry.isDirectory() && entry.name.startsWith('问题')) {
                const found = findPaperDir(path.join(dir, entry.name), depth + 1);
                if (found) return found;
              }
            }
          } catch {}
          return null;
        }
        const nestedPaper = findPaperDir(solveDir, 0);
        if (nestedPaper) {
          try { fs.renameSync(nestedPaper, paperDir); } catch (e) {
            console.error('Mrite: 修正论文目录失败', e.message);
          }
        }
      }
    },

    _mergeDir(src, dst) {
      if (!fs.existsSync(dst)) fs.mkdirSync(dst, { recursive: true });
      try {
        const entries = fs.readdirSync(src, { withFileTypes: true });
        for (const entry of entries) {
          const srcPath = path.join(src, entry.name);
          const dstPath = path.join(dst, entry.name);
          if (entry.isDirectory()) {
            this._mergeDir(srcPath, dstPath);
          } else if (!fs.existsSync(dstPath)) {
            fs.copyFileSync(srcPath, dstPath);
          }
        }
      } catch {}
    },

    exportResults(projectPath, customOutputPath) {
      const workDir = this.getWorkDir(projectPath);
      if (!fs.existsSync(workDir)) return null;
      const folderName = path.basename(workDir);
      if (customOutputPath) {
        try {
          const tsDir = path.join(customOutputPath, folderName);
          if (!fs.existsSync(tsDir)) fs.mkdirSync(tsDir, { recursive: true });
          ['求解', '论文'].forEach(dir => {
            const src = path.join(workDir, dir);
            const dst = path.join(tsDir, dir);
            if (fs.existsSync(src)) {
              if (fs.existsSync(dst)) fs.rmSync(dst, { recursive: true, force: true });
              try { fs.cpSync(src, dst, { recursive: true, force: true }); } catch {}
            }
          });
          return tsDir;
        } catch {}
      }
      return workDir;
    },

    resetOutputSync(projectPath) {
      try {
        const workDir = this.getWorkDir(projectPath);
        if (fs.existsSync(workDir)) fs.rmSync(workDir, { recursive: true, force: true });
        const claudeSessions = path.join(os.homedir(), '.claude', 'projects');
        if (fs.existsSync(claudeSessions)) fs.rmSync(claudeSessions, { recursive: true, force: true });
      } catch {}
    },
  };
}

module.exports = { create };
