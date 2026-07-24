// Mrite v1.9 — Agent 事件处理（精简输出 + 阶段进度 + 图片路径修复）
window.Mrite = window.Mrite || {};

Mrite.STATE.toolOps = [];

Mrite._syncWsState = function(updates) {
  try {
    if (window.electronAPI && window.electronAPI.updateWsState) {
      window.electronAPI.updateWsState(updates);
    }
  } catch(e) {}
};

Mrite._persistCurrentConversation = function(extraUpdates) {
  try {
    var S = Mrite.STATE || {};
    var hasProject = !!(S.settings && S.settings.projectPath);
    if (!hasProject || !window.electronAPI || !window.electronAPI.updateWsState) return;
    var updates = {
      chatHistory: JSON.parse(JSON.stringify(Mrite.modifyChatHistory || [])),
      taskSteps: JSON.parse(JSON.stringify(S.taskSteps || [])),
      toolOps: JSON.parse(JSON.stringify(S.toolOps || [])),
      tokenInput: S.tokenInput || 0,
      tokenOutput: S.tokenOutput || 0,
    };
    if (extraUpdates && typeof extraUpdates === 'object') {
      Object.assign(updates, extraUpdates);
    }
    window.electronAPI.updateWsState(updates);
  } catch(e) {}
};

// ★ 防抖保存运行状态到工作区（每5秒最多一次）
Mrite._saveRunStateTimer = null;
// ★ 立即保存对话记录到工作区（不防抖）
Mrite._saveChatNow = function() {
  try {
    window.electronAPI.updateWsState({
      chatHistory: JSON.parse(JSON.stringify(Mrite.modifyChatHistory || [])),
      toolOps: JSON.parse(JSON.stringify(Mrite.STATE.toolOps || [])),
    });
  } catch(e) {}
};

Mrite._saveRunStateToWs = function() {
  if (Mrite._saveRunStateTimer) return;
  Mrite._saveRunStateTimer = setTimeout(function() {
    Mrite._saveRunStateTimer = null;
    var S = Mrite.STATE;
    if (S.runStatus !== 'running') return;
    try {
      var progress = Mrite._getCurrentProgress ? Mrite._getCurrentProgress() : 0;
      Mrite._syncWsState({
        progress: progress,
        chatHistory: JSON.parse(JSON.stringify(Mrite.modifyChatHistory || [])),
        taskSteps: JSON.parse(JSON.stringify(S.taskSteps || [])),
        toolOps: JSON.parse(JSON.stringify(S.toolOps || [])),
        tokenInput: S.tokenInput || 0,
        tokenOutput: S.tokenOutput || 0,
      });
    } catch(e) {}
  }, 5000);
};

// ★ 不再自动弹恢复提示
Mrite._checkRecovery = function() {
  try {
    if (!window.electronAPI || !window.electronAPI.getWsState || !window.electronAPI.updateWsState) return;
    window.electronAPI.getWsState().then(function(wsState) {
      if (!wsState) return;
      if (wsState.status === 'running' || wsState.status === 'error') {
        window.electronAPI.updateWsState({
          status: 'stopped',
          runStoppedAt: new Date().toISOString()
        });
      }
    }).catch(function() {});
  } catch(e) {}
};

// ═══════════ 阶段进度管理 ═══════════
// 基于实际工作量的进度条：5% 开始 → 每次工具调用涨一点 → 到 95% 停住 → 完成后 100%
Mrite._lastProgress = 0;
Mrite._progressDone = false;
Mrite._toolCallCount = 0;
Mrite._problemCount = 0;

// 启动进度条（点击运行时调用）
Mrite._startProgress = function(startPct) {
  var start = startPct || 5;
  Mrite._lastProgress = start;
  Mrite._progressDone = false;
  Mrite._toolCallCount = 0;
  Mrite._problemCount = 0;
  Mrite._seenStages = {};
  Mrite.renderProgress(start);
};

// 每次工具调用时更新进度（从当前进度缓慢涨到 95%）
Mrite._tickProgress = function() {
  if (Mrite._progressDone) return;
  Mrite._toolCallCount++;

  var base = Mrite._lastProgress || 5;
  var remaining = 95 - base;
  if (remaining <= 0) { Mrite._progressDone = true; return; }

  // 前 30 次每次涨 0.3%，之后每次涨 0.1%，缓慢逼近 95%
  var step = Mrite._toolCallCount <= 30 ? 0.3 : 0.1;
  var pct = Math.min(Math.round((base + Mrite._toolCallCount * step) * 10) / 10, 95);
  // 只在整数百分比变化时更新显示
  var displayPct = Math.floor(pct);
  var lastDisplayPct = Math.floor(Mrite._lastProgress);

  if (displayPct > lastDisplayPct) {
    Mrite._lastProgress = pct;
    Mrite.renderProgress(displayPct);
  }
};

// 完成进度条
Mrite._finishProgress = function() {
  Mrite._progressDone = true;
  Mrite.renderProgress(100);
};

// 停止进度条（任务出错或中止时）
Mrite._stopProgress = function() {
  // 停在当前位置，不重置
};

// ★ 格式化工具调用详情（显示在对话窗口）
Mrite._formatToolDetail = function(toolName, input) {
  if (!input) return '';
  try {
    switch (toolName) {
      case 'Bash':
        var cmd = input.command || '';
        if (!cmd) return '';
        // 截断过长的命令
        if (cmd.length > 300) cmd = cmd.substring(0, 300) + '...';
        return '💻 $ ' + cmd;
      case 'Read':
        return '📖 读取: ' + (input.file_path || input.filePath || '');
      case 'Write':
        return '✏️ 写入: ' + (input.file_path || input.filePath || '');
      case 'Edit':
        return '📝 编辑: ' + (input.file_path || input.filePath || '');
      case 'Glob':
        return '🔍 搜索: ' + (input.pattern || '');
      case 'Grep':
        return '🔎 匹配: ' + (input.pattern || '') + ' @ ' + (input.path || '');
      default:
        return '⚙️ ' + toolName;
    }
  } catch(e) {
    return '⚙️ ' + toolName;
  }
};

// ═══════════ 实时结果面板 ═══════════
Mrite._liveTab = 'image'; // 'image' | 'table' | 'code' | 'paper'
Mrite._liveImgIdx = 0;
Mrite._liveTblIdx = 0;
Mrite._liveCodeIdx = 0;
Mrite._livePdfPage = 1;
Mrite._livePdfTotal = 0;
Mrite._livePdfPath = '';

// ★ 定时轮询作为文件监听的后备（Windows 上 fs.watch 可能丢失事件）
Mrite._liveScanTimer = null;
Mrite._startGlobalLiveScan = function() {
  if (Mrite._liveScanTimer) return;
  Mrite._scanLiveNow();
  Mrite._liveScanTimer = setInterval(function() {
    if (Mrite.STATE && Mrite.STATE.runStatus === 'running') {
      Mrite._scanLiveNow();
    } else {
      // 任务已结束，停止轮询
      Mrite._stopGlobalLiveScan();
    }
  }, 5000); // 每5秒扫描一次
};
Mrite._stopGlobalLiveScan = function() {
  if (Mrite._liveScanTimer) {
    clearInterval(Mrite._liveScanTimer);
    Mrite._liveScanTimer = null;
  }
};

// 立即扫描
Mrite._scanLiveNow = function() {
  var dir = Mrite._activeWorkDir;
  console.log('[LivePanel] 扫描开始, dir:', dir);
  if (!dir) { console.log('[LivePanel] 无工作目录，跳过'); return; }
  var scanPath = dir + '/求解';
  console.log('[LivePanel] 扫描路径:', scanPath);
  window.electronAPI.listDirFiles(scanPath).then(function(r) {
    console.log('[LivePanel] 扫描结果:', r);
    if (!r || !r.files) { console.log('[LivePanel] 无文件返回'); return; }
    var imgs = [], tbls = [], codes = [];
    r.files.forEach(function(f) {
      // ★ 过滤空文件和过小文件（可能还在写入中）
      if (f.size !== undefined && f.size < 100) return;
      var ext = (f.name || '').split('.').pop().toLowerCase();
      if (ext === 'png' || ext === 'jpg' || ext === 'jpeg' || ext === 'gif' || ext === 'svg' || ext === 'webp') {
        imgs.push(f);
      } else if (ext === 'csv' || ext === 'xlsx' || ext === 'xls') {
        tbls.push(f);
      } else if (ext === 'py' || ext === 'm' || ext === 'r') {
        codes.push(f);
      }
    });
    console.log('[LivePanel] 统计: 图片=' + imgs.length + ' 表格=' + tbls.length + ' 代码=' + codes.length);

    var prevImgs = Mrite._liveImgs || [];
    var prevTbls = Mrite._liveTbls || [];
    var hasNewFiles = imgs.length > prevImgs.length || tbls.length > prevTbls.length;

    // ★ 检测文件大小变化（文件被更新）或新文件时清空缓存
    var hasChanges = hasNewFiles;
    if (!hasChanges) {
      for (var ci = 0; ci < imgs.length; ci++) {
        var found = false;
        for (var cj = 0; cj < prevImgs.length; cj++) {
          if (imgs[ci].path === prevImgs[cj].path) {
            if (imgs[ci].size !== prevImgs[cj].size) hasChanges = true;
            found = true; break;
          }
        }
        if (!found) { hasChanges = true; break; }
      }
    }
    if (hasChanges) {
      Mrite._imgCache = {};
      Mrite._tblCache = {};
    }

    Mrite._liveImgs = imgs;
    Mrite._liveTbls = tbls;
    Mrite._liveCodes = codes;

    if (hasNewFiles) {
      if (imgs.length > prevImgs.length) {
        Mrite._liveImgIdx = imgs.length - 1;
        Mrite._liveTab = 'image';
      } else if (tbls.length > prevTbls.length) {
        Mrite._liveTblIdx = tbls.length - 1;
        Mrite._liveTab = 'table';
      }
    }

    // 检查面板元素
    var panel = document.getElementById('liveResultPanel');
    console.log('[LivePanel] 面板元素:', panel ? '存在' : '不存在', 'lp-visible:', panel?.classList.contains('lp-visible'));

    Mrite._renderLivePanel();
  }).catch(function(e) {
    console.error('[LivePanel] 扫描失败:', dir, e);
  });
};

Mrite._toggleLivePanel = function() {
  var c = document.getElementById('liveResultPanel');
  if (!c) return;
  c.classList.toggle('lp-expanded');
  var isExpanded = c.classList.contains('lp-expanded');
  // 更新按钮文字
  var btn = document.getElementById('lpToggleBtn');
  if (btn) {
    var span = btn.querySelector('span');
    if (span) span.textContent = isExpanded ? '关闭' : '展开';
  }
  if (isExpanded) { Mrite._scanLiveNow(); Mrite._renderLivePanel(); }
};

// 获取当前 tab 的文件列表和索引
Mrite._liveGetList = function() {
  if (Mrite._liveTab === 'image') return { list: Mrite._liveImgs || [], idx: Mrite._liveImgIdx, setIdx: function(i) { Mrite._liveImgIdx = i; } };
  if (Mrite._liveTab === 'table') return { list: Mrite._liveTbls || [], idx: Mrite._liveTblIdx, setIdx: function(i) { Mrite._liveTblIdx = i; } };
  return { list: Mrite._liveCodes || [], idx: Mrite._liveCodeIdx, setIdx: function(i) { Mrite._liveCodeIdx = i; } };
};

// 主渲染函数
Mrite._renderLivePanel = function() {
  var imgs = Mrite._liveImgs || [];
  var tbls = Mrite._liveTbls || [];
  var codes = Mrite._liveCodes || [];
  if (Mrite._liveImgIdx >= imgs.length) Mrite._liveImgIdx = Math.max(0, imgs.length - 1);
  if (Mrite._liveTblIdx >= tbls.length) Mrite._liveTblIdx = Math.max(0, tbls.length - 1);
  if (Mrite._liveCodeIdx >= codes.length) Mrite._liveCodeIdx = Math.max(0, codes.length - 1);

  var countEl = document.getElementById('lpFileCount');
  if (countEl) {
    countEl.textContent = Mrite._liveTab === 'paper' ? '' : (imgs.length + '图 ' + tbls.length + '表 ' + codes.length + '代码');
  }

  document.querySelectorAll('#liveResultPanel .lp-tab').forEach(function(t) {
    t.classList.toggle('active', t.dataset.tab === Mrite._liveTab);
  });

  Mrite._renderLiveSidebar();
  Mrite._renderLivePreview();
};

