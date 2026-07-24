// Mrite v1.8 — 工具栏 + 任务面板（4行2列栅格布局，无项目挂载逻辑）
window.Mrite = window.Mrite || {};

// ★ 直接切换导航高亮
Mrite._navTo = function(btn) {
  // 先移除所有按钮的 active
  document.querySelectorAll('.app-nav-btn').forEach(function(b) {
    b.classList.remove('active');
  });
  // 给当前按钮加 active
  btn.classList.add('active');
  // 根据按钮 ID 确定面板名
  var panelMap = { btnHome: null, btnTask: 'task', btnView: 'view', btnSettings: 'settings' };
  var panelName = panelMap[btn.id] || null;
  window._openPanel(panelName);
};

// ═══════════ 按钮状态更新 ═══════════
// ★ 检查授权是否过期（以服务器返回的到期日期为准）
Mrite._isExpired = function() {
  return false;
};

Mrite._syncNavIndicator = function(activeBtn) {
  var nav = document.querySelector('.app-nav');
  if (!nav) return;
  activeBtn = activeBtn || nav.querySelector('.app-nav-btn.active');
  if (!activeBtn) return;
  requestAnimationFrame(function() {
    nav.style.setProperty('--app-nav-active-x', activeBtn.offsetLeft + 'px');
    nav.style.setProperty('--app-nav-active-y', activeBtn.offsetTop + 'px');
    nav.style.setProperty('--app-nav-active-w', activeBtn.offsetWidth + 'px');
    nav.style.setProperty('--app-nav-active-h', activeBtn.offsetHeight + 'px');
  });
};

// ★ 防抖：避免短时间内重复调用
Mrite._updateBtnTimer = null;
Mrite.updateButtonStates = function() {
  if (Mrite._updateBtnTimer) return;
  Mrite._updateBtnTimer = setTimeout(function() { Mrite._updateBtnTimer = null; }, 50);
  // 实际更新逻辑
  var $ = function(s) { return document.getElementById(s); };
  var S = Mrite.STATE;

  // ★ 授权过期：视觉灰化但不阻止点击（让 toast 弹出来）
  var expired = Mrite._isExpired();
  var h = $('btnHome');   if (h) { h.disabled = false; if (expired) h.classList.add('t-expired'); else h.classList.remove('t-expired'); }
  var t = $('btnTask');   if (t) { t.disabled = false; if (expired) t.classList.add('t-expired'); else t.classList.remove('t-expired'); }
  var v = $('btnView');   if (v) { v.disabled = false; if (expired) v.classList.add('t-expired'); else v.classList.remove('t-expired'); }
  var sf = $('btnSettings'); if (sf) sf.disabled = false;

  // 任务按钮：保持默认样式
  if (t) t.classList.remove('t-ready');

  // ── 按钮状态（只在状态变化时更新）──
  var btnRP = $('btnRunPause');
  var lblRP = $('runPauseLabel');
  var canRun = !!S.inputLoaded;
  var isRunning = S.runStatus === 'running';

  // 继续/暂停按钮（修改模式下禁用）
  var isModify = (S.taskType === 'modify');
  if (btnRP) {
    var newLabel = isRunning ? '暂停' : '继续';
    var newClass = isRunning ? 'exec-btn exec-btn-danger' : 'exec-btn exec-btn-primary';
    var newDisabled = isModify || (!isRunning && !canRun);
    if (lblRP && lblRP.textContent !== newLabel) lblRP.textContent = newLabel;
    if (btnRP.className !== newClass) btnRP.className = newClass;
    if (btnRP.disabled !== newDisabled) btnRP.disabled = newDisabled;
  }

  // ── 模式 UI：solve 显示进度条，modify 显示输入框 ──
  var isModify = (S.taskType === 'modify');
  Mrite._setModeUI(isModify);
  // 进度条动画：运行中才流动
  var track = document.querySelector('.progress-track');
  if (track) track.classList.toggle('running', S.runStatus === 'running' && S.taskType === 'solve');
  // 只在没有工作区时清零进度条（且任务未完成，防止覆盖完成后的 100%）
  if (S.runStatus === 'idle' && !S.inputLoaded && !Mrite._progressDone && S.taskType !== 'modify') {
    var bar = document.querySelector('#progressBarFill');
    var txt = document.querySelector('#progressText');
    if (bar && bar.style.width !== '0%') { bar.style.width = '0%'; bar.classList.remove('done','error'); }
    if (txt && txt.textContent !== '0%') txt.textContent = '0%';
  }

  // ── 对话框：求解模式运行中禁用；修改模式运行中保持可用（用户可输入和终止） ──
  var isSolveRunning = (S.runStatus === 'running' || S.runStatus === 'paused') && S.taskType === 'solve';
  Mrite._setDialogEnabled(!isSolveRunning);

  // ── 顶部控制栏：有工作区就显示，没有就隐藏 ──
  var topCard = document.querySelector('.task-v4-top-card');
  var hideBar = !S.inputLoaded && S.taskType === 'idle';
  if (topCard) {
    // ★ 首次渲染无动画（初始化），之后用 CSS transition 做收缩/展开
    if (!Mrite._barInitDone) {
      topCard.classList.add('no-transition');
      Mrite._barInitDone = true;
      if (hideBar) topCard.classList.add('collapsed');
      else topCard.classList.remove('collapsed');
      // 下一帧移除 no-transition，后续操作恢复过渡动画
      requestAnimationFrame(function() { topCard.classList.remove('no-transition'); });
    } else {
      if (hideBar) topCard.classList.add('collapsed');
      else topCard.classList.remove('collapsed');
    }
  }
  // ★ 控制栏隐藏时给 body 补上顶部间距（与 bar 同步过渡）
  var body = document.querySelector('.task-v4-body');
  if (body) body.classList.toggle('no-top-bar', hideBar);
};

