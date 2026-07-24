// Mrite v1.8 — 面板切换 + 窗口尺寸 + 激活遮罩 + 错误弹窗 + 项目管理
window.Mrite = window.Mrite || {};

// ★ 运行中操作守卫：返回 true 表示正在运行（调用方应 return），false 表示可继续
Mrite._guardRunning = function(actionName) {
  var S = Mrite.STATE;
  if (S.runStatus === 'running' || S.runStatus === 'paused') {
    Mrite._showToast('项目运行中，暂时无法' + (actionName || '执行此操作'));
    return true;
  }
  return false;
};

Mrite._panelSwitching = false;

Mrite.togglePanel = async function(name) {
  // ★ 防止并发切换
  if (Mrite._panelSwitching) return;
  Mrite._panelSwitching = true;
  try {
    var S = Mrite.STATE;

    S.activePanel = name;

    // ★ 切换面板可见性
    await Mrite.renderPanel(name);

    if (name === 'view') { Mrite.loadHistoryList(); Mrite._syncAndRefresh(); }
    if (name === 'task') {
      // ★ 延迟初始化，让面板先显示出来
      requestAnimationFrame(function() {
        Mrite.renderFileList();
        Mrite._initDropZones?.();
        Mrite._initTaskPanel();
        Mrite._updateDialogModePill();
        Mrite._modifyRenderChat(); Mrite._modifyRenderFileOps();
      });
      var uploadSection = document.getElementById('taskUploadSection');
      var execSection = document.getElementById('taskExecSection');
      var hasLoadedProject = !!S.inputLoaded;
      // ★ 有工作区就显示执行区，没有就显示上传区
      if (uploadSection) uploadSection.classList.toggle('hidden', hasLoadedProject);
      if (execSection) execSection.classList.toggle('hidden', !hasLoadedProject);
      if (hasLoadedProject && Mrite._scrollChatToBottom) {
        requestAnimationFrame(function() { Mrite._scrollChatToBottom(true); });
      }
      // ★ 恢复进度条和顶部控制栏
      var topCard = document.querySelector('.task-v4-top-card');
      var track = document.querySelector('.progress-track');
      var bar = document.querySelector('#progressBarFill');
      var pt = document.querySelector('#progressText');
      if (hasLoadedProject) {
        if (topCard) { topCard.classList.remove('collapsed'); topCard.classList.add('force-visible'); }
        if (S.taskType === 'modify') {
          // 修改模式：隐藏进度条
          if (track) track.style.display = 'none';
        } else {
          // 求解模式：始终显示进度条（确保 track 可见）
          if (track) track.style.display = '';
          if (S.runStatus === 'done') {
            // 已完成：保持 100% + done 样式
            if (bar) { bar.style.width = '100%'; bar.classList.add('done'); bar.classList.remove('error'); }
            if (pt) pt.textContent = '100%';
          } else {
            var savedProg = (S._prevProgress || 0) || (S._savedProgress || 0);
            if (savedProg > 0) {
              if (bar) { bar.style.width = savedProg + '%'; bar.classList.remove('done', 'error'); }
              if (pt) pt.textContent = savedProg + '%';
            }
          }
        }
      } else {
        if (topCard) topCard.classList.remove('force-visible');
      }
      var inputArea = document.getElementById('taskDialogV4');
      if (inputArea) {
        // 修改模式或求解完成后启用输入框
        var enableInput = (S.taskType === 'modify') || (S.runStatus === 'done');
        inputArea.classList.toggle('is-disabled', !enableInput);
      }
      Mrite._updateDialogModePill();
    }
    Mrite.updateButtonStates();
  } finally {
    Mrite._panelSwitching = false;
  }
};

// ★ renderPanel 用 display 切换面板，带 fade 过渡
Mrite.renderPanel = async function(panelName) {
  var name = panelName || Mrite.STATE.activePanel || 'welcome';
  var panels = ['welcomePanel', 'taskPanel', 'viewPanel', 'settingsPanel'];
  var map = { welcome: 'welcomePanel', task: 'taskPanel', view: 'viewPanel', settings: 'settingsPanel' };
  var targetId = map[name] || 'welcomePanel';

  // 找到当前显示的面板
  var currentEl = null;
  panels.forEach(function(id) {
    var el = document.getElementById(id);
    if (el && el.style.display !== 'none') currentEl = el;
  });

  var targetEl = document.getElementById(targetId);

  // 如果是同一个面板，不切换
  if (currentEl && currentEl === targetEl) return;

  // 切换面板：瞬间切换，无动画延迟
  panels.forEach(function(id) {
    var el = document.getElementById(id);
    if (!el) return;
    if (id === targetId) {
      el.style.display = 'flex';
      el.style.opacity = '1';
      el.style.transform = 'none';
      el.style.transition = 'none';
    } else {
      el.style.display = 'none';
      el.style.opacity = '';
      el.style.transform = '';
      el.style.transition = '';
    }
  });

  if (name === 'settings') {
    Mrite.renderSettings(); Mrite._loadProjectList(); Mrite._loadMachineCode();
  }
};

