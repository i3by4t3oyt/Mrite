// Mrite v1.8 — 修改面板（绑定项目修改 / 求解后修改）
window.Mrite = window.Mrite || {};

Mrite.modifyChatHistory = [];
Mrite.modifyFileOps = [];
Mrite._modifyCompileState = { ran: false, ok: false, detail: '' };
Mrite._modifySessionIntent = 'modify';
Mrite._modifyCompleted = false;      // 去重：防止重复完成回调
Mrite._modifyHadFileOps = false;     // ★ 本轮是否有实际文件操作

Mrite._clearPendingMessages = function() {
  Mrite.modifyChatHistory = Mrite.modifyChatHistory.filter(function(m) { return !m.pending; });
};

Mrite._getPendingStatusText = function(taskType) {
  return taskType === 'solve'
    ? '运行求解中，请稍候…'
    : '思考中，正在处理你的修改…';
};

Mrite._pushPendingStatus = function(taskType) {
  Mrite._clearPendingMessages();
  Mrite.modifyChatHistory.push({
    role: 'ai',
    text: Mrite._getPendingStatusText(taskType),
    pending: true,
    _statusOnly: true
  });
};

// ═══════════ 线性 SVG 矢量图标 ═══════════
var MIC = {
  read:  '<svg w="13" h="13" v="0 0 24 24" f="none" s="currentColor" sw="1.5" sl="round" sj="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>',
  write: '<svg w="13" h="13" v="0 0 24 24" f="none" s="currentColor" sw="1.5" sl="round" sj="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
  edit:  '<svg w="13" h="13" v="0 0 24 24" f="none" s="currentColor" sw="1.5" sl="round" sj="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
  bash:  '<svg w="13" h="13" v="0 0 24 24" f="none" s="currentColor" sw="1.5" sl="round" sj="round"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>',
  compile:'<svg w="13" h="13" v="0 0 24 24" f="none" s="currentColor" sw="1.5" sl="round" sj="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>',
  search:'<svg w="13" h="13" v="0 0 24 24" f="none" s="currentColor" sw="1.5" sl="round" sj="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
  web:   '<svg w="13" h="13" v="0 0 24 24" f="none" s="currentColor" sw="1.5" sl="round" sj="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>',
  trash: '<svg w="13" h="13" v="0 0 24 24" f="none" s="currentColor" sw="1.5" sl="round" sj="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
  check: '<svg w="14" h="14" v="0 0 24 24" f="none" s="currentColor" sw="2" sl="round" sj="round"><polyline points="20 6 9 17 4 12"/></svg>',
  warn:  '<svg w="14" h="14" v="0 0 24 24" f="none" s="currentColor" sw="2" sl="round" sj="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
};
(function() {
  var r = { w: 'width', h: 'height', v: 'viewBox', f: 'fill', s: 'stroke', sw: 'stroke-width', sl: 'stroke-linecap', sj: 'stroke-linejoin' };
  for (var k in MIC) for (var a in r) MIC[k] = MIC[k].replace(new RegExp(' ' + a + '=', 'g'), ' ' + r[a] + '=').replace(new RegExp('"' + a + '"', 'g'), '"' + r[a] + '"');
})();

// ═══════════ 编译状态追踪 ═══════════
Mrite._modifyResetCompileState = function() {
  Mrite._modifyCompileState = { ran: false, ok: false, detail: '' };
};

Mrite._isCompileOnlyRequest = function(text) {
  if (!text) return false;
  var t = text.trim();
  return t === '重新编译论文' || t === '重新编译' || t === '编译论文' || t === '编译';
};

Mrite._runCompileOnlyRequest = async function(text) {
  var S = Mrite.STATE;
  var projectPath = S.settings.projectPath;
  var input = document.getElementById('modifyInput');
  if (!projectPath) {
    Mrite._clearPendingMessages();
    Mrite._modifyAddAiMsg('未选择项目，无法编译论文。');
    S.runStatus = 'done';
    S.taskType = 'modify';
    Mrite._setSendButtonStop(false);
    if (input) input.disabled = false;
    Mrite.updateButtonStates();
    Mrite.updateStatusIndicator();
    return;
  }

  Mrite._clearPendingMessages();
  Mrite._modifyAddAiMsg('检测到这是纯编译指令，已跳过 AI，直接编译论文。');
  Mrite._modifyShowCompileStatus(null, '正在直接编译论文...');

  try {
    var findResult = await window.electronAPI.findTexFile(projectPath);
    if (!findResult || !findResult.success || !findResult.texPath) {
      throw new Error((findResult && findResult.error) || '未找到 tex 文件');
    }
    var result = await window.electronAPI.directCompile(findResult.texPath, null, true);
    if (result && result.success) {
      Mrite._modifyCompileState = { ran: true, ok: true, detail: 'xelatex 编译通过，PDF 已生成' };
      Mrite._modifyShowCompileStatus(true, 'PDF 已更新');
      Mrite._modifyAddAiMsg('编译完成，PDF 已更新。');
      S.runStatus = 'done';
      S.taskType = 'modify';
    } else {
      var msg = (result && result.error) || '编译失败';
      Mrite._modifyCompileState = { ran: true, ok: false, detail: msg };
      Mrite._modifyShowCompileStatus(false, msg);
      Mrite._modifyAddAiMsg('编译失败：' + msg);
      S.runStatus = 'done';
      S.taskType = 'modify';
    }
  } catch (e) {
    Mrite._modifyCompileState = { ran: true, ok: false, detail: e.message };
    Mrite._modifyShowCompileStatus(false, e.message);
    Mrite._modifyAddAiMsg('编译异常：' + e.message);
    S.runStatus = 'done';
    S.taskType = 'modify';
  }

  Mrite._setSendButtonStop(false);
  if (input) input.disabled = false;
  Mrite.updateButtonStates();
  Mrite.updateStatusIndicator();
  if (Mrite._persistCurrentConversation) Mrite._persistCurrentConversation();
};

// ── 切换发送按钮为停止按钮 ──
Mrite._setSendButtonStop = function(isRunning) {
  var btn = document.getElementById('modifySend');
  if (!btn) return;
  if (isRunning) {
    btn.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="6" width="12" height="12" rx="1"/></svg>';
    btn.title = '停止生成';
    btn.classList.add('mod-send-stop');
  } else {
    btn.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>';
    btn.title = '发送';
    btn.classList.remove('mod-send-stop');
  }
};