// ═══════════ 已用时更新 ═══════════
Mrite._elapsedTimer = null;
// ★ 获取总耗时（累加之前的 + 当前会话）
Mrite._getTotalDurationMs = function() {
  var S = Mrite.STATE;
  var accumulated = S._accumulatedDurationMs || 0;
  var current = S.taskStartTime ? (Date.now() - S.taskStartTime) : 0;
  return accumulated + current;
};
Mrite._updateElapsed = function() {
  var el = document.getElementById('progressElapsed');
  if (!el) return;
  var S = Mrite.STATE;
  if (!S.taskStartTime) {
    el.textContent = '已用时：00 分 00 秒';
    return;
  }
  var sec = Math.floor(Mrite._getTotalDurationMs() / 1000);
  var m = Math.floor(sec / 60);
  var s = sec % 60;
  el.textContent = '已用时：' + (m < 10 ? '0' : '') + m + ' 分 ' + (s < 10 ? '0' : '') + s + ' 秒';
};
Mrite._startElapsedTimer = function() {
  Mrite._stopElapsedTimer();
  Mrite._updateElapsed();
  Mrite._elapsedTimer = setInterval(Mrite._updateElapsed, 1000);
};
Mrite._stopElapsedTimer = function() {
  if (Mrite._elapsedTimer) { clearInterval(Mrite._elapsedTimer); Mrite._elapsedTimer = null; }
};

// ═══════════ 对话框启用/禁用 ═══════════
Mrite._setDialogEnabled = function(enabled) {
  var area = document.getElementById('taskDialogV4');
  var inp = document.getElementById('modifyInput');
  var btn = document.getElementById('modifySend');

  if (enabled) {
    if (area) area.classList.remove('is-disabled');
    if (inp) { inp.disabled = false; inp.placeholder = '输入消息…'; }
    if (btn) btn.disabled = false;
  } else {
    if (area) area.classList.add('is-disabled');
    if (inp) { inp.disabled = true; inp.placeholder = '任务运行中…'; }
    if (btn) btn.disabled = true;
  }
};

