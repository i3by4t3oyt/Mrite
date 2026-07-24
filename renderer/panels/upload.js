// Mrite v1.8 — 上传面板（左右布局）
window.Mrite = window.Mrite || {};

function fileIconClass(name, isDir) {
  if (isDir) return 'folder';
  const ext = (name||'').split('.').pop()?.toLowerCase();
  if (ext === 'pdf') return 'pdf';
  if (['doc','docx'].includes(ext)) return 'word';
  if (['xls','xlsx','csv'].includes(ext)) return 'xls';
  if (['png','jpg','jpeg','gif','svg','webp'].includes(ext)) return 'img';
  if (['py','r','m','js','ts','json'].includes(ext)) return 'code';
  if (['txt','md'].includes(ext)) return 'text';
  if (['zip','rar','7z','tar','gz'].includes(ext)) return 'archive';
  return 'unknown';
}

function fileIconSVG(name, isDir) {
  if (isDir) return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>';
  const ext = (name||'').split('.').pop()?.toLowerCase();
  if (ext === 'pdf') return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="13" y2="17"/></svg>';
  if (['doc','docx'].includes(ext)) return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="15" y2="17"/></svg>';
  if (['xls','xlsx','csv'].includes(ext)) return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><rect x="8" y="12" width="8" height="6" rx="1"/><line x1="8" y1="15" x2="16" y2="15"/></svg>';
  if (['png','jpg','jpeg','gif','svg','webp'].includes(ext)) return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><circle cx="10" cy="14" r="2"/><polyline points="18 18 14 14 8 18"/></svg>';
  if (['zip','rar','7z','tar','gz'].includes(ext)) return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="11" x2="12" y2="11.01"/><line x1="12" y1="14" x2="12" y2="14.01"/><line x1="12" y1="17" x2="12" y2="17.01"/></svg>';
  // 未知文件类型：通用文件 + 问号标记
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M9.5 14.5a3 3 0 0 1 5.5 1.5c0 2-3 2.5-3 4.5" stroke-width="1.3"/><circle cx="12" cy="21" r="0.4" fill="currentColor"/></svg>';
}

Mrite.openFilePicker = async function(type) {
  var block = Mrite._blockIfRunning();
  if (block === true) return;

  try {
    const r = await window.electronAPI.openFileDialog({
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: '所有文件', extensions: ['*'] }],
    });
    if (r?.length) await Mrite._addFiles(r, type);
  } catch(e) { console.error('upload:', e); }
};

Mrite._addFiles = async function(paths, type) {
  const list = type==='topic' ? Mrite.STATE.topicFiles : Mrite.STATE.dataFiles;
  const dir = type==='topic' ? '题目' : '数据';
  if (Mrite.STATE.topicFiles.length===0 && Mrite.STATE.dataFiles.length===0) await window.electronAPI.prepareWorkspace();
  var dupCount = 0;
  for (const fp of paths) {
    const baseName = fp.split('/').pop().split('\\').pop(); // 取文件名
    if (list.some(f => f.name === baseName)) { dupCount++; continue; }        // 按文件名去重
    try { const r=await window.electronAPI.copyFileToProject(fp,dir); if(r.success){list.push({name:r.fileName,path:r.destPath,isDir:false,fileCount:1});continue;} } catch {}
    try { const r=await window.electronAPI.copyFolderToProject(fp,dir); if(r.success)list.push({name:r.folderName,path:r.destPath,isDir:true,fileCount:r.fileCount}); } catch {}
  }
  if (dupCount > 0) Mrite._showToast('已跳过 ' + dupCount + ' 个同名文件');
  Mrite.renderFileList();
  Mrite.updateButtonStates();
};

