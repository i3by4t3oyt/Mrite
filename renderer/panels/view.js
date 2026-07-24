// Mrite v1.8 — 文件浏览器（左右 1:2 固定分栏）
window.Mrite = window.Mrite || {};

// ═══════════ SVG 图标（压缩属性名，运行时展开）═══════════
var IC = {
  dir:  '<svg w="14" h="14" v="0 0 24 24" f="none" s="currentColor" sw="1.5" sl="round" sj="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>',
  doc:  '<svg w="14" h="14" v="0 0 24 24" f="none" s="currentColor" sw="1.5" sl="round" sj="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>',
  code: '<svg w="14" h="14" v="0 0 24 24" f="none" s="currentColor" sw="1.5" sl="round" sj="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>',
  img:  '<svg w="14" h="14" v="0 0 24 24" f="none" s="currentColor" sw="1.5" sl="round" sj="round"><rect x="3" y="3" w="18" h="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>',
  tbl:  '<svg w="14" h="14" v="0 0 24 24" f="none" s="currentColor" sw="1.5" sl="round" sj="round"><rect x="3" y="3" w="18" h="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/></svg>',
  log:  '<svg w="14" h="14" v="0 0 24 24" f="none" s="currentColor" sw="1.5" sl="round" sj="round"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>',
  chv:  '<svg w="10" h="10" v="0 0 24 24" f="none" s="currentColor" sw="2.5" sl="round" sj="round"><polyline points="9 18 15 12 9 6"/></svg>',
  rld:  '<svg w="13" h="13" v="0 0 24 24" f="none" s="currentColor" sw="2" sl="round" sj="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10"/><path d="M20.49 15a9 9 0 0 1-14.85 3.36L1 14"/></svg>',
  // ★ 单条记录「重新加载」按钮专用图标，与顶部刷新 rld 区分
  load: '<svg w="13" h="13" v="0 0 24 24" f="none" s="currentColor" sw="2.5" sl="round" sj="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>',
  dl:   '<svg w="13" h="13" v="0 0 24 24" f="none" s="currentColor" sw="2" sl="round" sj="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
  trash:'<svg w="13" h="13" v="0 0 24 24" f="none" s="currentColor" sw="2" sl="round" sj="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>'
};
(function() {
  var r = { w: 'width', h: 'height', v: 'viewBox', f: 'fill', s: 'stroke', sw: 'stroke-width', sl: 'stroke-linecap', sj: 'stroke-linejoin' };
  for (var k in IC) for (var a in r) IC[k] = IC[k].replace(new RegExp(' ' + a + '=', 'g'), ' ' + r[a] + '=').replace(new RegExp('"' + a + '"', 'g'), '"' + r[a] + '"');
})();

// ═══════════ 文件图标匹配 ═══════════
function fileMeta(ext, isDir) {
  if (isDir) return { s: IC.dir, c: 'v-dir' };
  var m = {
    pdf: [IC.doc,'v-pdf'], tex: [IC.doc,'v-tex'], py: [IC.code,'v-code'],
    js: [IC.code,'v-code'], ts: [IC.code,'v-code'], json: [IC.code,'v-code'],
    csv: [IC.tbl,'v-dat'], xlsx: [IC.tbl,'v-dat'], xls: [IC.tbl,'v-dat'],
    png: [IC.img,'v-img'], jpg: [IC.img,'v-img'], jpeg: [IC.img,'v-img'], svg: [IC.img,'v-img'],
    md: [IC.doc,'v-doc'], txt: [IC.doc,'v-doc'], log: [IC.log,'v-log']
  };
  var h = m[ext];
  return h ? { s: h[0], c: h[1] } : { s: IC.doc, c: 'v-doc' };
}