// ═══════════ 运行 ═══════════
Mrite.onRun = async function() {
  var S = Mrite.STATE;

  // 禁止运行中重复启动（允许从暂停状态继续）
  if (S.runStatus === 'running') return;

  var outPath = S.settings.outputPath?.trim();
  var team = S.settings.teamCode?.trim();
  var prob = S.settings.problemNumber?.trim();
  var apiCfg = Mrite._getActiveApiConfig ? Mrite._getActiveApiConfig() : {
    apiBase: S.settings.apiBase || '',
    apiKey: S.settings.apiKey || '',
    apiModel: S.settings.apiModel || ''
  };
  var nameInput = document.getElementById('taskProjectName');
  if (nameInput) S.currentProjectName = nameInput.value.trim();
  // ★ 空名称时自动生成
  if (!S.currentProjectName) {
    S.currentProjectName = await Mrite._autoGenerateProjectName();
    if (nameInput) nameInput.value = S.currentProjectName;
  }
  if (!outPath) { Mrite._showToast('请先在设置中配置输出路径'); return; }
  if (!apiCfg.apiKey) { Mrite._showToast('请先在设置中配置可用的 API Key'); return; }
  if (!apiCfg.apiModel) { Mrite._showToast('请先在设置中选择模型'); return; }

  // ★ 清除加载时的延迟修正定时器（防止覆盖运行状态）
  if (Mrite._loadFixTimer) { clearTimeout(Mrite._loadFixTimer); Mrite._loadFixTimer = null; }
  S.runStatus = 'running'; S.taskType = 'solve';
  // ★ 判断是否为继续模式（只看 _prevProgress 和 _lastDurationMs，不看 DOM）
  var isContinue = (S._prevProgress > 0) || (S._lastDurationMs > 0);
  if (!isContinue) {
    // 首次运行：清空状态
    S.taskSteps = []; S.toolOps = [];
    S.tokenInput = 0; S.tokenOutput = 0;
  }
  S.taskStartTime = Date.now();
  // ★ 累加之前的耗时（继续模式）
  S._accumulatedDurationMs = S._lastDurationMs || 0;
  Mrite._shownFiles = {}; // ★ 清空已展示文件记录
  if (!isContinue) {
    // ★ 首次运行：清空实时结果面板数据
    Mrite._liveImgs = [];
    Mrite._liveTbls = [];
    Mrite._liveCodes = [];
    Mrite._liveImgIdx = 0;
    Mrite._liveTblIdx = 0;
    Mrite._liveCodeIdx = 0;
    Mrite._imgCache = {};
    Mrite._tblCache = {};
  } else {
    // ★ 继续模式：保留已有图片，扫描恢复可能遗漏的文件
    if (Mrite._activeWorkDir) {
      Mrite._scanLiveNow();
    }
  }
  Mrite._renderLivePanel();
  // ★ 对话框添加"运行中"提示（延迟渲染，确保 DOM 就绪）
  Mrite.modifyChatHistory.push({
    role: 'ai',
    text: '🚀 任务启动中，请稍候…',
    _startupMsg: true
  });
  setTimeout(function() {
    if (Mrite._modifyRenderChat) Mrite._modifyRenderChat();
  }, 100);
  // ★ 上报任务开始事件
  try { window.electronAPI.reportEvent('task_start', { type: 'solve', problem: S.settings.problemNumber || '' }); } catch(_) {}
  // ★ 更新工作区状态文件
  try { window.electronAPI.updateWsState({
    status: 'running',
    projectName: S.currentProjectName,
    displayName: S.currentProjectName,
    runStartedAt: new Date().toISOString()
  }); } catch(_) {}

  S.activePanel = 'task';
  Mrite._renderToolOps();
  await new Promise(function(r) { requestAnimationFrame(function() { requestAnimationFrame(r); }); });
  await Mrite.renderPanel();

  var bar = document.querySelector('#progressBarFill');
  if (bar) bar.classList.remove('done', 'error');
  Mrite.updateButtonStates(); Mrite.updateStatusIndicator();
  Mrite._startElapsedTimer();

  S.settings.teamCode = team; S.settings.problemNumber = prob; S.settings.outputPath = outPath;
  await window.electronAPI.setOutputConfig(outPath);
  Mrite.saveSettings();

  await window.electronAPI.writeTask({
    command:'start', timestamp: new Date().toISOString(),
    topicFiles:S.topicFiles.map(function(f){return f.path;}),
    dataFiles:S.dataFiles.map(function(f){return f.path;}),
    projectPath:S.settings.projectPath,
    contestInfo:{teamCode:team,problemNumber:prob},
  });
  await window.electronAPI.injectTeamInfo({ teamCode:team, problemNumber:prob });
  Mrite.renderStepList();
  // ★ 启动进度条
  var progressTrack = document.querySelector('.progress-track');
  if (progressTrack) progressTrack.style.display = '';
  if (isContinue) {
    // ★ 继续模式：直接从保存的进度继续，不归零
    var savedProg = S._savedProgress || S._prevProgress || 5;
    Mrite._lastProgress = savedProg;
    Mrite._progressDone = false;
    Mrite._toolCallCount = 0;
    Mrite.renderProgress(savedProg);
  } else {
    // ★ 新任务：从5%开始
    Mrite._startProgress();
  }
  S._prevProgress = 0;
  S._savedProgress = 0;

  // 重置阶段检测变量
  Mrite._problemCount = 0;
  Mrite._solvedProblems = 0;
  Mrite._seenStages = {};

  Mrite._startHeartbeat();
  var launchResult = await window.electronAPI.launchTask(S.settings.projectPath, {
    apiBase: apiCfg.apiBase || '',
    apiKey: apiCfg.apiKey || '',
    apiModel: apiCfg.apiModel || '',
    apiFormat: apiCfg.apiFormat || 'auto',
    projectName: S.currentProjectName,
    _taskType: 'solve'
  });
  // 检查后端返回的错误
  if (launchResult && !launchResult.success) {
    Mrite._stopHeartbeat();
    Mrite._stopElapsedTimer();
    S.runStatus = 'idle'; S.taskType = 'idle';
    S.taskSteps = [];
    Mrite.updateButtonStates(); Mrite.updateStatusIndicator();
    Mrite.showErrorModal(launchResult.error || '任务启动失败');
    return;
  }
  await window.electronAPI.sendNotification('Mrite','任务已启动');
};