// 激活遮罩（已禁用）
// 激活遮罩（已禁用）
Mrite.showActivation = function() {};

// 错误弹窗
Mrite.showErrorModal = function(msg) {
  var old=document.querySelector('.error-overlay'); if(old)old.remove();
  var o=document.createElement('div'); o.className='error-overlay';
  o.style.cssText='position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;z-index:10000;';
  var safeMsg = String(msg).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  o.innerHTML='<div style="background:#1e1e2e;border:1px solid #f38ba8;border-radius:12px;padding:24px;max-width:500px;width:90%;color:#cdd6f4;font-family:-apple-system,sans-serif"><div style="font-size:18px;font-weight:700;color:#f38ba8;margin-bottom:8px">❌ 运行出错</div><div style="font-size:13px;color:#a6adc8;margin-bottom:16px;line-height:1.5;word-break:break-all">'+safeMsg+'</div><button id="btnDismissError" style="width:100%;padding:10px;border:none;border-radius:8px;background:#f38ba8;color:#1e1e2e;font-size:13px;cursor:pointer;font-weight:600">关闭</button></div>';
  document.body.appendChild(o);
  document.getElementById('btnDismissError').onclick=function(){o.remove();};
  o.onclick=function(e){if(e.target===o)o.remove();};
};

// ★ 比赛模板列表
Mrite._loadProjectList = async function() {
  // 兼容隐藏 select
  var sel = document.querySelector('#projectSelect');
  if (!sel) {
    var ref = Mrite._getPanel?.('settings');
    if (ref) sel = ref.querySelector('#projectSelect');
  }

  var listEl = document.getElementById('tplList');
  var curNameEl = document.getElementById('tplCurrentName');

  if (!listEl) return;
  listEl.innerHTML = '<div class="tpl-empty">加载中...</div>';

  try {
    if (!window.electronAPI?.listProjects) { listEl.innerHTML='<div class="tpl-empty">API不可用</div>'; return; }
    var r = await Promise.race([window.electronAPI.listProjects(), new Promise(function(_,rj){setTimeout(function(){rj(new Error('timeout'))},5000)})]).catch(function(){ return null; });
    if(!r||!r.success){listEl.innerHTML='<div class="tpl-empty">暂无模板</div>';return;}

    // ★ 同步主进程的当前项目路径
    if (r.currentProjectPath) {
      Mrite.STATE.settings.projectPath = r.currentProjectPath;
    }

    // 更新隐藏 select
    if (sel) {
      sel.removeEventListener('change', Mrite.onSwitchProject);
      sel.addEventListener('change', Mrite.onSwitchProject);
      sel.innerHTML = '';
    }

    var projects = r.projects || [];
    var currentPath = r.currentProjectPath;

    // 找当前模板名
    var currentName = '';
    for (var i = 0; i < projects.length; i++) {
      if (projects[i].path === currentPath) { currentName = projects[i].name; break; }
    }
    if (curNameEl) curNameEl.textContent = currentName || '未选择';
    Mrite.STATE.currentTemplateName = currentName || '';

    // 渲染列表
    if (!projects.length) {
      listEl.innerHTML = '<div class="tpl-empty">暂无可用模板</div>';
      return;
    }

    var html = '';
    for (var i = 0; i < projects.length; i++) {
      var p = projects[i];
      var isActive = p.path === currentPath;
      var isDefault = p.name === '默认';
      var delBtn = (isActive || isDefault) ? '' : '<button class="tpl-row-del" data-path="' + escAttr(p.path) + '" data-name="' + escAttr(p.name) + '" title="删除模板">' +
        '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>' +
      '</button>';
      html += '<div class="tpl-row" data-path="' + escAttr(p.path) + '" data-name="' + escAttr(p.name) + '">' +
        '<span class="tpl-row-name">' + escHtml(p.name) + '</span>' +
        delBtn +
        '<button class="tpl-row-btn' + (isActive ? ' active' : '') + '">' + (isActive ? '使用中' : '启用') + '</button>' +
      '</div>';
      // 更新 select
      if (sel) {
        var o = document.createElement('option');
        o.value = p.path; o.textContent = p.name;
        if (p.isCurrent) o.selected = true;
        sel.appendChild(o);
      }
    }
    listEl.innerHTML = html;

    // 绑定点击切换 → 走完整 onSwitchProject 流程
    listEl.querySelectorAll('.tpl-row-btn').forEach(function(btn) {
      btn.onclick = async function(e) {
        e.stopPropagation();
        var row = btn.parentElement;
        var path = row.dataset.path;
        var name = row.dataset.name;
        if (!path || btn.classList.contains('active')) return;

        // ★ 先同步 select 的值，再走完整切换流程（含清理工作区）
        if (sel) sel.value = path;
        await Mrite.onSwitchProject();
        // 刷新 UI
        Mrite._loadProjectList();
        Mrite._showToast('已切换模板：' + name);
      };
    });

    // 绑定删除按钮
    listEl.querySelectorAll('.tpl-row-del').forEach(function(delBtn) {
      delBtn.onclick = async function(e) {
        e.stopPropagation();
        var path = delBtn.dataset.path;
        var name = delBtn.dataset.name;
        if (!path || !name) return;
        var confirmed = await Mrite._showConfirm({
          title: '删除模板',
          desc: '确定删除模板「' + name + '」？此操作不可撤销。',
          type: 'warn',
          confirmText: '删除',
          confirmClass: 'modal-btn-danger'
        });
        if (!confirmed) return;
        try {
          var dr = await window.electronAPI.deleteProject(name);
          if (dr && dr.success) {
            Mrite._showToast('已删除: ' + name);
            Mrite._loadProjectList();
          } else {
            Mrite._showToast('删除失败: ' + ((dr && dr.error) || '未知错误'));
          }
        } catch(err) {
          Mrite._showToast('删除异常: ' + err.message);
        }
      };
    });

  } catch(e) { listEl.innerHTML = '<div class="tpl-empty">加载失败</div>'; }
};

