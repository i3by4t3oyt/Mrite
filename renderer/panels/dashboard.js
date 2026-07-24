// Mrite v1.8 — 首页信息展示 + 公告轮播
window.Mrite = window.Mrite || {};

// ★ 默认公告（后端拉取失败时的 fallback）
Mrite._defaultNotices = [
  { title: '快速上手指南',
    desc: '**第一步：选择模板**\n在左侧选择竞赛模板（如高教社杯），点击进入。\n\n**第二步：上传文件**\n将赛题 PDF 拖拽到「题目」区域，数据文件拖拽到「数据」区域。\n\n**第三步：配置信息**\n填写队伍编号、题号等信息（可选），确认输出路径。\n\n**第四步：开始求解**\n点击绿色「运行」按钮，AI 自动完成：读题 → 建模 → 求解 → 撰写论文 → 编译 PDF。\n\n**第五步：查看结果**\n求解完成后，在输出目录查看论文 PDF，可进入修改模式调整。\n\n> 全程约 10-30 分钟，无需手动干预。' },
  { title: '常见问题解答',
    desc: '**Q：编译失败怎么办？**\nA：检查 LaTeX 环境是否安装完整，点击「设置 - 系统环境」检测。\n\n**Q：求解中断了能恢复吗？**\nA：可以！在运行记录中点击「装载」，恢复进度后继续运行。\n\n**Q：如何切换 AI 模型？**\nA：在「设置 - 模型管理」中添加或切换模型，支持多个 API 端点。\n\n**Q：论文质量不满意？**\nA：进入修改模式，输入具体修改指令，如"缩减摘要到800字"、"优化表格排版"。\n\n**Q：如何查看历史记录？**\nA：左侧运行记录列表显示所有历史任务，可随时装载恢复。' },
  { title: '数模竞赛备赛攻略',
    desc: '**赛前准备（2-4周）**\n- 熟悉常用模型：线性回归、神经网络、优化算法、图论\n- 准备代码模板：数据预处理、可视化、模型评估\n- 练习 LaTeX 排版：表格、公式、参考文献\n\n**比赛期间（3天）**\n- Day1：审题 + 建模思路 + 文献调研\n- Day2：编程求解 + 结果分析\n- Day3：论文撰写 + 排版 + 检查\n\n**评审重点**\n- 建模思路的创新性（30%）\n- 求解方法的正确性（25%）\n- 论文表达的清晰度（25%）\n- 结果的合理性（20%）' },
  { title: '近期数模竞赛日程',
    desc: '| 赛事 | 时间 | 级别 |\n|------|------|------|\n| 深圳杯 | 7月中旬 | 省级 |\n| CUMCM 国赛 | 9月中旬 | 国家级 |\n| 认证杯 | 11月 | 国家级 |\n| MCM/ICM 美赛 | 2027.2 | 国际级 |\n| 华为杯 | 12月 | 国家级 |\n\n**参赛建议**\n- 提前 2 周组队并分工\n- 准备好编程环境和模板\n- 熟悉 Mrite 的使用流程\n\n> 详见 [MCM 官网](https://www.mcm.edu.cn)' },
  { title: '作者的话',
    desc: 'Mrite 是辅助工具，**不能替代你的独立思考**。\n\n**评审最看重的是：**\n- 你的建模思路和创新点\n- 问题分析的深度和广度\n- 结果验证的严谨性\n\n**AI 能帮你做的：**\n- 快速生成代码和图表\n- 自动排版和编译\n- 节省重复劳动时间\n\n**AI 不能替代的：**\n- 问题理解和分析\n- 模型选择和创新\n- 结果解释和讨论\n\n> 真正获奖的，永远是**你的想法**，而不是 AI 的输出。善用工具，但不依赖工具。' },
];

Mrite._noticeIdx = 0;
Mrite._noticeTimer = null;
Mrite._noticeSyncTimer = null;
Mrite._notices = []; // 实际公告数据
Mrite._serverConnected = false; // 服务器连接状态
Mrite._serverRegion = localStorage.getItem('mrite-region') || ''; // 服务器地区（断网保留）