// ── 运行按钮（简化：只有运行和中止） ──
Mrite.onRunPause = async function() {
  var S = Mrite.STATE;
  // 修改模式下不允许运行
  if (S.taskType === 'modify') {
    Mrite._showToast('修改模式下无法运行，请先切换到求解模式');
    return;
  }
  if (S.runStatus === 'running') {
    // ★ 暂停：保存进度，停止 agent
    var bar = document.querySelector('#progressBarFill');
    S._prevProgress = bar ? parseInt(bar.style.width) || 0 : 0;
    S._lastDurationMs = Mrite._getTotalDurationMs ? Mrite._getTotalDurationMs() : 0;
    try { await window.electronAPI.abortTask(); } catch(_) {}
    Mrite._stopHeartbeat();
    Mrite._stopElapsedTimer();
    S.runStatus = 'paused';
    if (Mrite._clearPendingMessages) Mrite._clearPendingMessages();
    Mrite._showToast('已暂停');
    Mrite.updateButtonStates();
    return;
  }
  // ★ 继续：直接跑（新任务或恢复历史）
  await Mrite.onRun();
};

// ── 内部中止逻辑 ──
// ★ 保存当前运行状态到工作区（暂停/终止共用）
Mrite._saveRunningState = async function(statusLabel) {
  var S = Mrite.STATE;
  var dur = Mrite._getTotalDurationMs();
  var progress = Mrite._getCurrentProgress();
  S._savedProgress = progress;  // 存到 state，终止后上传页也能读到
  try { window.electronAPI.recordUsage({ input: S.tokenInput, output: S.tokenOutput, durationMs: dur, model: S.settings.apiModel || '', status: statusLabel || 'stopped' }); } catch(_) {}
  try { window.electronAPI.updateWsState({
    status: 'stopped',
    runStoppedAt: new Date().toISOString(),
    progress: progress,
    chatHistory: JSON.parse(JSON.stringify(Mrite.modifyChatHistory || [])),
    taskSteps: JSON.parse(JSON.stringify(S.taskSteps || [])),
    toolOps: JSON.parse(JSON.stringify(S.toolOps || [])),
    tokenInput: S.tokenInput || 0,
    tokenOutput: S.tokenOutput || 0,
    durationMs: dur,
  }); } catch(_) {}
  S._lastDurationMs = dur;
};

// ★ 暂停：停止运行，留在执行页，进度锁定
// ★ 终止：停止运行，退回上传页，进度锁定（下次加载可继续）
Mrite._doTerminate = async function() {
  var S = Mrite.STATE;
  S._userTerminated = true;
  await window.electronAPI.abortTask();
  await Mrite._saveRunningState('stopped');
  try { window.electronAPI.updateWsState({ runCompletedAt: null, status: 'stopped' }); } catch(_) {}
  if (Mrite._clearPendingMessages) Mrite._clearPendingMessages();
  Mrite._stopHeartbeat();
  Mrite._stopElapsedTimer();
  S.runStatus = 'idle';  // 可继续
  S.inputLoaded = false;  // ★ 清掉，回来显示上传页
  S.topicFiles = [];
  S.dataFiles = [];
  Mrite._renderToolOps();
  Mrite.renderFileList();
  // 退回上传界面
  var uploadSection = document.getElementById('taskUploadSection');
  var execSection = document.getElementById('taskExecSection');
  if (uploadSection) uploadSection.classList.remove('hidden');
  if (execSection) execSection.classList.add('hidden');
  Mrite.updateButtonStates(); Mrite.updateStatusIndicator();
  Mrite._updateDialogModePill();
  Mrite._showToast('已终止，重新加载后可继续');
};