// ── 停止 AI 生成 ──
Mrite.modifyStop = async function() {
  var S = Mrite.STATE;
  if (S.runStatus !== 'running') return;
  await window.electronAPI.abortTask();
  Mrite._stopHeartbeat();
  Mrite._stopElapsedTimer();
  S._userTerminated = true;
  S.taskSteps = [];

  // ★ 清理流式状态
  Mrite.modifyChatHistory.forEach(function(m) {
    if (m._streaming) delete m._streaming;
  });
  S._streamingText = false;
  S._thinkingActive = false;
  if (Mrite._streamRenderTimer) {
    cancelAnimationFrame(Mrite._streamRenderTimer);
    Mrite._streamRenderTimer = null;
  }

  if (S.taskType === 'solve') {
    Mrite._modifyAddAiMsg('用户手动中止求解。');
    var bar = document.querySelector('#progressBarFill');
    if (bar) { bar.style.width = '0%'; bar.classList.remove('done', 'error'); }
    var pt = document.querySelector('#progressText');
    if (pt) pt.textContent = '0%';
    Mrite._syncWsState({ status: 'stopped', stoppedAt: new Date().toISOString() });
    // 求解中止：回到上传界面
    S.runStatus = 'idle'; S.taskType = 'idle';
    var uploadSection = document.getElementById('taskUploadSection');
    var execSection = document.getElementById('taskExecSection');
    if (uploadSection) uploadSection.classList.remove('hidden');
    if (execSection) execSection.classList.add('hidden');
  } else {
    Mrite._modifyAddAiMsg('已停止。');
    // 修改模式中止：保持在修改界面，输入框仍可用
    S.runStatus = 'done';
    Mrite._setSendButtonStop(false);
  }
  Mrite.updateButtonStates(); Mrite.updateStatusIndicator();
  Mrite._updateDialogModePill();
};

// ── 发送指令（统一全局 AI 对话，无项目绑定）──
Mrite.modifySend = async function() {
  var input = document.getElementById('modifyInput');
  var btn = document.getElementById('modifySend');
  var S = Mrite.STATE;
  var apiCfg = Mrite._getActiveApiConfig ? Mrite._getActiveApiConfig() : {
    apiBase: S.settings.apiBase || '',
    apiKey: S.settings.apiKey || '',
    apiModel: S.settings.apiModel || ''
  };

  // ★ 求解/对话运行期间，点击按钮 = 停止
  if (S.runStatus === 'running') {
    await Mrite.modifyStop();
    return;
  }

  var text = input?.value?.trim();
  if (!text) return;
  var isCompileOnly = Mrite._isCompileOnlyRequest(text);
  if (!isCompileOnly) {
    // ★ 无激活码 → 弹出激活遮罩
    if (!S.settings.inviteCode || !S.settings.inviteVerified) {
      Mrite.showActivation();
      return;
    }
    // ★ 激活码过期 → 提示续期
    if (Mrite._isExpired && Mrite._isExpired()) {
      Mrite._showToast('激活码已过期，请续期后使用');
      return;
    }
    // ★ 服务器端二次验证
    if (window.electronAPI && window.electronAPI.checkActivation) {
      try {
        var actResult = await window.electronAPI.checkActivation();
        if (!actResult || !actResult.valid) {
          Mrite._showToast('激活码验证失败：' + ((actResult && actResult.error) || '无效'));
          return;
        }
      } catch (e) {
        Mrite._showToast('无法连接服务器，请检查网络');
        return;
      }
    }
  }
  if (!isCompileOnly && !apiCfg.apiKey) { Mrite._showToast('请先在设置中配置可用的 API Key'); return; }
  if (!isCompileOnly && !apiCfg.apiModel) { Mrite._showToast('请先在设置中选择模型'); return; }

  var intent = 'modify';
  S.taskType = 'modify'; S.runStatus = 'running';
  Mrite._modifySessionIntent = 'modify';
  S.tokenInput = 0; S.tokenOutput = 0;
  S.taskStartTime = Date.now();

  Mrite.modifyChatHistory.push({ role: 'user', text: text, _forceVisible: true });
  Mrite._modifyRenderChat();
  if (Mrite._persistCurrentConversation) Mrite._persistCurrentConversation({
    status: 'modify',
    lastUserMessageAt: new Date().toISOString()
  });
  if (input) input.value = '';
  // 修改模式不禁用输入框，用户可继续输入和终止
  Mrite._setSendButtonStop(true);

  Mrite._modifyResetCompileState();
  Mrite._modifyShowCompileStatus(null);
  Mrite._modifyHadFileOps = false;
  Mrite._modifyCompleted = false;
  Mrite.updateButtonStates(); Mrite.updateStatusIndicator();

  Mrite._pushPendingStatus('modify');
  Mrite._modifyRenderChat();

  if (isCompileOnly) {
    if (input) input.value = '';
    await Mrite._runCompileOnlyRequest(text);
    return;
  }

  try {
    Mrite._startHeartbeat();
    // ★ 获取最近3条聊天历史作为上下文
    var recentChat = (Mrite.modifyChatHistory || [])
      .filter(function(m) { return m && (m.role === 'user' || m.role === 'ai') && m.text; })
      .slice(-6)
      .map(function(m) { return { role: m.role, text: m.text.substring(0, 200) }; });
    var launchResult = await window.electronAPI.launchTask(
      S.settings.projectPath || null,
      {
        apiBase: apiCfg.apiBase || '',
        apiKey: apiCfg.apiKey || '',
        apiModel: apiCfg.apiModel || '',
        apiFormat: apiCfg.apiFormat || 'auto',
        _taskType: 'modify',
        _recentChat: recentChat,
      },
      text,
      true
    );
    // 检查后端返回的错误
    if (launchResult && !launchResult.success) {
      Mrite._clearPendingMessages();
      Mrite._modifyAddAiMsg(launchResult.error || '任务启动失败');
      S.runStatus = 'done'; S.taskType = 'modify';
      Mrite._stopHeartbeat();
      Mrite._setSendButtonStop(false);
      if (input) { input.disabled = false; input.placeholder = '输入消息…'; }
      Mrite.updateButtonStates(); Mrite.updateStatusIndicator();
      return;
    }
  } catch (e) {
    Mrite._clearPendingMessages();
    Mrite._modifyAddAiMsg('发送失败: ' + e.message);
    S.runStatus = 'done'; S.taskType = 'modify';
    Mrite._setSendButtonStop(false);
    if (input) input.disabled = false;
    Mrite.updateButtonStates(); Mrite.updateStatusIndicator();
  }
};

// ── 快捷指令 ──
Mrite.modifyQuick = function(action) {
  // 如果是编译指令，直接执行，不走 AI
  if (Mrite._isCompileOnlyRequest(action)) {
    Mrite._runCompileOnlyRequest(action);
    return;
  }
  var input = document.getElementById('modifyInput');
  if (input) { input.value = action; input.focus(); }
};

// ── 添加 AI 消息 ──
Mrite._modifyAddAiMsg = function(text) {
  Mrite.modifyChatHistory = Mrite.modifyChatHistory.filter(function(m) { return !m.pending; });
  Mrite.modifyChatHistory.push({ role: 'ai', text: text });
  Mrite._modifyRenderChat();
  if (Mrite._persistCurrentConversation) Mrite._persistCurrentConversation();
};