// ═══════════ 文件树（直接读取工作区路径） ═══════════
Mrite.loadFileTree = async function(wsPath) {
  var el = document.getElementById('fileTree');
  if (!el) return;
  if (!wsPath) {
    el.innerHTML = '<div class="ve">请选择左侧任务查看文件</div>';
    el.dataset.currentPath = '';
    return;
  }
  el.dataset.currentPath = wsPath; // ★ 记录当前预览的项目路径
  el.innerHTML = '<div class="ve">加载中…</div>';
  try {
    var exists = await window.electronAPI.pathExists(wsPath);
    if (!exists) { el.innerHTML = '<div class="ve">工作区不存在</div>'; return; }
    var r = await window.electronAPI.readDirectoryTree(wsPath, 4);
    if (r && r.success && r.tree && r.tree.children && r.tree.children.length > 0) {
      var kids = r.tree.children.filter(function(c) { return c.name === '求解' || c.name === '论文'; });
      if (kids.length === 0) {
        el.innerHTML = '<div class="ve">暂无求解或论文文件<br><span style="font-size:10px;color:#ccc;">运行求解后将在此显示</span></div>';
        return;
      }
      el.innerHTML = '';
      var treeName = wsPath.split('/').pop().split('\\').pop();
      el.appendChild(buildNode({ name: treeName, type: 'directory', path: wsPath, children: kids }));
      el.querySelectorAll('.va').forEach(function(a) { a.click(); });
    } else {
      el.innerHTML = '<div class="ve">暂无文件</div>';
    }
  } catch(e) { el.innerHTML = '<div class="ve">读取失败</div>'; }
};

function buildNode(node) {
  var w = document.createElement('div');
  var r = document.createElement('div'); r.className = 'vr';
  var a = document.createElement('span'); a.className = 'va';
  if (node.children && node.children.length) a.innerHTML = IC.chv;
  else a.style.visibility = 'hidden';
  var ext = node.name ? node.name.split('.').pop().toLowerCase() : '';
  var m = fileMeta(ext, node.type === 'directory');
  var i = document.createElement('span'); i.className = 'vi ' + m.c; i.innerHTML = m.s;
  var n = document.createElement('span'); n.className = 'vn' + (node.type === 'file' ? ' vf' : ''); n.textContent = node.name;
  if (node.type === 'file') n.dataset.path = node.path;
  r.appendChild(a); r.appendChild(i); r.appendChild(n); w.appendChild(r);
  if (node.children && node.children.length) {
    var k = document.createElement('div'); k.className = 'vk hide';
    node.children.forEach(function(ch) { k.appendChild(buildNode(ch)); });
    w.appendChild(k);
    a.onclick = function(e) { e.stopPropagation(); var h = k.classList.contains('hide'); k.classList.toggle('hide', !h); a.classList.toggle('open', h); };
  }
  if (node.type === 'file') {
    n.style.cursor = 'pointer';
    n.addEventListener('click', function(ev) {
      ev.stopPropagation();
      // ★ 收集同目录兄弟图片/CSV文件
      var siblings = [];
      var vrEl = ev.target.closest('.vr');
      var vkEl = vrEl ? vrEl.closest('.vk') : null;
      if (vkEl) {
        var allVn = vkEl.querySelectorAll('.vn.vf');
        allVn.forEach(function(sn) {
          var snName = sn.textContent;
          var snPath = sn.dataset.path;
          var snExt = (snName || '').split('.').pop().toLowerCase();
          if (['png','jpg','jpeg','gif','svg','webp','csv','tex','pdf'].includes(snExt) && snPath) {
            siblings.push({ name: snName, path: snPath, ext: snExt });
          }
        });
        siblings.sort(function(a, b) { return (a.name || '').localeCompare(b.name || ''); });
      }
      Mrite._previewFile(node.path, node.name, siblings);
    });
    n.addEventListener('dblclick', function(ev) {
      ev.stopPropagation();
      window.electronAPI.openFile(node.path);
    });
  }
  return w;
}

// ═══════════ 历史记录 ═══════════
Mrite.refreshViewPanel = async function() {
  await Mrite.loadHistoryList();
  var r = await Mrite._syncAndRefresh();
  if (Mrite._showToast) {
    if (r && r.skipped) Mrite._showToast('请先在设置中配置输出路径');
    else if (!r || !r.success) Mrite._showToast('同步失败，请检查输出路径和工作区');
  }
};