// ★ 退出到上传页（不改变任务状态，只是退出界面）
Mrite._doExitToUpload = async function() {
  var S = Mrite.STATE;
  S.inputLoaded = false;
  S.topicFiles = [];
  S.dataFiles = [];
  Mrite.renderFileList();
  var uploadSection = document.getElementById('taskUploadSection');
  var execSection = document.getElementById('taskExecSection');
  if (uploadSection) uploadSection.classList.remove('hidden');
  if (execSection) execSection.classList.add('hidden');
  Mrite.updateButtonStates(); Mrite.updateStatusIndicator();
  Mrite._updateDialogModePill();
  Mrite._showToast('已退出');
};

// ── 终止（返回上传界面）──
Mrite.onReset = async function() {
  Mrite._fullResetTaskState();
  Mrite._modifyRenderChat();
  Mrite._renderToolOps();
  // 返回上传界面
  var uploadSection = document.getElementById('taskUploadSection');
  var execSection = document.getElementById('taskExecSection');
  if (uploadSection) uploadSection.classList.remove('hidden');
  if (execSection) execSection.classList.add('hidden');
  Mrite.updateButtonStates(); Mrite.updateStatusIndicator();
  Mrite._updateDialogModePill();
  Mrite._showToast('已复原，可开始新任务');
};

// ═══════════ 心跳 ═══════════
Mrite._heartbeatTimer = null;
Mrite._startHeartbeat = function() {
  Mrite._stopHeartbeat();
  Mrite._heartbeatTimer = setInterval(async function() {
    // ★ 只在 running 状态检测，暂停/完成/错误状态不检测
    if (Mrite.STATE.runStatus !== 'running') return;
    try {
      var s = await window.electronAPI.getTaskState();
      if (!s.isRunning) {
        // ★ 二次确认：延迟1秒再检查，避免瞬时状态误判
        await new Promise(function(r) { setTimeout(r, 1000); });
        var s2 = await window.electronAPI.getTaskState();
        if (!s2.isRunning && Mrite.STATE.runStatus === 'running') {
          Mrite.STATE.runStatus = 'error';
          if (Mrite._clearPendingMessages) Mrite._clearPendingMessages();
          Mrite._showToast('任务已中断，点击继续重新运行');
          Mrite.updateButtonStates();
          Mrite.updateStatusIndicator();
        }
      }
    } catch(e) {}
  }, 5000);
};
Mrite._stopHeartbeat = function() {
  if(Mrite._heartbeatTimer){clearInterval(Mrite._heartbeatTimer);Mrite._heartbeatTimer=null;}
  Mrite._stopProgress();
};

Mrite.onTaskComplete = function() {
  Mrite._stopHeartbeat();
  Mrite._stopElapsedTimer();
  var S = Mrite.STATE;
  // ★ 保存最终耗时，防止下次继续时丢失
  S._lastDurationMs = Mrite._getTotalDurationMs();
  S.taskStartTime = null;
  try {
    window.electronAPI.reportEvent('task_end', { type: 'solve', durationMs: S._lastDurationMs, tokens: (S.tokenInput||0) + (S.tokenOutput||0) });
  } catch(_) {}
  // ★ 保存完整状态到工作区
  try { window.electronAPI.updateWsState({
    status: 'completed',
    runCompletedAt: new Date().toISOString(),
    progress: 100,
    chatHistory: JSON.parse(JSON.stringify(Mrite.modifyChatHistory || [])),
    taskSteps: JSON.parse(JSON.stringify(S.taskSteps || [])),
    toolOps: JSON.parse(JSON.stringify(S.toolOps || [])),
    tokenInput: S.tokenInput || 0,
    tokenOutput: S.tokenOutput || 0,
    durationMs: S._lastDurationMs,
  }); } catch(_) {}
  Mrite.STATE.runStatus = 'done';
  Mrite.STATE.taskType = 'solve';
  Mrite.saveSettings();
  Mrite.updateButtonStates(); Mrite.updateStatusIndicator();
  window.electronAPI.sendNotification('Mrite','论文生成完成');
  // 保持在执行界面，显示完成提示 + 修改模式入口
  Mrite._showSolveCompleteDialog();
  Mrite._updateDialogModePill();
};