// 渲染文件列表（新版：左右两个 drop zone）
Mrite.renderFileList = function() {
  const topicList = document.getElementById('topicFileList');
  const dataList = document.getElementById('dataFileList');

  const topics = Mrite.STATE.topicFiles;
  const datas = Mrite.STATE.dataFiles;

  // 渲染赛题文件
  if (topicList) {
    if (!topics.length) {
      topicList.innerHTML = '<div class="task-file-box-empty">点击上传 PDF/DOCX/图片</div>';
    } else {
      topicList.innerHTML = topics.map((f, i) => buildFileRow(f, i, 'topic')).join('');
    }
  }

  // 渲染数据文件
  if (dataList) {
    if (!datas.length) {
      dataList.innerHTML = '<div class="task-file-box-empty">点击上传 Excel/CSV/图片</div>';
    } else {
      dataList.innerHTML = datas.map((f, i) => buildFileRow(f, i, 'data')).join('');
    }
  }

  // 绑定删除事件
  document.querySelectorAll('.task-file-del').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      var block = Mrite._blockIfRunning();
      e.stopPropagation();
      if (block === true) return;
      const type = btn.dataset.type;
      const idx = parseInt(btn.dataset.index);
      const list = type === 'topic' ? Mrite.STATE.topicFiles : Mrite.STATE.dataFiles;
      const file = list[idx];
      if (!file) return;
      const targetDir = type === 'topic' ? '题目' : '数据';
      try {
        const r = await window.electronAPI.removeProjectFile(file.path, targetDir);
        if (!r || !r.success) {
          Mrite._showToast((r && r.error) || '删除失败');
          return;
        }
      } catch(err) {
        Mrite._showToast('删除失败: ' + (err.message || err));
        return;
      }
      list.splice(idx, 1);
      if (!list.length && !Mrite.STATE.topicFiles.length && !Mrite.STATE.dataFiles.length) {
        Mrite.STATE.inputLoaded = false;
      }
      try { await window.electronAPI.updateWsState({ inputLoaded: Mrite.STATE.inputLoaded }); } catch(_) {}
      Mrite.renderFileList();
      Mrite.updateButtonStates();
      Mrite._showToast('已删除文件');
    });
  });

  // 更新运行按钮状态
  Mrite._updateRunBtnState();
};

function buildFileRow(f, i, type) {
  var iconClass = fileIconClass(f.name, f.isDir);
  var iconSvg = fileIconSVG(f.name, f.isDir);
  return '<div class="task-file-row">' +
    '<div class="task-file-icon ' + iconClass + '">' + iconSvg + '</div>' +
    '<span class="task-file-name" title="' + escAttr(f.name) + '">' + escHtml(f.name) + '</span>' +
    '<button type="button" class="task-file-del" data-type="' + type + '" data-index="' + i + '" title="删除文件">&times;</button>' +
    '</div>';
}