// ── Markdown → HTML（中间过程展示用，保持简洁）──
Mrite._renderMarkdown = function(text) {
  if (!text) return '';
  var blocks = [];
  var h = String(text).replace(/```(\w*)\n([\s\S]*?)```/g, function(_, lang, code) {
    var id = blocks.length;
    blocks.push('<pre class="md-code"><code>' + Mrite._escHtml(code) + '</code></pre>');
    return '\u0000CODE' + id + '\u0000';
  });
  h = Mrite._escHtml(h);

  // ★ 表格：连续的 | 行组成表格
  h = h.replace(/(?:^\|.+\|$\n?)+/gm, function(block) {
    var lines = block.trim().split('\n');
    if (lines.length < 2) return block;
    var t = '<div class="md-table-wrap"><table class="md-table">';
    var pastHeader = false;
    for (var i = 0; i < lines.length; i++) {
      // 跳过分隔行 |---|----|
      if (i === 1 && /^\|[\s\-:]+\|$/.test(lines[i])) continue;
      var cells = lines[i].replace(/^\||\|$/g, '').split('|');
      var tag = pastHeader ? 'td' : 'th';
      t += '<tr>';
      for (var j = 0; j < cells.length; j++) t += '<' + tag + '>' + cells[j].trim() + '</' + tag + '>';
      t += '</tr>';
      pastHeader = true;
    }
    t += '</table></div>';
    return t;
  });
  // 标题
  h = h.replace(/^####\s+(.+)$/gm, '<h5 class="md-h md-h5">$1</h5>');
  h = h.replace(/^###\s+(.+)$/gm, '<h4 class="md-h md-h4">$1</h4>');
  h = h.replace(/^##\s+(.+)$/gm, '<h3 class="md-h md-h3">$1</h3>');
  h = h.replace(/^#\s+(.+)$/gm, '<h2 class="md-h md-h2">$1</h2>');
  // 引用 > ...
  h = h.replace(/^&gt;\s+(.+)$/gm, '<blockquote class="md-quote">$1</blockquote>');
  // 列表
  h = h.replace(/(?:^(?:[-*]|\d+\.)\s+.+$\n?)+/gm, function(block) {
    var ordered = /^\d+\./.test(block.trim());
    var items = block.trim().split('\n').map(function(line) {
      return '<li>' + line.replace(/^(?:[-*]|\d+\.)\s+/, '') + '</li>';
    }).join('');
    return ordered ? '<ol class="md-list">' + items + '</ol>' : '<ul class="md-list">' + items + '</ul>';
  });
  // 行内代码 `...`
  h = h.replace(/`([^`]+)`/g, '<code class="md-inline-code">$1</code>');
  // 粗体 **...**
  h = h.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  // 斜体 *...*（但不匹配列表项开头的 *）
  h = h.replace(/(?<!\n)\*([^*\n]+)\*(?!\s)/g, '<em>$1</em>');
  // 链接 [text](url) — ★ 安全校验：只允许 http/https 协议
  h = h.replace(/\[([^\]]+)\]\(([^)]+)\)/g, function(match, text, url) {
    var safeUrl = url.trim();
    // 只允许 http:// 和 https:// 协议，拒绝 javascript: 等危险协议
    if (!/^https?:\/\//i.test(safeUrl)) {
      safeUrl = '#'; // 危险协议替换为 #
    }
    return '<a href="' + safeUrl + '" class="md-link" target="_blank" rel="noopener noreferrer">' + text + '</a>';
  });
  h = h.replace(/^-{3,}$/gm, '<hr class="md-hr">');
  // 换行
  h = h.replace(/\n{2,}/g, '<br><br>');
  h = h.replace(/\n/g, '<br>');
  h = h.replace(/\u0000CODE(\d+)\u0000/g, function(_, id) { return blocks[Number(id)] || ''; });
  return h;
};

// ★ 检测计划列表（AI 输出的步骤/任务列表）
Mrite._extractPlan = function(text) {
  var t = String(text || '');
  var lines = t.split('\n');
  var items = [];
  var planPatterns = [
    /^[\s]*[-*]\s*\[([ xX✓✅🔄⏳])\]\s*(.+)/,                    // - [x] / - [ ]
    /^[\s]*(\d+)[.、）)]\s*(.+)/,                                   // 1. / 1、 / 1）
    /^[\s]*[-*]\s*(✅|🔄|⏳|⬜|☑️|⬜️)\s*(.+)/,                    // - ✅ xxx
    /^[\s]*(✅|🔄|⏳|⬜|☑️|⬜️)\s*(.+)/,                           // ✅ xxx
    /^[\s]*[-*]\s*(已完成|进行中|待完成|完成|未完成)\s*[：:]\s*(.+)/,  // - 已完成：xxx
  ];
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    if (!line) continue;
    for (var p = 0; p < planPatterns.length; p++) {
      var match = line.match(planPatterns[p]);
      if (match) {
        var status = 'pending';
        var mark = match[1];
        var label = match[2].trim();
        if (mark === 'x' || mark === 'X' || mark === '✓' || mark === '✅' || mark === '已完成' || mark === '完成' || mark === '☑️' || mark === '☑') {
          status = 'done';
        } else if (mark === '🔄' || mark === '进行中') {
          status = 'active';
        } else if (mark === '⏳' || mark === '待完成' || mark === '未完成' || mark === '⬜' || mark === '⬜️') {
          status = 'pending';
        } else if (/^\d+$/.test(mark)) {
          // 数字列表：通过内容判断状态
          if (/[✅✓已完成]/.test(label)) { status = 'done'; label = label.replace(/[✅✓已完成]/g, '').trim(); }
          else if (/[🔄进行中]/.test(label)) { status = 'active'; label = label.replace(/[🔄进行中]/g, '').trim(); }
          else if (/[⏳待完成未完成]/.test(label)) { status = 'pending'; label = label.replace(/[⏳待完成未完成]/g, '').trim(); }
        }
        items.push({ status: status, label: label, index: items.length + 1 });
        break;
      }
    }
  }

  // ★ 修正 AI 误标：一旦遇到第一个非 done 项，后续全部强制为 pending
  // AI 有时会把整个计划都标为 ✅，但实际还没执行到后面的步骤
  var foundNonDone = false;
  for (var j = 0; j < items.length; j++) {
    if (foundNonDone) {
      items[j].status = 'pending';
    } else if (items[j].status !== 'done') {
      foundNonDone = true;
    }
  }

  return items;
};

// ★ 渲染计划列表（增强版）
Mrite._renderPlan = function(items, fullText) {
  var planHtml = '<div class="mod-plan">';
  planHtml += '<div class="mod-plan-header"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg> 执行计划</div>';
  planHtml += '<div class="mod-plan-list">';

  // 统计进度
  var doneCount = items.filter(function(i) { return i.status === 'done'; }).length;
  var activeIndex = -1;
  items.forEach(function(item, idx) { if (item.status === 'active') activeIndex = idx; });

  items.forEach(function(item, idx) {
    var icon = '';
    var cls = '';
    var statusText = '';

    if (item.status === 'done') {
      icon = '<span class="mod-plan-icon mod-plan-done"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 6L9 17l-5-5"/></svg></span>';
      cls = 'mod-plan-item-done';
      statusText = '<span class="mod-plan-status mod-plan-status-done">已完成</span>';
    } else if (item.status === 'active') {
      icon = '<span class="mod-plan-icon mod-plan-active"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg></span>';
      cls = 'mod-plan-item-active';
      statusText = '<span class="mod-plan-status mod-plan-status-active">进行中</span>';
    } else {
      icon = '<span class="mod-plan-icon mod-plan-pending"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg></span>';
      cls = 'mod-plan-item-pending';
      statusText = '<span class="mod-plan-status mod-plan-status-pending">待完成</span>';
    }

    // 添加进度线
    var progressLine = '';
    if (idx < items.length - 1) {
      var lineClass = item.status === 'done' ? 'mod-plan-line-done' : (item.status === 'active' ? 'mod-plan-line-active' : 'mod-plan-line-pending');
      progressLine = '<div class="mod-plan-line ' + lineClass + '"></div>';
    }

    planHtml += '<div class="mod-plan-item ' + cls + '">' +
      '<div class="mod-plan-connector">' + icon + progressLine + '</div>' +
      '<div class="mod-plan-content"><span class="mod-plan-label">' + Mrite._escHtml(item.label) + '</span>' + statusText + '</div>' +
      '</div>';
  });

  // 进度条
  var progressPercent = items.length > 0 ? Math.round((doneCount / items.length) * 100) : 0;
  planHtml += '<div class="mod-plan-progress"><div class="mod-plan-progress-bar"><div class="mod-plan-progress-fill" style="width: ' + progressPercent + '%"></div></div><span class="mod-plan-progress-text">' + doneCount + '/' + items.length + ' 完成</span></div>';

  planHtml += '</div>';
  planHtml += '</div>';
  return planHtml;
};

Mrite._extractCodeFence = function(text) {
  var t = String(text || '').trim();
  var m = t.match(/^```([A-Za-z0-9_-]*)\n([\s\S]*?)\n?```$/);
  if (!m) return null;
  return { lang: (m[1] || 'text').toLowerCase(), code: m[2] || '' };
};

Mrite._looksLikeLatexSource = function(text) {
  var t = String(text || '').trim();
  if (!t) return false;
  if (/^```(?:tex|latex|LaTeX|latexmk)\b/.test(t)) return true;
  var markers = [
    '\\documentclass',
    '\\begin{document}',
    '\\usepackage',
    '\\section{',
    '\\subsection{',
    '\\begin{table}',
    '\\begin{figure}',
    '\\begin{equation}',
    '\\end{document}'
  ];
  var hits = 0;
  markers.forEach(function(marker) {
    if (t.indexOf(marker) !== -1) hits++;
  });
  return hits >= 2;
};

// ── HTML 转义 ──
Mrite._escHtml = function(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
};

Mrite._fileName = function(filePath) {
  return String(filePath || '').split(/[\\/]/).pop();
};

Mrite._resolveArtifactPath = function(filePath) {
  var p = String(filePath || '');
  if (!p) return '';
  if (p.charAt(0) === '/' || /^[A-Za-z]:[\\/]/.test(p)) return p;
  var base = Mrite._activeWorkDir || Mrite.STATE?.settings?.projectPath || '';
  if (!base) return p;
  return base.replace(/[\\/]$/, '') + '/' + p.replace(/^[\\/]/, '');
};

Mrite._imageSrcAttr = function(filePath) {
  return Mrite._escAttr(Mrite._resolveArtifactPath(filePath));
};

Mrite._isChatNearBottom = function(el) {
  if (!el) return true;
  return (el.scrollHeight - el.scrollTop - el.clientHeight) < 180;
};

// ★ 用户手动滚动检测：当用户主动向上滚动时，暂停自动滚动
Mrite._userScrolledUp = false;
Mrite._autoScrolling = false; // ★ 标记是否正在自动滚动
Mrite._setupChatScrollListener = function() {
  var el = document.getElementById('modifyChatHistory');
  if (!el || el._scrollListenerAttached) return;
  el._scrollListenerAttached = true;
  el.addEventListener('scroll', function() {
    // ★ 如果正在自动滚动，不处理（避免自动滚动触发的 scroll 事件干扰）
    if (Mrite._autoScrolling) return;
    // 如果用户滚动到底部附近，重置标记
    if (Mrite._isChatNearBottom(el)) {
      Mrite._userScrolledUp = false;
    }
  }, { passive: true });
  // ★ 监听鼠标滚轮事件：用户主动滚动时标记
  el.addEventListener('wheel', function(e) {
    // 如果用户向上滚动（deltaY < 0），标记为手动滚动
    if (e.deltaY < 0) {
      Mrite._userScrolledUp = true;
    }
    // 如果用户向下滚动到底部附近，重置标记
    if (e.deltaY > 0 && Mrite._isChatNearBottom(el)) {
      Mrite._userScrolledUp = false;
    }
  }, { passive: true });
  // ★ 监听触摸事件：移动端支持
  var touchStartY = 0;
  el.addEventListener('touchstart', function(e) {
    touchStartY = e.touches[0].clientY;
  }, { passive: true });
  el.addEventListener('touchmove', function(e) {
    var touchCurrentY = e.touches[0].clientY;
    var deltaY = touchStartY - touchCurrentY;
    // 如果用户向上滑动（deltaY > 0 表示手指向上移动），标记为手动滚动
    if (deltaY < 0) {
      Mrite._userScrolledUp = true;
    }
    // 如果用户向下滑动到底部附近，重置标记
    if (deltaY > 0 && Mrite._isChatNearBottom(el)) {
      Mrite._userScrolledUp = false;
    }
    touchStartY = touchCurrentY;
  }, { passive: true });
};

Mrite._scrollChatToBottom = function(force) {
  var el = document.getElementById('modifyChatHistory');
  if (!el) return;
  // ★ 确保滚动监听已设置
  Mrite._setupChatScrollListener();
  // ★ 如果用户手动向上滚动了，不强制滚动到底部
  if (Mrite._userScrolledUp && force) return;
  if (!force && !Mrite._isChatNearBottom(el)) return;
  // ★ 标记开始自动滚动
  Mrite._autoScrolling = true;
  requestAnimationFrame(function() {
    // ★ 再次检查用户是否手动滚动（在动画帧执行前用户可能已滚动）
    if (Mrite._userScrolledUp && force) {
      Mrite._autoScrolling = false;
      return;
    }
    el.scrollTop = el.scrollHeight;
    setTimeout(function() {
      // ★ 延迟后再次检查
      if (Mrite._userScrolledUp && force) {
        Mrite._autoScrolling = false;
        return;
      }
      el.scrollTop = el.scrollHeight;
      // ★ 自动滚动完成
      Mrite._autoScrolling = false;
    }, 40);
  });
  // ★ 安全机制：500ms 后强制重置自动滚动标记（防止卡住）
  setTimeout(function() {
    if (Mrite._autoScrolling) {
      Mrite._autoScrolling = false;
    }
  }, 500);
};

// ── 渲染对话历史（平铺模式）──
Mrite._modifyRenderChat = function() {
  var el = document.getElementById('modifyChatHistory');
  if (!el) return;
  // ★ 如果用户手动上滑了，记住滚动位置，渲染后恢复
  var savedScrollTop = -1;
  if (Mrite._userScrolledUp) {
    savedScrollTop = el.scrollTop;
  }
  var shouldStickBottom = !Mrite._userScrolledUp && Mrite._isChatNearBottom(el);
  var html = '';
  var imageGallery = []; // 收集连续图片用于画廊模式
  var S = Mrite.STATE;
  var isSolveTask = (S.taskType === 'solve');

  // ★ 添加模式类到容器，用于 CSS 控制用户消息显示
  el.classList.toggle('solve-mode', isSolveTask);
  el.classList.toggle('modify-mode', !isSolveTask);

  Mrite.modifyChatHistory.forEach(function(m, idx) {
    // ★ 阶段标题：显示为分隔线样式
    if (m._stageTitle) {
      if (imageGallery.length > 0) {
        html += Mrite._renderImageGallery(imageGallery);
        imageGallery = [];
      }
      html += '<div class="mod-stage-divider"><span class="mod-stage-divider-text">' + Mrite._escHtml(m.text || m._stageTitle) + '</span></div>';
      return;
    }

    // 系统消息（工具调用和输出）
    if (m.role === 'system') {
      if (imageGallery.length > 0) {
        html += Mrite._renderImageGallery(imageGallery);
        imageGallery = [];
      }
      html += '<div class="mod-msg mod-msg-system"><div class="mod-msg-bubble mod-system-bubble">' + Mrite._escHtml(m.text) + '</div></div>';
      return;
    }

    // 用户消息：始终显示，避免模式切换时被误隐藏
    if (m.role === 'user') {
      if (imageGallery.length > 0) {
        html += Mrite._renderImageGallery(imageGallery);
        imageGallery = [];
      }
      html += '<div class="mod-msg mod-msg-user"><div class="mod-msg-bubble mod-user-bubble">' + Mrite._escHtml(m.text) + '</div></div>';
      return;
    }

    // HTML 消息（状态行、编译状态、完成总结等）
    if (m._html) {
      if (imageGallery.length > 0) {
        html += Mrite._renderImageGallery(imageGallery);
        imageGallery = [];
      }
      // ★ 求解报告独立显示，不包在气泡里
      if (String(m._html).indexOf('solve-report') !== -1) {
        html += '<div class="mod-msg mod-msg-ai">' + m._html + '</div>';
      } else {
        html += '<div class="mod-msg mod-msg-ai"><div class="mod-msg-bubble mod-ai-bubble">' + m._html + '</div></div>';
      }
    } else if (m._markdownFile) {
      if (imageGallery.length > 0) {
        html += Mrite._renderImageGallery(imageGallery);
        imageGallery = [];
      }
      html += '<div class="mod-msg mod-msg-ai"><div class="mod-msg-bubble mod-ai-bubble mod-artifact-bubble">' +
        '<div class="mod-markdown-wrap" data-markdown-file="' + Mrite._escAttr(m._markdownFile) + '">加载中…</div>' +
      '</div></div>';
    } else if (m._texFile) {
      if (imageGallery.length > 0) {
        html += Mrite._renderImageGallery(imageGallery);
        imageGallery = [];
      }
      html += '<div class="mod-msg mod-msg-ai"><div class="mod-msg-bubble mod-ai-bubble mod-artifact-bubble">' +
        '<div class="mod-csv-wrap" data-file="' + Mrite._escAttr(m._texFile) + '" data-type="tex">加载中…</div>' +
      '</div></div>';
    } else if (m._codeFile) {
      if (imageGallery.length > 0) {
        html += Mrite._renderImageGallery(imageGallery);
        imageGallery = [];
      }
      html += '<div class="mod-msg mod-msg-ai"><div class="mod-msg-bubble mod-ai-bubble mod-artifact-bubble">' +
        '<div class="mod-code-wrap" data-code-file="' + Mrite._escAttr(m._codeFile) + '">加载中…</div>' +
      '</div></div>';
    } else if (m._image || m._csv || m._tableData) {
      // ★ 图片/CSV/表格在对话窗口也显示
      if (imageGallery.length > 0) {
        html += Mrite._renderImageGallery(imageGallery);
        imageGallery = [];
      }
      if (m._image) {
        html += '<div class="mod-msg mod-msg-ai"><div class="mod-msg-bubble mod-ai-bubble mod-artifact-bubble">' +
          '<div class="mod-gallery-img-wrap mod-image-wrap" data-image="' + Mrite._imageSrcAttr(m._image) + '"><div class="mod-image-loading">加载图片…</div></div>' +
        '</div></div>';
      } else if (m._csv) {
        html += '<div class="mod-msg mod-msg-ai"><div class="mod-msg-bubble mod-ai-bubble mod-artifact-bubble">' +
          '<div class="mod-csv-wrap" data-csv="' + Mrite._escAttr(m._csv) + '">加载中…</div>' +
        '</div></div>';
      } else if (m._tableData) {
        html += '<div class="mod-msg mod-msg-ai"><div class="mod-msg-bubble mod-ai-bubble mod-artifact-bubble">' +
          '<div class="mod-table-wrap">' + Mrite._renderTableData(m._tableData) + '</div>' +
        '</div></div>';
      }
    } else {
      if (imageGallery.length > 0) {
        html += Mrite._renderImageGallery(imageGallery);
        imageGallery = [];
      }
      var errorClass = m._error ? ' mod-msg-error' : '';
      var thinkingClass = m._thinking ? ' mod-msg-thinking' : '';
      var pendingClass = m.pending ? ' mod-msg-pending' : '';
      // ★ 思考过程：折叠显示
      if (m._thinking && !m._streaming) {
        // 思考完成，折叠显示
        html += '<div class="mod-msg mod-msg-ai mod-msg-thinking-collapsed"><div class="mod-msg-bubble mod-ai-bubble mod-thinking-bubble">' +
          '<details><summary>💭 思考过程（点击展开）</summary>' +
          '<div class="mod-thinking-content">' + Mrite._renderMarkdown(m.text) + '</div>' +
          '</details></div></div>';
        return;
      }
      if (m.pending || m._statusOnly) {
        var pendingText = Mrite._escHtml(m.text || Mrite._getPendingStatusText(isSolveTask ? 'solve' : 'modify'));
        html += '<div class="mod-msg mod-msg-ai' + pendingClass + '"><div class="mod-msg-bubble mod-ai-bubble mod-pending-bubble"><span class="mod-pending-label">' + pendingText + '</span><span class="mod-pending-dots" aria-hidden="true"><i></i><i></i><i></i></span></div></div>';
        return;
      }
      // ★ 直接使用原始文本，不过滤
      var renderText = m.text;
      if (!String(renderText || '').trim()) {
        return;
      }
      // ★ 不再显示计划列表，直接渲染 markdown 内容
      var fenced = Mrite._extractCodeFence(renderText);
      if (fenced && (fenced.lang === 'latex' || fenced.lang === 'tex' || fenced.lang === 'python' || fenced.lang === 'py')) {
        var lang = fenced.lang === 'py' ? 'python' : (fenced.lang === 'tex' ? 'latex' : fenced.lang);
        html += '<div class="mod-msg mod-msg-ai' + errorClass + pendingClass + '"><div class="mod-msg-bubble mod-ai-bubble mod-artifact-bubble">' + Mrite._renderCodeViewer(fenced.code, lang) + '</div></div>';
      } else if (Mrite._looksLikeLatexSource(renderText)) {
        html += '<div class="mod-msg mod-msg-ai' + errorClass + pendingClass + '"><div class="mod-msg-bubble mod-ai-bubble mod-artifact-bubble">' + Mrite._renderCodeViewer(renderText, 'latex') + '</div></div>';
      } else {
        var body = Mrite._renderMarkdown(renderText);
        // ★ 思考过程使用特殊样式
        if (m._thinking) {
          html += '<div class="mod-msg mod-msg-ai mod-msg-thinking' + thinkingClass + '"><div class="mod-msg-bubble mod-ai-bubble mod-thinking-bubble">' +
            '<div class="mod-thinking-label">💭 思考中...</div>' +
            '<div class="mod-thinking-content">' + body + '</div>' +
            '</div></div>';
        }
        // ★ 检测是否有标题，有则用卡片容器包裹
        else {
          var titleMatch = renderText.match(/^###?\s+(.+)$/m);
          if (titleMatch) {
            var title = titleMatch[1].trim();
            html += '<div class="mod-msg mod-msg-ai' + errorClass + pendingClass + '"><div class="mod-msg-bubble mod-ai-bubble mod-artifact-bubble">' +
              '<div class="mod-textcard">' +
              '<div class="mod-textcard-header"><span class="mod-textcard-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg></span>' +
              '<span class="mod-textcard-title">' + Mrite._escHtml(title) + '</span></div>' +
              '<div class="mod-textcard-body">' + body + '</div>' +
              '</div></div></div>';
          } else {
            html += '<div class="mod-msg mod-msg-ai' + errorClass + pendingClass + '"><div class="mod-msg-bubble mod-ai-bubble">' + body + '</div></div>';
          }
        }
      }
    }
  });
  // flush剩余图片
  if (imageGallery.length > 0) {
    html += Mrite._renderImageGallery(imageGallery);
  }
  if (!html && !isSolveTask) {
    html = '<div class="mod-empty-chat">等待任务开始…</div>';
  }
  el.innerHTML = html;
  // ★ 如果用户已上滑，恢复到之前的位置；否则跟随新内容
  if (savedScrollTop >= 0) {
    el.scrollTop = savedScrollTop;
  } else {
    Mrite._scrollChatToBottom(shouldStickBottom);
  }

  // ★ 移除：不再在聊天渲染时调用 _renderToolOps，避免闪烁
  // _renderToolOps 只在 tool_use 和 tool_result 事件时调用

  el.querySelectorAll('.mod-csv-wrap[data-csv]').forEach(function(wrap) {
    var csvPath = wrap.dataset.csv;
    Mrite._loadCsvInline(csvPath, wrap);
  });
  el.querySelectorAll('.mod-csv-wrap[data-file][data-type="tex"]').forEach(function(wrap) {
    var texPath = wrap.dataset.file;
    Mrite._loadTexInline(texPath, wrap);
  });
  el.querySelectorAll('.mod-markdown-wrap[data-markdown-file]').forEach(function(wrap) {
    var mdPath = wrap.dataset.markdownFile;
    Mrite._loadMarkdownInline(mdPath, wrap);
  });
  el.querySelectorAll('.mod-code-wrap[data-code-file]').forEach(function(wrap) {
    var codePath = wrap.dataset.codeFile;
    Mrite._loadCodeInline(codePath, wrap);
  });
  el.querySelectorAll('.mod-image-wrap[data-image]').forEach(function(wrap) {
    Mrite._loadImageInline(wrap.dataset.image, wrap);
  });
};

Mrite._loadImageInline = async function(imagePath, wrap) {
  try {
    var resolvedPath = Mrite._resolveArtifactPath(imagePath);
    var r = await window.electronAPI.readFileContent(resolvedPath);
    if (!r || !r.success || !r.dataUrl) {
      var msg = wrap.closest('.mod-msg');
      if (msg) msg.remove();
      else wrap.remove();
      return;
    }
    wrap.innerHTML = '<img src="' + Mrite._escAttr(r.dataUrl) + '" class="mod-gallery-img" data-path="' + Mrite._escAttr(resolvedPath) + '" onclick="Mrite._openImgPreview(this.dataset.path)">';
    Mrite._scrollChatToBottom(false);
  } catch(e) {
    var msg = wrap.closest('.mod-msg');
    if (msg) msg.remove();
    else wrap.remove();
    Mrite._scrollChatToBottom(false);
  }
};

// ★ 异步加载 CSV 并渲染为数据查看器
Mrite._loadCsvInline = async function(csvPath, wrap) {
  try {
    csvPath = Mrite._resolveArtifactPath(csvPath);
    var r = await window.electronAPI.readFileContent(csvPath);
    if (!r || !r.success) { wrap.parentElement?.remove(); return; }
    var lines = (r.text || '').split('\n').filter(function(l) { return l.trim(); });
    if (!lines.length) { wrap.parentElement?.remove(); return; }
    var headers = lines[0].split(',').map(function(h) { return h.trim(); });
    var rows = lines.slice(1).map(function(line) {
      return line.split(',').map(function(c) { return c.trim(); });
    });
    var data = { headers: headers, rows: rows };
    var filename = csvPath.split('/').pop();
    wrap.innerHTML = Mrite._renderDataViewer(data, filename);
    Mrite._scrollChatToBottom(false);
  } catch(e) { wrap.parentElement?.remove(); Mrite._scrollChatToBottom(false); }
};

// ★ 异步加载 Markdown 文件，按普通气泡正文渲染
Mrite._loadMarkdownInline = async function(mdPath, wrap) {
  try {
    mdPath = Mrite._resolveArtifactPath(mdPath);
    var r = await window.electronAPI.readFileContent(mdPath);
    if (!r || !r.success) { wrap.parentElement?.remove(); return; }
    var text = r.text || '';
    if (!text.trim()) { wrap.parentElement?.remove(); return; }
    wrap.innerHTML = Mrite._renderMarkdownViewer(text, mdPath.split('/').pop());
    Mrite._scrollChatToBottom(false);
  } catch(e) { wrap.parentElement?.remove(); Mrite._scrollChatToBottom(false); }
};

// ★ tex 直接复用代码文件加载逻辑，和 Python 使用同一种代码卡片
Mrite._loadTexInline = async function(texPath, wrap) {
  return Mrite._loadCodeInline(texPath, wrap);
};

// ★ 异步加载代码文件，Python / LaTeX 统一使用同一种代码卡片
Mrite._loadCodeInline = async function(codePath, wrap) {
  try {
    codePath = Mrite._resolveArtifactPath(codePath);
    var r = await window.electronAPI.readFileContent(codePath);
    if (!r || !r.success) { wrap.parentElement?.remove(); return; }
    var text = r.text || '';
    if (!text.trim()) { wrap.parentElement?.remove(); return; }
    var filename = codePath.split('/').pop();
    var ext = (filename.split('.').pop() || 'text').toLowerCase();
    var lang = ext === 'py' ? 'python' : (ext === 'tex' ? 'latex' : ext);
    wrap.innerHTML = Mrite._renderCodeViewer(text, lang, filename);
    Mrite._scrollChatToBottom(false);
  } catch(e) { wrap.parentElement?.remove(); Mrite._scrollChatToBottom(false); }
};

// ═══════════ 图片画廊组件 ═══════════
Mrite._renderImageGallery = function(images) {
  if (!images || images.length === 0) return '';
  var galleryId = 'gallery-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
  var html = '<div class="mod-gallery" id="' + galleryId + '" data-images="' + Mrite._escAttr(JSON.stringify(images)) + '" data-index="0">';
  html += '<div class="mod-gallery-header">';
  html += '<span class="mod-gallery-title"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg> 图片 (' + images.length + ')</span>';
  html += '<span class="mod-gallery-counter"><span class="mod-gallery-current">1</span> / ' + images.length + '</span>';
  html += '</div>';
  html += '<div class="mod-gallery-body">';
  html += '<button class="mod-gallery-btn mod-gallery-prev" onclick="Mrite._galleryPrev(\'' + galleryId + '\')" disabled>‹</button>';
  html += '<div class="mod-gallery-img-wrap mod-image-wrap" data-image="' + Mrite._imageSrcAttr(images[0]) + '"><div class="mod-image-loading">加载图片…</div></div>';
  html += '<button class="mod-gallery-btn mod-gallery-next" onclick="Mrite._galleryNext(\'' + galleryId + '\')"' + (images.length <= 1 ? ' disabled' : '') + '>›</button>';
  html += '</div>';
  html += '<div class="mod-gallery-thumbs">';
  images.forEach(function(img, i) {
    var name = Mrite._fileName(img);
    html += '<span class="mod-gallery-thumb' + (i === 0 ? ' active' : '') + '" onclick="Mrite._galleryGo(\'' + galleryId + '\',' + i + ')" title="' + Mrite._escAttr(name) + '">' + Mrite._escHtml(name.substring(0, 12)) + '</span>';
  });
  html += '</div>';
  html += '</div>';
  return html;
};

Mrite._galleryPrev = function(id) {
  var el = document.getElementById(id);
  if (!el) return;
  var images = JSON.parse(el.dataset.images || '[]');
  var idx = parseInt(el.dataset.index || '0');
  if (idx > 0) Mrite._galleryGo(id, idx - 1);
};

Mrite._galleryNext = function(id) {
  var el = document.getElementById(id);
  if (!el) return;
  var images = JSON.parse(el.dataset.images || '[]');
  var idx = parseInt(el.dataset.index || '0');
  if (idx < images.length - 1) Mrite._galleryGo(id, idx + 1);
};

Mrite._galleryGo = function(id, idx) {
  var el = document.getElementById(id);
  if (!el) return;
  var images = JSON.parse(el.dataset.images || '[]');
  if (idx < 0 || idx >= images.length) return;
  el.dataset.index = idx;
  var wrap = el.querySelector('.mod-gallery-img-wrap');
  if (wrap) {
    wrap.dataset.image = Mrite._resolveArtifactPath(images[idx]);
    wrap.innerHTML = '<div class="mod-image-loading">加载图片…</div>';
    Mrite._loadImageInline(images[idx], wrap);
  }
  var current = el.querySelector('.mod-gallery-current');
  if (current) current.textContent = idx + 1;
  var prev = el.querySelector('.mod-gallery-prev');
  var next = el.querySelector('.mod-gallery-next');
  if (prev) prev.disabled = (idx <= 0);
  if (next) next.disabled = (idx >= images.length - 1);
  el.querySelectorAll('.mod-gallery-thumb').forEach(function(t, i) {
    t.classList.toggle('active', i === idx);
  });
  var activeThumb = el.querySelector('.mod-gallery-thumb.active');
  var thumbs = el.querySelector('.mod-gallery-thumbs');
  if (activeThumb && thumbs) {
    var thumbRect = activeThumb.getBoundingClientRect();
    var railRect = thumbs.getBoundingClientRect();
    var target = thumbs.scrollLeft + (thumbRect.left - railRect.left) - (railRect.width - thumbRect.width) / 2;
    var max = thumbs.scrollWidth - thumbs.clientWidth;
    if (idx <= 0) target = 0;
    else if (idx >= images.length - 1) target = max;
    thumbs.scrollLeft = Math.max(0, Math.min(max, target));
  }
};

// ═══════════ 表格数据渲染（_tableData 用） ═══════════
Mrite._renderTableData = function(tableData) {
  if (!tableData) return '';
  // 如果已有 _renderDataViewer，优先用它
  if (tableData.rows && tableData.headers) {
    return Mrite._renderDataViewer(tableData, tableData.title || '数据表格');
  }
  // 简单对象/数组 → 基础表格
  if (Array.isArray(tableData) && tableData.length > 0) {
    var headers = Object.keys(tableData[0]);
    var html = '<table class="mod-dataviewer-table"><thead><tr>';
    headers.forEach(function(h) { html += '<th>' + Mrite._escHtml(h) + '</th>'; });
    html += '</tr></thead><tbody>';
    tableData.forEach(function(row) {
      html += '<tr>';
      headers.forEach(function(h) { html += '<td>' + Mrite._escHtml(String(row[h] || '')) + '</td>'; });
      html += '</tr>';
    });
    html += '</tbody></table>';
    return html;
  }
  return '<pre>' + Mrite._escHtml(JSON.stringify(tableData, null, 2)) + '</pre>';
};

// ═══════════ 数据表格查看器组件 ═══════════
Mrite._renderDataViewer = function(data, title) {
  if (!data || !data.rows || data.rows.length === 0) return '';
  var viewerId = 'viewer-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
  var html = '<div class="mod-dataviewer" id="' + viewerId + '">';
  html += '<div class="mod-dataviewer-header">';
  html += '<span class="mod-dataviewer-title"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/></svg> ' + Mrite._escHtml(title || '数据') + '</span>';
  var maxRows = data.rows.length;
  html += '<div class="mod-dataviewer-actions"><span class="mod-dataviewer-info">共 ' + data.rows.length + ' 行 × ' + data.headers.length + ' 列</span><button class="mod-dataviewer-zoom" onclick="Mrite._openTablePreview(\'' + viewerId + '\')" title="放大查看"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg></button></div>';
  html += '</div>';
  html += '<div class="mod-dataviewer-table-wrap">';
  html += '<table class="mod-dataviewer-table"><thead><tr>';
  data.headers.forEach(function(h) { html += '<th>' + Mrite._escHtml(h) + '</th>'; });
  html += '</tr></thead><tbody>';
  data.rows.slice(0, maxRows).forEach(function(row) {
    html += '<tr>';
    row.forEach(function(cell) { html += '<td>' + Mrite._escHtml(String(cell)) + '</td>'; });
    html += '</tr>';
  });
  html += '</tbody></table>';
  html += '</div>';
  html += '</div>';
  return html;
};

Mrite._openTablePreview = function(viewerId) {
  var viewer = document.getElementById(viewerId);
  if (!viewer) return;
  var overlay = document.getElementById('tablePreviewOverlay');
  var body = document.getElementById('tablePreviewBody');
  var title = document.getElementById('tablePreviewTitle');
  if (!overlay || !body || !title) return;
  var titleEl = viewer.querySelector('.mod-dataviewer-title');
  var tableWrap = viewer.querySelector('.mod-dataviewer-table-wrap');
  title.textContent = titleEl ? titleEl.textContent.trim() : '表格预览';
  body.innerHTML = tableWrap ? tableWrap.innerHTML : '';
  overlay.style.display = 'flex';
  Mrite._tablePreviewKeyHandler = function(e) {
    if (e.key === 'Escape') Mrite._closeTablePreview();
  };
  document.addEventListener('keydown', Mrite._tablePreviewKeyHandler);
};

Mrite._closeTablePreview = function() {
  var overlay = document.getElementById('tablePreviewOverlay');
  if (overlay) overlay.style.display = 'none';
  if (Mrite._tablePreviewKeyHandler) {
    document.removeEventListener('keydown', Mrite._tablePreviewKeyHandler);
    Mrite._tablePreviewKeyHandler = null;
  }
};

// ═══════════ 代码查看器组件 ═══════════
Mrite._renderCodeViewer = function(code, language, filename) {
  var viewerId = 'code-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
  var lines = code.split('\n');
  var html = '<div class="mod-codeviewer">';
  html += '<div class="mod-codeviewer-header">';
  html += '<span class="mod-codeviewer-lang">' + Mrite._escHtml(language || 'text') + '</span>';
  if (filename) html += '<span class="mod-codeviewer-file">' + Mrite._escHtml(filename) + '</span>';
  html += '<button class="mod-codeviewer-copy" onclick="Mrite._copyCode(\'' + viewerId + '\')">复制</button>';
  html += '</div>';
  html += '<pre class="mod-codeviewer-body" id="' + viewerId + '"><code>' + Mrite._escHtml(code) + '</code></pre>';
  html += '</div>';
  return html;
};

// ═══════════ Markdown 查看器组件 ═══════════
Mrite._renderMarkdownViewer = function(text, filename) {
  var html = '<div class="mod-mdviewer">';
  html += '<div class="mod-mdviewer-header">';
  html += '<span class="mod-mdviewer-badge">MD</span>';
  if (filename) html += '<span class="mod-mdviewer-file">' + Mrite._escHtml(filename) + '</span>';
  html += '</div>';
  html += '<div class="mod-mdviewer-body">' + Mrite._renderMarkdown(text) + '</div>';
  html += '</div>';
  return html;
};

Mrite._copyCode = function(id) {
  var el = document.getElementById(id);
  if (!el) return;
  var code = el.textContent;
  navigator.clipboard.writeText(code).then(function() {
    Mrite._showToast('已复制到剪贴板');
  });
};

// ── 渲染文件变更列表 ──
Mrite._modifyRenderFileOps = function() {
  var el = document.getElementById('modifyFileChanges');
  var count = document.getElementById('modifyOpCount');
  if (!el) return;
  // ★ 无实际文件操作时不生成任何条目
  if (!Mrite.modifyFileOps.length) {
    el.innerHTML = '<div class="mod-file-empty">暂无文件变更</div>';
    if (count) count.textContent = '';
    return;
  }
  if (count) count.textContent = '(' + Mrite.modifyFileOps.length + ')';
  var icons = {
    Read: MIC.read, Write: MIC.write, Edit: MIC.edit,
    Bash: MIC.bash, Grep: MIC.search, Glob: MIC.search,
    WebSearch: MIC.web, WebFetch: MIC.web, Task: MIC.bash,
    delete: MIC.trash, rename: MIC.edit, compile: MIC.compile,
  };
  var html = '';
  Mrite.modifyFileOps.forEach(function(op) {
    var icon = icons[op.op] || MIC.read;
    html += '<div class="mod-file-op"><span class="mod-file-op-icon">' + icon + '</span><span class="mod-file-op-text" title="' + Mrite._escAttr(op.label) + '">' + Mrite._escHtml(op.label) + '</span></div>';
  });
  el.innerHTML = html;
  el.scrollTop = el.scrollHeight;
};

// ── 显示编译状态 ──
Mrite._modifyShowCompileStatus = function(ok, detail) {
  var el = document.getElementById('modifyCompileStatus');
  if (!el) return;
  if (ok === null || ok === undefined) {
    el.classList.add('hidden');
    el.innerHTML = '';
    return;
  }
  el.classList.remove('hidden');
  if (ok) {
    el.className = 'mod-compile-ok';
    el.innerHTML = '<div class="mod-compile-title">' + MIC.check + ' <span>编译成功</span></div><div class="mod-compile-detail">' + Mrite._escHtml(detail || 'PDF 已更新') + '</div>';
  } else {
    el.className = 'mod-compile-err';
    el.innerHTML = '<div class="mod-compile-title">' + MIC.warn + ' <span>编译需手动检查</span></div><div class="mod-compile-detail">' + Mrite._escHtml(detail || '请查看编译日志') + '</div>';
  }
};

// ── 完全重置修改面板 ──
Mrite._modifyReset = function() {
  Mrite.modifyChatHistory = [];
  Mrite.modifyFileOps = [];
  Mrite._modifyResetCompileState();
  Mrite._modifySessionIntent = 'modify';
  Mrite._modifyCompleted = false;
  Mrite._modifyHadFileOps = false;
  Mrite._shownFiles = {}; // ★ 清空已展示文件记录
  Mrite._userScrolledUp = false; // ★ 重置手动滚动标记
  Mrite._modifyRenderChat();
  Mrite._modifyRenderFileOps();
  Mrite._modifyShowCompileStatus(null);
};

// ═══════════ 图片预览弹窗（左右导航） ═══════════
Mrite._imgPreviewList = [];
Mrite._imgPreviewIdx = 0;

Mrite._openImgPreview = function(src) {
  // 收集当前对话中所有图片
  var imgs = [];
  Mrite.modifyChatHistory.forEach(function(m) {
    if (m._image) imgs.push(m._image);
  });
  Mrite._imgPreviewList = imgs;
  Mrite._imgPreviewIdx = imgs.indexOf(src);
  if (Mrite._imgPreviewIdx < 0) Mrite._imgPreviewIdx = 0;
  Mrite._renderImgPreview();
  var overlay = document.getElementById('imgPreviewOverlay');
  if (overlay) overlay.style.display = 'flex';
  // 键盘左右导航
  Mrite._imgPreviewKeyHandler = function(e) {
    if (e.key === 'ArrowLeft') Mrite._imgPreviewNav(-1);
    else if (e.key === 'ArrowRight') Mrite._imgPreviewNav(1);
    else if (e.key === 'Escape') Mrite._closeImgPreview();
  };
  document.addEventListener('keydown', Mrite._imgPreviewKeyHandler);
};

Mrite._closeImgPreview = function() {
  var overlay = document.getElementById('imgPreviewOverlay');
  if (overlay) overlay.style.display = 'none';
  if (Mrite._imgPreviewKeyHandler) {
    document.removeEventListener('keydown', Mrite._imgPreviewKeyHandler);
    Mrite._imgPreviewKeyHandler = null;
  }
};

Mrite._imgPreviewNav = function(delta) {
  var newIdx = Mrite._imgPreviewIdx + delta;
  if (newIdx < 0 || newIdx >= Mrite._imgPreviewList.length) return;
  Mrite._imgPreviewIdx = newIdx;
  Mrite._renderImgPreview();
};

Mrite._renderImgPreview = function() {
  var img = document.getElementById('imgPreviewImg');
  var info = document.getElementById('imgPreviewInfo');
  var prevBtn = document.getElementById('imgPreviewPrev');
  var nextBtn = document.getElementById('imgPreviewNext');
  var list = Mrite._imgPreviewList;
  var idx = Mrite._imgPreviewIdx;
  if (!list.length) return;
  var src = list[idx];
  src = Mrite._resolveArtifactPath(src);
  if (img) {
    img.removeAttribute('src');
    img.alt = '加载图片…';
    window.electronAPI.readFileContent(src).then(function(r) {
      if (r && r.success && r.dataUrl) {
        img.src = r.dataUrl;
        img.alt = Mrite._fileName(src);
      }
    }).catch(function() {});
  }
  if (info) info.textContent = Mrite._fileName(src) + ' (' + (idx + 1) + '/' + list.length + ')';
  if (prevBtn) prevBtn.disabled = (idx <= 0);
  if (nextBtn) nextBtn.disabled = (idx >= list.length - 1);
};

// ── 转义 ──
Mrite._escAttr = function(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
};