// ═══════════ 求解完成弹窗 ═══════════
Mrite._showSolveCompleteDialog = function() {
  Mrite.modifyChatHistory = Mrite.modifyChatHistory.filter(function(m) { return !m._isSolveDialog && !m._completionSummary; });
  var html = Mrite._buildSolveCompleteCard ? Mrite._buildSolveCompleteCard(Mrite.modifyChatHistory) : '<div class="solve-complete-card"><div class="solve-complete-title">求解完成</div><div class="solve-complete-actions"><button class="solve-complete-primary" onclick="Mrite._enterModifyMode()">进入修改模式</button></div></div>';
  Mrite.modifyChatHistory.push({ role: 'ai', text: '', _html: html, _solveStage: true, _isSolveDialog: true });
  Mrite._modifyRenderChat();
};

// ★ 模式切换（带动画）
// ★ 每次都重新查询 DOM 元素（避免缓存过期导致的 bug）
Mrite._setModeUI = function(isModify) {
  var els = {
    progressWrap: document.getElementById('progressWrap'),
    inputArea: document.getElementById('taskDialogV4'),
    track: document.getElementById('modeSwitchTrack'),
    opts: document.querySelectorAll('.mode-switch-opt'),
  };
  // 避免重复设置相同状态
  if (Mrite._lastModeUI === isModify) return;
  Mrite._lastModeUI = isModify;
  if (els.progressWrap) els.progressWrap.classList.toggle('mode-hidden', isModify);
  if (els.inputArea) els.inputArea.classList.toggle('mode-hidden', !isModify);
  if (els.track) els.track.classList.toggle('modify', isModify);
  els.opts.forEach(function(o) {
    o.classList.toggle('active', o.dataset.mode === (isModify ? 'modify' : 'solve'));
  });
};

// ★ 手动切换模式
Mrite._switchMode = function(mode) {
  var S = Mrite.STATE;
  // 修改模式运行中禁止切换到求解模式
  if (mode === 'solve' && S.taskType === 'modify' && S.runStatus === 'running') {
    Mrite._showToast('修改运行中无法切换，请等待完成');
    return;
  }
  // 求解运行中禁止切换到修改模式
  if (mode === 'modify' && S.runStatus === 'running') {
    Mrite._showToast('运行中请先暂停再切换');
    return;
  }
  if (mode === 'modify') {
    if (S.taskType === 'modify') return;
    // 停止当前任务
    if (S.runStatus === 'running' || S.runStatus === 'paused') {
      try { window.electronAPI.abortTask(); } catch(_) {}
      Mrite._stopHeartbeat();
      Mrite._stopElapsedTimer();
      if (Mrite._clearPendingMessages) Mrite._clearPendingMessages();
    }
    S.taskType = 'modify';
    S.runStatus = 'done';
    Mrite._setModeUI(true);
  } else {
    if (S.taskType === 'solve') return;
    S.taskType = 'solve';
    S.runStatus = S.inputLoaded ? 'idle' : 'idle';
    Mrite._setModeUI(false);
  }
  Mrite.updateButtonStates();
  Mrite._updateDialogModePill();
};

// ★ 退出执行界面（确认后退出）
Mrite._exitExec = function() {
  var S = Mrite.STATE;
  if (S.runStatus === 'running' || S.runStatus === 'paused') {
    Mrite._showConfirm({
      title: '退出执行',
      desc: '任务正在运行中，退出将中断当前任务。确定退出吗？',
      type: 'warn',
      confirmText: '退出',
      confirmClass: 'modal-btn-danger'
    }).then(function(ok) {
      if (ok) {
        window.electronAPI.abortTask().catch(function(){});
        Mrite._stopHeartbeat();
        Mrite._stopElapsedTimer();
        S.runStatus = 'idle';
        Mrite._doExitToUpload();
      }
    });
  } else {
    Mrite._showConfirm({
      title: '退出执行',
      desc: '确定退出执行界面吗？',
      type: 'default',
      confirmText: '退出'
    }).then(function(ok) {
      if (ok) Mrite._doExitToUpload();
    });
  }
};