Mrite.loadHistoryList = async function() {
  var el = document.getElementById('historyList');
  if (!el) return;
  el.innerHTML = '<div class="he">加载中…</div>';
  try {
    var r = await window.electronAPI.scanWorkspaceProjects();
    if (!r || !r.success || !r.projects || !r.projects.length) {
      el.innerHTML = '<div class="he">暂无运行记录<br><span style="font-size:10px;color:#ccc;">运行求解后将在此显示</span></div>'; return;
    }
    var h = '';
    var currentPath = (Mrite.STATE && Mrite.STATE.settings && Mrite.STATE.settings.projectPath) || '';
    r.projects.forEach(function(p) {
      var activeCls = (currentPath && currentPath === p.projectPath) ? ' active' : '';
      h += '<div class="hr' + activeCls + '" data-pp="' + escAttr(p.projectPath) + '" data-wn="' + escAttr(p.workspaceName || '') + '" data-name="' + escAttr(p.projectName) + '" data-status="' + escAttr(p.status) + '">' +
        '<div class="hr-top">' +
          '<span class="hr-name">' + escHtml(p.projectName) + '</span>' +
        '</div>' +
        '<div class="hr-bot">' +
          '<span class="hr-time">' + fmtTime(p.timestamp) + '</span>' +
          '<span class="hr-actions">' +
            '<button class="hr-icon-btn hr-btn-dl" title="下载">' + IC.dl + '</button>' +
            '<button class="hr-icon-btn hr-btn-del" title="删除">' + IC.trash + '</button>' +
          '</span>' +
        '</div>' +
      '</div>';
    });
    el.innerHTML = h;

    function findRow(el) { while (el && !el.classList.contains('hr')) el = el.parentElement; return el; }

    // ── 单击卡片 → 切换文件树 + 高亮 + 缓存 ──
    el.querySelectorAll('.hr').forEach(function(card) {
      card.addEventListener('click', function(ev) {
        if (ev.target.closest('button') || ev.target.closest('.hr-name')) return;
        el.querySelectorAll('.hr').forEach(function(c) { c.classList.remove('active'); });
        card.classList.add('active');
        var pp = card.dataset.pp;
        if (pp) {
          Mrite.loadFileTree(pp);
          Mrite._setViewMode('file');
          // ★ 缓存最后打开的工作区
          try { localStorage.setItem('mrite-last-view', pp); } catch(_) {}
        }
      });
    });

    // ★ 恢复上次打开的卡片
    var lastWs = '';
    try { lastWs = localStorage.getItem('mrite-last-view') || ''; } catch(_) {}
    if (lastWs) {
      var lastCard = el.querySelector('.hr[data-pp="' + escAttr(lastWs) + '"]');
      if (lastCard) { lastCard.click(); }
    }

    // ── 下载 ──
    el.querySelectorAll('.hr-btn-dl').forEach(function(btn) {
      btn.onclick = async function(ev) {
        ev.stopPropagation();
        var row = findRow(btn); if (!row) return;
        var pp = row.dataset.pp; if (!pp) return;
        try {
          var setR = await window.electronAPI.setWorkspaceOverride(pp);
          if (!setR || !setR.success) { Mrite._showToast('工作区路径无效'); return; }
          var r = await window.electronAPI.syncOutput();
          if (r && r.success) {
            if (r.skipped) Mrite._showToast('请先在设置中配置输出路径');
            else Mrite._showToast('已同步到输出路径');
          } else { Mrite._showToast('同步失败'); }
        } catch(e) { Mrite._showToast('同步失败'); }
      };
    });
    // ── 删除 ──
    el.querySelectorAll('.hr-btn-del').forEach(function(btn) {
      btn.onclick = function(ev) {
        ev.stopPropagation();
        if (Mrite._guardRunning('删除项目')) return;
        var row = findRow(btn); if (!row) return;
        var wsName = row.dataset.wn, displayName = row.dataset.name;
        var deletedPp = row.dataset.pp; // 记录当前删除的项目路径
        Mrite._showConfirm({
          title: '删除项目',
          desc: '确定要删除「' + displayName + '」吗？此操作不可恢复。',
          type: 'danger',
          confirmText: '删除',
          confirmClass: 'modal-btn-danger'
        }).then(function(confirmed) {
          if (confirmed) {
            window.electronAPI.deleteWorkspaceProject(wsName).then(function(r) {
              if (r.success) {
                row.remove();
                if (!el.querySelector('.hr')) el.innerHTML = '<div class="he">暂无项目</div>';
                // ★ 强制清空文件树和预览
                var fileTree = document.getElementById('fileTree');
                var filePreview = document.getElementById('filePreview');
                if (fileTree) { fileTree.innerHTML = '<div class="tree-empty">请选择项目</div>'; fileTree.dataset.currentPath = ''; }
                if (filePreview) { filePreview.style.display = 'none'; filePreview.innerHTML = ''; }
                Mrite._lastPreviewedFile = null;
                try { localStorage.removeItem('mrite-last-view'); } catch(_) {}
                Mrite._showToast('已删除');
              }
            });
          }
        });
      };
    });
  } catch(e) { el.innerHTML = '<div class="he">加载失败</div>'; }
};