// ★ 从后端拉取公告
Mrite._fetchNotices = async function() {
  try {
    if (window.electronAPI && window.electronAPI.fetchAnnouncements) {
      var r = await window.electronAPI.fetchAnnouncements();
      if (r && r.success && r.announcements && r.announcements.length) {
        Mrite._notices = r.announcements.map(function(a) {
          return { title: a.title, desc: a.content };
        });
        Mrite._serverConnected = true;
        Mrite._cacheNotices(); // 缓存到本地
        Mrite._updateConnectionUI();
        return;
      }
      // API 成功但无公告也算连接成功
      if (r && r.success) {
        Mrite._serverConnected = true;
        Mrite._updateConnectionUI();
        if (!Mrite._notices || !Mrite._notices.length) {
          Mrite._notices = Mrite._defaultNotices || [];
        }
        return;
      }
    }
  } catch (e) {}
  // 连接失败，保留缓存的公告
  Mrite._serverConnected = false;
  Mrite._updateConnectionUI();
  if (!Mrite._notices || !Mrite._notices.length) {
    Mrite._notices = Mrite._defaultNotices || [];
  }
};

// ★ 更新连接状态 UI
Mrite._updateConnectionUI = function() {
  // 缓存地区（断网时保留）
  if (Mrite._serverRegion) {
    localStorage.setItem('mrite-region', Mrite._serverRegion);
  }

  var S = Mrite.STATE;
  var isExpired = Mrite._isExpired && Mrite._isExpired();
  var isActivated = S.settings.inviteVerified && !isExpired;

  var statusText, dotClass;
  if (isActivated) {
    statusText = '已激活';
    dotClass = 'ok';
  } else if (isExpired) {
    statusText = '已过期';
    dotClass = 'fail';
  } else {
    statusText = '未激活';
    dotClass = 'fail';
  }

  // 状态卡
  var actEl = document.getElementById('whInfoActivate');
  if (actEl) { actEl.textContent = statusText; actEl.style.color = dotClass === 'ok' ? '#059669' : '#ef4444'; }
  var actDot = document.getElementById('whActivateDot');
  if (actDot) { actDot.className = 'wh-status-dot ' + dotClass; }
};

// ★ 监听网络变化
Mrite._initConnectionListener = function() {
  // 浏览器原生断网事件 → 立即显示断开
  window.addEventListener('offline', function() {
    Mrite._serverConnected = false;
    Mrite._updateConnectionUI();
    Mrite._syncHomeStatus();
    // ★ 任务运行中断网 → 在对话窗口显示警告
    if (Mrite.STATE && Mrite.STATE.runStatus === 'running') {
      Mrite._showNetworkWarning('offline');
    }
  });
  // 浏览器联网事件 → 立即尝试重连一次
  window.addEventListener('online', function() {
    Mrite._tryReconnect();
    // ★ 联网恢复 → 在对话窗口显示恢复提示
    if (Mrite._networkWarnShown) {
      Mrite._showNetworkWarning('online');
    }
  });
};

// ★ 断网/恢复提示（任务运行中）
Mrite._networkWarnShown = false;
Mrite._showNetworkWarning = function(type) {
  if (type === 'offline') {
    Mrite._networkWarnShown = true;
    if (typeof Mrite._modifyAddAiMsg === 'function') {
      Mrite._modifyAddAiMsg('⚠️ 网络已断开，任务可能中断。请检查网络连接，恢复后可点击"继续"重试。');
    }
    if (typeof Mrite._showToast === 'function') {
      Mrite._showToast('⚠️ 网络断开，任务可能受影响');
    }
  } else if (type === 'online') {
    Mrite._networkWarnShown = false;
    if (typeof Mrite._modifyAddAiMsg === 'function') {
      Mrite._modifyAddAiMsg('✅ 网络已恢复连接。');
    }
    if (typeof Mrite._showToast === 'function') {
      Mrite._showToast('✅ 网络已恢复');
    }
  }
};