Mrite._enterModifyMode = function() {
  Mrite.STATE.taskType = 'modify';
  Mrite.STATE.runStatus = 'done';
  Mrite._modifyCompleted = false;
  Mrite._dismissSolveDialog();
  // ★ 切换到修改模式 UI（带动画）
  Mrite._setModeUI(true);
  Mrite._modifyRenderChat();
  Mrite._updateDialogModePill();
  Mrite.updateButtonStates();
  Mrite.updateStatusIndicator();
  Mrite._showToast('已进入修改模式');
  var inp = document.getElementById('modifyInput');
  if (inp) { inp.disabled = false; inp.placeholder = '输入修改指令…'; }
  var btn = document.getElementById('modifySend');
  if (btn) btn.disabled = false;
};

Mrite._dismissSolveDialog = function() {
  // 移除弹窗消息
  Mrite.modifyChatHistory = Mrite.modifyChatHistory.filter(function(m) { return !m._isSolveDialog; });
  Mrite._modifyRenderChat();
};

Mrite.updateStatusIndicator = function() {
  var dot = document.querySelector('#statusBadge .status-dot');
  var txt = document.querySelector('#statusBadge .status-text');
  if (dot && txt) {
    dot.className = 'status-dot';
    var S = Mrite.STATE;
    var isExpired = Mrite._isExpired && Mrite._isExpired();

    // ★ 四态：未激活 / 已过期 / 已就绪 / 运行中
    if (S.runStatus === 'running' || S.runStatus === 'paused') {
      dot.classList.add('status-running');
      txt.textContent = '运行中';
    } else if (!S.settings.inviteCode || !S.settings.inviteVerified) {
      dot.classList.add('status-ok');
      txt.textContent = '就绪';
    } else if (isExpired) {
      dot.classList.add('status-error');
      txt.textContent = '已过期';
    } else {
      dot.classList.add('status-ready');
      txt.textContent = '已就绪';
    }
  }
  // ★ 对话模式药丸
  Mrite._updateDialogModePill();
  // ★ 同步首页状态（始终执行，不受 statusBadge 影响）
  if (Mrite._syncHomeStatus) Mrite._syncHomeStatus();
  if (Mrite._refreshInfoPanel) Mrite._refreshInfoPanel();
};

// ★ 更新对话窗口标题 + 项目标签 + 模式药丸
Mrite._updateDialogModePill = function() {
  var pill = document.getElementById('dialogModePill');
  var titleEl = document.getElementById('dialogTitleText');
  var badge = document.getElementById('dialogProjectBadge');
  var nameEl = document.getElementById('dialogProjectName');
  var S = Mrite.STATE;

  if (titleEl) titleEl.textContent = '对话窗口';
  var projName = S.currentProjectName || '';
  if (badge) {
    if (S.inputLoaded && projName) {
      badge.classList.remove('hidden');
      if (nameEl) nameEl.textContent = projName;
    } else {
      badge.classList.add('hidden');
    }
  }

  // ★ 模式标签
  var isModify = (S.taskType === 'modify');
  if (pill) {
    pill.textContent = isModify ? '修改模式' : '求解模式';
    pill.className = 'dialog-mode-pill' + (isModify ? ' dialog-mode-modify' : '');
  }

  // ★ 顶部卡片模式 UI
  Mrite._setModeUI(isModify);
};

