const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // ── 文件路径 ──
  getFilePath: (file) => {
    try { return webUtils.getPathForFile(file); }
    catch { return null; }
  },

  // ── 文件对话框 ──
  openFileDialog: (options) => ipcRenderer.invoke('open-file-dialog', options),
  openFolderDialog: (options) => ipcRenderer.invoke('open-folder-dialog', options),

  // ── 文件操作 ──
  prepareWorkspace: () => ipcRenderer.invoke('prepare-workspace'),
  copyFileToProject: (filePath, targetDir) =>
    ipcRenderer.invoke('copy-file-to-project', { filePath, targetDir }),
  copyFolderToProject: (folderPath, targetDir) =>
    ipcRenderer.invoke('copy-folder-to-project', { folderPath, targetDir }),
  clearProjectDir: (targetDir) => ipcRenderer.invoke('clear-project-dir', { targetDir }),
  removeProjectFile: (filePath, targetDir) =>
    ipcRenderer.invoke('remove-project-file', { filePath, targetDir }),
  listProjectFiles: (targetDir) => ipcRenderer.invoke('list-project-files', { targetDir }),

  // ── 状态与任务 ──
  readStatus: () => ipcRenderer.invoke('read-status'),
  writeTask: (task) => ipcRenderer.invoke('write-task', task),

  // ── 目录树 ──
  readDirectoryTree: (dirPath, maxDepth) =>
    ipcRenderer.invoke('read-directory-tree', { dirPath, maxDepth }),
  readFileContent: (filePath) => ipcRenderer.invoke('read-file-content', filePath),
  writeFileContent: (filePath, content) => ipcRenderer.invoke('write-file-content', filePath, content),
  listDirFiles: (dirPath) => ipcRenderer.invoke('list-dir-files', dirPath),
  listDirFilesRecursive: (dirPath) => ipcRenderer.invoke('list-dir-files-recursive', dirPath),
  saveFileDialog: (defaultName) => ipcRenderer.invoke('save-file-dialog', defaultName),
  copyFileToPath: (src, dest) => ipcRenderer.invoke('copy-file-to-path', src, dest),
  renderPdfPage: (filePath, pageNum) => ipcRenderer.invoke('render-pdf-page', filePath, pageNum),
  copyToOutput: (filePath) => ipcRenderer.invoke('copy-to-output', filePath),
  updateWsState: (updates) => ipcRenderer.invoke('update-ws-state', updates),
  syncOutput: () => ipcRenderer.invoke('sync-output'),
  renameOutputFolder: (oldName, newName) => ipcRenderer.invoke('rename-output-folder', oldName, newName),
  pathExists: (p) => ipcRenderer.invoke('path-exists', p),
  getRecoveryState: () => ipcRenderer.invoke('get-recovery-state'),
  getWsState: () => ipcRenderer.invoke('get-ws-state'),
  readWsStateByPath: (projectPath) => ipcRenderer.invoke('read-ws-state-by-path', projectPath),
  directCompile: (texPath, workDir, singlePass) => ipcRenderer.invoke('direct-compile', { texPath, workDir, singlePass }),
  findTexFile: (projectPath) => ipcRenderer.invoke('find-tex-file', projectPath),

  // ── 系统操作 ──
  openFile: (filePath) => ipcRenderer.invoke('open-file', filePath),
  openInFinder: (dirPath) => ipcRenderer.invoke('open-in-finder', dirPath),

  // ── 项目管理 ──
  listProjects: () => ipcRenderer.invoke('list-projects'),
  switchProject: (projectPath) => ipcRenderer.invoke('switch-project', { projectPath }),
  setProjectPath: (projectPath) => ipcRenderer.invoke('set-project-path', projectPath),
  setWorkspaceOverride: (wsPath) => ipcRenderer.invoke('set-workspace-override', wsPath),
  importTemplate: (sourcePath) => ipcRenderer.invoke('import-template', { sourcePath }),
  installMrtplTemplate: (sourcePath) => ipcRenderer.invoke('install-mrtpl-template', { sourcePath }),
  deleteProject: (projectName) => ipcRenderer.invoke('delete-project', { projectName }),

  // ── 问题目录检测 ──
  checkProblemDir: (problemName) => ipcRenderer.invoke('check-problem-dir', problemName),

  // ── 环境检测 ──
  checkEnvironment: () => ipcRenderer.invoke('check-environment'),
	  testApi: (baseURL, apiKey) => ipcRenderer.invoke('test-api', { baseURL, apiKey }),
  exportDiagnosticsLog: () => ipcRenderer.invoke('export-diagnostics-log'),

  // ── 软件授权 ──
  verifyInviteCode: (code, apiUrl) =>
    ipcRenderer.invoke('verify-invite-code', { code, apiUrl }),
  getMachineCode: () => ipcRenderer.invoke('get-machine-code'),
  reportUsage: (data) => ipcRenderer.invoke('report-usage', data),
  reportTaskLog: (data) => ipcRenderer.invoke('report-task-log', data),
  getBackendUrl: () => ipcRenderer.invoke('get-backend-url'),
  unifiedReport: (data) => ipcRenderer.invoke('unified-report', data),
  fetchAnnouncements: () => ipcRenderer.invoke('fetch-announcements'),
  fetchServerApiConfig: () => ipcRenderer.invoke('fetch-server-api-config'),
  getConnectionState: () => ipcRenderer.invoke('get-connection-state'),
  checkConnection: () => ipcRenderer.invoke('check-connection'),
  getServerUsage: () => ipcRenderer.invoke('get-server-usage'),
  reportEvent: (type, data) => ipcRenderer.invoke('report-event', { type, data }),
  checkActivation: () => ipcRenderer.invoke('check-activation'),

  // ── 任务控制（★ v1.4：支持自定义 API 配置）──
  launchTask: (projectPath, apiConfig, prompt, modifyMode) => ipcRenderer.invoke('launch-task', { projectPath, apiConfig, prompt, modifyMode }),
  abortTask: () => ipcRenderer.invoke('abort-task'),
  getTaskState: () => ipcRenderer.invoke('get-task-state'),
  injectTeamInfo: (info) => ipcRenderer.invoke('inject-team-info', info),

  // ── 复原与输出 ──
  resetProject: () => ipcRenderer.invoke('reset-project'),
  getOutputPath: () => ipcRenderer.invoke('get-output-path'),
  getOutputConfig: () => ipcRenderer.invoke('get-output-config'),
  setOutputConfig: (outputPath) => ipcRenderer.invoke('set-output-config', { outputPath }),
  selectOutputPath: () => ipcRenderer.invoke('select-output-path'),

  // ── 历史记录（★ v1.4）──
  saveHistoryEntry: (entry) => ipcRenderer.invoke('save-history-entry', entry),
  listHistory: () => ipcRenderer.invoke('list-history'),
  deleteHistoryEntry: (entryId) => ipcRenderer.invoke('delete-history-entry', entryId),
  renameHistoryEntry: (entryId, newName) => ipcRenderer.invoke('rename-history-entry', entryId, newName),
  clearHistory: () => ipcRenderer.invoke('clear-history'),
  scanWorkspaceProjects: () => ipcRenderer.invoke('scan-workspace-projects'),
  deleteWorkspaceProject: (name) => ipcRenderer.invoke('delete-workspace-project', name),
  renameWorkspaceProject: (oldName, newName) => ipcRenderer.invoke('rename-workspace-project', oldName, newName),
  cleanupUncommitted: () => ipcRenderer.invoke('cleanup-uncommitted'),
  deleteTempWorkspace: (force) => ipcRenderer.invoke('delete-temp-workspace', { force: !!force }),
  recordUsage: (entry) => ipcRenderer.invoke('record-usage', entry),
  getUsageStats: () => ipcRenderer.invoke('get-usage-stats'),
  getHourlyStats: () => ipcRenderer.invoke('get-hourly-stats'),
  clearUsage: () => ipcRenderer.invoke('clear-usage'),

  // ── 系统通知 ──
  sendNotification: (title, body) =>
    ipcRenderer.invoke('send-notification', { title, body }),

  // ── 数据库设置同步 ──
  dbGetSettings: () => ipcRenderer.invoke('db-get-settings'),
  dbSaveSettings: (settings) => ipcRenderer.invoke('db-save-settings', settings),
  dbGetSetting: (key) => ipcRenderer.invoke('db-get-setting', key),

  // ── 窗口控制 ──
  setContentSize: (width, height) =>
    ipcRenderer.invoke('set-content-size', { width, height }),
  forceCloseApp: () => ipcRenderer.invoke('force-close-app'),

  // ── 外部链接 ──
  openExternal: (url) => ipcRenderer.invoke('open-external', url),

  // ── LaTeX 环境 ──
  latexGetStatus: () => ipcRenderer.invoke('latex-get-status'),
  latexInstall: () => ipcRenderer.invoke('latex-install'),
  latexUninstall: () => ipcRenderer.invoke('latex-uninstall'),
  latexInstallPackages: () => ipcRenderer.invoke('latex-install-packages'),
  onLatexInstallProgress: (callback) => {
    if (window._mriteLatexProgressHandler) {
      ipcRenderer.removeListener('latex-install-progress', window._mriteLatexProgressHandler);
    }
    window._mriteLatexProgressHandler = (event, data) => callback(data);
    ipcRenderer.on('latex-install-progress', window._mriteLatexProgressHandler);
  },

  // ── Python 环境 ──
  pythonGetStatus: () => ipcRenderer.invoke('python-get-status'),
  pythonEnsure: () => ipcRenderer.invoke('python-ensure'),
  pythonInstallPackage: (pkg) => ipcRenderer.invoke('python-install-package', pkg),
  pythonResetEnv: () => ipcRenderer.invoke('python-reset-env'),
  onPythonProgress: (callback) => {
    if (window._mritePythonProgressHandler) {
      ipcRenderer.removeListener('python-progress', window._mritePythonProgressHandler);
    }
    window._mritePythonProgressHandler = (event, data) => callback(data);
    ipcRenderer.on('python-progress', window._mritePythonProgressHandler);
  },

  // ── ★ v1.0 事件监听（统一 agent-event 通道）──
  onAgentEvent: (callback) => {
    // 移除旧监听后重新绑定，防止重复
    if (window._mriteAgentHandler) {
      ipcRenderer.removeListener('agent-event', window._mriteAgentHandler);
    }
    window._mriteAgentHandler = (event, data) => callback(data);
    ipcRenderer.on('agent-event', window._mriteAgentHandler);
  },

  onAppCloseBlocked: (callback) => {
    if (window._mriteCloseHandler) {
      ipcRenderer.removeListener('app-close-blocked', window._mriteCloseHandler);
    }
    window._mriteCloseHandler = (event, data) => callback(data);
    ipcRenderer.on('app-close-blocked', window._mriteCloseHandler);
  },

  onConnectionStateChanged: (callback) => {
    if (window._mriteConnectionHandler) {
      ipcRenderer.removeListener('connection-state-changed', window._mriteConnectionHandler);
    }
    window._mriteConnectionHandler = (event, data) => callback(data);
    ipcRenderer.on('connection-state-changed', window._mriteConnectionHandler);
  },

  onVersionOutdated: (callback) => {
    if (window._mriteVersionHandler) {
      ipcRenderer.removeListener('version-outdated', window._mriteVersionHandler);
    }
    window._mriteVersionHandler = (event, data) => callback(data);
    ipcRenderer.on('version-outdated', window._mriteVersionHandler);
  },
});