// 上传模板
Mrite._uploadTemplate = async function() {
  try {
    // 只允许 .mrtpl 加密模板文件
    var result = await window.electronAPI.openFileDialog({
      title: '选择 Mrite 加密模板',
      properties: ['openFile'],
      filters: [
        { name: 'Mrite 加密模板 (.mrtpl)', extensions: ['mrtpl'] },
        { name: '所有文件', extensions: ['*'] }
      ]
    });
    if (!result || !result.length) return;

    var sourcePath = result[0];
    if (!sourcePath.toLowerCase().endsWith('.mrtpl')) {
      Mrite._showToast('仅支持 .mrtpl 加密模板文件');
      return;
    }

    Mrite._showToast('正在解密安装模板...');
    var r = await window.electronAPI.installMrtplTemplate(sourcePath);

    if (r && r.success) {
      Mrite._showToast('模板 "' + r.name + '" 导入成功');
      await Mrite._loadProjectList();
    } else {
      Mrite._showToast('导入失败: ' + (r.error || '未知错误'));
    }
  } catch(e) {
    Mrite._showToast('导入异常: ' + e.message);
  }
};

// HTML 转义（统一定义在 view.js，此处不再重复）

Mrite.onSwitchProject = async function() {
  var sel = document.querySelector('#projectSelect');
  if (!sel) { var ref = Mrite._getPanel?.('settings'); if (ref) sel = ref.querySelector('#projectSelect'); }
  var newPath = sel?.value;
  if (!newPath || newPath===Mrite.STATE.settings.projectPath) return;
  if (Mrite.STATE.runStatus==='running' || Mrite.STATE.runStatus==='paused') { Mrite._showToast('运行中无法切换模板，请先中止任务'); sel.value=Mrite.STATE.settings.projectPath; return; }
  try {
    // ★ 切换模板 → 无论装载与否，先清临时工作区（已提交的自动跳过）
    try { await window.electronAPI.deleteTempWorkspace(); } catch(_) {}
    Mrite.STATE.inputLoaded = false;
    Mrite.STATE.topicFiles = []; Mrite.STATE.dataFiles = [];
    Mrite.STATE.currentTemplateName = sel.options && sel.selectedIndex >= 0 ? sel.options[sel.selectedIndex].textContent : '';
    Mrite.renderFileList();
    Mrite.updateButtonStates();

    var r = await window.electronAPI.switchProject(newPath);
    if(r.success){
      Mrite.STATE.settings.projectPath=r.projectPath;Mrite.saveSettings();
      // ★ 不预建工作区，上传时自然触发
      Mrite.updateButtonStates();
    } else {
      // IPC 拒绝（如运行中）→ 回退下拉框
      if (r.error) Mrite._showToast(r.error);
      sel.value = Mrite.STATE.settings.projectPath;
    }
  } catch(e) { sel.value = Mrite.STATE.settings.projectPath; Mrite._showToast('切换失败: '+e.message); }
};