// ★ 联网恢复：立即尝试重连一次
Mrite._tryReconnect = async function() {
  var footer = document.getElementById('homeFooterStatus');
  if (footer) { footer.textContent = '重连中...'; footer.style.color = '#ca8a04'; }
  var actEl = document.getElementById('whInfoActivate');
  if (actEl) { actEl.textContent = '重连中...'; actEl.style.color = '#ca8a04'; }

  try {
    if (window.electronAPI && window.electronAPI.checkConnection) {
      var cs = await window.electronAPI.checkConnection();
      if (cs) {
        Mrite._serverConnected = cs.connected;
        if (cs.region) Mrite._serverRegion = cs.region;
      }
    }
  } catch(e) {}

  Mrite._updateConnectionUI();
  Mrite._syncHomeStatus();
  await Mrite._fetchNotices();
  Mrite._renderNotices();
};

// ★ 缓存公告到 localStorage
Mrite._cacheNotices = function() {
  if (Mrite._notices && Mrite._notices.length) {
    try { localStorage.setItem('mrite-notices', JSON.stringify(Mrite._notices)); } catch(e) {}
  }
};

// ★ 从缓存加载数据（立即显示，不等服务器）
Mrite._loadCachedData = function() {
  // 加载缓存的地区
  Mrite._serverRegion = localStorage.getItem('mrite-region') || '';
  // 加载缓存的公告
  try {
    var cached = localStorage.getItem('mrite-notices');
    if (cached) {
      var parsed = JSON.parse(cached);
      if (Array.isArray(parsed) && parsed.length) {
        Mrite._notices = parsed;
      }
    }
  } catch(e) {}
  if (!Mrite._notices || !Mrite._notices.length) {
    Mrite._notices = Mrite._defaultNotices || [];
  }
};

// ★ 渲染公告卡片
Mrite._renderNotices = function() {
  var tEl = document.getElementById('whNoticeTitle');
  var dEl = document.getElementById('whNoticeDesc');
  var dotsEl = document.getElementById('whNoticeDots');
  if (!tEl || !dEl) return;

  var notices = Mrite._notices;
  Mrite._noticeIdx = 0;

  if (dotsEl) {
    var dotsHtml = '';
    for (var i = 0; i < notices.length; i++) {
      dotsHtml += '<span class="wh-notice-dot' + (i === 0 ? ' active' : '') + '" data-idx="' + i + '"></span>';
    }
    dotsEl.innerHTML = dotsHtml;
    dotsEl.onclick = function(e) {
      var dot = e.target.closest('.wh-notice-dot');
      if (dot) Mrite._showNotice(parseInt(dot.getAttribute('data-idx')));
    };
  }

  // 显示第一条
  Mrite._showNotice(0);

  // 绑定箭头按钮
  var prevBtn = document.getElementById('whNoticePrev');
  var nextBtn = document.getElementById('whNoticeNext');
  if (prevBtn) prevBtn.onclick = function() { Mrite._showNotice(Mrite._noticeIdx - 1); };
  if (nextBtn) nextBtn.onclick = function() { Mrite._showNotice(Mrite._noticeIdx + 1); };

  // 链接点击 → 默认浏览器打开
  var descEl = document.getElementById('whNoticeDesc');
  if (descEl) {
    descEl.addEventListener('click', function(e) {
      var a = e.target.closest('a');
      if (a && a.href) {
        e.preventDefault();
        if (window.electronAPI && window.electronAPI.openExternal) {
          window.electronAPI.openExternal(a.href);
        }
      }
    });
  }

  // 启动自动轮播
  if (Mrite._noticeTimer) clearInterval(Mrite._noticeTimer);
  Mrite._noticeTimer = setInterval(function() {
    Mrite._showNotice((Mrite._noticeIdx + 1) % notices.length);
  }, 60000);
};

