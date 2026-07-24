// Mrite v1.8 — 设置面板
window.Mrite = window.Mrite || {};

// ═══════════════════════════════════════════════════
// 供应商配置数据
// ═══════════════════════════════════════════════════
Mrite._PROVIDERS = {
  deepseek: {
    name: 'DeepSeek',
    baseURL: 'https://api.deepseek.com/anthropic',
    apiFormat: 'anthropic',
    defaultModel: 'deepseek-v4-pro',
    fixed: true
  },
  xiaomi: {
    name: '小米 MiMo',
    baseURL: '',
    apiFormat: 'openai',
    models: ['mimo-v2.5-pro', 'mimo-v2.5']
  },
  kimi: {
    name: 'Kimi',
    baseURL: 'https://api.moonshot.cn/v1',
    apiFormat: 'openai',
    models: ['kimi-k2', 'moonshot-v1-128k', 'moonshot-v1-32k']
  },
  glm: {
    name: '智谱 GLM',
    baseURL: 'https://open.bigmodel.cn/api/paas/v4',
    apiFormat: 'openai',
    models: ['glm-4-plus', 'glm-4-flash', 'glm-4-long']
  },
  openai: {
    name: 'OpenAI',
    baseURL: 'https://api.openai.com/v1',
    apiFormat: 'openai',
    models: ['gpt-4.1', 'gpt-4.1-mini', 'gpt-4o', 'o3', 'o4-mini']
  },
  anthropic: {
    name: 'Claude',
    baseURL: 'https://api.anthropic.com',
    apiFormat: 'anthropic',
    models: ['claude-sonnet-4-20250514', 'claude-haiku-4-5-20251001', 'claude-opus-4-20250514']
  },
  gemini: {
    name: 'Gemini',
    baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai',
    apiFormat: 'openai',
    models: ['gemini-2.5-flash', 'gemini-2.5-pro']
  },
  xai: {
    name: 'Grok',
    baseURL: 'https://api.x.ai/v1',
    apiFormat: 'openai',
    models: ['grok-3', 'grok-3-mini', 'grok-2']
  },
  custom: {
    name: '自定义',
    baseURL: '',
    apiFormat: 'auto',
    models: []
  }
};

// ★ 判断是否为固定配置（URL/模型不可修改）
Mrite._isFixedProvider = function(baseURL) {
  if (!baseURL) return false;
  var url = baseURL.trim().toLowerCase();
  for (var key in Mrite._PROVIDERS) {
    var p = Mrite._PROVIDERS[key];
    if (p.fixed && url === (p.baseURL || '').toLowerCase()) return true;
  }
  return false;
};

// ★ 选择供应商
Mrite._selectProvider = function(providerKey) {
  var p = Mrite._PROVIDERS[providerKey];
  if (!p) return;

  // 高亮选中卡片
  document.querySelectorAll('.provider-card').forEach(function(c) {
    c.classList.toggle('active', c.dataset.provider === providerKey);
  });

  // 切换供应商时填充端点和模型名
  var s = Mrite.STATE.settings;
  var baseEl = document.getElementById('inputApiBase');
  var modelEl = document.getElementById('inputApiModel');

  if (p.fixed) {
    // ★ 固定配置（如 DeepSeek）：URL 和模型写死，不可修改
    if (baseEl) { baseEl.value = p.baseURL || ''; baseEl.readOnly = true; baseEl.classList.add('input-locked'); }
    if (modelEl) { modelEl.value = p.defaultModel || ''; modelEl.readOnly = true; modelEl.classList.add('input-locked'); }
  } else {
    // 自定义供应商：清空字段，可编辑
    if (baseEl) { baseEl.value = p.baseURL || ''; baseEl.readOnly = false; baseEl.classList.remove('input-locked'); }
    if (modelEl) { modelEl.value = ''; modelEl.readOnly = false; modelEl.classList.remove('input-locked'); }
  }

  // 更新 API Key 提示链接
  Mrite._updateApiKeyHint(providerKey);

  // 保存供应商选择
  s._selectedProvider = providerKey;
  Mrite._autoSaveSettings();
};

// ★ 根据供应商更新 API Key 获取提示（仅 DeepSeek / 小米）
Mrite._PROVIDER_DOCS = {
  deepseek: { doc: 'https://api-docs.deepseek.com/zh-cn/', login: 'https://platform.deepseek.com/' },
  xiaomi:   { doc: 'https://platform.xiaomimimo.com/docs', login: 'https://platform.xiaomimimo.com/' }
};
Mrite._updateApiKeyHint = function(providerKey) {
  var hint = document.getElementById('apiKeyHint');
  var docLink = document.getElementById('apiKeyDocLink');
  var loginLink = document.getElementById('apiKeyLoginLink');
  if (!hint || !docLink || !loginLink) return;
  var info = Mrite._PROVIDER_DOCS[providerKey];
  if (info) {
    hint.style.display = '';
    docLink.href = info.doc;
    loginLink.href = info.login;
  } else {
    hint.style.display = 'none';
  }
};

// ★ 恢复活动配置到表单和 STATE（强制执行）
Mrite._restoreActiveConfig = function() {
  var s = Mrite.STATE.settings;
  var models = Array.isArray(s.apiModels) ? s.apiModels : [];

  // ★ 以 localStorage 为准（唯一可靠持久化来源，不被 DB 异步覆盖）
  var idx;
  try {
    var saved = localStorage.getItem('mrite-active-model-index');
    idx = (saved !== null) ? parseInt(saved) : undefined;
  } catch(e) { idx = undefined; }

  // 从未设置过 → 有配置就自动选第一个
  if (idx === undefined && models.length > 0) {
    idx = 0;
  }

  // 同步到 STATE
  s._activeModelIndex = (idx !== undefined) ? idx : -1;

  // 同步扁平字段
  if (idx >= 0 && models[idx]) {
    var m = models[idx];
    s.apiBase = m.baseURL || '';
    s.apiKey = m.apiKey || s.apiKey || '';
    s.apiModel = m.name || '';
  } else {
    s.apiBase = '';
    s.apiKey = '';
    s.apiModel = '';
  }

  Mrite._updateApiHero();
};