// ★ 解除项目：叉号 → 终止对话、清除装载
Mrite.unloadProject = async function() {
  var S = Mrite.STATE;
  if (Mrite._persistCurrentConversation) {
    Mrite._persistCurrentConversation({
      status: (S.taskType === 'modify') ? 'modify' : (S.runStatus === 'done' ? 'completed' : 'stopped'),
      lastUnloadedAt: new Date().toISOString()
    });
  }
  // ★ 清空并隐藏实时面板
  Mrite._liveImgs = [];
  Mrite._liveTbls = [];
  Mrite._liveCodes = [];
  Mrite._liveImgIdx = 0;
  Mrite._liveTblIdx = 0;
  Mrite._liveCodeIdx = 0;
  var lp = document.getElementById('liveResultPanel');
  if (lp) { lp.classList.remove('lp-visible', 'lp-expanded'); }
  // 如果正在运行 Modify 对话，先终止
  if (S.taskType === 'modify' && (S.runStatus === 'running' || S.runStatus === 'paused')) {
    await window.electronAPI.abortTask();
    Mrite._stopHeartbeat();
    Mrite._stopElapsedTimer();
    Mrite._modifyCompleted = true;
  }
  // ★ 清空项目关联 + 对话历史
  S.inputLoaded = false;
  S.runStatus = 'idle';
  S.taskType = 'idle';
  S.currentProjectName = '';
  S.topicFiles = []; S.dataFiles = [];
  S.taskSteps = []; S.toolOps = [];
  S.tokenInput = 0; S.tokenOutput = 0;
  Mrite._shownFiles = {};
  Mrite._modifyReset();

  // ★ 清进度条
  var bar = document.querySelector('#progressBarFill');
  var txt = document.querySelector('#progressText');
  if (bar) { bar.style.width = '0%'; bar.classList.remove('done', 'error'); }
  if (txt) txt.textContent = '0%';

  // ★ 切换回上传界面
  var uploadSection = document.getElementById('taskUploadSection');
  var execSection = document.getElementById('taskExecSection');
  if (uploadSection) uploadSection.classList.remove('hidden');
  if (execSection) execSection.classList.add('hidden');

  Mrite.saveSettings();
  Mrite.renderFileList();
  Mrite._updateDialogModePill();
  Mrite.updateButtonStates(); Mrite.updateStatusIndicator();
  Mrite._showToast('已解除项目');
};

// ═══════════ 渲染右侧操作日志 ═══════════
Mrite._renderToolOps = function() {
  var el = document.getElementById('taskToolOps');
  if (!el) return;
  var S = Mrite.STATE;
  var ops = S.toolOps || [];
  if (!ops.length) {
    el.innerHTML = '<div class="task-v4-empty">等待任务开始…</div>';
    return;
  }

  var icons = {
    Read: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>',
    Write: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
    Edit: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
    Bash: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>',
    compile: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>',
    python: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>',
    Grep: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
    Glob: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
    web: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>',
  };
  var defIcon = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/></svg>';

  var html = '';
  for (var i = ops.length - 1; i >= 0; i--) {
    var op = ops[i];
    var cls = op._done ? 'task-op-item done' : 'task-op-item active';
    html += '<div class="' + cls + '"><span class="task-op-icon">' + (icons[op.op] || defIcon) + '</span><span class="task-op-label" title="' + escAttr(op.label) + '">' + escHtml(op.label) + '</span></div>';
  }
  el.innerHTML = html;
  el.scrollTop = 0;
};

// ★ 快速编译（直接运行 xelatex，不经过 AI）
Mrite.onQuickCompile = async function() {
  var S = Mrite.STATE;
  var projectPath = S.settings.projectPath;
  if (!projectPath) {
    Mrite._showToast('请先选择项目');
    return;
  }

  // 查找 tex 文件
  var texPath = null;
  try {
    var r = await window.electronAPI.findTexFile(projectPath);
    if (r && r.success && r.texPath) {
      texPath = r.texPath;
    }
  } catch(e) {}

  if (!texPath) {
    Mrite._showToast('未找到 tex 文件');
    return;
  }

  Mrite._showToast('正在编译...');
  var compileBtn = document.getElementById('quickCompileBtn');
  if (compileBtn) {
    compileBtn.disabled = true;
    compileBtn.textContent = '编译中...';
  }

  try {
    var result = await window.electronAPI.directCompile(texPath, projectPath);
    if (result && result.success) {
      Mrite._showToast('编译成功！PDF 已生成');
      Mrite._modifyShowCompileStatus(true, 'PDF 已更新');
    } else {
      Mrite._showToast('编译失败：' + (result.error || '未知错误'));
      Mrite._modifyShowCompileStatus(false, result.error || '编译失败');
    }
  } catch(e) {
    Mrite._showToast('编译异常：' + e.message);
  }

  if (compileBtn) {
    compileBtn.disabled = false;
    compileBtn.textContent = '快速编译';
  }
};

function escHtml(s){ if(!s)return''; return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function escAttr(s){ if(!s)return''; return String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;'); }
