// Mrite v1.2 — 进度面板
window.Mrite = window.Mrite || {};

Mrite.renderStepList = function() {
  const el = document.querySelector('#stepList');
  if (!el) return;
  const steps = Mrite.STATE.taskSteps;
  if (!steps?.length) { el.innerHTML = '<div class="text-xs text-zinc-300 text-center py-4">等待任务开始...</div>'; return; }
  el.innerHTML = '';
  const iconGlyphs = {pending:'—',active:'●',completed:'OK',error:'!!'};
  steps.forEach(s => {
    const d = document.createElement('div');
    d.className = `step-item status-${s.status}`;
    d.innerHTML = `<span class="step-status-icon">${iconGlyphs[s.status]||'○'}</span><span class="step-name">${s.name}</span><span class="step-duration">${s.status==='completed'?'完成':''}</span>`;
    el.appendChild(d);
  });
  el.scrollTop = el.scrollHeight;
};

Mrite.renderProgress = function(pct) {
  const v = Math.min(100, Math.max(0, Math.round(pct)));
  const bar = document.querySelector('#progressBarFill');
  const txt = document.querySelector('#progressText');
  if (bar) { bar.style.width = `${v}%`; if(v>=100)bar.classList.add('done'); }
  if (txt) txt.textContent = `${v}%`;
};