Mrite.saveHistoryEntry = async function(outputTimestampDir) {
  try {
    var S = Mrite.STATE;
    var op = outputTimestampDir || await window.electronAPI.getOutputPath();
    var pp = S.settings.projectPath;
    // ★ 传递用户设置的项目名称
    await window.electronAPI.saveHistoryEntry({
      projectPath: pp,
      projectName: S.currentProjectName || '',
      timestamp: new Date().toISOString(),
      outputPath: op || ''
    });
    await Mrite.loadHistoryList();
  } catch(e) {}
};

// ═══════════ 工具 ═══════════
function fmtTime(ts) {
  try { var d=new Date(ts),n=new Date(),x=n-d;
    if(x<6e4)return'刚刚';if(x<36e5)return Math.floor(x/6e4)+'分前';
    if(x<864e5)return Math.floor(x/36e5)+'时前';if(x<25056e5)return Math.floor(x/864e5)+'天前';
    if(x<31536e6)return Math.floor(x/26298e5)+'月前';
    return Math.min(99,Math.floor(x/31536e6))+'年前';
  } catch(e){return ts;}
}
// ═══════════ 底部媒体导航（左右切换） ═══════════
function buildMediaNav(file, type) {
  var sibs = file.siblings || [];
  var h = '<div class="fv-mnav">';
  h += '<button class="fv-mnav-btn fv-mnav-prev" ' + (sibs.length === 0 ? 'disabled' : '') + '>';
  h += '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="15 18 9 12 15 6"/></svg>';
  h += '</button>';
  h += '<span class="fv-mnav-info">' + escHtml(file.name) + '</span>';
  h += '<button class="fv-mnav-btn fv-mnav-next" ' + (sibs.length === 0 ? 'disabled' : '') + '>';
  h += '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="9 18 15 12 9 6"/></svg>';
  h += '</button>';
  h += '</div>';
  return h;
}

function bindMediaNav(file) {
  var sibs = file.siblings || [];
  if (!sibs.length) return;
  var prevBtn = document.querySelector('.fv-mnav-prev');
  var nextBtn = document.querySelector('.fv-mnav-next');
  var curIdx = -1;
  for (var i = 0; i < sibs.length; i++) {
    if (sibs[i].path === file.path) { curIdx = i; break; }
  }
  if (prevBtn && curIdx > 0) {
    prevBtn.onclick = function() { Mrite._previewFile(sibs[curIdx - 1].path, sibs[curIdx - 1].name, sibs); };
  } else if (prevBtn) { prevBtn.disabled = true; }
  if (nextBtn && curIdx < sibs.length - 1) {
    nextBtn.onclick = function() { Mrite._previewFile(sibs[curIdx + 1].path, sibs[curIdx + 1].name, sibs); };
  } else if (nextBtn) { nextBtn.disabled = true; }
}