function escAttr(s) { return s ? String(s).replace(/"/g, '&quot;').replace(/</g, '&lt;') : ''; }
function escHtml(s) { return s ? String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') : ''; }

// ★ 自动生成项目名称：任务1, 任务2, ...（查实际历史记录）
Mrite._autoGenerateProjectName = async function() {
  var existing = [];
  try {
    var r = await window.electronAPI.scanWorkspaceProjects();
    if (r && r.success && r.projects) {
      r.projects.forEach(function(p) {
        var t = (p.projectName || '').trim();
        if (/^任务\d+$/.test(t)) existing.push(parseInt(t.replace('任务', '')));
      });
    }
  } catch(_) {}
  var next = existing.length ? Math.max.apply(null, existing) + 1 : 1;
  return '任务' + next;
};

// ★ 完全重置任务状态（新建/复原共用）
Mrite._fullResetTaskState = function() {
  var S = Mrite.STATE;
  S.runStatus = 'idle';
  S.taskType = 'idle';
  S.inputLoaded = false;
  S.currentProjectName = '';
  S.settings.projectPath = '';
  S.topicFiles = [];
  S.dataFiles = [];
  S.taskSteps = [];
  S.toolOps = [];
  S.tokenInput = 0;
  S.tokenOutput = 0;
  S._prevProgress = 0;
  S._savedProgress = 0;
  S._lastDurationMs = 0;
  S._accumulatedDurationMs = 0;
  S.taskStartTime = null;
  S._modifySessionIntent = 'solve';
  S._modifyCompleted = false;
  Mrite.modifyChatHistory = [];
  Mrite.modifyFileOps = [];
  Mrite._shownFiles = {};
  Mrite._userScrolledUp = false; // ★ 新任务开始时重置手动滚动标记
  Mrite._liveImgs = [];
  Mrite._liveTbls = [];
  Mrite._liveCodes = [];
  Mrite._liveImgIdx = 0;
  Mrite._liveTblIdx = 0;
  Mrite._liveCodeIdx = 0;
  Mrite._stopHeartbeat();
  Mrite._stopElapsedTimer();
  // 清空进度条
  var bar = document.querySelector('#progressBarFill');
  var pt = document.querySelector('#progressText');
  if (bar) { bar.style.width = '0%'; bar.classList.remove('done', 'error'); }
  if (pt) pt.textContent = '0%';
  var et = document.getElementById('progressElapsed');
  if (et) et.textContent = '已用时：00 分 00 秒';
  var lp = document.getElementById('liveResultPanel');
  if (lp) lp.classList.remove('lp-visible', 'lp-expanded');
  Mrite.saveSettings();
};

// ★ 新建任务
Mrite._onNewTask = async function() {
  var S = Mrite.STATE;
  if (S.runStatus === 'running' || S.runStatus === 'paused') {
    Mrite._showToast('任务运行中，无法新建');
    return;
  }
  Mrite._fullResetTaskState();
  // 自动生成项目名称
  S.currentProjectName = await Mrite._autoGenerateProjectName();
  var nameInput = document.getElementById('taskProjectName');
  if (nameInput) nameInput.value = S.currentProjectName;
  Mrite.renderFileList();
  Mrite._updateRunBtnState();
  Mrite._showToast('任务已创建，请上传赛题和数据');
};

// 更新运行按钮状态（有文件即可运行）
Mrite._updateRunBtnState = function() {
  var btn = document.getElementById('btnTaskRun');
  if (!btn) return;
  var hasFiles = Mrite.STATE.topicFiles.length > 0 || Mrite.STATE.dataFiles.length > 0;
  btn.disabled = !hasFiles;
};

// ── 移除按钮：清空所有已上传文件 + 清理工作空间 ──
Mrite.onRemoveFiles = async function() {
  var block = Mrite._blockIfRunning();
  if (block === true) return;
  
  var S = Mrite.STATE;
  try {
    const r = await window.electronAPI.deleteTempWorkspace(true);
    if (r && !r.success) {
      Mrite._showToast(r.error || '清空失败');
      return;
    }
  } catch(_) {}
  S.inputLoaded = false;
  S.topicFiles = [];
  S.dataFiles = [];
  S.taskSteps = [];
  S.toolOps = [];
  S.tokenInput = 0;
  S.tokenOutput = 0;
  Mrite.saveSettings();
  Mrite.renderFileList();
  Mrite.updateButtonStates();
  try { await Mrite.loadHistoryList(); } catch(_) {}
  Mrite._showToast('已清空并删除工作区');
};

// ── 装载按钮：提交工作区 → 历史记录可见 → 永不被自动清除 ──
Mrite.onLoadFiles = async function() {
  var block = Mrite._blockIfRunning();
  if (block === true) return;
  
  var S = Mrite.STATE;
  if (!S.topicFiles.length && !S.dataFiles.length) {
    Mrite._showToast('请先上传赛题或数据文件');
    return;
  }
  var nameInput = document.getElementById('taskProjectName');
  if (nameInput) S.currentProjectName = nameInput.value.trim();
  // ★ 空名称时自动生成
  if (!S.currentProjectName) {
    S.currentProjectName = await Mrite._autoGenerateProjectName();
    if (nameInput) nameInput.value = S.currentProjectName;
  }
  // ★ 查重：名称不能和已有项目重复
  try {
    var existing = await window.electronAPI.scanWorkspaceProjects();
    if (existing && existing.success && existing.projects) {
      var dup = existing.projects.find(function(p) { return p.projectName === S.currentProjectName; });
      if (dup) {
        S.currentProjectName = await Mrite._autoGenerateProjectName();
        if (nameInput) nameInput.value = S.currentProjectName;
        Mrite._showToast('名称已存在，已自动改为：' + S.currentProjectName);
      }
    }
  } catch(_) {}
  // ★ 提交工作区：写入历史记录，此后永久保留
  try {
    await window.electronAPI.saveHistoryEntry({
      projectPath: S.settings.projectPath,
      projectName: S.currentProjectName,
      timestamp: new Date().toISOString(),
      outputPath: S.settings.outputPath || '',
    });
    await Mrite.loadHistoryList();
    await Mrite._renderTaskHistory();
  } catch(_) {}

  // ★ 标记输入已装载
  S.inputLoaded = true;
  S.runStatus = 'idle';
  S.taskType = 'solve';
  // ★ 更新工作区状态文件
  try { await window.electronAPI.updateWsState({
    status: 'loaded',
    inputLoaded: true,
    projectName: S.currentProjectName,
    displayName: S.currentProjectName,
    loadedAt: new Date().toISOString()
  }); } catch(_) {}
  S.taskSteps = [];
  S.toolOps = [];
  Mrite._modifyReset();
  Mrite.saveSettings();
  // 清零进度条
  var bar = document.querySelector('#progressBarFill');
  var txt = document.querySelector('#progressText');
  if (bar) { bar.style.width = '0%'; bar.classList.remove('done','error'); }
  if (txt) txt.textContent = '0%';
  Mrite.updateButtonStates();
  Mrite.updateStatusIndicator();

  Mrite._showToast('工作区已提交');
};

// ★ 运行中拦截：完全阻止
Mrite._blockIfRunning = function() {
  var S = Mrite.STATE;
  var isRunning = (S.runStatus === 'running');
  if (!isRunning) return false;
  Mrite._showToast('任务运行中，无法执行此操作');
  return true;
};

// ★ 新版运行按钮（自动装载+运行）
Mrite.onTaskRun = async function() {
  var S = Mrite.STATE;
  // 如果正在运行，不允许重复点击
  if (S.runStatus === 'running' || S.runStatus === 'paused') return;

  // ★ 空名称时自动生成
  if (!S.currentProjectName || !S.currentProjectName.trim()) {
    S.currentProjectName = await Mrite._autoGenerateProjectName();
    var nameInput = document.getElementById('taskProjectName');
    if (nameInput) nameInput.value = S.currentProjectName;
  }

  // 检查是否有文件
  if (!S.topicFiles.length && !S.dataFiles.length) {
    Mrite._showToast('请先上传赛题或数据文件');
    return;
  }

  // 如果未装载，先自动装载
  if (!S.inputLoaded) {
    await Mrite.onLoadFiles();
  }

  // 装载成功后，切换到执行界面并运行
  if (S.inputLoaded) {
    // ★ 先清空实时结果面板数据（防止旧任务图片混入）
    Mrite._liveImgs = [];
    Mrite._liveTbls = [];
    Mrite._liveCodes = [];
    Mrite._liveImgIdx = 0;
    Mrite._liveTblIdx = 0;
    Mrite._liveCodeIdx = 0;
    Mrite._imgCache = {};
    Mrite._tblCache = {};
    Mrite._renderLivePanel();
    // 隐藏上传区，显示执行区
    var uploadSection = document.getElementById('taskUploadSection');
    var execSection = document.getElementById('taskExecSection');
    if (uploadSection) uploadSection.classList.add('hidden');
    if (execSection) execSection.classList.remove('hidden');
    // ★ 显示实时结果面板（扫描延迟到 _activeWorkDir 设置后）
    var lp = document.getElementById('liveResultPanel');
    if (lp) lp.classList.add('lp-visible');
    // ★ 保存文件名用于摘要显示，然后清空
    S._lastTopicFiles = (S.topicFiles || []).map(function(f) { return f.name; });
    S._lastDataFiles = (S.dataFiles || []).map(function(f) { return f.name; });
    S.topicFiles = [];
    S.dataFiles = [];
    Mrite.renderFileList();
    // 执行运行
    Mrite.onRun();
  }
};

// ★ 初始化任务面板
Mrite._initTaskPanel = function() {
  console.log('[Mrite] _initTaskPanel called');
  // 初始化模板轮盘
  Mrite._initTemplateCarousel();

  // 填充配置（从设置同步，只保留队伍编号和题号）
  var s = Mrite.STATE.settings;
  var setVal = function(id, val) { var el = document.getElementById(id); if (el) el.value = val || ''; };
  setVal('taskProjectName', Mrite.STATE.currentProjectName || '');
  setVal('taskTeamCode', s.teamCode);
  setVal('taskProblemNum', s.problemNumber);

  // 开关状态
  var toggleTeam = document.getElementById('taskToggleTeamCode');
  var toggleProb = document.getElementById('taskToggleProblemNum');
  if (toggleTeam) toggleTeam.checked = !!s.enableTeamCode;
  if (toggleProb) toggleProb.checked = !!s.enableProblemNum;

  // 渲染历史记录
  Mrite._renderTaskHistory();
};

// ★ 模板轮盘
Mrite._tplList = [];
Mrite._tplIndex = 0;

Mrite._initTemplateCarousel = function() {
  console.log('[Mrite] _initTemplateCarousel called');
  var select = document.getElementById('taskTplSelect');
  console.log('[Mrite] taskTplSelect element:', select);

  // 加载项目列表（直接使用项目名作为模板）
  if (window.electronAPI && window.electronAPI.listProjects) {
    // ★ 添加超时保护，防止 IPC 挂起导致永远加载中
    Promise.race([
      window.electronAPI.listProjects(),
      new Promise(function(_, rj) { setTimeout(function() { rj(new Error('timeout')); }, 5000); })
    ]).then(function(r) {
      console.log('[Mrite] listProjects result:', r);
      if (r && r.success && r.projects && r.projects.length) {
        Mrite._tplList = r.projects.map(function(p) { return { name: p.name, path: p.path }; });
        console.log('[Mrite] Template list:', Mrite._tplList);
        // ★ 将当前选中的模板路径同步到 settings.projectPath
        var cur = Mrite._tplList[Mrite._tplIndex];
        if (cur && cur.path) {
          Mrite.STATE.settings.projectPath = cur.path;
        }
      }
      Mrite._renderTplCarousel();
    }).catch(function(e) {
      console.error('[Mrite] listProjects error:', e);
      Mrite._renderTplCarousel();
    });
  } else {
    console.log('[Mrite] electronAPI.listProjects not available');
    Mrite._renderTplCarousel();
  }
};

Mrite._renderTplCarousel = function() {
  var select = document.getElementById('taskTplSelect');
  console.log('[Mrite] _renderTplCarousel, select:', select, 'tplList:', Mrite._tplList);
  if (!select) return;
  if (!Mrite._tplList || !Mrite._tplList.length) {
    select.innerHTML = '<div class="task-tpl-empty">暂无模板</div>';
    return;
  }
  select.innerHTML = Mrite._tplList.map(function(tpl, i) {
    var isActive = i === Mrite._tplIndex;
    var displayName = (typeof tpl === 'string') ? tpl : tpl.name;
    return '<div class="task-tpl-option' + (isActive ? ' active' : '') + '" data-idx="' + i + '" onclick="Mrite._tplGo(' + i + ')">' +
      '<span class="task-tpl-check"></span>' +
      '<span class="task-tpl-name">' + escHtml(displayName) + '</span>' +
    '</div>';
  }).join('');
};

Mrite._tplGo = function(i) {
  Mrite._tplIndex = i;
  // ★ 将选中模板的路径同步到 settings.projectPath
  var tpl = Mrite._tplList[i];
  if (tpl) {
    var tplPath = (typeof tpl === 'string') ? null : tpl.path;
    if (tplPath) {
      Mrite.STATE.settings.projectPath = tplPath;
    }
  }
  Mrite._renderTplCarousel();
};

// ★ 配置变更回调（同步到设置）
Mrite._onTaskConfigChange = function() {
  var s = Mrite.STATE.settings;
  var el;
  el = document.getElementById('taskTeamCode'); if (el) s.teamCode = el.value.trim();
  el = document.getElementById('taskProblemNum'); if (el) s.problemNumber = el.value.trim();
  // 同步开关状态
  el = document.getElementById('taskToggleTeamCode'); if (el) s.enableTeamCode = el.checked;
  el = document.getElementById('taskToggleProblemNum'); if (el) s.enableProblemNum = el.checked;
  Mrite.saveSettings();
};

// ★ 恢复默认配置
Mrite._resetConfig = function() {
  var s = Mrite.STATE.settings;
  var setVal = function(id, val) { var el = document.getElementById(id); if (el) el.value = val || ''; };
  setVal('taskTeamCode', s.teamCode);
  setVal('taskProblemNum', s.problemNumber);
  Mrite._tplIndex = 0;
  // ★ 重置时也将第一个模板的路径同步到 settings.projectPath
  var firstTpl = Mrite._tplList[0];
  if (firstTpl && firstTpl.path) {
    s.projectPath = firstTpl.path;
  }
  Mrite._renderTplCarousel();
  Mrite._showToast('已恢复默认配置');
};

// ★ 项目名称（自动保存，无需手动保存按钮）
Mrite._onProjectNameChange = function() {
  var el = document.getElementById('taskProjectName');
  if (el) {
    Mrite.STATE.currentProjectName = el.value.trim();
    // 自动保存到设置
    Mrite.saveSettings();
    // 更新运行按钮状态
    Mrite._updateRunBtnState();
    // 更新顶部运行按钮状态
    Mrite.updateButtonStates();
  }
};

// ═══════════ 任务历史记录（统一使用 .mrite-ws.json 为数据源） ═══════════
Mrite._getCurrentProgress = function() {
  var bar = document.querySelector('#progressBarFill');
  if (bar) {
    var w = bar.style.width;
    return parseInt(w) || 0;
  }
  return 0;
};

// 渲染运行记录（与文件面板共用 scanWorkspaceProjects 数据）
Mrite._renderTaskHistory = async function() {
  var container = document.getElementById('taskHistoryList');
  if (!container) return;
  try {
    var r = await window.electronAPI.scanWorkspaceProjects();
    if (!r || !r.success || !r.projects || !r.projects.length) {
      container.innerHTML = '<div class="task-history-empty">暂无运行记录</div>';
      return;
    }
    var currentPath = (Mrite.STATE && Mrite.STATE.settings && Mrite.STATE.settings.projectPath) || '';
    container.innerHTML = r.projects.map(function(p) {
      // ★ 简化状态：只有求解模式和修改模式
      var isModify = (p.status === 'modify');
      var st = isModify
        ? { cls: 'hr-st-modified', label: '修改模式' }
        : { cls: 'hr-st-done', label: '求解模式' };
      var timeStr = '';
      if (p.timestamp) {
        var d = new Date(p.timestamp);
        var now = new Date();
        var diff = now - d;
        if (diff < 60000) timeStr = '刚刚';
        else if (diff < 3600000) timeStr = Math.floor(diff/60000) + '分钟前';
        else if (diff < 86400000) timeStr = Math.floor(diff/3600000) + '小时前';
        else timeStr = (d.getMonth()+1) + '/' + d.getDate();
      }
      var activeCls = (currentPath && currentPath === p.projectPath) ? ' active' : '';
      return '<div class="hr' + activeCls + '" data-pp="' + escAttr(p.projectPath) + '" data-wn="' + escAttr(p.workspaceName || '') + '" data-name="' + escAttr(p.projectName) + '" data-status="' + escAttr(p.status) + '">' +
        '<div class="hr-top">' +
          '<span class="hr-name">' + escHtml(p.projectName) + '</span>' +
          '<span class="hr-badge ' + st.cls + '">' + st.label + '</span>' +
        '</div>' +
        '<div class="hr-bot">' +
          '<span class="hr-time">' + timeStr + '</span>' +
          '<span class="hr-actions">' +
            '<button class="hr-icon-btn hr-btn-load" title="装载"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg></button>' +
            '<button class="hr-icon-btn hr-btn-del" title="删除"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>' +
          '</span>' +
        '</div>' +
      '</div>';
    }).join('');

    // 绑定事件
    function findRow(el) { while (el && !el.classList.contains('hr')) el = el.parentElement; return el; }
    container.querySelectorAll('.hr').forEach(function(card) {
      card.addEventListener('click', function(ev) {
        if (ev.target.closest('button')) return;
        container.querySelectorAll('.hr').forEach(function(c) { c.classList.remove('active'); });
        card.classList.add('active');
        // ★ 点击卡片时自动加载文件树
        var pp = card.dataset.pp;
        if (pp && Mrite.loadFileTree) {
          Mrite.loadFileTree(pp);
          Mrite._setViewMode('preview');
        }
      });
    });
    container.querySelectorAll('.hr-btn-load').forEach(function(btn) {
      btn.onclick = async function(ev) {
        ev.stopPropagation();
        var row = findRow(btn); if (!row) return;
        container.querySelectorAll('.hr').forEach(function(c) { c.classList.remove('active'); });
        row.classList.add('active');
        var pp = row.dataset.pp, name = row.dataset.name, status = row.dataset.status;
        if (!pp) return;
        var S = Mrite.STATE;
        // ★ 递增加载代号，让旧任务的事件失效
        Mrite._loadGeneration = (Mrite._loadGeneration || 0) + 1;
        var thisGen = Mrite._loadGeneration;
        // 终止当前运行
        if (S.runStatus === 'running' || S.runStatus === 'paused') {
          try { await window.electronAPI.abortTask(); } catch(_) {}
          Mrite._stopHeartbeat();
        }
        // 设置工作区
        S.settings.projectPath = pp;
        S.currentProjectName = name || '';
        S.inputLoaded = true;
        S.topicFiles = []; S.dataFiles = [];
        Mrite.saveSettings();
        try { await window.electronAPI.setWorkspaceOverride(pp); } catch(_) {}

        // ★ 自动加载文件树并切换到预览模式
        if (Mrite.loadFileTree) Mrite.loadFileTree(pp);
        if (Mrite._setViewMode) Mrite._setViewMode('preview');

        // ★ 更新项目名称输入框
        var nameInput = document.getElementById('taskProjectName');
        if (nameInput) nameInput.value = name || '';

        // ★ 读取工作区完整状态
        var wsState = null;
        try { wsState = await window.electronAPI.readWsStateByPath(pp); } catch(_) {}

        // ★ 切换界面（立即，不等后续逻辑）
        var uploadSection = document.getElementById('taskUploadSection');
        var execSection = document.getElementById('taskExecSection');
        if (uploadSection) uploadSection.classList.add('hidden');
        if (execSection) execSection.classList.remove('hidden');
        // ★ 强制显示顶部控制栏
        (function() {
          var topCard = document.querySelector('.task-v4-top-card');
          if (!topCard) return;
          topCard.classList.remove('collapsed');
          topCard.classList.add('force-visible');
        })();

        // ★ 简化判定：有没有修改指令 → 修改模式；没有 → 求解模式
        var savedChat = (wsState && wsState.chatHistory) || [];
        var hasModifyMsg = savedChat.some(function(m) { return m && m.role === 'user' && !m._isSolveDialog; });
        var isModifyMode = hasModifyMsg;

        // ★ 清空临时状态
        Mrite.modifyFileOps = [];
        Mrite._modifyCompleted = false;
        Mrite._modifyHadFileOps = false;
        Mrite._shownFiles = {};
        // ★ 先清空实时结果面板（防止旧任务图片混入新任务）
        Mrite._liveImgs = [];
        Mrite._liveTbls = [];
        Mrite._liveCodes = [];
        Mrite._liveImgIdx = 0;
        Mrite._liveTblIdx = 0;
        Mrite._liveCodeIdx = 0;
        Mrite._imgCache = {};
        Mrite._tblCache = {};
        Mrite._renderLivePanel();
        // ★ 设置工作目录后再扫描
        Mrite._activeWorkDir = pp;
        // ★ 显示实时面板并扫描（此时 _activeWorkDir 已指向新任务）
        var lp = document.getElementById('liveResultPanel');
        if (lp) lp.classList.add('lp-visible');
        Mrite._scanLiveNow();
        Mrite._startGlobalLiveScan();

        if (isModifyMode) {
          // ★ 修改模式：无进度条，可输入修改指令
          S.taskType = 'modify';
          S.runStatus = 'done';
          Mrite._modifySessionIntent = 'modify';
        } else {
          // ★ 求解模式：有进度条，可继续求解
          S.taskType = 'solve';
          S.runStatus = 'idle';
          Mrite._modifySessionIntent = 'solve';
          S._prevProgress = (wsState && wsState.progress) || 0;
        }
        Mrite._modifyCompleted = false;

        // ★ 恢复保存的状态（对话记录和操作记录累加，永不删除）
        if (wsState) {
          if (wsState.taskSteps) S.taskSteps = wsState.taskSteps;
          // ★ 操作记录：直接用 wsState 的（它是最完整的）
          if (wsState.toolOps && wsState.toolOps.length) {
            S.toolOps = wsState.toolOps;
          }
          if (wsState.tokenInput) S.tokenInput = wsState.tokenInput;
          if (wsState.tokenOutput) S.tokenOutput = wsState.tokenOutput;
          if (wsState.durationMs) S._lastDurationMs = wsState.durationMs;
          // ★ 对话记录：直接用 wsState 的（它是最完整的）
          if (wsState.chatHistory && wsState.chatHistory.length) {
            Mrite.modifyChatHistory = wsState.chatHistory.filter(function(m) {
              return m && !m._completionSummary && !m.pending && !m._statusOnly;
            });
            Mrite._userScrolledUp = false; // ★ 恢复对话时重置手动滚动标记
          }
        }
        // ★ 立即保存当前状态（确保对话记录不丢）
        try {
          window.electronAPI.updateWsState({
            chatHistory: JSON.parse(JSON.stringify(Mrite.modifyChatHistory || [])),
            toolOps: JSON.parse(JSON.stringify(S.toolOps || [])),
            taskSteps: JSON.parse(JSON.stringify(S.taskSteps || [])),
          });
        } catch(_) {}

        // ★ 模式 UI 切换（带动画）
        Mrite._setModeUI(isModifyMode);
        var savedProgress = (wsState && wsState.progress) || 0;
        var bar = document.querySelector('#progressBarFill');
        var pt = document.querySelector('#progressText');
        if (!isModifyMode) {
          if (savedProgress >= 100) {
            // ★ 已完成的任务：保持 100% + done 样式
            if (bar) { bar.style.width = '100%'; bar.classList.add('done'); bar.classList.remove('error'); }
            if (pt) pt.textContent = '100%';
          } else if (savedProgress > 0) {
            if (bar) { bar.style.width = savedProgress + '%'; bar.classList.remove('done', 'error'); }
            if (pt) pt.textContent = savedProgress + '%';
          } else {
            if (bar) { bar.style.width = '0%'; bar.classList.remove('done', 'error'); }
            if (pt) pt.textContent = '0%';
          }
        }

        Mrite._modifyRenderChat();
        if (Mrite._scrollChatToBottom) Mrite._scrollChatToBottom(true);
        Mrite._renderToolOps();

        // ★ 设置输入框状态（按钮状态统一由 updateButtonStates 管理）
        var inp = document.getElementById('modifyInput');
        var sendBtn = document.getElementById('modifySend');

        if (isModifyMode) {
          if (inp) { inp.disabled = false; inp.placeholder = '输入修改指令...'; }
          if (sendBtn) sendBtn.disabled = false;
          Mrite._showToast('已进入修改模式');
        } else {
          if (inp) { inp.disabled = true; inp.placeholder = '点击顶部运行按钮继续求解…'; }
          if (sendBtn) sendBtn.disabled = true;
          Mrite._showToast('已恢复，进度 ' + ((wsState && wsState.progress) || 0) + '%，点击继续按钮继续');
        }

        Mrite._updateDialogModePill();
        // ★ 按钮状态统一由 updateButtonStates 管理，不再手动设置
        Mrite.updateButtonStates(); Mrite.updateStatusIndicator();

        // ★ 最终恢复进度条（防止被 updateButtonStates 清掉）
        if (!isModifyMode && savedProgress > 0) {
          var bar2 = document.querySelector('#progressBarFill');
          var pt2 = document.querySelector('#progressText');
          if (bar2) {
            bar2.style.width = savedProgress + '%';
            if (savedProgress >= 100) { bar2.classList.add('done'); bar2.classList.remove('error'); }
            else { bar2.classList.remove('done', 'error'); }
          }
          if (pt2) pt2.textContent = savedProgress + '%';
        }

        // ★ 延迟再刷按钮（防止 DOM 未就绪）
        Mrite._loadFixTimer = setTimeout(function() {
          Mrite._loadFixTimer = null;
          // 只在没有运行时才修正（不干扰正在运行的任务）
          if (S.runStatus !== 'running' && S.runStatus !== 'paused') {
            Mrite.updateButtonStates();
            Mrite.updateStatusIndicator();
          }
        }, 200);
      };
    });
    container.querySelectorAll('.hr-btn-del').forEach(function(btn) {
      btn.onclick = function(ev) {
        ev.stopPropagation();
        var row = findRow(btn); if (!row) return;
        var wsName = row.dataset.wn, displayName = row.dataset.name;
        var deletedPp = row.dataset.pp; // 删除前保存路径
        Mrite._showConfirm({
          title: '删除运行记录',
          desc: '确定要删除「' + displayName + '」吗？此操作不可恢复。',
          type: 'danger',
          confirmText: '删除',
          confirmClass: 'modal-btn-danger'
        }).then(function(confirmed) {
          if (confirmed) {
            window.electronAPI.deleteWorkspaceProject(wsName).then(function(r) {
              if (r.success) {
                // ★ 如果删除的是当前加载的任务，重置状态
                if (deletedPp && Mrite.STATE.settings.projectPath === deletedPp) {
                  Mrite._fullResetTaskState();
                  var uploadSection = document.getElementById('taskUploadSection');
                  var execSection = document.getElementById('taskExecSection');
                  if (uploadSection) uploadSection.classList.remove('hidden');
                  if (execSection) execSection.classList.add('hidden');
                }
                // ★ 清空文件树和预览
                var fileTree = document.getElementById('fileTree');
                var filePreview = document.getElementById('filePreview');
                var currentPreviewPath = fileTree && fileTree.dataset.currentPath;
                if (currentPreviewPath && deletedPp && (currentPreviewPath === deletedPp || currentPreviewPath.startsWith(deletedPp + '/'))) {
                  if (fileTree) { fileTree.innerHTML = '<div class="tree-empty">请选择项目</div>'; fileTree.dataset.currentPath = ''; }
                  if (filePreview) { filePreview.style.display = 'none'; filePreview.innerHTML = ''; }
                  Mrite._lastPreviewedFile = null;
                }
                // ★ 清除 localStorage 缓存
                try { var lastWs = localStorage.getItem('mrite-last-view'); if (lastWs && deletedPp && (lastWs === deletedPp || lastWs.startsWith(deletedPp + '/'))) localStorage.removeItem('mrite-last-view'); } catch(_) {}
                Mrite._renderTaskHistory();
                Mrite._showToast('已删除');
              }
            });
          }
        });
      };
    });
  } catch(e) {
    container.innerHTML = '<div class="task-history-empty">加载失败</div>';
  }
};