// ★ 更新 API hero 卡片（读取 STATE.settings，直接更新 DOM）
Mrite._updateApiHero = function() {
  var s = Mrite.STATE.settings;
  var models = Array.isArray(s.apiModels) ? s.apiModels : [];
  var idx = s._activeModelIndex;

  var heroCard = document.getElementById('apiHeroCard');
  var heroIcon = document.getElementById('apiHeroIcon');
  var heroModel = document.getElementById('apiHeroModel');
  var heroMeta = document.getElementById('apiHeroMeta');
  var heroStatus = document.getElementById('apiHeroStatus');

  if (!heroCard) return;

  // 有活动配置
  if (idx >= 0 && models[idx]) {
    var m = models[idx];
    var provider = m.provider || Mrite._getProviderLabel(m.baseURL);
    var icon = Mrite._getProviderIcon(m.baseURL);
    var hasKey = !!(m.apiKey || s.apiKey);

    heroCard.classList.toggle('connected', hasKey);
    if (heroIcon) heroIcon.src = icon;
    if (heroModel) heroModel.textContent = m.name;
    if (heroMeta) heroMeta.textContent = provider + ' · ' + (m.baseURL || '').replace(/^https?:\/\//, '');
    if (heroStatus) heroStatus.textContent = hasKey ? '当前使用中' : '缺少 API Key';
  } else {
    heroCard.classList.remove('connected');
    if (heroIcon) heroIcon.src = '../assets/icons/providers/custom.svg';
    if (heroModel) heroModel.textContent = '未配置';
    if (heroMeta) heroMeta.textContent = '请在下方选择服务商并配置 API';
    if (heroStatus) heroStatus.textContent = '未连接';
  }
};

// ★ 初始化设置面板（不自动选中供应商卡片，等用户自己点）
Mrite._initProviderUI = function() {
  // 恢复活动配置（只同步扁平字段 + hero 卡片）
  Mrite._restoreActiveConfig();

  // ★ 不自动高亮任何供应商卡片 — 用户必须自己点击才选中
  // ★ 不自动显示 API Key 提示 — 等用户选供应商后再显示

  // 渲染已保存模型列表
  Mrite._renderSavedModels();

  // 更新 hero 卡片
  Mrite._updateApiHero();
};

// ═══════════════════════════════════════════════════
// 已保存模型配置管理
// ═══════════════════════════════════════════════════

// ★ 获取供应商图标路径
Mrite._getProviderIcon = function(baseURL) {
  if (!baseURL) return '../assets/icons/providers/custom.svg';
  var u = baseURL.toLowerCase();
  if (u.includes('deepseek')) return '../assets/icons/providers/deepseek.ico';
  if (u.includes('xiaomi') || u.includes('mimo')) return '../assets/icons/providers/xiaomi.png';
  if (u.includes('moonshot') || u.includes('kimi')) return '../assets/icons/providers/moonshot.ico';
  if (u.includes('bigmodel') || u.includes('glm') || u.includes('zhipu')) return '../assets/icons/providers/glm.png';
  if (u.includes('openai')) return '../assets/icons/providers/openai.ico';
  if (u.includes('anthropic') || u.includes('claude')) return '../assets/icons/providers/anthropic.png';
  if (u.includes('google') || u.includes('gemini') || u.includes('generativelanguage')) return '../assets/icons/providers/gemini.png';
  if (u.includes('x.ai') || u.includes('grok')) return '../assets/icons/providers/xai.ico';
  if (u.includes('baichuan')) return '../assets/icons/providers/baichuan.png';
  if (u.includes('qwen') || u.includes('dashscope')) return '../assets/icons/providers/qwen.png';
  if (u.includes('doubao') || u.includes('volc')) return '../assets/icons/providers/doubao.png';
  if (u.includes('yi.') || u.includes('01.ai')) return '../assets/icons/providers/yi.png';
  if (u.includes('stepfun') || u.includes('step')) return '../assets/icons/providers/stepfun.png';
  if (u.includes('minimax')) return '../assets/icons/providers/minimax.ico';
  if (u.includes('spark') || u.includes('xfyun')) return '../assets/icons/providers/spark.ico';
  if (u.includes('cohere')) return '../assets/icons/providers/cohere.png';
  if (u.includes('mistral')) return '../assets/icons/providers/mistral.ico';
  return '../assets/icons/providers/custom.svg';
};

// ★ 获取供应商简称
Mrite._getProviderLabel = function(baseURL) {
  if (!baseURL) return '自定义';
  var u = baseURL.toLowerCase();
  if (u.includes('deepseek')) return 'DeepSeek';
  if (u.includes('xiaomi') || u.includes('mimo')) return '小米 MiMo';
  if (u.includes('moonshot') || u.includes('kimi')) return 'Kimi';
  if (u.includes('bigmodel') || u.includes('glm')) return '智谱 GLM';
  if (u.includes('openai')) return 'OpenAI';
  if (u.includes('anthropic')) return 'Claude';
  if (u.includes('google') || u.includes('gemini') || u.includes('generativelanguage')) return 'Gemini';
  if (u.includes('x.ai')) return 'Grok';
  return '自定义';
};

// ★ 保存当前 API 配置到列表
Mrite._saveCurrentApiConfig = function() {
  var s = Mrite.STATE.settings;
  var base = (s.apiBase || '').trim();
  var key = (s.apiKey || '').trim();
  var model = (s.apiModel || '').trim();

  if (!base) {
    Mrite._showToast('请填写 API 端点');
    return;
  }
  if (!model) {
    Mrite._showToast('请填写模型名称');
    return;
  }
  if (!key) {
    Mrite._showToast('请填写 API Key');
    return;
  }

  // 确保数组存在
  if (!Array.isArray(s.apiModels)) s.apiModels = [];

  // 检查是否已存在相同配置（base + model 去重）
  var dupIdx = -1;
  for (var i = 0; i < s.apiModels.length; i++) {
    var m = s.apiModels[i];
    if (m && m.baseURL === base && m.name === model) { dupIdx = i; break; }
  }

  var entry = {
    name: model,
    baseURL: base,
    apiKey: key,
    provider: Mrite._getProviderLabel(base),
    ts: Date.now()
  };

  if (dupIdx >= 0) {
    s.apiModels[dupIdx] = entry;
    s._activeModelIndex = dupIdx;
    Mrite._showToast('已更新配置: ' + model);
  } else {
    s.apiModels.push(entry);
    s._activeModelIndex = s.apiModels.length - 1;
    Mrite._showToast('已保存: ' + model);
  }

  // 同步扁平字段（确保任务执行时读到最新值）
  s.apiBase = base;
  s.apiKey = key;
  s.apiModel = model;

  Mrite.saveSettings();

  // ★ 保存后清空 API 配置表单（只清 Key，DeepSeek 预设的 URL/模型保持不变）
  var kEl3 = document.getElementById('inputApiKey');
  if (kEl3) kEl3.value = '';
  var hEl3 = document.getElementById('apiKeyHint');
  if (hEl3) hEl3.style.display = 'none';

  Mrite._renderSavedModels();
  Mrite._updateApiHero();
};

// ★ 渲染已保存模型列表（开关 + 测试 + 删除）
Mrite._renderSavedModels = function() {
  var listEl = document.getElementById('savedModelsList');
  if (!listEl) return;

  var models = (Mrite.STATE.settings && Array.isArray(Mrite.STATE.settings.apiModels))
    ? Mrite.STATE.settings.apiModels : [];

  if (models.length === 0) {
    listEl.innerHTML = '<div class="saved-models-empty">填写配置后点击「保存配置」添加</div>';
    return;
  }

  var activeIdx = Mrite.STATE.settings._activeModelIndex;
  var testResults = Mrite._testResults || {};

  var html = '';
  for (var i = 0; i < models.length; i++) {
    var m = models[i];
    if (!m || !m.name) continue;
    var icon = Mrite._getProviderIcon(m.baseURL);
    var isActive = (activeIdx === i);
    var provider = m.provider || Mrite._getProviderLabel(m.baseURL);
    var meta = provider + (m.baseURL ? ' · ' + m.baseURL.replace(/^https?:\/\//, '').slice(0, 35) : '');

    // 测试结果
    var test = testResults[i];
    var latencyHtml = '';
    if (test) {
      if (test.ok) {
        latencyHtml = '<span class="saved-model-latency latency-ok">' + test.ms + 'ms</span>';
      } else {
        latencyHtml = '<span class="saved-model-latency latency-fail">' + (test.msg || '失败') + '</span>';
      }
    }

    html += '<div class="saved-model-item' + (isActive ? ' active' : '') + '">';
    html += '<img src="' + icon + '" class="saved-model-icon" onerror="this.src=\'../assets/icons/providers/custom.svg\'">';
    html += '<div class="saved-model-info">';
    html += '<div class="saved-model-name">';
    html += Mrite._escHtml(m.name);
    if (latencyHtml) html += latencyHtml;
    html += '</div>';
    html += '<div class="saved-model-meta">' + Mrite._escHtml(meta) + '</div>';
    html += '</div>';
    html += '<div class="saved-model-actions">';
    // 开关按钮
    html += '<label class="model-toggle-switch" onclick="event.stopPropagation()">';
    html += '<input type="checkbox" ' + (isActive ? 'checked' : '') + ' onchange="Mrite._toggleModelActive(' + i + ', this.checked)">';
    html += '<span class="model-toggle-slider"></span>';
    html += '</label>';
    // 测试按钮
    html += '<button class="saved-model-btn btn-test" onclick="event.stopPropagation();Mrite._testApiConnectivity(' + i + ')" title="测试连通性">';
    html += '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>';
    html += '测试</button>';
    // 删除按钮
    html += '<button class="saved-model-btn btn-delete" onclick="event.stopPropagation();Mrite._deleteSavedModel(' + i + ')" title="删除">';
    html += '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';
    html += '</button>';
    html += '</div>';
    html += '</div>';
  }

  listEl.innerHTML = html;
};

// ★ 测试结果缓存
Mrite._testResults = {};

// ★ 测试 API 连通性（结果只在按钮上显示）
Mrite._testApiConnectivity = async function(index) {
  var models = (Mrite.STATE.settings && Array.isArray(Mrite.STATE.settings.apiModels))
    ? Mrite.STATE.settings.apiModels : [];
  var m = models[index];
  if (!m) return;

  var items = document.querySelectorAll('.saved-model-item');
  var card = items[index];
  if (!card) return;
  var btn = card.querySelector('.btn-test');

  if (btn) { btn.disabled = true; btn.textContent = '...'; }

  try {
    var baseURL = m.baseURL || '';
    var apiKey = m.apiKey || '';
    var model = m.name || '';

    var isAnthropic = baseURL.includes('/anthropic') || baseURL.includes('api.anthropic.com');
    var testUrl, testHeaders, testBody;

    if (isAnthropic) {
      testUrl = baseURL.replace(/\/+$/, '') + '/v1/messages';
      testHeaders = { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' };
      testBody = JSON.stringify({ model: model, max_tokens: 5, messages: [{ role: 'user', content: 'hi' }] });
    } else {
      var path = baseURL.replace(/\/+$/, '');
      if (!/\/v\d+$/.test(path)) path += '/v1';
      testUrl = path + '/chat/completions';
      testHeaders = { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey };
      testBody = JSON.stringify({ model: model, max_tokens: 5, messages: [{ role: 'user', content: 'hi' }] });
    }

    var startTime = Date.now();
    var controller = new AbortController();
    var timeoutId = setTimeout(function() { controller.abort(); }, 15000);

    var resp = await fetch(testUrl, { method: 'POST', headers: testHeaders, body: testBody, signal: controller.signal });
    clearTimeout(timeoutId);
    var latency = Date.now() - startTime;

    if (resp.ok) {
      Mrite._testResults[index] = { ok: true, ms: latency };
      if (btn) { btn.textContent = latency + 'ms'; btn.classList.add('btn-ok'); btn.classList.remove('btn-fail'); }
    } else {
      var errText = '';
      try { var ej = await resp.json(); errText = ej.error?.message || ej.message || ''; } catch { errText = ''; }
      Mrite._testResults[index] = { ok: false, msg: '✗ ' + resp.status };
      if (btn) { btn.textContent = '✗ ' + resp.status; btn.classList.add('btn-fail'); btn.classList.remove('btn-ok'); }
    }
  } catch (e) {
    var msg = e.name === 'AbortError' ? '超时' : '网络错误';
    Mrite._testResults[index] = { ok: false, msg: '✗ ' + msg };
    if (btn) { btn.textContent = '✗ ' + msg; btn.classList.add('btn-fail'); btn.classList.remove('btn-ok'); }
  }

  // 重新渲染（保留测试结果）
  setTimeout(function() { Mrite._renderSavedModels(); }, 100);
};

// ★ HTML 转义
Mrite._escHtml = function(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
};

// ★ 开关切换：激活/取消已保存的模型配置
Mrite._toggleModelActive = function(index, checked) {
  var s = Mrite.STATE.settings;
  if (!Array.isArray(s.apiModels) || !s.apiModels[index]) return;
  var m = s.apiModels[index];

  if (checked) {
    // 激活该配置（只同步扁平字段给后端，不填充表单）
    s._activeModelIndex = index;
    s.apiBase = m.baseURL || '';
    s.apiKey = m.apiKey || '';
    s.apiModel = m.name || '';
    // 取消其他开关
    var checkboxes = document.querySelectorAll('.model-toggle-switch input[type="checkbox"]');
    for (var ci = 0; ci < checkboxes.length; ci++) {
      if (ci !== index) checkboxes[ci].checked = false;
    }
  } else {
    s._activeModelIndex = -1;
    s.apiBase = '';
    s.apiKey = '';
    s.apiModel = '';
    // 关闭开关时清空 hero
  }

  Mrite.saveSettings();
  // ★ 唯一持久化来源：直接写 localStorage
  try { localStorage.setItem('mrite-active-model-index', String(s._activeModelIndex)); } catch(e) {}
  Mrite._renderSavedModels();
  Mrite._updateApiHero();
  if (checked) {
    Mrite._showToast('已切换至: ' + m.name);
  }
};

// ★ 删除已保存的模型配置
Mrite._deleteSavedModel = function(index) {
  var s = Mrite.STATE.settings;
  if (!Array.isArray(s.apiModels) || !s.apiModels[index]) return;
  var name = s.apiModels[index].name;
  s.apiModels.splice(index, 1);
  // 清理活动索引
  if (s._activeModelIndex === index) s._activeModelIndex = -1;
  else if (s._activeModelIndex > index) s._activeModelIndex--;
  // 清理测试结果
  if (Mrite._testResults) {
    delete Mrite._testResults[index];
    var newResults = {};
    for (var k in Mrite._testResults) {
      var ki = parseInt(k);
      newResults[ki > index ? ki - 1 : ki] = Mrite._testResults[k];
    }
    Mrite._testResults = newResults;
  }
  // 同步扁平字段（删除后指向新活动项或清空）
  if (s._activeModelIndex >= 0 && s.apiModels[s._activeModelIndex]) {
    var newActive = s.apiModels[s._activeModelIndex];
    s.apiBase = newActive.baseURL || '';
    s.apiKey = newActive.apiKey || '';
    s.apiModel = newActive.name || '';
  } else {
    s.apiBase = '';
    s.apiKey = '';
    s.apiModel = '';
  }

  Mrite.saveSettings();
  try { localStorage.setItem('mrite-active-model-index', String(s._activeModelIndex)); } catch(e) {}
  Mrite._renderSavedModels();
  Mrite._updateApiHero();
  Mrite._showToast('已删除: ' + name);
};

// ★ 导航切换 — 公共函数，供 HTML 内联 onclick 调用
Mrite._navToSection = function(el, section) {
  // 更新导航 active
  var nav = el.parentElement;
  if (nav) {
    nav.querySelectorAll('.set-nav-item').forEach(function(i) { i.classList.remove('active'); });
  }
  el.classList.add('active');
  // 更新内容区 active
  var content = document.getElementById('settingsContent');
  if (content) {
    content.querySelectorAll('.set-section-panel').forEach(function(p) { p.classList.remove('active'); });
    var target = content.querySelector('[data-section="' + section + '"]');
    if (target) target.classList.add('active');
  }
};

// ★ 所有按钮事件均使用 HTML 内联 onclick

// ★ 自动保存：仅读取 DOM 中存在的字段，避免面板关闭时误清空
Mrite._autoSaveSettings = async function() {
  var st = Mrite.STATE.settings;
  var el;
  el = document.querySelector('#inputTeamCode'); if (el) st.teamCode = el.value.trim();
  el = document.querySelector('#inputProblemNumber'); if (el) st.problemNumber = el.value.trim();
  el = document.querySelector('#inputSchool'); if (el) st.school = el.value.trim();
  el = document.querySelector('#inputMembers'); if (el) st.members = el.value.trim();
  el = document.querySelector('#inputAdvisor'); if (el) st.advisor = el.value.trim();
  el = document.querySelector('#inputStylePrompt'); if (el) st.stylePrompt = el.value.trim().slice(0,150);
  el = document.querySelector('#inputInviteCode'); if (el) st.inviteCode = el.value.trim();
  el = document.querySelector('#inputApiBase'); if (el) st.apiBase = el.value.trim();
  el = document.querySelector('#inputApiKey'); if (el) st.apiKey = el.value.trim();
  el = document.querySelector('#inputApiModel'); if (el) st.apiModel = el.value.trim() || '';
  el = document.querySelector('#inputOutputPath');
  if (el) {
    var newOutPath = el.value.trim();
    if (newOutPath !== st.outputPath) {
      st.outputPath = newOutPath;
      try { await window.electronAPI.setOutputConfig(newOutPath); } catch(_) {}
    }
  }
  Mrite.saveSettings();
};

Mrite.onVerifyInviteCode = async function() {
  var code = document.querySelector('#inputInviteCode')?.value?.trim();
  if (!code) return;
  Mrite._updateInviteUI('verifying');
  var r = await window.electronAPI.verifyInviteCode(code,'');
  if (r.success && r.valid) {
    Mrite.STATE.settings.inviteCode=code;Mrite.STATE.settings.inviteVerified=true;Mrite.STATE.isActivated=true;
    // ★ 保存激活/到期时间
    if (r.data) {
      if (r.data.activatedAt) Mrite.STATE.settings.inviteActivatedAt = r.data.activatedAt;
      // ★ expiresAt 可能为 null（未激活的码），不要覆盖已有值
      if (r.data.expiresAt !== undefined && r.data.expiresAt !== null) {
        Mrite.STATE.settings.inviteExpiresAt = r.data.expiresAt;
      }
    }
    // ★ 启动本地计时器
    Mrite._startLicenseTimer(r.data);
    Mrite.saveSettings();Mrite._updateInviteUI('verified');
    Mrite.updateButtonStates();Mrite.updateStatusIndicator();
    if (Mrite._syncHomeStatus) Mrite._syncHomeStatus();
    // ★ 激活成功后首次弹出配置窗
    setTimeout(function() { Mrite._checkSystemConfigOnStartup({ showDialog: true }); }, 500);
  } else {
    Mrite.STATE.settings.inviteVerified=false;Mrite.STATE.isActivated=false;
    Mrite._updateInviteUI('failed');Mrite.updateButtonStates();Mrite.updateStatusIndicator();
  }
};

// ★ 启动许可证计时器：基于服务器返回的到期时间，自然时间倒计时
Mrite._startLicenseTimer = function(data) {
  if (!data || !data.expiresAt) return;
  var expiresAt = new Date(data.expiresAt).getTime();
  if (expiresAt <= 0) return;
  Mrite.STATE.settings.licenseExpiresAt = expiresAt;
  if (Mrite._licenseTimer && typeof Mrite._licenseTimer.init === 'function') {
    Mrite._licenseTimer.init(expiresAt, Mrite._onLicenseExpired);
  }
};

// ★ 许可证过期处理（已禁用）
// 许可证过期处理（已禁用）
Mrite._onLicenseExpired = function() {};

// ★ 过期后尝试重新验证（有网立即验证，没网等联网后验证）
Mrite._tryReVerifyOnExpire = async function() {
  var code = Mrite.STATE.settings.inviteCode;
  if (!code) return;
  try {
    var r = await window.electronAPI.verifyInviteCode(code, '');
    if (r && r.success && r.valid) {
      // 续期成功，重新激活
      Mrite.STATE.settings.inviteVerified = true;
      Mrite.STATE.isActivated = true;
      if (r.data) {
        if (r.data.activatedAt) Mrite.STATE.settings.inviteActivatedAt = r.data.activatedAt;
        // ★ expiresAt 可能为 null（未激活的码），不要覆盖已有值
        if (r.data.expiresAt !== undefined && r.data.expiresAt !== null) {
          Mrite.STATE.settings.inviteExpiresAt = r.data.expiresAt;
        }
      }
      Mrite._startLicenseTimer(r.data);
      Mrite.saveSettings();
      Mrite.updateButtonStates();
      Mrite.updateStatusIndicator();
      // 移除过期遮罩
      var o = document.querySelector('.expired-overlay'); if(o)o.remove();
      Mrite._showToast('续期成功');
    }
  } catch(e) {
    // 网络错误，注册联网事件监听，联网后自动重试
    window.addEventListener('online', function onReconnect() {
      window.removeEventListener('online', onReconnect);
      Mrite._tryReVerifyOnExpire();
    });
  }
};

Mrite._updateInviteUI = function(status) {
  var dot = document.querySelector('#inviteStatus .invite-dot');
  var txt = document.querySelector('#inviteStatus .invite-text');
  var info = document.getElementById('inviteInfo');
  status = status || (Mrite.STATE.settings.inviteVerified?'verified':'unverified');
  if (dot) {
    dot.className='invite-dot';
    var map={verified:'invite-verified',verifying:'invite-verifying',failed:'invite-unverified',unverified:'invite-unverified'};
    dot.classList.add(map[status]||'invite-unverified');
  }
  if (txt) {
    var labels={verified:'已验证 — 功能已激活',verifying:'验证中...',failed:'验证失败',unverified:'未验证'};
    txt.textContent=labels[status]||'未验证';
  }

  // ★ 有激活码时，自动向服务器验证一次（每次进入设置页都触发）
  var code = Mrite.STATE.settings.inviteCode;
  if (code && status !== 'verifying') {
    if (dot) { dot.className='invite-dot invite-verifying'; }
    if (txt) { txt.textContent='验证中...'; }
    window.electronAPI.verifyInviteCode(code, '').then(function(r) {
      if (r && r.success && r.valid) {
        Mrite.STATE.settings.inviteVerified = true;
        Mrite.STATE.isActivated = true;
        if (r.data) {
          if (r.data.activatedAt) Mrite.STATE.settings.inviteActivatedAt = r.data.activatedAt;
          // ★ expiresAt 可能为 null（未激活的码），不要覆盖已有值
          if (r.data.expiresAt !== undefined && r.data.expiresAt !== null) {
            Mrite.STATE.settings.inviteExpiresAt = r.data.expiresAt;
          }
        }
        // ★ 启动/刷新本地计时器
        Mrite._startLicenseTimer(r.data);
        Mrite.saveSettings();
        Mrite._renderInviteStatus('verified');
      } else {
        Mrite.STATE.settings.inviteVerified = false;
        Mrite.STATE.isActivated = false;
        Mrite.saveSettings();
        Mrite._renderInviteStatus('failed');
      }
      Mrite.updateButtonStates();
      Mrite.updateStatusIndicator();
    }).catch(function() {
      // 网络错误时保持当前状态，不改变
      Mrite._renderInviteStatus(Mrite.STATE.settings.inviteVerified ? 'verified' : 'failed');
    });
    return; // 异步回调里会更新UI，这里先return
  }

  // ★ 显示/隐藏激活时间详情
  if (info) {
    if (status === 'verified') {
      info.style.display = 'block';
      var setVal = function(id, val) { var e = document.getElementById(id); if (e) e.textContent = val; };
      var s = Mrite.STATE.settings;
      var fmtDate = function(d) { if (!d) return '--'; var t = new Date(d); return t.getFullYear()+'-'+(t.getMonth()+1)+'-'+t.getDate(); };
      var getRemaining = function() {
        if (!s.inviteExpiresAt) return '未使用';
        var diff = new Date(s.inviteExpiresAt) - Date.now();
        if (diff <= 0) return '已过期';
        var days = Math.floor(diff / 86400000);
        var hours = Math.floor((diff % 86400000) / 3600000);
        var minutes = Math.floor((diff % 3600000) / 60000);
        var seconds = Math.floor((diff % 60000) / 1000);
        var parts = [];
        if (days > 0) parts.push(days + '天');
        parts.push(hours + '时');
        parts.push(minutes + '分');
        parts.push(seconds + '秒');
        return parts.join(' ');
      };
      setVal('inviteActivatedAt', fmtDate(s.inviteActivatedAt));
      setVal('inviteExpiresAt', fmtDate(s.inviteExpiresAt));
      setVal('inviteRemaining', getRemaining());
      // ★ 启动倒计时
      if (Mrite._inviteCountdownTimer) clearInterval(Mrite._inviteCountdownTimer);
      Mrite._inviteCountdownTimer = setInterval(function() {
        setVal('inviteRemaining', getRemaining());
      }, 1000);
    } else {
      info.style.display = 'none';
      if (Mrite._inviteCountdownTimer) { clearInterval(Mrite._inviteCountdownTimer); Mrite._inviteCountdownTimer = null; }
    }
  }
};

// ★ 渲染激活状态UI（供异步回调使用）
Mrite._renderInviteStatus = function(status) {
  var dot = document.querySelector('#inviteStatus .invite-dot');
  var txt = document.querySelector('#inviteStatus .invite-text');
  var info = document.getElementById('inviteInfo');
  if (dot) {
    dot.className='invite-dot';
    var map={verified:'invite-verified',verifying:'invite-verifying',failed:'invite-unverified',unverified:'invite-unverified'};
    dot.classList.add(map[status]||'invite-unverified');
  }
  if (txt) {
    var labels={verified:'已验证 — 功能已激活',verifying:'验证中...',failed:'验证失败',unverified:'未验证'};
    txt.textContent=labels[status]||'未验证';
  }
  if (info) {
    if (status === 'verified') {
      info.style.display = 'block';
      var setVal = function(id, val) { var e = document.getElementById(id); if (e) e.textContent = val; };
      var s = Mrite.STATE.settings;
      var fmtDate = function(d) { if (!d) return '--'; var t = new Date(d); return t.getFullYear()+'-'+(t.getMonth()+1)+'-'+t.getDate(); };
      var getRemaining = function() {
        if (!s.inviteExpiresAt) return '未使用';
        var diff = new Date(s.inviteExpiresAt) - Date.now();
        if (diff <= 0) return '已过期';
        var days = Math.floor(diff / 86400000);
        var hours = Math.floor((diff % 86400000) / 3600000);
        var minutes = Math.floor((diff % 3600000) / 60000);
        var seconds = Math.floor((diff % 60000) / 1000);
        var parts = [];
        if (days > 0) parts.push(days + '天');
        parts.push(hours + '时');
        parts.push(minutes + '分');
        parts.push(seconds + '秒');
        return parts.join(' ');
      };
      setVal('inviteActivatedAt', fmtDate(s.inviteActivatedAt));
      setVal('inviteExpiresAt', fmtDate(s.inviteExpiresAt));
      setVal('inviteRemaining', getRemaining());
      // ★ 启动倒计时
      if (Mrite._inviteCountdownTimer) clearInterval(Mrite._inviteCountdownTimer);
      Mrite._inviteCountdownTimer = setInterval(function() {
        setVal('inviteRemaining', getRemaining());
      }, 1000);
    } else {
      info.style.display = 'none';
      if (Mrite._inviteCountdownTimer) { clearInterval(Mrite._inviteCountdownTimer); Mrite._inviteCountdownTimer = null; }
    }
  }
};

window._onExportLogs = async function() {
  if (!window.electronAPI || !window.electronAPI.exportDiagnosticsLog) return;
  try {
    var r = await window.electronAPI.exportDiagnosticsLog();
    if (r && r.success) {
      Mrite._showToast('诊断日志已导出');
    } else if (!(r && r.canceled)) {
      Mrite._showToast((r && r.error) || '导出失败');
    }
  } catch (e) {
    Mrite._showToast('导出失败: ' + e.message);
  }
};

// ★ 写作语言切换
Mrite._switchLang = function(el, lang) {
  var row = el.parentElement;
  row.querySelectorAll('.cfg-lang-opt').forEach(function(o) { o.classList.remove('active'); });
  el.classList.add('active');
  Mrite.STATE.settings.writingLang = lang;
  Mrite.saveSettings();
};

// ★ 求解配置 — 每个字段独立开关
Mrite._onSolveToggle = function(field) {
  var toggle = document.getElementById('toggle' + field.charAt(0).toUpperCase() + field.slice(1));
  // 映射到 settings key
  var keyMap = { teamCode: 'enableTeamCode', problemNumber: 'enableProblemNum', school: 'enableSchool', members: 'enableMembers', advisor: 'enableAdvisor', style: 'enableStyle' };
  var key = keyMap[field];
  if (key && toggle) {
    Mrite.STATE.settings[key] = !!toggle.checked;
    Mrite.saveSettings();
  }
};

Mrite.onBrowseOutput = async function() {
  const r = await window.electronAPI.selectOutputPath();
  if (r.success) {
    document.querySelector('#inputOutputPath').value = r.path;
    Mrite.STATE.settings.outputPath = r.path;
    Mrite.saveSettings();
    await window.electronAPI.setOutputConfig(r.path);
  }
};

// ★ 用量统计渲染 — 信息丰富型仪表盘
Mrite.renderUsageStats = async function() {
  try {
    var r = await window.electronAPI.getUsageStats();
    var dash = document.getElementById('usageDashboard');
    if (!dash) return;
    if (!r || !r.success || !r.totals) {
      dash.innerHTML = '<div class="ud-empty">暂无使用记录</div>';
      return;
    }
    var t = r.totals || {}, daily = r.daily || {};
    var tasks = r.tasks || [];
    var today = new Date().toISOString().split('T')[0];
    var td = daily[today] || { input: 0, output: 0, tasks: 0, durationMs: 0 };
    var trend = r.trend || [];

    var fmtN = function(n) {
      if (n >= 1e6) return (n/1e6).toFixed(1)+'M';
      if (n >= 1e3) return (n/1e3).toFixed(1)+'K';
      return String(n);
    };
    var fmtM = function(ms) {
      var sec = Math.floor(ms / 1000);
      var m = Math.floor(sec / 60);
      var s = sec % 60;
      if (m >= 60) { var h = Math.floor(m / 60); m = m % 60; return h + 'h ' + m + 'm'; }
      if (m > 0) return m + 'm ' + s + 's';
      return s + 's';
    };
    var escHtml = function(s) { return s ? String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') : ''; };
    // DeepSeek 官方人民币定价：输入 ¥1/M tokens, 输出 ¥4/M tokens
    var costToday = (td.input*1 + td.output*4)/1e6;
    var costTotal = ((t.input||0)*1 + (t.output||0)*4)/1e6;
    var todayInput = fmtN(td.input);
    var todayOutput = fmtN(td.output);
    var todayTotal = td.input + td.output;
    var avgInput = (t.tasks||0)>0 ? fmtN(Math.round(t.input/(t.tasks||1))) : '--';
    var avgOutput = (t.tasks||0)>0 ? fmtN(Math.round(t.output/(t.tasks||1))) : '--';

    // 任务统计
    var completedTasks = 0, errorTasks = 0;
    tasks.forEach(function(tk) {
      if (tk.status === 'completed') completedTasks++;
      else if (tk.status === 'error') errorTasks++;
    });
    var successRate = tasks.length > 0 ? Math.round(completedTasks / tasks.length * 100) : 0;
    var avgDuration = completedTasks > 0 ? Math.round(tasks.reduce(function(s, tk) { return s + (tk.duration_ms || 0); }, 0) / completedTasks) : 0;

    var html = '';

    // ── 今日概览 ──
    html += '<div class="ud-section-title"><span class="ud-section-dot"></span>今日概览</div>';
    html += '<div class="ud-row">';
    html += '<div class="ud-card"><div class="ud-card-icon ud-icon-input"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg></div><div class="ud-card-info"><span class="ud-card-num">'+todayInput+'</span><span class="ud-card-label">输入 Token</span></div></div>';
    html += '<div class="ud-card"><div class="ud-card-icon ud-icon-output"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg></div><div class="ud-card-info"><span class="ud-card-num">'+todayOutput+'</span><span class="ud-card-label">输出 Token</span></div></div>';
    html += '<div class="ud-card"><div class="ud-card-icon ud-icon-task"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg></div><div class="ud-card-info"><span class="ud-card-num">'+String(td.tasks)+'</span><span class="ud-card-label">任务数</span></div></div>';
    html += '<div class="ud-card"><div class="ud-card-icon ud-icon-time"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></div><div class="ud-card-info"><span class="ud-card-num">'+fmtM(td.durationMs||0)+'</span><span class="ud-card-label">运行时长</span></div></div>';
    html += '</div>';

    // ── 今日花费 ──
    var inpPct = todayTotal>0 ? Math.round(td.input/todayTotal*100) : 50;
    html += '<div class="ud-section-title"><span class="ud-section-dot"></span>今日消耗</div>';
    html += '<div class="ud-split-block">';
    html += '<div class="ud-split-top"><span class="ud-split-cost">¥'+costToday.toFixed(4)+'</span><span class="ud-split-price">输入 ¥1/M · 输出 ¥4/M</span></div>';
    html += '<div class="ud-split-bar"><div class="ud-split-in" style="flex:'+inpPct+'"></div><div class="ud-split-out" style="flex:'+(100-inpPct)+'"></div></div>';
    html += '<div class="ud-split-labels"><span class="ud-split-in-label"><span class="ud-dot-in"></span>输入 '+todayInput+'</span><span class="ud-split-out-label"><span class="ud-dot-out"></span>输出 '+todayOutput+'</span></div>';
    html += '</div>';

    // ── 任务质量 ──
    html += '<div class="ud-section-title"><span class="ud-section-dot"></span>任务质量</div>';
    html += '<div class="ud-quality-row">';
    html += '<div class="ud-quality-item"><div class="ud-quality-bar-wrap"><div class="ud-quality-bar" style="width:'+successRate+'%"></div></div><div class="ud-quality-info"><span class="ud-quality-val">'+successRate+'%</span><span class="ud-quality-label">成功率</span></div></div>';
    html += '<div class="ud-quality-item"><span class="ud-quality-val ud-val-ok">'+completedTasks+'</span><span class="ud-quality-label">成功</span></div>';
    html += '<div class="ud-quality-item"><span class="ud-quality-val ud-val-err">'+errorTasks+'</span><span class="ud-quality-label">失败</span></div>';
    html += '<div class="ud-quality-item"><span class="ud-quality-val">'+fmtM(avgDuration)+'</span><span class="ud-quality-label">平均耗时</span></div>';
    html += '</div>';

    // ── 7天趋势 ──
    var maxVal = 0;
    trend.forEach(function(d) { var v=d.input+d.output; if(v>maxVal)maxVal=v; });
    if (maxVal===0) maxVal=1;
    html += '<div class="ud-section-title"><span class="ud-section-dot"></span>近 7 天趋势</div>';
    html += '<div class="ud-trend">';
    html += '<div class="ud-trend-chart">';
    trend.forEach(function(d) {
      var total = d.input+d.output;
      var h = Math.max(2,Math.round(total/maxVal*56));
      var date = new Date(d.date);
      var day = String(date.getMonth()+1)+'/'+String(date.getDate());
      var isToday = d.date===today;
      html += '<div class="ud-bar-col'+(isToday?' today':'')+'">';
      html += '<span class="ud-bar-num">'+fmtN(total)+'</span>';
      html += '<div class="ud-bar-stack">';
      html += '<div class="ud-bar-in" style="height:'+Math.round((total>0?d.input/total:0.5)*h)+'px"></div>';
      html += '<div class="ud-bar-out" style="height:'+Math.round((total>0?d.output/total:0.5)*h)+'px"></div>';
      html += '</div>';
      html += '<span class="ud-bar-label">'+day+'</span>';
      html += '</div>';
    });
    html += '</div></div>';

    // ── 累计统计 ──
    html += '<div class="ud-section-title"><span class="ud-section-dot"></span>累计统计</div>';
    html += '<div class="ud-footer">';
    html += '<div class="ud-footer-item"><span class="ud-footer-val">'+fmtN(t.input+t.output)+'</span><span class="ud-footer-label">总 Token</span></div>';
    html += '<div class="ud-footer-item"><span class="ud-footer-val">'+String(t.tasks||0)+'</span><span class="ud-footer-label">总任务</span></div>';
    html += '<div class="ud-footer-item"><span class="ud-footer-val">¥'+costTotal.toFixed(2)+'</span><span class="ud-footer-label">总花费</span></div>';
    html += '<div class="ud-footer-item"><span class="ud-footer-val">'+fmtM(t.durationMs||0)+'</span><span class="ud-footer-label">总时长</span></div>';
    html += '<div class="ud-footer-item"><span class="ud-footer-val">'+avgInput+'</span><span class="ud-footer-label">平均输入</span></div>';
    html += '<div class="ud-footer-item"><span class="ud-footer-val">'+avgOutput+'</span><span class="ud-footer-label">平均输出</span></div>';
    html += '</div>';

    // ── 最近任务 ──
    if (tasks.length > 0) {
      html += '<div class="ud-section-title"><span class="ud-section-dot"></span>最近任务</div>';
      html += '<div class="ud-task-list">';
      var showTasks = tasks.slice(0, 8); // 最多显示8条
      showTasks.forEach(function(tk) {
        var statusIcon = tk.status === 'completed' ? '✓' : (tk.status === 'error' ? '✗' : '●');
        var statusClass = tk.status === 'completed' ? 'ok' : (tk.status === 'error' ? 'err' : 'run');
        var typeLabel = tk.task_type === 'solve' ? '求解' : (tk.task_type === 'modify' ? '修改' : tk.task_type || '');
        var name = tk.project_name || tk.workspace_name || '未命名';
        if (name.length > 16) name = name.substring(0, 16) + '...';
        var tokens = fmtN((tk.input_tokens||0) + (tk.output_tokens||0));
        var dur = tk.duration_ms ? fmtM(tk.duration_ms) : '--';
        var dateStr = '';
        if (tk.started_at) {
          var d = new Date(tk.started_at);
          dateStr = (d.getMonth()+1) + '/' + d.getDate() + ' ' + String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0');
        }
        html += '<div class="ud-task-item">';
        html += '<span class="ud-task-status ud-status-'+statusClass+'">'+statusIcon+'</span>';
        html += '<span class="ud-task-type ud-type-'+(tk.task_type||'')+'">'+typeLabel+'</span>';
        html += '<span class="ud-task-name" title="'+escHtml(tk.project_name||tk.workspace_name||'')+'">'+escHtml(name)+'</span>';
        html += '<span class="ud-task-meta">'+tokens+' tok · '+dur+'</span>';
        html += '<span class="ud-task-time">'+dateStr+'</span>';
        html += '</div>';
      });
      html += '</div>';
    }

    dash.innerHTML = html;
  } catch(_) {}
};

// ★ 加载机器码
Mrite._loadMachineCode = async function() {
  var el = document.getElementById('inputMachineCode');
  if (!el) return;
  try {
    var r = await window.electronAPI.getMachineCode();
    if (r && r.success) el.value = r.machineCode;
    else el.value = '获取失败';
  } catch(e) { el.value = '获取失败'; }
};


// ★ 求解模式三档开关
Mrite._solveMode = 1; // 0=pro, 1=max, 2=Ultra
Mrite._modeDescs = [
  '关键步骤需确认后继续',
  '全自动运行，无需人工干预',
  '运行完成后自动校验结果',
];
Mrite._setMode = function(idx) {
  Mrite._solveMode = idx;
  var thumb = document.getElementById('modeThumb');
  var desc = document.getElementById('modeDesc');
  var opts = document.querySelectorAll('.mode-opt');
  if (thumb) thumb.style.transform = 'translateX(' + (idx * 100) + '%)';
  opts.forEach(function(o, i) { o.classList.toggle('active', i === idx); });
  if (desc) desc.textContent = Mrite._modeDescs[idx] || '';
};

// ★ 首次进入主界面后检查系统配置
Mrite._scheduleSystemConfigOnStartup = function() {
  if (Mrite._systemConfigScheduled) return;
  Mrite._systemConfigScheduled = true;

  var tries = 0;
  var run = async function() {
    tries++;
    var splash = document.getElementById('splashScreen');
    var activation = document.querySelector('.activation-overlay');
    var splashVisible = splash && splash.style.display !== 'none';
    if ((splashVisible || activation) && tries < 40) {
      setTimeout(run, 400);
      return;
    }
    await Mrite._checkSystemConfigOnStartup({ showDialog: false });
  };
  setTimeout(run, 2600);
};

Mrite._checkSystemConfigOnStartup = async function(options) {
  try {
    var S = Mrite.STATE;
    if (!S || !S.settings || !S.settings.inviteVerified) return;

    var doneKey = 'mrite-system-config-v1-done';
    var done = localStorage.getItem(doneKey) === 'true';

    // 已完成过配置 → 后台静默检测，不弹窗
    if (done) {
      try {
        var py = await window.electronAPI.pythonGetStatus();
        if (!py || !py.ready) await window.electronAPI.pythonEnsure();
      } catch(_) {}
      return;
    }

    // 首次配置（激活后触发）→ 弹窗，自动跑完
    var showDialog = options && options.showDialog;
    if (!showDialog) return;

    Mrite._showSystemConfigDialog(doneKey);
  } catch(e) {
    console.warn('System config startup check failed:', e);
  }
};

Mrite._setSystemConfigStep = function(id, state, text) {
  var row = document.querySelector('[data-config-step="' + id + '"]');
  if (!row) return;
  row.classList.remove('pending', 'running', 'ok', 'warn', 'fail');
  row.classList.add(state);
  var status = row.querySelector('.sys-config-step-status');
  if (status) status.textContent = text || '';
};

// ★ 系统配置弹窗
Mrite._showSystemConfigDialog = function(doneKey) {
  // 移除旧弹窗
  var old = document.querySelector('.python-init-overlay');
  if (old) old.remove();

  var overlay = document.createElement('div');
  overlay.className = 'python-init-overlay';

  var card = document.createElement('div');
  card.className = 'python-init-card';

  card.innerHTML = '<div class="python-init-content">' +
    '<div class="python-init-icon">' +
      '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v3"/><path d="M12 18v3"/><path d="M4.64 7.5 7.24 9"/><path d="m16.76 15 2.6 1.5"/><path d="m4.64 16.5 2.6-1.5"/><path d="m16.76 9 2.6-1.5"/><circle cx="12" cy="12" r="4"/></svg>' +
    '</div>' +
    '<h3 class="python-init-title">系统配置中</h3>' +
    '<p class="python-init-desc">正在检查运行环境...</p>' +
    '<div class="sys-config-steps">' +
      '<div class="sys-config-step pending" data-config-step="python"><span class="sys-config-dot"></span><div><b>内置 Python</b><small>数模代码运行环境</small></div><span class="sys-config-step-status">等待检测</span></div>' +
      '<div class="sys-config-step pending" data-config-step="latex"><span class="sys-config-dot"></span><div><b>内置 TinyTeX</b><small>论文 PDF 编译环境</small></div><span class="sys-config-step-status">等待检测</span></div>' +
      '<div class="sys-config-step pending" data-config-step="path"><span class="sys-config-dot"></span><div><b>输出路径</b><small>论文和附件保存位置</small></div><span class="sys-config-step-status">等待检测</span></div>' +
      '<div class="sys-config-step pending" data-config-step="network"><span class="sys-config-dot"></span><div><b>网络状态</b><small>模型调用与依赖安装</small></div><span class="sys-config-step-status">等待检测</span></div>' +
      '<div class="sys-config-step pending" data-config-step="license"><span class="sys-config-dot"></span><div><b>激活状态</b><small>本机授权信息</small></div><span class="sys-config-step-status">等待检测</span></div>' +
    '</div>' +
    '<div id="pythonInitProgress" class="python-init-progress"></div>' +
    '<div class="python-init-actions">' +
      '<button id="btnPythonInitStart" class="python-init-btn python-init-btn-primary">开始配置</button>' +
      '<button id="btnPythonInitSkip" class="python-init-btn python-init-btn-secondary">稍后再说</button>' +
    '</div>' +
  '</div>';

  // 隐藏按钮（自动跑，不需要用户操作）
  var actionsDiv = card.querySelector('.python-init-actions');
  if (actionsDiv) actionsDiv.style.display = 'none';

  overlay.appendChild(card);
  document.body.appendChild(overlay);

  var progressDiv = document.getElementById('pythonInitProgress');
  progressDiv.classList.add('show');

  // 弹出来就自动跑，跑完自动关
  (async function() {
    try {
      // Python
      Mrite._setSystemConfigStep('python', 'running', '检测中');
      var py = await window.electronAPI.pythonGetStatus();
      if (!py || !py.ready) {
        try { await window.electronAPI.pythonEnsure(); } catch(_) {}
        py = await window.electronAPI.pythonGetStatus();
      }
      Mrite._setSystemConfigStep('python', py && py.ready ? 'ok' : 'fail',
        py && py.ready ? (py.version ? 'Python ' + py.version : '已就绪') : '未就绪');

      // LaTeX
      Mrite._setSystemConfigStep('latex', 'running', '检测中');
      var latex = await window.electronAPI.latexGetStatus();
      Mrite._setSystemConfigStep('latex', latex && latex.installed ? 'ok' : 'fail',
        latex && latex.installed ? '已就绪' : '未找到');

      // 输出路径
      Mrite._setSystemConfigStep('path', 'running', '检测中');
      var outPath = Mrite.STATE && Mrite.STATE.settings ? (Mrite.STATE.settings.outputPath || '') : '';
      if (outPath && window.electronAPI.pathExists) {
        var exists = await window.electronAPI.pathExists(outPath);
        Mrite._setSystemConfigStep('path', exists ? 'ok' : 'warn', exists ? '可用' : '路径失效');
      } else {
        Mrite._setSystemConfigStep('path', 'warn', '未配置');
      }

      // 网络
      Mrite._setSystemConfigStep('network', navigator.onLine ? 'ok' : 'warn', navigator.onLine ? '在线' : '离线');

      // 激活状态
      var s = Mrite.STATE ? Mrite.STATE.settings : {};
      if (s && s.inviteVerified) {
        var expired = Mrite._isExpired && Mrite._isExpired();
        Mrite._setSystemConfigStep('license', expired ? 'warn' : 'ok', expired ? '已过期' : '已激活');
      } else {
        Mrite._setSystemConfigStep('license', 'warn', '待激活');
      }

      localStorage.setItem(doneKey || 'mrite-system-config-v1-done', 'true');
      localStorage.removeItem('mrite-python-init-skip');

      // 跑完自动关闭
      setTimeout(function() { overlay.remove(); }, 600);
    } catch(e) {
      var progressDiv2 = document.getElementById('pythonInitProgress');
      if (progressDiv2) progressDiv2.textContent = '❌ ' + (e.message || e);
    }
  })();
};