// ═══════════ Markdown 渲染 ═══════════
function renderMd(text) {
  var h = escHtml(text);
  h = h.replace(/```(\w*)\n([\s\S]*?)```/g, function(_, lang, code) {
    return '<pre class="fv-md-code">' + highlightCode(code.trim(), lang || '') + '</pre>';
  });
  h = h.replace(/`([^`]+)`/g, '<code class="fv-md-inline">$1</code>');
  h = h.replace(/^#### (.+)$/gm, '<h4 class="fv-md-h4">$1</h4>');
  h = h.replace(/^### (.+)$/gm, '<h3 class="fv-md-h3">$1</h3>');
  h = h.replace(/^## (.+)$/gm, '<h2 class="fv-md-h2">$1</h2>');
  h = h.replace(/^# (.+)$/gm, '<h1 class="fv-md-h1">$1</h1>');
  h = h.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  h = h.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  h = h.replace(/\*(.+?)\*/g, '<em>$1</em>');
  h = h.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a class="fv-md-a" target="_blank">$1</a>');
  h = h.replace(/^[\-\*] (.+)$/gm, '<li class="fv-md-li">$1</li>');
  h = h.replace(/^\|(.+)\|$/gm, function(line) {
    var cells = line.split('|').filter(function(c) { return c.trim(); });
    if (cells.every(function(c) { return /^[\-\:]+$/.test(c.trim()); })) return '';
    var tag = this._inThead ? 'td' : (this._inThead = true, 'th');
    return '<tr>' + cells.map(function(c) { return '<' + tag + '>' + c.trim() + '</' + tag + '>'; }).join('') + '</tr>';
  });
  h = h.replace(/\n\n/g, '</p><p class="fv-md-p">');
  h = '<p class="fv-md-p">' + h + '</p>';
  h = h.replace(/<p class="fv-md-p"><\/p>/g, '');
  return h;
}

// ═══════════ 代码着色 ═══════════
function highlightCode(text, lang) {
  var h = escHtml(text);
  var kw = '';
  if (lang === 'py') kw = '\\b(def|class|import|from|return|if|else|elif|for|while|try|except|with|as|in|not|and|or|True|False|None|pass|break|continue|yield|raise|lambda|print|range|len|int|str|float|list|dict|set|tuple|open|self|cls)\\b';
  else if (lang === 'js') kw = '\\b(function|const|let|var|return|if|else|for|while|try|catch|new|this|class|extends|import|export|default|from|async|await|true|false|null|undefined|console|require|module)\\b';
  else if (lang === 'tex') kw = '\\\\(section|subsection|textbf|textit|underline|emph|input|include|usepackage|documentclass|begin|end|caption|label|ref|cite|bibitem|title|author|date|maketitle|tableofcontents|newpage|hline|toprule|midrule|bottomrule|centering|small|large|Large|LARGE|huge|Huge|textwidth|newcommand|renewcommand|vspace|hspace|par|noindent|newline|sqrt|frac|alpha|beta|gamma|delta|epsilon|theta|lambda|mu|pi|sigma|phi|omega|sin|cos|tan|log|exp|max|min|sum|int|prod|lim|infty|partial|nabla|left|right|mathbf|mathbb|Rightarrow|Leftarrow|rightarrow|leftarrow|implies|iff|leq|geq|neq|approx|equiv|pm|times|div|cdot|forall|exists|in|notin|subset|supset|cup|cap|land|lor|lnot)\\b';
  if (kw) h = h.replace(new RegExp(kw, 'g'), '<span class="fv-kw">$&</span>');
  h = h.replace(/(["'`])(?:(?!\1)[^\\]|\\.)*\1/g, '<span class="fv-str">$&</span>');
  if (lang === 'py') h = h.replace(/(#.*$)/gm, '<span class="fv-cmt">$1</span>');
  else if (lang === 'js') h = h.replace(/(\/\/.*$)/gm, '<span class="fv-cmt">$1</span>');
  if (lang === 'tex') h = h.replace(/(%.*$)/gm, '<span class="fv-cmt">$1</span>');
  h = h.replace(/\b(\d+\.?\d*)\b/g, '<span class="fv-num">$1</span>');
  return h;
}

function escHtml(s){return s?String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'):'';}
function escAttr(s){return s?String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;'):'';}

// ═══════════ 文件同步（仅手动刷新或任务完成时触发） ═══════════

Mrite._syncAndRefresh = async function() {
  var result = null;
  try { result = await window.electronAPI.syncOutput(); } catch(_) {}
  return result;
};

// ═══════════ 模式切换：文件 / 预览 ═══════════
Mrite._viewMode = 'file';
Mrite._lastPreviewedFile = null;

// ★ 刷新当前预览文件（修改后自动更新）
Mrite._refreshCurrentPreview = function() {
  if (Mrite._lastPreviewedFile && Mrite._viewMode === 'preview') {
    Mrite._renderPreview(Mrite._lastPreviewedFile);
  }
};

Mrite._setViewMode = function(mode) {
  Mrite._viewMode = mode;
  var tree = document.getElementById('fileTree');
  var preview = document.getElementById('filePreview');
  var btnFile = document.getElementById('fvBtnFile');
  var btnPreview = document.getElementById('fvBtnPreview');

  if (mode === 'file') {
    if (tree) tree.style.display = '';
    if (preview) preview.style.display = 'none';
    if (btnFile) { btnFile.classList.add('active'); btnPreview.classList.remove('active'); }
  } else {
    if (tree) tree.style.display = 'none';
    if (preview) preview.style.display = '';
    if (btnFile) { btnFile.classList.remove('active'); btnPreview.classList.add('active'); }
    // 有历史文件则恢复，没有显示空状态
    if (Mrite._lastPreviewedFile) {
      Mrite._renderPreview(Mrite._lastPreviewedFile);
    }
  }
};

// ★ 预览文件
Mrite._previewFile = async function(filePath, fileName, siblings) {
  Mrite._lastPreviewedFile = { path: filePath, name: fileName, siblings: siblings || [] };
  Mrite._setViewMode('preview');
  Mrite._renderPreview({ path: filePath, name: fileName, siblings: siblings || [] });
};

Mrite._renderPreview = async function(file) {
  var el = document.getElementById('filePreview');
  if (!el) return;
  var ext = (file.name || '').split('.').pop().toLowerCase();
  el.innerHTML = '<div class="fv-loading">加载中…</div>';

  try {
    var r = await window.electronAPI.readFileContent(file.path);
    if (!r || !r.success) {
      el.innerHTML = '<div class="fv-empty"><p>读取失败</p></div>';
      return;
    }

    // ── 图片 ──
    if (['png','jpg','jpeg','gif','svg','webp'].includes(ext)) {
      var imgSrc = encodeURI('file:///' + file.path.replace(/\\/g, '/'));
      el.innerHTML = '<div class="fv-img-wrap"><img src="' + imgSrc + '" class="fv-img" id="fvMainImg"></div>' +
        buildMediaNav(file, 'img');
      bindMediaNav(file);
      return;
    }

    // ── PDF ──
    if (ext === 'pdf') {
      var encPath = encodeURI('file:///' + file.path.replace(/\\/g, '/'));
      // 如果已在 PDF 模式，只更新 iframe src + 白遮罩
      var existingFrame = document.getElementById('fvPdfFrame');
      if (existingFrame) {
        var shell = existingFrame.parentElement;
        if (shell) shell.classList.add('fv-pdf-loading');
        existingFrame.src = encPath + '#toolbar=0&navpanes=0';
        var infoEl = document.querySelector('.fv-mnav-info');
        if (infoEl) infoEl.textContent = file.name;
        clearTimeout(Mrite._pdfMaskTimer);
        Mrite._pdfMaskTimer = setTimeout(function() {
          if (shell) shell.classList.remove('fv-pdf-loading');
        }, 500);
        Mrite._lastPreviewedFile = file;
        return;
      }
      el.innerHTML = '<div class="fv-pdf-wrap">' +
        '<div class="fv-pdf-shell fv-pdf-loading">' +
          '<iframe id="fvPdfFrame" src="file://' + encPath + '#toolbar=0&navpanes=0" class="fv-pdf"></iframe>' +
        '</div>' +
        '<div class="fv-mnav">' +
          '<span class="fv-mnav-info">' + escHtml(file.name) + '</span>' +
        '</div>' +
      '</div>';
      clearTimeout(Mrite._pdfMaskTimer);
      Mrite._pdfMaskTimer = setTimeout(function() {
        var shell = document.querySelector('.fv-pdf-shell');
        if (shell) shell.classList.remove('fv-pdf-loading');
      }, 500);
      return;
    }

    // ── Excel → 表格 ──
    if (['xlsx', 'xls'].includes(ext) && r.excel && r.sheets) {
      var sheetNames = Object.keys(r.sheets);
      if (!sheetNames.length) { el.innerHTML = '<div class="fv-empty"><p>空文件</p></div>'; return; }
      var html = '';
      // 如果有多个 sheet，显示 tab 切换
      if (sheetNames.length > 1) {
        html += '<div class="fv-sheet-tabs">';
        sheetNames.forEach(function(name, idx) {
          html += '<button class="fv-sheet-tab' + (idx === 0 ? ' active' : '') + '" data-sheet="' + escAttr(name) + '">' + escHtml(name) + '</button>';
        });
        html += '</div>';
      }
      // 渲染每个 sheet
      sheetNames.forEach(function(name, idx) {
        var csv = r.sheets[name];
        var lines = csv.split('\n').filter(function(l) { return l.trim(); });
        var tableHtml = '<table class="fv-table">';
        var rows = lines.slice(0, 200);
        if (rows.length > 0) {
          tableHtml += '<thead><tr>';
          var headers = rows[0].split(',');
          headers.forEach(function(c) { tableHtml += '<th>' + escHtml(c.trim()) + '</th>'; });
          tableHtml += '</tr></thead><tbody>';
          for (var i = 1; i < rows.length; i++) {
            tableHtml += '<tr>';
            var cols = rows[i].split(',');
            cols.forEach(function(c) { tableHtml += '<td>' + escHtml(c.trim()) + '</td>'; });
            tableHtml += '</tr>';
          }
          tableHtml += '</tbody></table>';
        }
        if (lines.length > 200) tableHtml += '<p class="fv-truncated">仅显示前 200 行</p>';
        html += '<div class="fv-sheet-content' + (idx > 0 ? ' hidden' : '') + '" data-sheet="' + escAttr(name) + '">' +
          '<div class="fv-table-wrap">' + tableHtml + '</div></div>';
      });
      el.innerHTML = html;
      // 绑定 sheet 切换事件
      el.querySelectorAll('.fv-sheet-tab').forEach(function(btn) {
        btn.onclick = function() {
          el.querySelectorAll('.fv-sheet-tab').forEach(function(b) { b.classList.remove('active'); });
          btn.classList.add('active');
          var sheetName = btn.dataset.sheet;
          el.querySelectorAll('.fv-sheet-content').forEach(function(c) {
            c.classList.toggle('hidden', c.dataset.sheet !== sheetName);
          });
        };
      });
      return;
    }

    // ── CSV → 表格 ──
    if (ext === 'csv') {
      var lines = (r.text || '').split('\n').filter(function(l) { return l.trim(); });
      if (!lines.length) { el.innerHTML = '<div class="fv-empty"><p>空文件</p></div>'; return; }
      var h = '<table class="fv-table">';
      var rows = lines.slice(0, 200);
      h += '<thead><tr>';
      var headers = rows[0].split(',');
      headers.forEach(function(c) { h += '<th>' + escHtml(c.trim()) + '</th>'; });
      h += '</tr></thead><tbody>';
      for (var i = 1; i < rows.length; i++) {
        h += '<tr>';
        var cols = rows[i].split(',');
        cols.forEach(function(c) { h += '<td>' + escHtml(c.trim()) + '</td>'; });
        h += '</tr>';
      }
      h += '</tbody></table>';
      if (lines.length > 200) h += '<p class="fv-truncated">仅显示前 200 行</p>';
      el.innerHTML = '<div class="fv-table-wrap">' + h + '</div>' + buildMediaNav(file, 'csv');
      bindMediaNav(file);
      return;
    }

    // ── 代码/文本 ──
    var text = r.text || '';
    if (text.length > 50000) text = text.substring(0, 50000) + '\n\n... 文件过大，仅显示前 50000 字符';

    // Markdown 渲染
    if (ext === 'md') {
      el.innerHTML = '<div class="fv-md">' + renderMd(text) + '</div>';
      return;
    }

    // 代码着色
    var lang = '';
    if (['py'].includes(ext)) lang = 'py';
    else if (['js','ts','json'].includes(ext)) lang = 'js';
    else if (['tex','cls','sty'].includes(ext)) lang = 'tex';
    el.innerHTML = '<div class="fv-code-wrap"><pre class="fv-code fv-code-' + lang + '">' + highlightCode(text, lang) + '</pre></div>' +
      buildMediaNav(file, lang || 'code');
    bindMediaNav(file);

  } catch(e) {
    el.innerHTML = '<div class="fv-empty"><p>预览失败</p></div>';
  }
};