// 左侧文件列表
Mrite._renderLiveSidebar = function() {
  var el = document.getElementById('lpFileList');
  if (!el) return;

  // 论文 tab：隐藏侧边栏
  if (Mrite._liveTab === 'paper') {
    el.style.display = 'none';
    return;
  }

  // 图片/表格/代码 tab：显示文件列表
  el.style.display = '';

  var cur = Mrite._liveGetList();
  var labels = { image: '图片', table: '表格', code: '代码' };
  if (!cur.list.length) { el.innerHTML = '<div class="lp-empty">暂无' + (labels[Mrite._liveTab] || '') + '</div>'; return; }

  var h = '';
  for (var i = 0; i < cur.list.length; i++) {
    var sel = i === cur.idx ? ' active' : '';
    h += '<div class="lp-file-item' + sel + '" data-idx="' + i + '">' + escHtml(cur.list[i].name) + '</div>';
  }
  el.innerHTML = h;
  el.querySelectorAll('.lp-file-item').forEach(function(item) {
    item.onclick = function() {
      cur.setIdx(parseInt(item.dataset.idx, 10));
      Mrite._renderLivePanel();
    };
  });
  var activeEl = el.querySelector('.lp-file-item.active');
  if (activeEl) activeEl.scrollIntoView({ block: 'nearest' });
};

// SVG 图标
var _lpSvg = {
  prev: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>',
  next: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>',
  download: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
  zoom: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>',
  shrink: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="14" y1="10" x2="21" y2="3"/><line x1="3" y1="21" x2="10" y2="14"/></svg>',
  insert: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>',
  refresh: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>',
  compile: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>',
  list: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>',
  pin: '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
};

// ★ 刷新当前文件（清缓存并重新加载）
Mrite._liveRefreshFile = function() {
  var list = Mrite._liveTab === 'image' ? (Mrite._liveImgs || []) : (Mrite._liveTbls || []);
  var curIdx = Mrite._liveTab === 'image' ? Mrite._liveImgIdx : Mrite._liveTblIdx;
  var file = list[curIdx];
  if (!file) return;
  if (Mrite._liveTab === 'image' && Mrite._imgCache) delete Mrite._imgCache[file.path];
  if (Mrite._liveTab === 'table' && Mrite._tblCache) delete Mrite._tblCache[file.path];
  Mrite._renderLivePanel();
};

// ★ 添加引用气泡到输入框
Mrite._addRefBubble = function(type, path) {
  var input = document.getElementById('modifyInput');
  if (!input) return;
  var marker = '【' + type + ': ' + path + '】';
  // 检查是否已经添加过
  if (input.value.indexOf(marker) !== -1) {
    Mrite._showToast('已添加过该引用');
    return;
  }
  input.value = marker + ' ' + input.value;
  input.focus();
  input.setSelectionRange(input.value.length, input.value.length);
};

// ★ 论文预览：左边LaTeX代码，右边PDF，无侧边栏
Mrite._liveTexFiles = [];
Mrite._liveTexIdx = 0;
Mrite._liveTexContent = '';
Mrite._liveTexMaximized = false;

Mrite._renderPaperPreview = function(preview) {
  var workDir = Mrite._activeWorkDir || (Mrite.STATE.settings && Mrite.STATE.settings.projectPath) || '';
  if (!workDir) { preview.innerHTML = '<div class="lp-empty">无工作目录</div>'; return; }

  var isCompiling = Mrite._seenStages && Mrite._seenStages['compile'] && Mrite.STATE.runStatus === 'running';
  var paperDir = workDir + '/论文';

  window.electronAPI.listDirFiles(paperDir).then(function(r) {
    if (!r || !r.files) { preview.innerHTML = '<div class="lp-empty">暂无论文</div>'; return; }

    var pdfFile = null;
    var texFiles = [];
    for (var i = 0; i < r.files.length; i++) {
      var f = r.files[i];
      if (f.name && f.name.endsWith('.pdf')) pdfFile = f;
      if (f.name && f.name.endsWith('.tex')) texFiles.push(f);
    }
    Mrite._liveTexFiles = texFiles;
    // ★ 自动检测主文件
    if (!Mrite._liveMainTex) {
      for (var ti = 0; ti < texFiles.length; ti++) {
        if (texFiles[ti].name === '论文.tex' || texFiles[ti].name === 'main.tex') {
          Mrite._liveMainTex = texFiles[ti].path; break;
        }
      }
      if (!Mrite._liveMainTex && texFiles.length > 0) Mrite._liveMainTex = texFiles[0].path;
    }
    var pdfPath = pdfFile ? encodeURI('file:///' + pdfFile.path.replace(/\\/g, '/')) : '';

    // ── LaTeX面板 ──
    var texName = texFiles[Mrite._liveTexIdx] ? texFiles[Mrite._liveTexIdx].name : 'LaTeX';
    var mainName = (Mrite._liveMainTex || '').split(/[\\/]/).pop() || texName;
    var zoomIcon = Mrite._liveTexMaximized ? _lpSvg.shrink : _lpSvg.zoom;
    var zoomTitle = Mrite._liveTexMaximized ? '还原' : '最大化';
    var leftPanel =
      '<div class="lp-paper-left" id="lpPaperLeft">' +
        '<div class="lp-paper-bar">' +
          '<div class="lp-paper-bar-left">' +
            '<button class="lp-action-btn lp-tex-list-btn" id="lpTexListBtn" onclick="Mrite._toggleTexList()" title="选择文件">' + _lpSvg.list + '</button>' +
            '<button class="lp-action-btn" id="lpSetMainBtn" onclick="Mrite._toggleMainTexList()" title="编译主文件: ' + escAttr(mainName) + '">' + _lpSvg.pin + '</button>' +
          '</div>' +
          '<div class="lp-paper-bar-center">' +
            '<span class="lp-paper-title">' + escHtml(texName) + '</span>' +
          '</div>' +
          '<div class="lp-paper-bar-right">' +
            '<button class="lp-action-btn" id="lpCompileBtn" onclick="Mrite._liveCompile()" title="编译主文件">' + _lpSvg.compile + '</button>' +
            '<button class="lp-action-btn" id="lpTexZoomBtn" onclick="Mrite._toggleTexMaximize()" title="' + zoomTitle + '">' + zoomIcon + '</button>' +
          '</div>' +
        '</div>' +
        '<div class="lp-paper-code-wrap" id="lpPaperCodeWrap">' +
          '<pre class="lp-paper-code" id="lpPaperCode"><code>加载中...</code></pre>' +
        '</div>' +
      '</div>';

    // ── PDF面板 ──
    var rightContent = '';
    if (isCompiling) {
      rightContent = '<div class="lp-pdf-compiling"><div class="lp-pdf-compiling-icon">⏳</div><div class="lp-pdf-compiling-text">PDF 编译中...</div></div>';
    } else if (pdfPath) {
      rightContent = '<iframe src="' + pdfPath + '#toolbar=0&navpanes=0" class="lp-pdf-frame" id="lpPdfFrame"></iframe>';
    } else {
      rightContent = '<div class="lp-empty">暂无 PDF</div>';
    }
    var rightPanel =
      '<div class="lp-paper-right" id="lpPaperRight">' +
        '<div class="lp-paper-bar">' +
          '<div class="lp-paper-bar-left"></div>' +
          '<div class="lp-paper-bar-right">' +
            '<button class="lp-action-btn" onclick="Mrite._livePdfRefresh()" title="刷新PDF">' + _lpSvg.refresh + '</button>' +
            '<button class="lp-action-btn" onclick="Mrite._liveDownload()" title="下载PDF">' + _lpSvg.download + '</button>' +
            '<button class="lp-action-btn" onclick="Mrite._togglePdfMaximize()" title="最大化PDF">' + _lpSvg.zoom + '</button>' +
          '</div>' +
        '</div>' +
        '<div class="lp-paper-content">' + rightContent + '</div>' +
      '</div>';

    preview.innerHTML = '<div class="lp-paper-split" id="lpPaperSplit">' + leftPanel + rightPanel + '</div>';

    // 加载tex内容
    if (texFiles.length > 0) {
      Mrite._loadTexContent(texFiles[Mrite._liveTexIdx] || texFiles[0]);
    }
  }).catch(function() {
    preview.innerHTML = '<div class="lp-empty">暂无论文</div>';
  });
};

// ★ 加载tex文件内容
// ★ 保存当前编辑的 LaTeX 内容到磁盘（切换文件/编译前调用）
Mrite._saveTexContent = function() {
  var codeWrap = document.getElementById('lpPaperCodeWrap');
  if (!codeWrap) return;
  // ★ 从 contentEditable 中提取纯文本（textContent 自动去除 HTML 标签）
  var rawText = codeWrap.textContent || '';
  if (!rawText.trim()) return;
  if (rawText === Mrite._liveTexContent) return;
  var texFile = Mrite._liveTexFiles[Mrite._liveTexIdx];
  if (!texFile) return;
  Mrite._liveTexContent = rawText;
  try {
    window.electronAPI.writeFileContent(texFile.path, rawText);
  } catch(e) {
    console.error('[TeX] save failed:', e);
  }
};

Mrite._loadTexContent = function(texFile) {
  if (!texFile) return;
  window.electronAPI.readFileContent(texFile.path).then(function(result) {
    if (!result || !result.success || !result.text) {
      var codeEl = document.getElementById('lpPaperCode');
      if (codeEl) codeEl.innerHTML = '<code>无法读取文件</code>';
      return;
    }
    Mrite._liveTexContent = result.text;
    var codeEl = document.getElementById('lpPaperCode');
    if (codeEl) codeEl.innerHTML = '<code>' + Mrite._highlightLatex(result.text) + '</code>';
    // 默认可编辑
    var codeWrap = document.getElementById('lpPaperCodeWrap');
    if (codeWrap) {
      codeWrap.contentEditable = 'true';
      codeWrap.style.outline = 'none';
    }
    Mrite._attachCodeSelection();
  });
};

