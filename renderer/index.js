// Mrite v1.8 — 入口：事件绑定 + 启动

// ★ 所有面板始终在 DOM 中，用 CSS class 切换可见性
// 面板默认隐藏，只有 active 的面板显示
(function initPanels() {
  ['taskPanel', 'viewPanel', 'settingsPanel'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  var welcome = document.getElementById('welcomePanel');
  if (welcome) welcome.style.display = 'flex';
})();

Mrite._getPanel = function(name) {
  var map = { welcome: 'welcomePanel', task: 'taskPanel', view: 'viewPanel', settings: 'settingsPanel' };
  return document.getElementById(map[name]) || null;
};

document.addEventListener('DOMContentLoaded', async function() {
  // ★ 启动动画 — 名字浮现 → 文字下移 → 淡化
  (function runSplash() {
    var splash = document.getElementById("splashScreen");
    var brand = document.getElementById("splashBrand");
    var tag = document.getElementById("splashTag");
    if (!splash || !brand || !tag) return;

    // Phase 1: 名字弹性放大
    requestAnimationFrame(function() {
      requestAnimationFrame(function() {
        brand.style.transition = "transform .5s cubic-bezier(0.34, 1.56, 0.64, 1), opacity .35s ease-out";
        brand.style.opacity = "1";
        brand.style.transform = "scale(1)";
      });
    });

    // Phase 2: 名字上移 + 文字下移 (500ms)
    setTimeout(function() {
      brand.style.transition = "transform .4s cubic-bezier(0.22, 0.61, 0.36, 1)";
      brand.style.transform = "scale(1) translateY(-10px)";
      tag.style.transition = "opacity .35s ease-out, transform .4s cubic-bezier(0.22, 0.61, 0.36, 1)";
      tag.style.opacity = "1";
      tag.style.transform = "translateY(8px)";
    }, 500);

    // Phase 3: 整体淡化 (1200ms)
    setTimeout(function() {
      splash.style.transition = "opacity .25s ease-out";
      splash.style.opacity = "0";
      splash.style.pointerEvents = "none";
    }, 1200);

    // Phase 4: 移除 (1500ms)
    setTimeout(function() {
      splash.style.display = "none";
    }, 1500);
  })();
  Mrite.loadSettings();

  // 全局入口（给 HTML inline onclick）
  window._openPanel = Mrite.togglePanel;
  window._onRun = Mrite.onRun;
  window._onStop = Mrite.onStop;
  window._onModify = Mrite.onModify;
  window._onVerifyClick = Mrite.onVerifyInviteCode;
  window._onTopicUpload = function() { Mrite.openFilePicker('topic'); };
  window._onDataUpload = function() { Mrite.openFilePicker('data'); };
  window._onBrowseOutput = Mrite.onBrowseOutput;

  // 事件绑定（仅绑定始终在 DOM 中的元素；设置面板按钮在 renderPanel 时由 _bindSettingsButtons 绑定）
  var on = function(id, ev, fn) { var e = document.getElementById(id); if (e) e.addEventListener(ev, fn); };
  on('projectSelect', 'change', Mrite.onSwitchProject);
  on('btnRefresh', 'click', function() { Mrite.refreshViewPanel(); });

  // ★ v1.8: 键盘快捷键 Cmd/Ctrl+R 触发运行
  document.addEventListener('keydown', function(e) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'r') {
      e.preventDefault();
      var S = Mrite.STATE;
      if (S.runStatus === 'running' && S.taskType === 'solve') return;
      Mrite.onRun();
    }
  });

  // 监听 Claude Agent 事件
  if (window.electronAPI?.onAgentEvent) {
    window.electronAPI.onAgentEvent(Mrite.handleAgentEvent);
  }

  window.electronAPI?.onAppCloseBlocked?.(function() {
    Mrite._showAlert({
      title: '无法关闭',
      desc: '任务正在运行中，请先中止任务再关闭应用。',
      type: 'warn',
      btnText: '取消',
      secondaryBtnText: '直接关闭',
      secondaryBtnCallback: function() {
        window.electronAPI?.forceCloseApp?.();
      }
    });
  });

  // ★ 版本过低弹窗
  window.electronAPI?.onVersionOutdated?.(function(data) {
    var minVer = (data && data.minVersion) || '';
    Mrite._showAlert({
      title: '版本过低',
      desc: '当前软件版本过低，无法继续使用。' + (minVer ? '\n最低要求版本：' + minVer : '') + '\n请更新到最新版本后再试。',
      type: 'warn',
      btnText: '知道了'
    });
  });

  // 初始化 — 检测工作空间状态
  await Mrite._loadProjectList();

  // 初始化信息看板（默认界面）
  Mrite.dashboardInit();

  // ★ 首次进入主界面后做系统配置检查
  Mrite._scheduleSystemConfigOnStartup();

  if (Mrite.STATE.runStatus === 'done') {
    Mrite.updateButtonStates();
    Mrite.updateStatusIndicator();
    try { await Mrite.loadHistoryList(); } catch(e) {}
  } else {
    Mrite.updateButtonStates();
    Mrite.updateStatusIndicator();
  }
});