// ★ Markdown → HTML 渲染器（标题/表格/代码/链接/列表/粗体/斜体/引用/分隔线）
function parseRichText(text) {
  if (!text) return '';
  var lines = text.split('\n');
  var html = '';
  var inTable = false;
  var tableHtml = '';
  var inList = false;
  var listType = ''; // 'ul' or 'ol'

  function closeList() {
    if (inList) {
      html += '</' + listType + '>';
      inList = false;
      listType = '';
    }
  }

  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    // 安全转义
    line = line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    // 分隔线：--- 或 *** 或 ___
    if (/^[-*_]{3,}\s*$/.test(line.trim())) {
      closeList();
      if (inTable) { html += '<table class="wn-table">' + tableHtml + '</table>'; tableHtml = ''; inTable = false; }
      html += '<hr>';
      continue;
    }

    // 标题：# ## ### ####
    var headingMatch = line.match(/^(#{1,4})\s+(.+)/);
    if (headingMatch) {
      closeList();
      if (inTable) { html += '<table class="wn-table">' + tableHtml + '</table>'; tableHtml = ''; inTable = false; }
      var level = headingMatch[1].length;
      var headingText = headingMatch[2]
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
        .replace(/\*(.+?)\*/g, '<i>$1</i>')
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');
      html += '<h' + level + ' style="font-size:' + (16 - level) + 'px;font-weight:700;color:#18181b;margin:8px 0 4px">' + headingText + '</h' + level + '>';
      continue;
    }

    // 表格行：以 | 开头
    if (/^\|.+\|$/.test(line.trim())) {
      closeList();
      if (/^\|[-:\s|]+\|$/.test(line.trim())) { inTable = true; continue; } // 分隔行跳过
      if (!inTable) tableHtml = '';
      inTable = true;
      var cells = line.trim().split('|').filter(function(c) { return c.length > 0; });
      var isFirstRow = !tableHtml;
      tableHtml += '<tr>' + cells.map(function(c, j) {
        var cellContent = c.trim()
          .replace(/`([^`]+)`/g, '<code>$1</code>')
          .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
          .replace(/\*(.+?)\*/g, '<i>$1</i>')
          .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');
        return '<' + (isFirstRow ? 'th' : 'td') + '>' + cellContent + '</' + (isFirstRow ? 'th' : 'td') + '>';
      }).join('') + '</tr>';
      continue;
    } else if (inTable) {
      html += '<table class="wn-table">' + tableHtml + '</table>';
      tableHtml = '';
      inTable = false;
    }

    // 无序列表：- 或 *
    if (/^\s*[-*]\s+/.test(line)) {
      if (!inList || listType !== 'ul') {
        closeList();
        html += '<ul style="margin:4px 0;padding-left:20px">';
        inList = true;
        listType = 'ul';
      }
      var itemText = line.replace(/^\s*[-*]\s+/, '')
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
        .replace(/\*(.+?)\*/g, '<i>$1</i>')
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');
      html += '<li style="margin:2px 0">' + itemText + '</li>';
      continue;
    }

    // 有序列表：1. 2. 3.
    if (/^\s*\d+\.\s+/.test(line)) {
      if (!inList || listType !== 'ol') {
        closeList();
        html += '<ol style="margin:4px 0;padding-left:20px">';
        inList = true;
        listType = 'ol';
      }
      var itemText = line.replace(/^\s*\d+\.\s+/, '')
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
        .replace(/\*(.+?)\*/g, '<i>$1</i>')
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');
      html += '<li style="margin:2px 0">' + itemText + '</li>';
      continue;
    }

    closeList();

    // 行内解析
    var processed = line
      .replace(/`([^`]+)`/g, '<code>$1</code>')                         // 行内代码
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>') // 链接
      .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')                            // 粗体
      .replace(/\*(.+?)\*/g, '<i>$1</i>');                                // 斜体

    // 块级元素
    if (/^> (.+)/.test(line)) {
      html += '<blockquote style="border-left:3px solid #d4d4d8;padding:4px 8px;margin:4px 0;color:#71717a;background:#fafafa;border-radius:0 4px 4px 0">' + processed.replace(/^&gt;\s*/, '') + '</blockquote>';
    } else if (line.trim() === '') {
      html += '<div style="height:4px"></div>';
    } else {
      html += '<p style="margin:4px 0">' + processed + '</p>';
    }
  }

  // 关闭残留的列表
  closeList();

  // 尾部残留表格
  if (inTable && tableHtml) {
    html += '<table class="wn-table">' + tableHtml + '</table>';
  }

  return html;
}

// ★ 切换到指定公告
Mrite._showNotice = function(idx) {
  var notices = Mrite._notices;
  if (idx < 0) idx = notices.length - 1;
  if (idx >= notices.length) idx = 0;
  Mrite._noticeIdx = idx;

  var n = notices[idx];
  var tEl = document.getElementById('whNoticeTitle');
  var dEl = document.getElementById('whNoticeDesc');
  if (tEl) tEl.innerHTML = n.title;
  if (dEl) {
    dEl.innerHTML = parseRichText(n.desc);
    // 渲染 LaTeX 公式
    try {
      if (window.renderMathInElement) {
        window.renderMathInElement(dEl, {
          delimiters: [
            { left: '$$', right: '$$', display: true },
            { left: '$', right: '$', display: false },
            { left: '\\(', right: '\\)', display: false },
            { left: '\\[', right: '\\]', display: true }
          ],
          throwOnError: false
        });
      }
    } catch (e) { console.warn('KaTeX render error:', e); }
  }

  var dots = document.querySelectorAll('#whNoticeDots .wh-notice-dot');
  dots.forEach(function(d, i) {
    d.classList.toggle('active', i === idx);
  });
};

// ★ 同步底部状态文字
Mrite._syncHomeStatus = function() {
  var footer = document.getElementById('homeFooterStatus');
  if (!footer) return;
  var S = Mrite.STATE;
  var isExpired = Mrite._isExpired && Mrite._isExpired();

  if (S.runStatus === 'running' || S.runStatus === 'paused') {
    footer.textContent = '任务进行中';
    footer.style.color = '';
  } else if (!S.settings.inviteCode || !S.settings.inviteVerified) {
    footer.textContent = '未激活';
    footer.style.color = '#ef4444';
  } else if (isExpired) {
    footer.textContent = '已过期';
    footer.style.color = '#ef4444';
  } else {
    footer.textContent = '已激活';
    footer.style.color = '#059669';
  }
  // 同时更新状态卡
  Mrite._updateConnectionUI();
};

// ★ 刷新系统信息面板
Mrite._refreshInfoPanel = function() {
  var S = Mrite.STATE;
  var modelEl = document.getElementById('whInfoModel');
  if (modelEl) {
    var model = S.settings.apiModel || '--';
    if (model.length > 28) model = model.slice(0, 26) + '…';
    modelEl.textContent = model;
  }
  // 同步更新激活状态
  Mrite._updateConnectionUI();
  Mrite._syncHomeStatus();
};

// ★ 格式化数字
Mrite._fmtNum = function(n) {
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return String(n);
};
Mrite._fmtDur = function(ms) {
  if (!ms || ms <= 0) return '--';
  var min = Math.floor(ms / 60000);
  if (min < 60) return min + 'm';
  var h = Math.floor(min / 60);
  if (h < 24) return h + 'h' + (min % 60) + 'm';
  var d = Math.floor(h / 24);
  return d + '天' + (h % 24) + '时';
};

// ★ 刷新数据仪表盘
Mrite._refreshDash = async function() {
  var setVal = function(id, val) {
    var el = document.getElementById(id);
    if (el) el.textContent = val;
  };

  var daily = {};
  var tasks = [];
  var totals = { input: 0, output: 0, tasks: 0, durationMs: 0 };
  var trend = [];

  try {
    var r = await window.electronAPI.getUsageStats();
    if (r && r.success) {
      daily = r.daily || {};
      tasks = r.tasks || [];
      totals = r.totals || totals;
      trend = r.trend || [];
    }
  } catch(e) {}
  Mrite._lastDailyData = daily;

  var hourlyRows = [];
  try {
    var hr = await window.electronAPI.getHourlyStats();
    if (hr && hr.success) hourlyRows = hr.rows || [];
  } catch(e) {}

  // 概览数字
  // 第一行
  setVal('whDashPapers', totals.tasks > 0 ? totals.tasks : '--');
  var totalTokens = (totals.input || 0) + (totals.output || 0);
  setVal('whDashTokens', totalTokens > 0 ? Mrite._fmtNum(totalTokens) : '--');
  setVal('whDashRuntime', Mrite._fmtDur(totals.durationMs));
  var avgMs = totals.tasks > 0 ? Math.round(totals.durationMs / totals.tasks) : 0;
  setVal('whDashAvgTime', avgMs > 0 ? Math.round(avgMs / 1000) + 's' : '--');
  // 完成率：已完成任务 / 总任务
  if (totals.tasks > 0) {
    var completed = tasks.filter(function(t) { return t.status === 'completed'; }).length;
    var total = totals.tasks;
    setVal('whDashSuccess', Math.round(completed / total * 100) + '%');
  } else {
    setVal('whDashSuccess', '--');
  }
  // 第二行
  setVal('whDashInput', totals.input > 0 ? Mrite._fmtNum(totals.input) : '--');
  setVal('whDashOutput', totals.output > 0 ? Mrite._fmtNum(totals.output) : '--');
  var todayStr = new Date().toISOString().split('T')[0];
  var todayData = daily[todayStr];
  setVal('whDashTodayTasks', todayData && todayData.tasks > 0 ? todayData.tasks : '--');
  var todayTok = todayData ? (todayData.input || 0) + (todayData.output || 0) : 0;
  setVal('whDashTodayTokens', todayTok > 0 ? Mrite._fmtNum(todayTok) : '--');
  // 花费：输入 ¥1/M + 输出 ¥4/M
  var cost = ((totals.input || 0) * 1 + (totals.output || 0) * 4) / 1e6;
  setVal('whDashCost', cost > 0 ? '¥' + cost.toFixed(2) : '--');

  // 热力图
  Mrite._renderHeatmap(hourlyRows);

  // 7天趋势
  Mrite._renderTrend(trend);

  // 昼夜曲线
  Mrite._renderCurve(hourlyRows);
};

// ★ 渲染热力图（大格子撑满，hover显示详情）
Mrite._renderHeatmap = function(hourlyRows) {
  var grid = document.getElementById('dashHeatmap');
  if (!grid) return;

  // 构建 date+slot → tokens（小时数据）
  var heatData = {};
  if (hourlyRows && hourlyRows.length) {
    hourlyRows.forEach(function(r) {
      var slot = Math.floor((r.hour || 0) / 4);
      if (slot > 5) slot = 5;
      var key = r.date + '|' + slot;
      var tokens = (r.input_tokens || 0) + (r.output_tokens || 0);
      heatData[key] = (heatData[key] || 0) + tokens;
    });
  }

  // 日数据兜底（按时段权重分布，总和=1）
  var slotWeights = [0.05, 0.13, 0.22, 0.22, 0.20, 0.18];
  if (Mrite._lastDailyData) {
    for (var dk in Mrite._lastDailyData) {
      var dd = Mrite._lastDailyData[dk];
      if (dd && dd.tasks > 0) {
        var total = (dd.input||0) + (dd.output||0);
        for (var s = 0; s < 6; s++) {
          var k = dk + '|' + s;
          if (!heatData[k]) heatData[k] = Math.round(total * slotWeights[s]);
        }
      }
    }
  }

  // 计算全局 maxTokens
  var maxTokens = 0;
  for (var k in heatData) {
    if (heatData[k] > maxTokens) maxTokens = heatData[k];
  }

  // 动态列数撑满宽度
  var container = grid.parentElement;
  var availWidth = container ? container.offsetWidth - 10 : 300;
  var cols = Math.max(30, Math.floor(availWidth / 12));

  var today = new Date();
  var html = '';
  var slotNames = ['0-4时','4-8时','8-12时','12-16时','16-20时','20-24时'];

  // 外层=列（天），内层=行（时段）→ grid-auto-flow:column 先填满一列再下一列
  for (var d = cols - 1; d >= 0; d--) {
    var dt = new Date(today);
    dt.setDate(today.getDate() - d);
    var ds = dt.toISOString().split('T')[0];
    for (var slot = 0; slot < 6; slot++) {
      var key = ds + '|' + slot;
      var tokens = heatData[key] || 0;
      var lv = 0;
      if (tokens > 0 && maxTokens > 0) {
        var r = tokens / maxTokens;
        lv = r <= 0.25 ? 1 : r <= 0.5 ? 2 : r <= 0.75 ? 3 : 4;
      }
      var tip = (dt.getMonth()+1)+'/'+dt.getDate()+' '+slotNames[slot];
      if (tokens > 0) tip += '\n'+(tokens>=1000?(tokens/1000).toFixed(1)+'K':tokens)+' tokens';
      else tip += '\n无数据';
      html += '<div class="c lv'+lv+'" title="'+tip+'"></div>';
    }
  }
  grid.innerHTML = html;
};

// ★ 渲染7天趋势
Mrite._renderTrend = function(trend) {
  var el = document.getElementById('dashTrend');
  if (!el) return;
  if (!trend || !trend.length) {
    el.innerHTML = '<span class="dash-trend-empty">暂无数据</span>';
    return;
  }
  var maxVal = 0;
  trend.forEach(function(d) { var t=(d.input||0)+(d.output||0); if(t>maxVal)maxVal=t; });
  if (maxVal === 0) maxVal = 1;
  var today = new Date().toISOString().split('T')[0];
  var dayNames = ['日','一','二','三','四','五','六'];
  var html = '';
  trend.forEach(function(d) {
    var total = (d.input||0)+(d.output||0);
    var pct = Math.max(4, Math.round(total/maxVal*100));
    var dt = new Date(d.date);
    var isToday = d.date === today;
    var num = total > 0 ? Mrite._fmtNum(total) : '';
    html += '<div class="tb">';
	    html += '<div class="bar-track"><span class="num">'+num+'</span><div class="bar'+(isToday?' now':'')+'" style="height:'+pct+'%"></div></div>';
    html += '<span class="day">'+(isToday?'今':dayNames[dt.getDay()])+'</span>';
    html += '</div>';
  });
  el.innerHTML = html;
};

// ★ 渲染昼夜曲线（和热力图同一份数据：6时段 → 展开成24点）
Mrite._renderCurve = function(hourlyRows) {
  var lineEl = document.getElementById('curveLine');
  var areaEl = document.getElementById('curveArea');
  if (!lineEl || !areaEl) return;

  // 构建和热力图完全一致的数据：date+slot → tokens
  var slotTotals = [0,0,0,0,0,0];
  var slotDays = [{},{},{},{},{},{}];
  if (hourlyRows && hourlyRows.length) {
    hourlyRows.forEach(function(r) {
      var slot = Math.floor((r.hour || 0) / 4);
      if (slot > 5) slot = 5;
      var tokens = (r.input_tokens || 0) + (r.output_tokens || 0);
      slotTotals[slot] += tokens;
      slotDays[slot][r.date] = true;
    });
  }

  // 每时段日均
  var slotAvg = [];
  var hasData = false;
  for (var s = 0; s < 6; s++) {
    var days = Object.keys(slotDays[s]).length;
    var avg = days > 0 ? slotTotals[s] / days : 0;
    slotAvg.push(avg);
    if (avg > 0) hasData = true;
  }

  // 无小时数据时，用 daily × 同一套 slotWeights
  if (!hasData && Mrite._lastDailyData) {
    var slotWeights = [0.05, 0.13, 0.22, 0.22, 0.20, 0.18];
    for (var dk in Mrite._lastDailyData) {
      var dd = Mrite._lastDailyData[dk];
      if (dd && dd.tasks > 0) {
        var total = (dd.input || 0) + (dd.output || 0);
        for (var s = 0; s < 6; s++) slotAvg[s] += total * slotWeights[s];
      }
    }
    var dayCount = Object.keys(Mrite._lastDailyData).length || 1;
    for (var s = 0; s < 6; s++) slotAvg[s] /= dayCount;
  }

  // 6个时段展开成24个点（每个时段内4小时值相同）
  var hourAvg = [];
  for (var s = 0; s < 6; s++) {
    for (var h = 0; h < 4; h++) hourAvg.push(slotAvg[s]);
  }

  // 3点移动平均平滑数据
  var smooth = [];
  for (var i = 0; i < 24; i++) {
    var sum = hourAvg[i], cnt = 1;
    if (i > 0)  { sum += hourAvg[i-1]; cnt++; }
    if (i < 23) { sum += hourAvg[i+1]; cnt++; }
    smooth.push(sum / cnt);
  }
  var maxVal = Math.max.apply(null, smooth) || 1;
  var W = 240, H = 60;
  var pts = [];
  for (var i = 0; i < 24; i++) {
    var x = (i / 23) * W;
    var y = H - (smooth[i] / maxVal) * (H - 6) - 3;
    pts.push({ x: x, y: y });
  }

  // 三次贝塞尔平滑：控制点取相邻三点加权，形成连续光滑曲线
  var d = 'M' + pts[0].x.toFixed(1) + ',' + pts[0].y.toFixed(1);
  for (var i = 0; i < pts.length - 1; i++) {
    var p0 = pts[Math.max(0, i - 1)];
    var p1 = pts[i];
    var p2 = pts[i + 1];
    var p3 = pts[Math.min(pts.length - 1, i + 2)];
    // 使用张力系数 0.3，曲线柔和且不越界
    var t = 0.3;
    var cp1x = p1.x + (p2.x - p0.x) * t;
    var cp1y = p1.y + (p2.y - p0.y) * t;
    var cp2x = p2.x - (p3.x - p1.x) * t;
    var cp2y = p2.y - (p3.y - p1.y) * t;
    d += ' C' + cp1x.toFixed(1) + ',' + cp1y.toFixed(1) + ' ' +
         cp2x.toFixed(1) + ',' + cp2y.toFixed(1) + ' ' +
         p2.x.toFixed(1) + ',' + p2.y.toFixed(1);
  }
  lineEl.setAttribute('d', d);
  areaEl.setAttribute('d', d + ' L' + W + ',' + H + ' L0,' + H + ' Z');
};

Mrite.dashboardInit = async function() {
  // 初始化网络变化监听
  Mrite._initConnectionListener();
  // 从缓存加载（立即显示，不等服务器）
  Mrite._loadCachedData();
  Mrite._refreshInfoPanel();
  Mrite._renderNotices();
  // 加载机器码
  try {
    if (window.electronAPI && window.electronAPI.getMachineCode) {
      var mc = await window.electronAPI.getMachineCode();
      if (mc && mc.success && mc.machineCode) {
        var mcEl = document.getElementById('whBrandMachineCode');
        if (mcEl) mcEl.textContent = mc.machineCode;
      }
    }
  } catch(e) {}
  // 首次连接服务器（只在启动时做一次）
  try {
    if (window.electronAPI && window.electronAPI.checkConnection) {
      var cs = await window.electronAPI.checkConnection();
      if (cs) {
        Mrite._serverConnected = cs.connected;
        if (cs.region) Mrite._serverRegion = cs.region;
      }
    }
  } catch(e) {}
  // 拉取公告并缓存
  await Mrite._fetchNotices();
  Mrite._renderNotices();
  Mrite._cacheNotices();
  // 刷新仪表盘数据
  await Mrite._refreshDash();
  // 更新UI
  Mrite._updateConnectionUI();
  Mrite._syncHomeStatus();
  Mrite._refreshInfoPanel();
  // 30秒刷新仪表盘数据（不检测连接状态，只刷数据）
  if (Mrite._dashRefreshTimer) clearInterval(Mrite._dashRefreshTimer);
  Mrite._dashRefreshTimer = setInterval(function() {
    Mrite._refreshDash();
  }, 30000);
};