// ★ LaTeX语法高亮（颜色丰富版 — 扫描匹配+逐段构建，无占位符泄漏/无二次转义）
Mrite._highlightLatex = function(text) {
  if (!text) return '';

  // 定义所有匹配规则，按优先级排序（越靠前优先级越高）
  var rules = [
    // 1. 注释（% 开头到行尾）
    { regex: /%[^\n]*/g, cls: 'tex-comment' },
    // 2. 环境标记（\begin{...} 和 \end{...}）
    { regex: /\\(?:begin|end)\{[^}]+\}/g, cls: 'tex-env' },
    // 3. 文档结构命令
    { regex: /\\(?:documentclass|usepackage|title|author|date|maketitle|tableofcontents|section|subsection|subsubsection|paragraph|subparagraph)\b/g, cls: 'tex-structure' },
    // 4. 字体命令
    { regex: /\\(?:textbf|textit|texttt|textsc|textsl|emph|underline|overline|boldmath|mathbf|mathit|mathcal|mathrm)\b/g, cls: 'tex-font' },
    // 5. 引用/标签命令
    { regex: /\\(?:item|caption|label|ref|cite|bibliography|bibliographystyle|footnote|marginpar)\b/g, cls: 'tex-ref' },
    // 6. 数学函数
    { regex: /\\(?:frac|sqrt|sum|prod|int|lim|inf|sup|max|min|log|ln|sin|cos|tan|sec|csc|cot|arcsin|arccos|arctan|det|dim|ker|hom|arg|exp|gcd|limsup|liminf)\b/g, cls: 'tex-math-cmd' },
    // 7. 希腊字母
    { regex: /\\(?:alpha|beta|gamma|delta|epsilon|zeta|eta|theta|iota|kappa|lambda|mu|nu|xi|pi|rho|sigma|tau|upsilon|phi|chi|psi|omega|Gamma|Delta|Theta|Lambda|Xi|Pi|Sigma|Upsilon|Phi|Psi|Omega|varepsilon|vartheta|varpi|varrho|varsigma|varphi)\b/g, cls: 'tex-greek' },
    // 8. 数学符号
    { regex: /\\(?:pm|mp|times|div|cdot|ast|star|circ|bullet|oplus|ominus|otimes|oslash|odot|dagger|ddagger|amalg|cap|cup|sqcap|sqcup|vee|wedge|setminus|wr|diamond|bigtriangleup|bigtriangledown|triangleleft|triangleright|lhd|rhd|unlhd|unrhd|bigcirc|bigoplus|bigotimes|bigodot)\b/g, cls: 'tex-symbol' },
    // 9. 关系符号
    { regex: /\\(?:leq|geq|equiv|prec|succ|sim|perp|parallel|subset|supset|subseteq|supseteq|sqsubset|sqsupset|sqsubseteq|sqsupseteq|dashv|vdash|models|smile|frown|asymp|notin|neq|approx|cong|doteq|propto|bowtie|Join|pitchfork|backsim|simeq|nsim|ncong|napprox)\b/g, cls: 'tex-relation' },
    // 10. 箭头
    { regex: /\\(?:leftarrow|rightarrow|leftrightarrow|Leftarrow|Rightarrow|Leftrightarrow|uparrow|downarrow|updownarrow|Uparrow|Downarrow|Updownarrow|mapsto|longleftarrow|longrightarrow|longleftrightarrow|Longleftarrow|Longrightarrow|Longleftrightarrow|leadsto|hookleftarrow|hookrightarrow|nearrow|searrow|swarrow|nwarrow|rightleftharpoons)\b/g, cls: 'tex-arrow' },
    // 11. 定界符
    { regex: /\\(?:left|right|big|Big|bigg|Bigg|lfloor|rfloor|lceil|rceil|langle|rangle|lvert|rvert|lVert|rVert)\b/g, cls: 'tex-delim' },
    // 12. 通用命令（\command，兜底匹配）
    { regex: /\\[a-zA-Z]+/g, cls: 'tex-command' },
    // 13. 数学行内 $...$
    { regex: /\$[^$]+\$/g, cls: 'tex-math' },
    // 14. 大括号
    { regex: /[{}]/g, cls: 'tex-brace' },
    // 15. 方括号参数 [...]
    { regex: /\[[^\]]*\]/g, cls: 'tex-optional' },
    // 16. 特殊字符（& # ^ _ ~）
    { regex: /[&#^_~]/g, cls: 'tex-special' }
  ];

  // ── 阶段1：收集所有匹配，附带位置和优先级 ──
  var matches = [];
  for (var ri = 0; ri < rules.length; ri++) {
    var rule = rules[ri];
    rule.regex.lastIndex = 0;
    var m;
    while ((m = rule.regex.exec(text)) !== null) {
      matches.push({
        start: m.index,
        end: m.index + m[0].length,
        cls: rule.cls,
        text: m[0],
        priority: ri
      });
      // 防止空匹配死循环
      if (m[0].length === 0) break;
    }
  }

  // ── 阶段2：按起始位置排序，同位置按优先级 ──
  matches.sort(function(a, b) {
    if (a.start !== b.start) return a.start - b.start;
    return a.priority - b.priority;
  });

  // ── 阶段3：去除重叠匹配（保留优先级高的，不重叠的保留先出现的）──
  var filtered = [];
  for (var mi = 0; mi < matches.length; mi++) {
    var cur = matches[mi];
    // 跳过完全被前一个匹配覆盖的
    if (filtered.length > 0 && cur.start < filtered[filtered.length - 1].end) continue;
    filtered.push(cur);
  }

  // ── 阶段4：逐段构建输出，只在纯文本段做 HTML 转义 ──
  function esc(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  var result = '';
  var pos = 0;
  for (var fi = 0; fi < filtered.length; fi++) {
    var fm = filtered[fi];
    // 输出匹配之前的纯文本（需要转义）
    if (fm.start > pos) {
      result += esc(text.slice(pos, fm.start));
    }
    // 输出高亮匹配（匹配内容也需转义，确保 & < > 在 span 内安全）
    result += '<span class="' + fm.cls + '">' + esc(fm.text) + '</span>';
    pos = fm.end;
  }
  // 尾部剩余文本
  if (pos < text.length) {
    result += esc(text.slice(pos));
  }

  return result;
};

// ★ 切换tex文件下拉列表（向上展开，fixed定位避免被裁剪）
Mrite._toggleTexList = function() {
  var existing = document.getElementById('lpTexDropdown');
  if (existing) { existing.remove(); return; }

  var btn = document.getElementById('lpTexListBtn');
  if (!btn) return;

  var dropdown = document.createElement('div');
  dropdown.id = 'lpTexDropdown';
  dropdown.className = 'lp-tex-dropdown';

  var h = '';
  for (var i = 0; i < Mrite._liveTexFiles.length; i++) {
    var f = Mrite._liveTexFiles[i];
    var sel = i === Mrite._liveTexIdx ? ' active' : '';
    h += '<div class="lp-tex-dropdown-item' + sel + '" data-idx="' + i + '">' + escHtml(f.name) + '</div>';
  }
  dropdown.innerHTML = h;

  // 插到 body 下，用 fixed 定位
  document.body.appendChild(dropdown);

  var rect = btn.getBoundingClientRect();
  // 向上展开：底部对齐按钮顶部
  dropdown.style.position = 'fixed';
  dropdown.style.bottom = (window.innerHeight - rect.top + 4) + 'px';
  dropdown.style.left = rect.left + 'px';

  dropdown.querySelectorAll('.lp-tex-dropdown-item').forEach(function(item) {
    item.onclick = function() {
      // ★ 切换前先保存当前编辑
      Mrite._saveTexContent();
      Mrite._liveTexIdx = parseInt(item.dataset.idx, 10);
      var texFile = Mrite._liveTexFiles[Mrite._liveTexIdx];
      if (texFile) {
        Mrite._loadTexContent(texFile);
        var titleEl = document.querySelector('.lp-paper-title');
        if (titleEl) titleEl.textContent = texFile.name;
      }
      dropdown.remove();
    };
  });

  // 点击外部关闭
  setTimeout(function() {
    document.addEventListener('mousedown', function closeDropdown(e) {
      if (!dropdown.contains(e.target) && e.target !== btn) {
        dropdown.remove();
        document.removeEventListener('mousedown', closeDropdown);
      }
    });
  }, 10);
};

// ★ LaTeX最大化/还原
Mrite._toggleTexMaximize = function() {
  var split = document.getElementById('lpPaperSplit');
  if (!split) return;
  Mrite._liveTexMaximized = !Mrite._liveTexMaximized;
  split.classList.toggle('lp-tex-maximized', Mrite._liveTexMaximized);
  split.classList.toggle('lp-pdf-maximized', false);
  // 切换图标
  var btn = document.getElementById('lpTexZoomBtn');
  if (btn) {
    btn.innerHTML = Mrite._liveTexMaximized ? _lpSvg.shrink : _lpSvg.zoom;
    btn.title = Mrite._liveTexMaximized ? '还原' : '最大化';
  }
};

// ★ PDF最大化/还原
Mrite._togglePdfMaximize = function() {
  var split = document.getElementById('lpPaperSplit');
  if (!split) return;
  split.classList.toggle('lp-pdf-maximized');
  split.classList.toggle('lp-tex-maximized', false);
};

// ★ 编译主文件选择
Mrite._liveMainTex = '';
Mrite._toggleMainTexList = function() {
  var existing = document.getElementById('lpMainTexDropdown');
  if (existing) { existing.remove(); return; }

  var btn = document.getElementById('lpSetMainBtn');
  if (!btn) return;

  var dropdown = document.createElement('div');
  dropdown.id = 'lpMainTexDropdown';
  dropdown.className = 'lp-tex-dropdown';

  var mainName = (Mrite._liveMainTex || '').split(/[\\/]/).pop() || '';
  var h = '';
  for (var i = 0; i < Mrite._liveTexFiles.length; i++) {
    var f = Mrite._liveTexFiles[i];
    var isMain = f.path === Mrite._liveMainTex;
    h += '<div class="lp-tex-dropdown-item' + (isMain ? ' active' : '') + '" data-idx="' + i + '">' +
      (isMain ? '★ ' : '  ') + escHtml(f.name) + '</div>';
  }
  dropdown.innerHTML = h;

  document.body.appendChild(dropdown);

  var rect = btn.getBoundingClientRect();
  dropdown.style.position = 'fixed';
  dropdown.style.bottom = (window.innerHeight - rect.top + 4) + 'px';
  dropdown.style.left = rect.left + 'px';

  dropdown.querySelectorAll('.lp-tex-dropdown-item').forEach(function(item) {
    item.onclick = function() {
      var idx = parseInt(item.dataset.idx, 10);
      var file = Mrite._liveTexFiles[idx];
      if (file) {
        Mrite._liveMainTex = file.path;
        Mrite._showToast('主文件 → ' + file.name);
        Mrite._saveRunStateToWs();
      }
      dropdown.remove();
    };
  });

  setTimeout(function() {
    document.addEventListener('mousedown', function closeDD(e) {
      if (!dropdown.contains(e.target) && e.target !== btn) {
        dropdown.remove();
        document.removeEventListener('mousedown', closeDD);
      }
    });
  }, 10);
};

// ★ 编译LaTeX（始终编译设定的主文件）
Mrite._liveCompile = function() {
  var workDir = Mrite._activeWorkDir || (Mrite.STATE.settings && Mrite.STATE.settings.projectPath) || '';
  if (!workDir) return;
  if (Mrite._compiling) return;

  Mrite._saveTexContent();
  Mrite._compiling = true;
  var btn = document.getElementById('lpCompileBtn');
  if (btn) {
    btn.innerHTML = '<span class="lp-compile-spinner"></span>';
    btn.title = '编译中...';
    btn.disabled = true;
  }
  Mrite._showToast('编译中...');

  // ★ 优先用设定的主文件，否则回退到 findTexFile
  var texPath = Mrite._liveMainTex;
  var doCompile = function(tp) {
    return window.electronAPI.directCompile(tp, null, false).then(function(result) {
      Mrite._compiling = false;
      if (btn) { btn.innerHTML = _lpSvg.compile; btn.title = '编译'; btn.disabled = false; }
      if (result && result.success) {
        Mrite._showToast('编译成功');
        Mrite._imgCache = {};
        Mrite._tblCache = {};
        setTimeout(function() { Mrite._renderLivePanel(); }, 500);
      } else {
        Mrite._showToast('编译失败: ' + (result.error || '未知错误'));
      }
    });
  };

  if (texPath) {
    doCompile(texPath).catch(function(err) {
      Mrite._compiling = false;
      if (btn) { btn.innerHTML = _lpSvg.compile; btn.title = '编译'; btn.disabled = false; }
      Mrite._showToast('编译异常: ' + (err.message || err));
    });
  } else {
    window.electronAPI.findTexFile(workDir).then(function(r) {
      if (!r || !r.success || !r.texPath) throw new Error('未找到 tex 文件');
      return doCompile(r.texPath);
    }).catch(function(err) {
      Mrite._compiling = false;
      if (btn) { btn.innerHTML = _lpSvg.compile; btn.title = '编译'; btn.disabled = false; }
      Mrite._showToast('编译失败: ' + (err.message || '未找到 tex 文件'));
    });
  }
};

// ★ 代码选中功能
Mrite._attachCodeSelection = function() {
  var wrap = document.getElementById('lpPaperCodeWrap');
  if (!wrap) return;

  var oldPopup = document.getElementById('lpSelectionPopup');
  if (oldPopup) oldPopup.remove();

  wrap.addEventListener('mouseup', function() {
    setTimeout(function() {
      var selection = window.getSelection();
      var selectedText = selection.toString().trim();
      if (!selectedText || selectedText.length < 2) {
        var popup = document.getElementById('lpSelectionPopup');
        if (popup) popup.remove();
        delete Mrite._savedSelection;
        return;
      }
      // ★ 保存选中文本，点击按钮时 selection 可能已丢失
      Mrite._savedSelection = selectedText;

      var range = selection.getRangeAt(0);
      var rect = range.getBoundingClientRect();
      var wrapRect = wrap.getBoundingClientRect();

      var popup = document.getElementById('lpSelectionPopup');
      if (!popup) {
        popup = document.createElement('div');
        popup.id = 'lpSelectionPopup';
        popup.className = 'lp-selection-popup';
        wrap.appendChild(popup);
      }

      popup.style.top = (rect.top - wrapRect.top - 36) + 'px';
      popup.style.left = Math.max(0, rect.left - wrapRect.left + rect.width / 2 - 60) + 'px';
      popup.innerHTML =
        '<button class="lp-sel-btn" onclick="Mrite._addSelectionToChat()">添加到对话</button>' +
        '<button class="lp-sel-btn" onclick="Mrite._copySelection()">复制</button>';
    }, 10);
  });
};

// ★ 添加选中内容到对话（气泡格式）
Mrite._addSelectionToChat = function() {
  var selectedText = Mrite._savedSelection || '';
  if (!selectedText) return;

  var input = document.getElementById('modifyInput');
  if (input) {
    var preview = selectedText.length > 50 ? selectedText.substring(0, 50) + '...' : selectedText;
    var marker = '【LaTeX: ' + preview + '】';
    if (input.value.indexOf(marker) === -1) {
      input.value = marker + ' ' + input.value;
    }
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  }

  var popup = document.getElementById('lpSelectionPopup');
  if (popup) popup.remove();
  delete Mrite._savedSelection;
};

// ★ 复制选中内容
Mrite._copySelection = function() {
  var selectedText = Mrite._savedSelection || '';
  if (!selectedText) return;

  navigator.clipboard.writeText(selectedText).then(function() {
    Mrite._showToast('已复制');
  });

  var popup = document.getElementById('lpSelectionPopup');
  if (popup) popup.remove();
  delete Mrite._savedSelection;
};

// ★ 添加文件引用到对话（气泡格式）
Mrite._liveInsertToChat = function() {
  var list, curIdx;
  if (Mrite._liveTab === 'image') { list = Mrite._liveImgs || []; curIdx = Mrite._liveImgIdx; }
  else if (Mrite._liveTab === 'code') { list = Mrite._liveCodes || []; curIdx = Mrite._liveCodeIdx; }
  else { list = Mrite._liveTbls || []; curIdx = Mrite._liveTblIdx; }
  var file = list[curIdx];
  if (!file) return;
  var relPath = file.name;
  var workDir = Mrite._activeWorkDir || (Mrite.STATE.settings && Mrite.STATE.settings.projectPath) || '';
  if (workDir && file.path) {
    var normalizedWork = workDir.replace(/\\/g, '/');
    var normalizedFile = file.path.replace(/\\/g, '/');
    if (normalizedFile.startsWith(normalizedWork)) {
      relPath = normalizedFile.substring(normalizedWork.length).replace(/^\//, '');
    }
  }
  var type = Mrite._liveTab === 'image' ? '图片' : Mrite._liveTab === 'code' ? '代码' : '表格';
  var input = document.getElementById('modifyInput');
  if (!input) return;
  var marker = '【' + type + ': ' + relPath + '】';
  if (input.value.indexOf(marker) !== -1) { Mrite._showToast('已添加过该引用'); return; }
  input.value = marker + ' ' + input.value;
  input.focus();
  input.setSelectionRange(input.value.length, input.value.length);
};

Mrite._livePdfRefresh = function() {
  Mrite._imgCache = {};
  Mrite._tblCache = {};
  Mrite._renderLivePanel();
};

// 右侧预览
Mrite._renderLivePreview = function() {
  var preview = document.getElementById('lpPreview');
  if (!preview) return;

  // ★ 论文 tab：PDF 预览
  if (Mrite._liveTab === 'paper') {
    Mrite._renderPaperPreview(preview);
    return;
  }

  var cur = Mrite._liveGetList();
  if (!cur.list.length) { preview.innerHTML = '<div class="lp-empty">无内容</div>'; return; }
  var file = cur.list[cur.idx];
  if (!file) { preview.innerHTML = '<div class="lp-empty">无内容</div>'; return; }

  var fileName = (file.name || '').replace(/\.[^.]+$/, '');
  var navHtml = '<div class="lp-preview-nav">';
  navHtml += '<div class="lp-nav-left">';
  if (cur.list.length > 1) {
    navHtml += '<button class="lp-nav-btn" onclick="Mrite._liveNav(-1)"' + (cur.idx <= 0 ? ' disabled' : '') + '>' + _lpSvg.prev + '</button>';
    navHtml += '<span class="lp-nav-idx">' + (cur.idx + 1) + '/' + cur.list.length + '</span>';
    navHtml += '<button class="lp-nav-btn" onclick="Mrite._liveNav(1)"' + (cur.idx >= cur.list.length - 1 ? ' disabled' : '') + '>' + _lpSvg.next + '</button>';
  }
  navHtml += '</div>';
  navHtml += '<div class="lp-nav-center">' + escHtml(fileName) + '</div>';
  navHtml += '<div class="lp-nav-right">';
  navHtml += '<button class="lp-action-btn" onclick="Mrite._liveInsertToChat()" title="添加到对话">' + _lpSvg.insert + '</button>';
  navHtml += '<button class="lp-action-btn" onclick="Mrite._liveRefreshFile()" title="刷新">' + _lpSvg.refresh + '</button>';
  navHtml += '<button class="lp-action-btn" onclick="Mrite._liveDownload()" title="下载">' + _lpSvg.download + '</button>';
  navHtml += '<button class="lp-action-btn" onclick="Mrite._liveZoom()" title="放大">' + _lpSvg.zoom + '</button>';
  navHtml += '</div></div>';

  if (Mrite._liveTab === 'image') {
    // ★ 缓存已加载的图片，避免重复读取
    if (!Mrite._imgCache) Mrite._imgCache = {};
    var cached = Mrite._imgCache[file.path];
    if (cached) {
      // 已缓存 → 直接显示，不显示加载中
      preview.innerHTML = navHtml + '<div class="lp-preview-body" id="lpPreviewBody"><img src="' + cached + '" class="lp-preview-img" onerror="Mrite._onPreviewImgError(this,\'' + escAttr(file.path) + '\')"></div>';
    } else {
      preview.innerHTML = navHtml + '<div class="lp-preview-body" id="lpPreviewBody"><div class="lp-loading">加载中…</div></div>';
      Mrite._loadPreviewImage(file.path, 0);
    }
  } else if (Mrite._liveTab === 'table') {
    // ★ 缓存已加载的表格
    if (!Mrite._tblCache) Mrite._tblCache = {};
    var tblCached = Mrite._tblCache[file.path];
    if (tblCached) {
      preview.innerHTML = navHtml + '<div class="lp-preview-body" id="lpPreviewBody">' + tblCached + '</div>';
    } else {
      preview.innerHTML = navHtml + '<div class="lp-preview-body" id="lpPreviewBody"><div class="lp-loading">加载中…</div></div>';
      window.electronAPI.readFileContent(file.path).then(function(r) {
        var body = document.getElementById('lpPreviewBody');
        if (!body) return;
        if (r && r.success && r.text) {
          var lines = r.text.split('\n').filter(function(l) { return l.trim(); });
          if (!lines.length) { body.innerHTML = '<div class="lp-empty">空文件</div>'; return; }
          var max = Math.min(lines.length, 20);
          var t = '<div class="lp-table-wrap"><table class="lp-tbl"><thead><tr>';
          lines[0].split(',').forEach(function(c) { t += '<th>' + escHtml(c.trim()) + '</th>'; });
          t += '</tr></thead><tbody>';
          for (var i = 1; i < max; i++) { t += '<tr>'; lines[i].split(',').forEach(function(c) { t += '<td>' + escHtml(c.trim()) + '</td>'; }); t += '</tr>'; }
          t += '</tbody></table></div>';
          Mrite._tblCache[file.path] = t;
          body.innerHTML = t;
        } else { body.innerHTML = '<div class="lp-empty">加载失败</div>'; }
      }).catch(function() { var b = document.getElementById('lpPreviewBody'); if (b) b.innerHTML = '<div class="lp-empty">加载失败</div>'; });
    }
  } else {
    // 代码预览
    preview.innerHTML = navHtml + '<div class="lp-preview-body" id="lpPreviewBody"><div class="lp-loading">加载中…</div></div>';
    window.electronAPI.readFileContent(file.path).then(function(r) {
      var body = document.getElementById('lpPreviewBody');
      if (!body) return;
      if (r && r.success && r.text) {
        body.innerHTML = '<pre class="lp-code"><code>' + escHtml(r.text) + '</code></pre>';
      } else { body.innerHTML = '<div class="lp-empty">加载失败</div>'; }
    }).catch(function() { var b = document.getElementById('lpPreviewBody'); if (b) b.innerHTML = '<div class="lp-empty">加载失败</div>'; });
  }
};

// ★ 图片加载（带重试）
Mrite._loadPreviewImage = function(filePath, retryCount) {
  var MAX_RETRIES = 3;
  window.electronAPI.readFileContent(filePath).then(function(r) {
    var body = document.getElementById('lpPreviewBody');
    if (!body) return;
    if (r && r.success && r.dataUrl) {
      Mrite._imgCache[filePath] = r.dataUrl;
      body.innerHTML = '<img src="' + r.dataUrl + '" class="lp-preview-img" onerror="Mrite._onPreviewImgError(this,\'' + escAttr(filePath) + '\')">';
    } else if (r && r.error) {
      body.innerHTML = '<div class="lp-empty">' + escHtml(r.error) + '</div>';
    } else if (retryCount < MAX_RETRIES) {
      setTimeout(function() { Mrite._loadPreviewImage(filePath, retryCount + 1); }, 500);
    } else {
      body.innerHTML = '<div class="lp-empty">加载失败（已重试' + MAX_RETRIES + '次）</div>';
    }
  }).catch(function() {
    var body = document.getElementById('lpPreviewBody');
    if (!body) return;
    if (retryCount < MAX_RETRIES) {
      setTimeout(function() { Mrite._loadPreviewImage(filePath, retryCount + 1); }, 500);
    } else {
      body.innerHTML = '<div class="lp-empty">加载失败</div>';
    }
  });
};

// ★ 图片加载失败时的处理（缓存的图片加载失败 → 清除缓存并重试）
Mrite._onPreviewImgError = function(imgEl, filePath) {
  if (Mrite._imgCache) delete Mrite._imgCache[filePath];
  var body = document.getElementById('lpPreviewBody');
  if (!body) return;
  body.innerHTML = '<div class="lp-loading">重新加载中…</div>';
  Mrite._loadPreviewImage(filePath, 0);
};

Mrite._liveNav = function(delta) {
  var cur = Mrite._liveGetList();
  if (cur.list.length <= 1) return;
  cur.setIdx(Math.max(0, Math.min(cur.list.length - 1, cur.idx + delta)));
  Mrite._renderLivePanel();
};

// 切换 tab
Mrite._liveSwitchTab = function(tab) {
  Mrite._liveTab = tab;
  // 论文模式：切换面板高度
  var panel = document.getElementById('liveResultPanel');
  if (panel) panel.classList.toggle('lp-paper-mode', tab === 'paper');
  Mrite._renderLivePanel();
};

// 下载当前文件
Mrite._liveDownload = function() {
  var list = Mrite._liveTab === 'image' ? (Mrite._liveImgs || []) : (Mrite._liveTbls || []);
  var curIdx = Mrite._liveTab === 'image' ? Mrite._liveImgIdx : Mrite._liveTblIdx;
  var file = list[curIdx];
  if (!file) return;
  window.electronAPI.saveFileDialog(file.name).then(function(result) {
    if (result && !result.canceled && result.filePath) {
      window.electronAPI.copyFileToPath(file.path, result.filePath).then(function(r) {
        if (r && r.success) Mrite._showToast('已下载');
        else Mrite._showToast('下载失败');
      });
    }
  });
};

// 放大预览（全屏遮罩）
Mrite._liveZoom = function() {
  var list = Mrite._liveTab === 'image' ? (Mrite._liveImgs || []) : (Mrite._liveTbls || []);
  var curIdx = Mrite._liveTab === 'image' ? Mrite._liveImgIdx : Mrite._liveTblIdx;
  var file = list[curIdx];
  if (!file) return;
  var overlay = document.createElement('div');
  overlay.className = 'lp-zoom-overlay';
  overlay.onclick = function() { overlay.remove(); };
  var content = document.createElement('div');
  content.className = 'lp-zoom-content';
  content.onclick = function(e) { e.stopPropagation(); };
  if (Mrite._liveTab === 'image') {
    content.innerHTML = '<div class="lp-loading">加载中…</div>';
    overlay.appendChild(content);
    document.body.appendChild(overlay);
    window.electronAPI.readFileContent(file.path).then(function(r) {
      if (r && r.success && r.dataUrl) {
        content.innerHTML = '<img src="' + r.dataUrl + '" class="lp-zoom-img" onerror="this.parentElement.innerHTML=\'<div class=\\\'lp-empty\\\'>图片加载失败</div>\'">';
      } else {
        content.innerHTML = '<div class="lp-empty">' + (r && r.error ? r.error : '加载失败') + '</div>';
      }
    }).catch(function() { content.innerHTML = '<div class="lp-empty">加载失败</div>'; });
  } else {
    content.innerHTML = '<div class="lp-loading">加载中…</div>';
    overlay.appendChild(content);
    document.body.appendChild(overlay);
    window.electronAPI.readFileContent(file.path).then(function(r) {
      if (r && r.success && r.text) {
        var lines = r.text.split('\n').filter(function(l) { return l.trim(); });
        var t = '<div class="lp-zoom-tbl-wrap"><table class="lp-tbl"><thead><tr>';
        lines[0].split(',').forEach(function(c) { t += '<th>' + escHtml(c.trim()) + '</th>'; });
        t += '</tr></thead><tbody>';
        for (var i = 1; i < lines.length; i++) {
          t += '<tr>';
          lines[i].split(',').forEach(function(c) { t += '<td>' + escHtml(c.trim()) + '</td>'; });
          t += '</tr>';
        }
        t += '</tbody></table></div>';
        content.innerHTML = t;
      }
    });
  }
  // ESC 关闭
  var handler = function(e) { if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', handler); } };
  document.addEventListener('keydown', handler);
};

Mrite._buildSolveCompleteCard = function(sourceList) {
  // ★ 使用实时结果面板的数据统计产物（更准确）
  var stats = {
    code: (Mrite._liveCodes || []).length,
    tex: 0, // tex 文件不在实时面板中，从聊天记录统计
    csv: (Mrite._liveTbls || []).length,
    image: (Mrite._liveImgs || []).length,
    md: 0
  };

  // 从聊天记录统计 tex 文件
  var list = Array.isArray(sourceList) ? sourceList : (Array.isArray(Mrite.modifyChatHistory) ? Mrite.modifyChatHistory : []);
  var seenTex = {};
  list.forEach(function(m) {
    if (!m || !m._texFile) return;
    if (seenTex[m._texFile]) return;
    seenTex[m._texFile] = true;
    stats.tex++;
  });
  var cs = Mrite._modifyCompileState || {};
  var compileText = cs.ran ? (cs.ok ? 'PDF 编译成功' : 'PDF 编译需检查') : '论文文件已生成';
  var artifactText = stats.code + ' 个代码 · ' + stats.csv + ' 份数据表 · ' + stats.image + ' 张图表';
  var totalFiles = stats.code + stats.tex + stats.csv + stats.image + stats.md;
  var S = Mrite.STATE || {};
  var durationMs = S._lastDurationMs || (Mrite._getTotalDurationMs ? Mrite._getTotalDurationMs() : 0);
  var durationText = durationMs ? Mrite._formatDurationShort(durationMs) : '未记录';
  var inputTokens = S.tokenInput || 0;
  var outputTokens = S.tokenOutput || 0;
  var totalTokens = inputTokens + outputTokens;
  return '' +
    '<div class="solve-report">' +
      '<div class="solve-report-title">求解结果报告</div>' +
      '<table class="solve-report-table">' +
        '<thead><tr><th>类别</th><th>数量</th><th>指标</th><th>数值</th></tr></thead>' +
        '<tbody>' +
          '<tr><td>归档产物</td><td class="num">' + totalFiles + '</td><td>耗时</td><td class="val">' + durationText + '</td></tr>' +
          '<tr><td>求解代码</td><td class="num">' + stats.code + '</td><td>输入Token</td><td class="val">' + Mrite._formatTokenCount(inputTokens) + '</td></tr>' +
          '<tr><td>结果表格</td><td class="num">' + stats.csv + '</td><td>输出Token</td><td class="val">' + Mrite._formatTokenCount(outputTokens) + '</td></tr>' +
          '<tr><td>可视化图</td><td class="num">' + stats.image + '</td><td>总Token</td><td class="val">' + Mrite._formatTokenCount(totalTokens) + '</td></tr>' +
        '</tbody>' +
      '</table>' +
      '<div class="solve-report-actions">' +
        '<button class="solve-report-btn" onclick="Mrite._enterModifyMode()">进入修改模式</button>' +
      '</div>' +
    '</div>';
};

Mrite._formatTokenCount = function(n) {
  n = Number(n || 0);
  if (!n) return '0';
  if (n >= 1000000) return (n / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  return String(n);
};

Mrite._formatDurationShort = function(ms) {
  var sec = Math.max(0, Math.round(Number(ms || 0) / 1000));
  var h = Math.floor(sec / 3600);
  var m = Math.floor((sec % 3600) / 60);
  var s = sec % 60;
  if (h) return h + '时' + m + '分';
  if (m) return m + '分' + s + '秒';
  return s + '秒';
};

Mrite.handleAgentEvent = function(event) {
  var S = Mrite.STATE;
  var isModifyTask = (S.taskType === 'modify');
  var isSolveTask = (S.taskType === 'solve');

  // ★ 忽略旧任务的事件（加载新任务后旧事件可能还在到达）
  if (event.type === 'state' && event.payload && event.payload.status === 'running') {
    if (Mrite._eventGeneration !== undefined && Mrite._eventGeneration !== (Mrite._loadGeneration || 0)) {
      return; // 旧任务的事件，丢弃
    }
    Mrite._eventGeneration = Mrite._loadGeneration || 0;
  }

  switch (event.type) {
    case 'state':
      if (event.payload.status === 'running') {
        S.runStatus = 'running';
        S.taskStartTime = Date.now();
        S._solveDoneHandled = false;
        Mrite._seenStages = {};
        Mrite._currentStage = 'idle';
        Mrite._problemCount = 0;
        Mrite._solvedProblems = 0;
        Mrite._activeWorkDir = event.payload.workDir || '';
        // ★ 首次运行才清空，继续/恢复模式保留已有数据
        var isResuming = (S._prevProgress > 0) || (S._lastDurationMs > 0) || (S.taskSteps && S.taskSteps.length > 0);
        if (!isResuming) {
          S.taskSteps = [];
          S.toolOps = [];
          S.tokenInput = 0;
          S.tokenOutput = 0;
          Mrite._shownFiles = {};
        }
        Mrite._renderToolOps();
        // ★ 确保轮询在运行
        Mrite._scanLiveNow();
        Mrite._startGlobalLiveScan();
        // ★ 显示实时结果面板
        var lp = document.getElementById('liveResultPanel');
        if (lp) lp.classList.add('lp-visible');
        if (isSolveTask) {
          // 不重置进度条（_startProgress 已设为 5%）
          Mrite.renderStepList();
          // ★ 显示开始运行提示
          Mrite._showStartMessage();
        }
        Mrite.updateButtonStates(); Mrite.updateStatusIndicator();
        Mrite._syncWsState({ status: 'running', runStartedAt: new Date().toISOString() });
      } else if (event.payload.status === 'done') {
        if (isModifyTask) {
          S.runStatus = 'done';
          S.taskType = 'modify';
          Mrite.saveSettings();
          Mrite._modifyOnComplete();
          Mrite._syncWsState({ status: 'modify', runCompletedAt: new Date().toISOString() });
        } else if (isSolveTask) {
          if (S._solveDoneHandled) break;
          S._solveDoneHandled = true;
          S.runStatus = 'done';
          S.taskType = 'solve';
          Mrite.saveSettings();
          Mrite._finishProgress();
          Mrite._showCompletionSummary(event.payload || {});
          Mrite.onTaskComplete();
          Mrite._syncWsState({ status: 'completed', runCompletedAt: new Date().toISOString() });
        }
      } else if (event.payload.status === 'error') {
        // ★ 兜底处理：如果 case 'error' 已处理，这里只更新状态
        if (S.runStatus !== 'error') {
          S.runStatus = 'error';
          if (Mrite._clearPendingMessages) Mrite._clearPendingMessages();
          Mrite._stopHeartbeat();
          Mrite._stopElapsedTimer();
          Mrite._stopGlobalLiveScan();
          var stateErrMsg = event.payload.error || '未知错误';
          // 格式化错误消息
          var formattedStateErr = stateErrMsg.includes('**') ? stateErrMsg : '❌ **任务中断**\n\n' + stateErrMsg;
          try { Mrite._modifyAddAiMsg(formattedStateErr); } catch(e) {}
        }
        // ★ 保存耗时
        S._lastDurationMs = Mrite._getTotalDurationMs ? Mrite._getTotalDurationMs() : 0;
        S.taskStartTime = null;
        // ★ 确保发送按钮复位（兜底，防止 case 'error' 未正确处理时按钮卡住）
        if (S.taskType === 'modify') Mrite._setSendButtonStop(false);
        Mrite.updateButtonStates(); Mrite.updateStatusIndicator();
        Mrite._syncWsState({ status: 'error', errorMessage: event.payload.error || '' });
      } else if (event.payload.status === 'idle') {
        if (!isModifyTask && !isSolveTask) S.runStatus = 'idle';
        Mrite.updateButtonStates(); Mrite.updateStatusIndicator();
      }
      break;

    // ★ 流式文本增量（token 级流式输出）
    case 'stream_text':
      if (!event.payload.content) break;
      {
        var deltaType = event.payload.deltaType || 'text';
        var streamContent = event.payload.content;

        // ★ 更新流式状态（用于操作记录显示）
        if (deltaType === 'thinking') {
          S._thinkingActive = true;
          S._streamingText = false;
          // 查找或创建思考块
          var thinkingBlock = null;
          for (var i = Mrite.modifyChatHistory.length - 1; i >= 0; i--) {
            if (Mrite.modifyChatHistory[i]._thinking && Mrite.modifyChatHistory[i]._streaming) {
              thinkingBlock = Mrite.modifyChatHistory[i];
              break;
            }
          }
          if (thinkingBlock) {
            thinkingBlock.text += streamContent;
          } else {
            Mrite.modifyChatHistory.push({
              role: 'ai',
              text: '💭 *思考中...*\n' + streamContent,
              _thinking: true,
              _streaming: true
            });
          }
        }
        // ★ 普通文本
        else {
          S._thinkingActive = false;
          S._streamingText = true;
          var streamLast = Mrite.modifyChatHistory[Mrite.modifyChatHistory.length - 1];
          if (streamLast && streamLast.role === 'ai' && streamLast._streaming && !streamLast._thinking) {
            streamLast.text += streamContent;
          } else {
            // 清除旧消息的 _streaming（确保只有一个光标）
            for (var si = 0; si < Mrite.modifyChatHistory.length; si++) {
              if (Mrite.modifyChatHistory[si]._streaming) delete Mrite.modifyChatHistory[si]._streaming;
            }
            Mrite.modifyChatHistory.push({ role: 'ai', text: streamContent, _streaming: true });
          }
        }

        // ★ 防抖渲染：16ms（一帧）内合并多次更新
        if (Mrite._streamRenderTimer) cancelAnimationFrame(Mrite._streamRenderTimer);
        Mrite._streamRenderTimer = requestAnimationFrame(function() {
          Mrite._modifyRenderChat();
          Mrite._streamRenderTimer = null;
        });
        // ★ 操作记录只在流式开始/结束时更新，不在每个 token 时更新（避免闪烁）
        if (!Mrite._toolOpsStreamShown) {
          Mrite._toolOpsStreamShown = true;
          Mrite._renderToolOps();
        }
      }
      break;

    case 'text':
      if (!event.payload.content) break;
      if (!String(event.payload.content).trim()) break;
      // ★ 流式模式下，text 事件是完整块，检查是否已被 stream_text 处理过
      {
        var lastMsg = Mrite.modifyChatHistory[Mrite.modifyChatHistory.length - 1];
        // 如果最后一条消息正在流式且内容已包含，则跳过（避免重复）
        if (lastMsg && lastMsg.role === 'ai' && lastMsg._streaming) {
          // 已经在流式处理中，不需要再添加
          break;
        }
        // 非流式模式或流式已结束，正常处理
        // 清除旧消息的 _streaming（确保只有一个光标）
        for (var ti = 0; ti < Mrite.modifyChatHistory.length; ti++) {
          if (Mrite.modifyChatHistory[ti]._streaming) delete Mrite.modifyChatHistory[ti]._streaming;
        }
        Mrite.modifyChatHistory.push({ role: 'ai', text: event.payload.content, _streaming: true });
        Mrite._modifyRenderChat();
        Mrite._saveChatNow();
      }
      break;

    case 'tool_use':
      // ★ 每次工具调用更新进度条
      Mrite._tickProgress();

      var label = Mrite.formatToolLabel(event.payload.toolName, event.payload.input);
      if (!Array.isArray(S.taskSteps)) S.taskSteps = [];
      S.taskSteps.push({ name: label, status: 'pending', _started: false, _startTime: Date.now() });

      // ★ 记录当前 Bash 命令，供 tool_result 阶段判断是否需要扫描新文件
      if (event.payload.toolName === 'Bash' && event.payload.input) {
        Mrite._lastBashCommand = event.payload.input.command || '';
      } else {
        Mrite._lastBashCommand = '';
      }

      Mrite._trackToolOp(event.payload.toolName, event.payload.input, label);

      // ★ 文件修改后自动刷新预览
      if ((event.payload.toolName === 'Write' || event.payload.toolName === 'Edit') && event.payload.input) {
        var modPath = event.payload.input.file_path || event.payload.input.filePath || '';
        if (modPath && Mrite._lastPreviewedFile && modPath === Mrite._lastPreviewedFile.path) {
          setTimeout(function() { Mrite._refreshCurrentPreview(); }, 500);
        }
      }

      // ★ 求解模式：在对话窗口显示工具调用详情
      if (isSolveTask) {
        var toolDetail = Mrite._formatToolDetail(event.payload.toolName, event.payload.input);
        if (toolDetail) {
          Mrite.modifyChatHistory.push({ role: 'system', text: toolDetail, _isToolCall: true });
          Mrite._modifyRenderChat();
          Mrite._saveChatNow();
        }
      }

      if (isSolveTask) {
        var input = event.payload.input || {};
        var fp = input.file_path || input.filePath || '';
        if (!Mrite._seenStages) Mrite._seenStages = {};

        // ★ 阶段检测（用于 UI 状态显示，进度条现在基于时间自动更新）
        if (fp) {
          // 检测读题阶段
          if ((fp.indexOf('题目/') !== -1 || fp.indexOf('数据/') !== -1) && !Mrite._seenStages['reading']) {
            Mrite._seenStages['reading'] = true;
          }

          // 检测问题数量
          var probMatch = fp.match(/问题[一二三四五六七八九十\d]+/);
          if (probMatch) {
            var probKey = probMatch[0];
            if (!Mrite._seenStages[probKey]) {
              Mrite._seenStages[probKey] = true;
              Mrite._problemCount = Math.max(Mrite._problemCount, Object.keys(Mrite._seenStages).filter(function(k) { return k.indexOf('问题') === 0; }).length);
            }
          }

          // 检测写论文阶段
          if (fp.indexOf('论文/') !== -1 && fp.indexOf('.tex') !== -1 && !Mrite._seenStages['paper']) {
            Mrite._seenStages['paper'] = true;
          }
        }

        // 编译检测
        if (event.payload.toolName === 'Bash' && input.command && input.command.indexOf('xelatex') !== -1) {
          if (!Mrite._seenStages['compile']) {
            Mrite._seenStages['compile'] = true;
            // ★ 显示编译中状态
            Mrite._showCompilingStatus();
          }
        }

        // 文件检测由全局轮询处理，此处不再重复
        Mrite._modifyRenderChat();
      }

      if (isModifyTask) {
        Mrite._modifyCheckCompileStart(event.payload.toolName, event.payload.input);
      }
      if (isSolveTask) {
        Mrite.renderStepList();
        // ★ 不再用 tool_use 次数计算进度，改为阶段进度
      }

      if (event.payload.input && (event.payload.input.file_path || event.payload.input.filePath)) {
        Mrite._syncWsState({
          lastToolOp: {
            tool: event.payload.toolName,
            path: event.payload.input.file_path || event.payload.input.filePath,
            timestamp: new Date().toISOString()
          }
        });
      }
      Mrite._saveRunStateToWs();
      break;

    case 'tool_result':
      // 找到第一个未开始的步骤，标记为已完成
      var firstPending = null;
      for (var si = 0; si < S.taskSteps.length; si++) {
        if (!S.taskSteps[si]._started) { firstPending = S.taskSteps[si]; break; }
      }
      if (firstPending) { firstPending._started = true; firstPending.status = 'completed'; }
      var ops = S.toolOps;
      if (ops.length) {
        var lastOp = ops[ops.length - 1];
        lastOp._done = true;
        Mrite._renderToolOps();
      }

      // ★ 求解模式：在对话窗口显示工具输出
      if (isSolveTask && event.payload) {
        var output = event.payload.output || event.payload.content || '';
        if (typeof output === 'object') output = JSON.stringify(output);
        if (output && output.trim()) {
          // 截断过长的输出（增加显示量）
          if (output.length > 2000) output = output.substring(0, 2000) + '\n...（输出已截断）';
          // ★ 隐藏绝对路径，只显示文件名
          var workDir = Mrite.STATE.settings.projectPath || '';
          if (workDir) {
            output = output.split(workDir).join('.');
            // 也处理 workspace 目录
            var wsDir = workDir.replace(/\\\\/g, '/').replace(/[^/]*$/, '');
            if (wsDir) output = output.split(wsDir).join('');
          }
          Mrite.modifyChatHistory.push({ role: 'system', text: '📤 ' + output, _isToolResult: true });
          Mrite._modifyRenderChat();
          Mrite._saveChatNow();
        }
      }

      // 文件检测由全局轮询处理
      if (isModifyTask) {
        Mrite._modifyCheckCompileResult(event.payload);
      }
      if (isSolveTask) Mrite.renderStepList();
      break;

    case 'tokens':
      S.tokenInput = event.payload.input; S.tokenOutput = event.payload.output;
      break;

    case 'done':
      Mrite._stopGlobalLiveScan();
      if (isModifyTask) {
        S.runStatus = 'done';
        Mrite.saveSettings();
        S.taskSteps.forEach(function(s) { if (s._started && s.status !== 'completed') s.status = 'completed'; });
        // ★ 清空文件缓存，确保下次显示最新内容
        Mrite._imgCache = {};
        Mrite._tblCache = {};
        Mrite._scanLiveNow();
        Mrite._renderToolOps();
        var modDur = Mrite._getTotalDurationMs ? Mrite._getTotalDurationMs() : (Mrite.STATE.taskStartTime ? (Date.now() - Mrite.STATE.taskStartTime) : 0);
        window.electronAPI.recordUsage({
          input: Mrite.STATE.tokenInput, output: Mrite.STATE.tokenOutput,
          durationMs: modDur, model: Mrite.STATE.settings.apiModel || '',
          workspaceName: '', status: 'modify'
        });
        try { window.electronAPI.reportUsage({ date: new Date().toISOString().split('T')[0], inputTokens: Mrite.STATE.tokenInput, outputTokens: Mrite.STATE.tokenOutput, tasks: 1, durationMs: modDur }); } catch(e) {}
        try { window.electronAPI.reportTaskLog({ model: Mrite.STATE.settings.apiModel || '', inputTokens: Mrite.STATE.tokenInput, outputTokens: Mrite.STATE.tokenOutput, durationMs: modDur, status: 'modify', startedAt: Mrite.STATE.taskStartTime ? new Date(Mrite.STATE.taskStartTime).toISOString() : '', finishedAt: new Date().toISOString() }); } catch(e) {}
        Mrite._modifyOnComplete();
      } else if (isSolveTask) {
        if (S._solveDoneHandled) break;
        S._solveDoneHandled = true;
        S.runStatus = 'done';
        S.taskType = 'solve';
        Mrite.saveSettings();
        Mrite.saveHistoryEntry(event.payload?.outputTimestampDir);
        S.taskSteps.forEach(function(s) { if (s._started && s.status !== 'completed') s.status = 'completed'; });
        if (S.taskSteps.length > 0) S.taskSteps.push({ name: '论文生成完成', status: 'completed', _started: true });
        Mrite._finishProgress();
        // ★ 清理所有流式光标
        Mrite.modifyChatHistory.forEach(function(m) { if (m._streaming) delete m._streaming; });
        S._streamingText = false;
        S._thinkingActive = false;
        // ★ 清空文件缓存，确保下次显示最新内容
        Mrite._imgCache = {};
        Mrite._tblCache = {};
        Mrite._scanLiveNow();
        Mrite.renderStepList();
        Mrite._renderToolOps();
        // ★ 验证是否真正完成：检查工作空间中是否有 PDF 文件
        var workDir = Mrite._activeWorkDir || event.payload?.outputTimestampDir || '';
        Mrite._verifyTaskCompletion(workDir).then(function(reallyDone) {
          if (reallyDone) {
            Mrite._showCompletionSummary(event.payload);
            Mrite.onTaskComplete();
          } else {
            // 没有 PDF → 任务未真正完成，标记为中断
            Mrite.modifyChatHistory.push({ role: 'ai', text: '⚠️ 任务已结束，但未检测到生成的 PDF 论文。可能在编译阶段被中断。', _error: true });
            Mrite._modifyRenderChat();
            Mrite._syncWsState({ status: 'interrupted', errorMessage: '未检测到 PDF 输出' });
            Mrite.updateButtonStates(); Mrite.updateStatusIndicator();
          }
        });
        var dur = Mrite._getTotalDurationMs ? Mrite._getTotalDurationMs() : (Mrite.STATE.taskStartTime ? (Date.now() - Mrite.STATE.taskStartTime) : 0);
        window.electronAPI.recordUsage({
          input: Mrite.STATE.tokenInput, output: Mrite.STATE.tokenOutput,
          durationMs: dur, model: Mrite.STATE.settings.apiModel || '',
          workspaceName: event.payload?.outputTimestampDir || '', status: 'completed'
        });
        try { window.electronAPI.reportUsage({ date: new Date().toISOString().split('T')[0], inputTokens: Mrite.STATE.tokenInput, outputTokens: Mrite.STATE.tokenOutput, tasks: 1, durationMs: dur }); } catch(e) {}
        try { window.electronAPI.reportTaskLog({ model: Mrite.STATE.settings.apiModel || '', inputTokens: Mrite.STATE.tokenInput, outputTokens: Mrite.STATE.tokenOutput, durationMs: dur, status: 'completed', startedAt: Mrite.STATE.taskStartTime ? new Date(Mrite.STATE.taskStartTime).toISOString() : '', finishedAt: new Date().toISOString() }); } catch(e) {}
        window.electronAPI.updateWsState({ status: 'completed', runCompletedAt: new Date().toISOString() });
        Mrite._syncAndRefresh();
      }
      break;

    case 'error':
      Mrite._stopFileWatcher();
      Mrite._stopGlobalLiveScan();
      if (S._userTerminated) {
        S._userTerminated = false;
        break;
      }
      S.runStatus = 'error';
      if (Mrite._clearPendingMessages) Mrite._clearPendingMessages();
      Mrite._stopHeartbeat();
      Mrite._stopElapsedTimer();
      var act2 = S.taskSteps.filter(function(s) { return !s._started && s.status === 'pending'; });
      if (act2.length) { act2[act2.length - 1].status = 'error'; act2[act2.length - 1]._started = true; }
      var errMsg = event.payload.message || '连接中断';
      // ★ 提取错误原因的第一行作为 toast（简洁提示，移除 Markdown 标记）
      var firstLine = errMsg.split('\n')[0];
      var toastMsg = firstLine.replace(/[❌⚠️⏱️🔧🌐⚙️🔒📊🔄]/g, '').replace(/\*\*/g, '').trim();
      if (toastMsg.length > 50) toastMsg = toastMsg.slice(0, 50) + '…';
      Mrite._showToast(toastMsg || '任务出错');
      // ★ 完整错误消息（包含原因和解决方法）显示在聊天区
      try { Mrite._modifyAddAiMsg(errMsg); } catch(e) {}
      Mrite._syncWsState({ status: 'error', errorMessage: errMsg });
      if (isModifyTask) {
        Mrite._modifyOnError(errMsg);
        // ★ 兜底：确保发送按钮始终复位（防止 _modifyOnError 内部异常导致跳过）
        Mrite._setSendButtonStop(false);
      } else if (isSolveTask) {
        // ★ 清理所有流式光标
        Mrite.modifyChatHistory.forEach(function(m) { if (m._streaming) delete m._streaming; });
        S._streamingText = false;
        S._thinkingActive = false;
        if (!S.taskSteps.length) {
          S.taskSteps.push({ name: '任务异常中断', status: 'error', _started: true });
        }
        Mrite.renderStepList();
        var errBar = document.querySelector('#progressBarFill');
        if (errBar) errBar.classList.add('error');
        // 格式化错误消息（如果已经是格式化的则直接使用）
        var formattedSolveErr = errMsg.includes('**') ? errMsg : '❌ **任务中断**\n\n' + errMsg;
        Mrite.modifyChatHistory.push({ role: 'ai', text: formattedSolveErr, _error: true });
        try { Mrite._modifyRenderChat(); } catch(e) {}
        var errDur = S.taskStartTime ? (Date.now() - S.taskStartTime) : 0;
        try { window.electronAPI.recordUsage({ input: S.tokenInput, output: S.tokenOutput, durationMs: errDur, model: S.settings.apiModel || '', workspaceName: '', status: 'error' }); } catch(e) {}
      }
      // ★ 统一兜底：无论何种任务类型，都确保按钮状态正确更新
      Mrite.updateButtonStates(); Mrite.updateStatusIndicator();
      break;

    // ★ 文件更新事件：实时接收新生成的图片和表格
    case 'file_update':
      var fileData = event.payload;
      if (!fileData || !fileData.name) break;

      console.log('[LivePanel] 收到文件更新:', fileData.name, fileData.type, 'size:', fileData.size);

      // ★ 文件大小稳定性检查：统一处理所有文件类型
      // 文件过小（可能还在写入中）→ 不丢弃，延迟重试
      if (fileData.size !== undefined && fileData.size < 100) {
        if (!Mrite._pendingSizes) Mrite._pendingSizes = {};
        var retryCount = Mrite._pendingSizes[fileData.path] || 0;
        if (retryCount < 5) {
          Mrite._pendingSizes[fileData.path] = retryCount + 1;
          console.log('[LivePanel] 文件过小，延迟重试 (' + (retryCount + 1) + '/5):', fileData.name, fileData.size);
          setTimeout(function() {
            if (Mrite._activeWorkDir) Mrite._scanLiveNow();
          }, 600);
        } else {
          // 重试5次后放弃
          delete Mrite._pendingSizes[fileData.path];
          console.log('[LivePanel] 文件过小，已达最大重试次数，跳过:', fileData.name);
        }
        break;
      }
      // 文件已经足够大，清除重试记录
      if (Mrite._pendingSizes) delete Mrite._pendingSizes[fileData.path];

      // 确保面板可见
      var lpPanel = document.getElementById('liveResultPanel');
      if (lpPanel && !lpPanel.classList.contains('lp-visible')) {
        lpPanel.classList.add('lp-visible');
      }

      // ★ 图片：额外的大小稳定性检查
      if (fileData.type === 'image') {
        if (!Mrite._pendingImgSizes) Mrite._pendingImgSizes = {};
        var prevSize = Mrite._pendingImgSizes[fileData.path];
        if (prevSize !== undefined && prevSize === fileData.size) {
          // 大小稳定，可以加载
          delete Mrite._pendingImgSizes[fileData.path];
        } else {
          // 大小还在变化，记录并延迟重试
          Mrite._pendingImgSizes[fileData.path] = fileData.size;
          setTimeout(function() {
            if (Mrite._activeWorkDir) Mrite._scanLiveNow();
          }, 800);
          break;
        }
      }

      // 根据文件类型添加到对应列表
      if (fileData.type === 'image') {
        if (!Mrite._liveImgs) Mrite._liveImgs = [];
        // 检查是否已存在（避免重复）
        var exists = Mrite._liveImgs.some(function(f) { return f.path === fileData.path; });
        if (!exists) {
          Mrite._liveImgs.push(fileData);
          Mrite._liveImgIdx = Mrite._liveImgs.length - 1;
          Mrite._liveTab = 'image';
          console.log('[LivePanel] 新增图片:', fileData.name, '总计:', Mrite._liveImgs.length);
          // 清除该文件的图片缓存（可能是旧版本）
          if (Mrite._imgCache) delete Mrite._imgCache[fileData.path];
        }
      } else if (fileData.type === 'table') {
        if (!Mrite._liveTbls) Mrite._liveTbls = [];
        var exists2 = Mrite._liveTbls.some(function(f) { return f.path === fileData.path; });
        if (!exists2) {
          Mrite._liveTbls.push(fileData);
          Mrite._liveTblIdx = Mrite._liveTbls.length - 1;
          Mrite._liveTab = 'table';
          console.log('[LivePanel] 新增表格:', fileData.name, '总计:', Mrite._liveTbls.length);
        }
      } else if (fileData.type === 'code') {
        if (!Mrite._liveCodes) Mrite._liveCodes = [];
        var exists3 = Mrite._liveCodes.some(function(f) { return f.path === fileData.path; });
        if (!exists3) {
          Mrite._liveCodes.push(fileData);
          Mrite._liveCodeIdx = Mrite._liveCodes.length - 1;
          console.log('[LivePanel] 新增代码:', fileData.name, '总计:', Mrite._liveCodes.length);
        }
      }

      // 延迟渲染，等待文件写入完成
      if (fileData.type === 'image') {
        setTimeout(function() { Mrite._renderLivePanel(); }, 500);
      } else {
        Mrite._renderLivePanel();
      }
      break;
  }
};

// ═══════════ 开始运行提示 ═══════════
Mrite._showStartMessage = function() {
  // ★ 保留历史对话，只清除临时状态
  Mrite.modifyFileOps = [];
  Mrite._modifyRenderFileOps();
  Mrite._userScrolledUp = false; // ★ 新任务开始时重置手动滚动标记

  // 移除旧的 pending、启动提示和文件摘要消息
  Mrite.modifyChatHistory = Mrite.modifyChatHistory.filter(function(m) { return !m.pending && !m._statusOnly && !m._fileSummary && !m._startupMsg; });

  // ★ 显示文件摘要（只在没有已有摘要时添加）
  var S = Mrite.STATE;
  var topics = S._lastTopicFiles || [];
  var datas = S._lastDataFiles || [];
  var hasSummary = Mrite.modifyChatHistory.some(function(m) { return m._fileSummary; });
  if (!hasSummary && (topics.length || datas.length)) {
    var summary = '📂 **已装载文件**\n\n';
    if (topics.length) summary += '**赛题：** ' + topics.join('、') + '\n';
    if (datas.length) summary += '**数据：** ' + datas.join('、') + '\n';
    Mrite.modifyChatHistory.push({ role: 'ai', text: summary, _fileSummary: true });
  }

  if (Mrite._pushPendingStatus) Mrite._pushPendingStatus('solve');
  Mrite._modifyRenderChat();
};

// ═══════════ 编译中状态 ═══════════
Mrite._showCompilingStatus = function() {
  // 移除旧的编译状态
  Mrite.modifyChatHistory = Mrite.modifyChatHistory.filter(function(m) { return !m._compileStatus; });
  Mrite.modifyChatHistory.push({
    role: 'ai',
    _compileStatus: true,
    text: '正在编译论文，XeLaTeX 编译中，请稍候。'
  });
  Mrite._modifyRenderChat();
};

// ★ 验证任务是否真正完成：检查工作空间中是否有 PDF 文件
Mrite._verifyTaskCompletion = async function(workDir) {
  if (!workDir) return false;
  try {
    var result = await window.electronAPI.listDirFiles(workDir + '/论文');
    if (result && result.files) {
      return result.files.some(function(f) { return f.name && f.name.endsWith('.pdf'); });
    }
  } catch(e) {}
  return false;
};

// ═══════════ 完成总结 ═══════════
Mrite._showCompletionSummary = function(payload) {
  if (Mrite._clearPendingMessages) Mrite._clearPendingMessages();
  // 移除旧的编译中状态
  Mrite.modifyChatHistory = Mrite.modifyChatHistory.filter(function(m) { return !m._compileStatus; });
  Mrite.modifyChatHistory = Mrite.modifyChatHistory.filter(function(m) { return !m._completionSummary && !m._isSolveDialog; });
  Mrite.modifyChatHistory.push({ role: 'ai', _html: Mrite._buildSolveCompleteCard(Mrite.modifyChatHistory), _completionSummary: true, _isSolveDialog: true });
  Mrite._modifyRenderChat();
};

// ═══════════ 通用工具操作追踪 ═══════════
Mrite._trackToolOp = function(name, input, label) {
  var S = Mrite.STATE;
  if (!S.toolOps) S.toolOps = [];

  var filePath = '';
  if (input) {
    var rawPath = input.file_path || input.filePath || input.path || '';
    if (rawPath) {
      var wsMatch = rawPath.match(/(?:workspace\/[^\/]+\/|projects\/[^\/]+\/)(.+)/);
      if (wsMatch) filePath = wsMatch[1];
      else {
        var knownMatch = rawPath.match(/(?:论文\/|求解\/|数据\/|题目\/)(.+)/);
        if (knownMatch) filePath = (rawPath.match(/(论文\/|求解\/|数据\/|题目\/).+/) || [''])[0];
        else filePath = rawPath.split('/').pop();
      }
    }
    if (!filePath && input.command) {
      var m = input.command.match(/(?:论文\/|求解\/|数据\/|题目\/)[^\s'"]*/);
      if (m) filePath = m[0];
      else {
        if (input.command.indexOf('xelatex') !== -1) filePath = '编译 LaTeX';
        else if (input.command.indexOf('python') !== -1) filePath = 'Python 脚本';
        else if (input.command.indexOf('grep') !== -1) filePath = '搜索日志';
        else filePath = input.command.substring(0, 50);
      }
    }
    if (!filePath && input.pattern) filePath = input.pattern;
    if (!filePath && input.query) filePath = input.query.substring(0, 50);
  }

  var displayPath = filePath;
  if (filePath && (filePath.indexOf('/') !== -1 || filePath.indexOf('\\') !== -1)) {
    var parts = filePath.replace(/\\/g, '/').split('/');
    if (parts.length >= 3 && /^问题/.test(parts[1])) {
      displayPath = parts[1] + '/' + parts[parts.length - 1];
    } else {
      displayPath = parts[parts.length - 1];
    }
  }

  var opIcon = name;
  if (name === 'Bash') {
    var c = input?.command || '';
    if (c.indexOf('xelatex') !== -1 || c.indexOf('pdflatex') !== -1) opIcon = 'compile';
    else if (c.indexOf('python') !== -1) opIcon = 'python';
  }
  if (name === 'WebSearch' || name === 'WebFetch') opIcon = 'web';

  var newLabel = displayPath ? (label + ': ' + displayPath) : label;
  // ★ 去重：如果和上一条操作的 op + label 完全相同，增加计数而非新增条目
  var lastOp = S.toolOps.length ? S.toolOps[S.toolOps.length - 1] : null;
  if (lastOp && lastOp.op === opIcon && lastOp.label === newLabel && !lastOp._done) {
    lastOp._count = (lastOp._count || 1) + 1;
    lastOp.time = Date.now();
  } else {
    S.toolOps.push({
      op: opIcon,
      label: newLabel,
      time: Date.now(),
      _done: false,
      _count: 1
    });
  }
  if (S.toolOps.length > 100) S.toolOps.shift();

  var writeOps = ['Write', 'Edit', 'Bash'];
  if (writeOps.indexOf(name) !== -1) {
    Mrite._modifyHadFileOps = true;
  }

  Mrite._renderToolOps();
};

// ═══════════ 渲染右侧操作日志 ═══════════
Mrite._renderToolOps = function() {
  var el = document.getElementById('taskToolOps');
  if (!el) return;
  var S = Mrite.STATE;

  var titleEl = document.getElementById('opsPanelTitle');
  if (titleEl) titleEl.textContent = '操作记录';

  var ops = S.toolOps || [];
  // ★ 添加实时状态信息
  var statusItems = [];
  if (S.runStatus === 'running') {
    if (S._streamingText) statusItems.push({ op: 'stream', label: '正在生成回复...', _active: true });
    if (S._thinkingActive) statusItems.push({ op: 'think', label: 'AI 思考中...', _active: true });
  }

  // ★ 添加统计信息
  var statsHtml = '';
  if (S.runStatus === 'running' || S.runStatus === 'done') {
    var startedSteps = (S.taskSteps || []).filter(function(s) { return s._started; });
    var stepCount = startedSteps.length;
    var doneCount = startedSteps.filter(function(s) { return s.status === 'completed'; }).length;
    var tokenIn = S.tokenInput || 0;
    var tokenOut = S.tokenOutput || 0;
    statsHtml = '<div class="task-op-stats">' +
      '<div class="task-op-stat"><span class="task-op-stat-label">步骤</span><span class="task-op-stat-value">' + doneCount + '/' + stepCount + '</span></div>' +
      '<div class="task-op-stat"><span class="task-op-stat-label">输入</span><span class="task-op-stat-value">' + Mrite._formatTokenCount(tokenIn) + '</span></div>' +
      '<div class="task-op-stat"><span class="task-op-stat-label">输出</span><span class="task-op-stat-value">' + Mrite._formatTokenCount(tokenOut) + '</span></div>' +
      '</div>';
  }

  if (!ops.length && !statusItems.length && !statsHtml) {
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
    // ★ 新增：流式输出和思考的图标
    stream: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>',
    think: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 1 1 7.072 0l-.548.547A3.374 3.374 0 0 0 14 18.469V19a2 2 0 1 1-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/></svg>',
  };
  var defaultIcon = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>';

  var html = '';
  // ★ 显示统计信息
  if (statsHtml) html += statsHtml;
  // ★ 先显示实时状态
  for (var j = 0; j < statusItems.length; j++) {
    var status = statusItems[j];
    html += '<div class="task-op-item active streaming"><span class="task-op-icon task-op-icon-active">' + (icons[status.op] || defaultIcon) + '</span><span class="task-op-label">' + escHtml(status.label) + '</span><span class="task-op-dots"><i></i><i></i><i></i></span></div>';
  }
  // 再显示历史操作
  for (var i = ops.length - 1; i >= 0; i--) {
    var op = ops[i];
    var cls = op._done ? 'task-op-item done' : 'task-op-item active';
    var countBadge = (op._count && op._count > 1) ? ' <span class="task-op-count">×' + op._count + '</span>' : '';
    var timeStr = op.time ? ' <span class="task-op-time">' + new Date(op.time).toLocaleTimeString() + '</span>' : '';
    html += '<div class="' + cls + '"><span class="task-op-icon">' + (icons[op.op] || defaultIcon) + '</span><span class="task-op-label" title="' + escAttr(op.label) + '">' + escHtml(op.label) + countBadge + timeStr + '</span></div>';
  }
  el.innerHTML = html;
  el.scrollTop = 0;
};

// ═══════════ 修改模式：编译检测 ═══════════
Mrite._modifyCheckCompileStart = function(name, input) {
  if (name === 'Bash') {
    var c = input?.command || '';
    if (c.indexOf('xelatex') !== -1 || c.indexOf('pdflatex') !== -1) {
      Mrite._modifyCompileState.ran = true;
    }
  }
};

Mrite._modifyCheckCompileResult = function(payload) {
  var output = payload.output || payload.result || '';
  var cmd = (payload.input && payload.input.command) || '';
  if (typeof output === 'string') {
    var isLatexCmd = cmd.indexOf('xelatex') !== -1 || cmd.indexOf('pdflatex') !== -1;
    var hasError = output.indexOf('Error') !== -1 || output.indexOf('! ') !== -1;
    var hasFatal = output.indexOf('Fatal error') !== -1;
    if (!hasError && !hasFatal && (isLatexCmd || output.indexOf('Output written') !== -1 || output.indexOf('Transcript written') !== -1)) {
      Mrite._modifyCompileState.ok = true;
      Mrite._modifyCompileState.detail = 'xelatex 编译通过，PDF 已生成';
    } else if (hasError || hasFatal) {
      Mrite._modifyCompileState.ok = false;
      Mrite._modifyCompileState.detail = hasFatal ? '编译致命错误' : '编译存在错误';
    }
  } else {
    Mrite._modifyCompileState.ok = true;
  }
};

// ── 修改完成 ──
Mrite._modifyOnComplete = function() {
  if (Mrite._modifyCompleted) return;
  Mrite._modifyCompleted = true;

  Mrite._stopHeartbeat();
  Mrite._stopGlobalLiveScan();
  // ★ 清理流式渲染定时器
  if (Mrite._streamRenderTimer) {
    cancelAnimationFrame(Mrite._streamRenderTimer);
    Mrite._streamRenderTimer = null;
  }
  // ★ 清理流式状态
  var S = Mrite.STATE;
  S._streamingText = false;
  S._thinkingActive = false;
  Mrite._syncWsState({ status: 'modify', runCompletedAt: new Date().toISOString() });
  var cs = Mrite._modifyCompileState;

  // ★ 清理所有流式标志（包括 thinking）
  Mrite.modifyChatHistory.forEach(function(m) {
    if (m._streaming) delete m._streaming;
  });
  // ★ 重置流式状态标志
  Mrite._toolOpsStreamShown = false;
  Mrite.STATE._streamingText = false;
  Mrite.STATE._thinkingActive = false;
  // ★ 刷新操作记录（移除流式状态）
  Mrite._renderToolOps();
  Mrite.modifyChatHistory = Mrite.modifyChatHistory.filter(function(m) { return !m.pending; });

  var notifyBody = '';

  if (Mrite._modifyHadFileOps && cs.ran && cs.ok) {
    Mrite._modifyAddAiMsg('修改完成，编译成功，PDF 已更新。');
    Mrite._modifyShowCompileStatus(true, '论文已重新编译，PDF 已更新');
    notifyBody = '修改完成，编译成功';
  } else if (Mrite._modifyHadFileOps && cs.ran && !cs.ok) {
    Mrite._modifyAddAiMsg('修改完成，编译有警告，请检查 PDF。');
    Mrite._modifyShowCompileStatus(false, '编译过程中检测到错误标记，请手动查看 PDF');
    notifyBody = '修改完成，编译有警告';
  } else if (Mrite._modifyHadFileOps && !cs.ran) {
    Mrite._modifyAddAiMsg('修改完成。');
    Mrite._modifyShowCompileStatus(null);
    notifyBody = '修改完成';
  } else if (!Mrite._modifyHadFileOps) {
    Mrite._modifyAddAiMsg('已完成，未检测到文件变更。');
    Mrite._modifyShowCompileStatus(null);
    notifyBody = '已完成';
  } else {
    Mrite._modifyAddAiMsg('修改完成。');
    Mrite._modifyShowCompileStatus(true, '处理完成');
    notifyBody = '修改完成';
  }
  if (Mrite._modifyHadFileOps) Mrite._syncAndRefresh();

  if (notifyBody) {
    window.electronAPI?.sendNotification?.('Mrite', notifyBody);
  }

  Mrite.STATE.runStatus = 'done';
  Mrite.STATE.taskType = 'modify';
  Mrite.saveSettings();
  Mrite._userScrolledUp = false; // ★ 任务完成时重置手动滚动标记
  if (Mrite._persistCurrentConversation) {
    Mrite._persistCurrentConversation({
      status: 'modify',
      runCompletedAt: new Date().toISOString()
    });
  }
  Mrite.updateButtonStates(); Mrite.updateStatusIndicator();
  Mrite._syncWsState({ status: 'modify', runCompletedAt: new Date().toISOString() });

  var inp = document.getElementById('modifyInput');
  if (inp) inp.disabled = false;
  Mrite._setSendButtonStop(false);
  Mrite._modifyRenderChat();
};

Mrite._modifyOnError = function(msg) {
  if (Mrite._modifyCompleted) return;
  Mrite._stopHeartbeat();
  if (Mrite._clearPendingMessages) Mrite._clearPendingMessages();
  Mrite._userScrolledUp = false; // ★ 任务出错时重置手动滚动标记
  // ★ 清理流式渲染定时器
  if (Mrite._streamRenderTimer) {
    cancelAnimationFrame(Mrite._streamRenderTimer);
    Mrite._streamRenderTimer = null;
  }
  // ★ 重置流式状态标志
  Mrite._toolOpsStreamShown = false;
  Mrite.STATE._streamingText = false;
  Mrite.STATE._thinkingActive = false;
  // ★ 清理所有流式标志（包括 thinking）
  Mrite.modifyChatHistory.forEach(function(m) {
    if (m._streaming) delete m._streaming;
  });
  // 注意：不再重复添加错误消息，case 'error' 已添加完整错误信息
  Mrite.STATE.runStatus = 'error';
  Mrite.STATE.taskType = 'modify';
  try {
    if (Mrite._persistCurrentConversation) {
      Mrite._persistCurrentConversation({
        status: 'error',
        errorMessage: msg || ''
      });
    }
  } catch(e) { console.warn('persistCurrentConversation failed:', e); }
  Mrite.updateButtonStates(); Mrite.updateStatusIndicator();
  var inp = document.getElementById('modifyInput');
  if (inp) inp.disabled = false;
  Mrite._setSendButtonStop(false);
  try { Mrite._modifyRenderChat(); } catch(e) {}
};

// ── 工具标签格式化 ──
Mrite.formatToolLabel = function(name, input) {
  var m = {
    Read: function() { return '读取文件'; },
    Write: function() { return '写入文件'; },
    Edit: function() { return '编辑文件'; },
    Bash: function() {
      var c = input?.command || '';
      if (c.indexOf('python') !== -1) return '运行 Python';
      if (c.indexOf('xelatex') !== -1) return '编译 LaTeX';
      if (c.indexOf('grep') !== -1) return '检查日志';
      return '执行命令';
    },
    Grep: function() { return '搜索内容'; },
    Glob: function() { return '查找文件'; },
    WebSearch: function() { return '搜索网页'; },
    WebFetch: function() { return '获取网页'; },
    Task: function() { return '子任务'; },
  };
  var fn = m[name];
  return fn ? fn() : '执行操作';
};

// ── HTML 转义 ──
function escHtml(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function escAttr(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;');
}
