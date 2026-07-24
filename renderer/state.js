// Mrite v1.8 — 全局状态（增强持久化）
window.Mrite = window.Mrite || {};

Mrite.STATE = {
  isActivated: true,
  topicFiles: [], dataFiles: [],
  runStatus: 'idle',
  taskType: 'solve',
  activePanel: null,
  currentViewPath: '',
  currentProjectName: '',
  currentTemplateName: '',
  modifyProjectName: '',
  modifyProjectTime: '',
  settings: { teamCode: '', problemNumber: '', school: '', members: '', advisor: '',
    inviteCode: '', inviteVerified: true, inviteActivatedAt: '', inviteExpiresAt: '',
    projectPath: '', outputPath: '',
    apiBase: '', apiKey: '', apiModel: '', apiFormat: 'auto', _selectedProvider: 'custom',
    enableTeamCode: false, enableProblemNum: false, enableSchool: false,
    enableMembers: false, enableAdvisor: false, enableStyle: false,
    stylePrompt: '', writingLang: 'zh' },
  taskSteps: [],
  tokenInput: 0, tokenOutput: 0,
  taskStartTime: null,
  workspaceState: null,
};

Mrite._getActiveApiConfig = function() {
  var s = Mrite.STATE.settings || {};
  var models = Array.isArray(s.apiModels) ? s.apiModels : [];
  var idx = s._activeModelIndex;

  // 优先从活动模型数组读取
  if (idx >= 0 && models[idx]) {
    var m = models[idx];
    // ★ apiKey 从模型中取，如果为空则回退到扁平字段（兼容 DB 剥离 apiKey 后恢复不全的场景）
    var apiKey = (m.apiKey || s.apiKey || '').trim();
    return {
      apiBase: (m.baseURL || s.apiBase || '').trim(),
      apiKey: apiKey,
      apiModel: (m.name || s.apiModel || '').trim(),
      apiFormat: m.apiFormat || s.apiFormat || 'auto'
    };
  }

  // fallback 到扁平字段
  return {
    apiBase: (s.apiBase || '').trim(),
    apiKey: (s.apiKey || '').trim(),
    apiModel: (s.apiModel || '').trim(),
    apiFormat: s.apiFormat || 'auto'
  };
};

Mrite.loadSettings = function() {
  // 1. 先从 localStorage 加载（同步，立即可用）
  try {
    const raw = localStorage.getItem('app-settings');
    if (raw) {
      const data = JSON.parse(raw);
      Mrite.STATE.settings = { ...Mrite.STATE.settings, ...data };
      // ★ 保留 localStorage 中的激活状态，等 DB 加载后再确认
    }
  } catch {}
  // 2. 再从数据库加载（DB 是主数据源，localStorage 只是快速缓存）
  setTimeout(async () => {
    try {
      if (window.electronAPI && window.electronAPI.dbGetSettings) {
        const result = await window.electronAPI.dbGetSettings();
        if (result && result.success && result.settings) {
          const db = result.settings;
          // ★ 简单解析：字符串布尔值转换
          for (const k of Object.keys(db)) {
            if (db[k] === 'true') db[k] = true;
            else if (db[k] === 'false') db[k] = false;
          }
          delete db._runStatus;
          // ★ 过滤损坏数据
          if (db.apiModels && !Array.isArray(db.apiModels)) delete db.apiModels;
          // ★ 直接用 DB 数据覆盖（DB 已是完整数据，包含 apiKey）
          Mrite.STATE.settings = { ...Mrite.STATE.settings, ...db };
          // ★ 兜底
          if (!Array.isArray(Mrite.STATE.settings.apiModels)) {
            Mrite.STATE.settings.apiModels = [];
          }
          // ★ 激活状态校验（兼容字符串和布尔值）
          Mrite.STATE.settings.inviteVerified = (Mrite.STATE.settings.inviteVerified === true || Mrite.STATE.settings.inviteVerified === 'true');
          Mrite.STATE.isActivated = Mrite.STATE.settings.inviteVerified;
          // 回写到 localStorage 保持同步
          localStorage.setItem('app-settings', JSON.stringify(Mrite.STATE.settings));
          // ★ 确保扁平字段与 apiModels 中的活动配置同步（即使用户未打开设置页）
          if (typeof Mrite._restoreActiveConfig === 'function') {
            Mrite._restoreActiveConfig();
          }
          // ★ 同步输出路径到主进程
          if (Mrite.STATE.settings.outputPath) {
            try { await window.electronAPI.setOutputConfig(Mrite.STATE.settings.outputPath); } catch(_) {}
          }
          // 更新 DOM（如果面板已挂载）
          Mrite.renderSettings();
          // 激活验证已禁用，始终视为已激活
          Mrite.STATE.settings.inviteVerified = true;
          Mrite.STATE.isActivated = true;
          // ★ 刷新状态指示器
          Mrite.updateStatusIndicator();
        }
      }
    } catch {}

    setTimeout(function() {
      if (typeof Mrite._checkRecovery === 'function') {
        Mrite._checkRecovery();
      }
    }, 1000);
  }, 500);
};

Mrite.saveSettings = function() {
  var full = Object.assign({}, Mrite.STATE.settings, { _runStatus: Mrite.STATE.runStatus });
  // 1. 写入 localStorage（快速缓存）
  try { localStorage.setItem('app-settings', JSON.stringify(full)); } catch {}
  // 2. 写入数据库（完整数据，包括 apiKey — 本地 SQLite，无安全差异）
  try {
    if (window.electronAPI && window.electronAPI.dbSaveSettings) {
      window.electronAPI.dbSaveSettings(full);
    }
  } catch {}
};

// 将 STATE.settings 同步到设置面板的 DOM 表单（仅在面板已挂载时有效）
Mrite.renderSettings = function() {
  var s = Mrite.STATE.settings;
  var set = function(id, val) { var e = document.getElementById(id); if (e) e.value = val || ''; };
  var setChk = function(id, key) { var e = document.getElementById(id); if (e) e.checked = !!s[key]; };
  set('inputTeamCode', s.teamCode);
  set('inputProblemNumber', s.problemNumber);
  set('inputSchool', s.school);
  set('inputMembers', s.members);
  set('inputAdvisor', s.advisor);
  set('inputInviteCode', s.inviteCode);
  set('inputOutputPath', s.outputPath);
  // 初始化供应商卡片选中状态
  if (typeof Mrite._initProviderUI === 'function') Mrite._initProviderUI();
  setChk('toggleTeamCode', 'enableTeamCode');
  setChk('toggleProblemNum', 'enableProblemNum');
  setChk('toggleSchool', 'enableSchool');
  setChk('toggleMembers', 'enableMembers');
  setChk('toggleAdvisor', 'enableAdvisor');
  setChk('toggleStyle', 'enableStyle');
  set('inputStylePrompt', s.stylePrompt);
  Mrite._updateInviteUI();
};