// ═══════════ 自定义弹窗组件 ═══════════

/**
 * 显示确认弹窗
 * @param {Object} options - 配置选项
 * @param {string} options.title - 标题
 * @param {string} options.desc - 描述
 * @param {string} options.type - 类型: warn/danger/info/success
 * @param {string} options.confirmText - 确认按钮文字
 * @param {string} options.cancelText - 取消按钮文字
 * @param {string} options.confirmClass - 确认按钮样式: modal-btn-confirm/modal-btn-danger/modal-btn-primary
 * @returns {Promise<boolean>} - 用户是否确认
 */
Mrite._showConfirm = function(options) {
  return new Promise(function(resolve) {
    var opts = Object.assign({
      title: '确认操作',
      desc: '确定要执行此操作吗？',
      type: 'warn',
      confirmText: '确定',
      cancelText: '取消',
      confirmClass: 'modal-btn-confirm'
    }, options);

    var icons = {
      warn: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
      danger: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>',
      info: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
      success: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>'
    };

    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = '<div class="modal-box">' +
      '<div class="modal-icon ' + opts.type + '">' + (icons[opts.type] || '⚠️') + '</div>' +
      '<div class="modal-title">' + Mrite._escHtml(opts.title) + '</div>' +
      '<div class="modal-desc">' + Mrite._escHtml(opts.desc) + '</div>' +
      '<div class="modal-btns">' +
        '<button class="modal-btn modal-btn-cancel" id="modalCancel">' + Mrite._escHtml(opts.cancelText) + '</button>' +
        '<button class="modal-btn ' + opts.confirmClass + '" id="modalConfirm">' + Mrite._escHtml(opts.confirmText) + '</button>' +
      '</div>' +
    '</div>';

    document.body.appendChild(overlay);

    var cancelBtn = document.getElementById('modalCancel');
    var confirmBtn = document.getElementById('modalConfirm');

    function close(result) {
      overlay.style.opacity = '0';
      setTimeout(function() { overlay.remove(); }, 200);
      resolve(result);
    }

    cancelBtn.onclick = function() { close(false); };
    confirmBtn.onclick = function() { close(true); };
    overlay.onclick = function(e) {
      if (e.target === overlay) close(false);
    };
  });
};

/**
 * 显示提示弹窗
 * @param {Object} options - 配置选项
 * @param {string} options.title - 标题
 * @param {string} options.desc - 描述
 * @param {string} options.type - 类型: info/success/warn/danger
 * @param {string} options.btnText - 按钮文字
 * @param {string} options.secondaryBtnText - 可选的第二个按钮文字
 * @param {Function} options.secondaryBtnCallback - 可选的第二个按钮回调
 */
Mrite._showAlert = function(options) {
  var opts = Object.assign({
    title: '提示',
    desc: '',
    type: 'info',
    btnText: '知道了',
    secondaryBtnText: null,
    secondaryBtnCallback: null
  }, options);

  var icons = {
    warn: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    danger: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>',
    info: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
    success: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>'
  };

  var secondaryBtnHtml = '';
  if (opts.secondaryBtnText) {
    secondaryBtnHtml = '<button class="modal-btn modal-btn-secondary" id="modalSecondary">' + Mrite._escHtml(opts.secondaryBtnText) + '</button>';
  }

  var overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = '<div class="modal-box">' +
    '<div class="modal-icon ' + opts.type + '">' + (icons[opts.type] || 'ℹ️') + '</div>' +
    '<div class="modal-title">' + Mrite._escHtml(opts.title) + '</div>' +
    '<div class="modal-desc">' + Mrite._escHtml(opts.desc) + '</div>' +
    '<div class="modal-btns">' +
      secondaryBtnHtml +
      '<button class="modal-btn modal-btn-primary" id="modalOk">' + Mrite._escHtml(opts.btnText) + '</button>' +
    '</div>' +
  '</div>';

  document.body.appendChild(overlay);

  var okBtn = document.getElementById('modalOk');
  var secondaryBtn = document.getElementById('modalSecondary');
  function close() {
    overlay.style.opacity = '0';
    setTimeout(function() { overlay.remove(); }, 200);
  }

  okBtn.onclick = close;
  if (secondaryBtn && opts.secondaryBtnCallback) {
    secondaryBtn.onclick = function() {
      close();
      opts.secondaryBtnCallback();
    };
  }
  overlay.onclick = function(e) {
    if (e.target === overlay) close();
  };
};
