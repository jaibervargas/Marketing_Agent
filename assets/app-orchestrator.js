import { loadSkills, scoreSkills } from './skills-loader.js';
import { mdToHtml, escapeHtml } from './md.js';
import { PROVIDERS } from './providers.js';
import { IMAGE_PROVIDERS } from './image-providers.js';
import { buildPrompt as buildPromptModule } from './prompt-builder.js';
import { smartMatch, runStream } from './llm-client.js';
import { generateImage, makeThumbnail } from './image-client.js';
import { getHistory, setHistory, saveToHistory, deleteFromHistory, clearHistory, fmtTime } from './history.js';

const taskInput = document.getElementById('taskInput');
const analyzeBtn = document.getElementById('analyzeBtn');
const autoBtn = document.getElementById('autoBtn');
const imageBtn = document.getElementById('imageBtn');
const stage = document.getElementById('stage');

let allSkills = [];
let matchedSkills = [];
let selectedSlugs = new Set();
let currentPrompt = '';
let currentRunController = null;
let lastMatchMode = 'keyword';

function toast(msg, type = 'ok') {
  const t = document.createElement('div');
  t.className = 'toast' + (type === 'error' ? ' error' : '');
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2200);
}

function getActiveConfig() {
  const provider = localStorage.getItem('llm_provider') || 'anthropic';
  const apiKey = localStorage.getItem('llm_apikey_' + provider) || '';
  const model = localStorage.getItem('llm_model_' + provider) || (PROVIDERS[provider]?.models[0] || '');
  const customUrl = localStorage.getItem('llm_custom_url') || '';
  return { provider, apiKey, model, customUrl };
}

function hasUsableConfig() {
  const c = getActiveConfig();
  if (!c.model) return false;
  if (c.provider === 'custom') return !!c.customUrl;
  return !!c.apiKey;
}

function getImageConfig() {
  const provider = localStorage.getItem('img_provider') || 'openai';
  const prov = IMAGE_PROVIDERS[provider] || IMAGE_PROVIDERS.openai;
  return {
    provider,
    apiKey: localStorage.getItem('img_apikey_' + provider) || '',
    model: localStorage.getItem('img_model_' + provider) || (prov.models[0] || ''),
    size: localStorage.getItem('img_size_' + provider) || (prov.sizes[0] || ''),
    quality: localStorage.getItem('img_quality_' + provider) || (prov.qualities[0] || ''),
    customUrl: localStorage.getItem('img_custom_url') || '',
  };
}

function hasUsableImageConfig() {
  const c = getImageConfig();
  if (!c.model && c.provider !== 'custom') return false;
  if (c.provider === 'custom') return !!c.customUrl;
  return !!c.apiKey;
}

document.querySelectorAll('.example-chip').forEach(c => {
  c.addEventListener('click', () => { taskInput.value = c.dataset.ex; taskInput.focus(); });
});
taskInput.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') analyze();
});
analyzeBtn.addEventListener('click', () => analyze());
autoBtn.addEventListener('click', () => analyze(true));
imageBtn.addEventListener('click', () => runImageGeneration());

function localKeywordMatch(task) {
  const scored = scoreSkills(task, allSkills).slice(0, 8);
  return scored.map(s => ({
    slug: s.skill.slug,
    name: s.skill.name,
    description: s.skill.description,
    category: s.skill.category,
    score: s.score,
    matches: s.matches,
  }));
}

async function analyze(autoRun = false) {
  const task = taskInput.value.trim();
  if (!task) { taskInput.focus(); return; }
  if (!allSkills.length) { toast('Skills aún no cargadas', 'error'); return; }
  const triggerBtn = autoRun ? autoBtn : analyzeBtn;
  const origLabel = triggerBtn.innerHTML;
  triggerBtn.disabled = true;
  const useSmartMatch = hasUsableConfig();
  triggerBtn.innerHTML = '<span class="spinner"></span> ' + (autoRun ? 'Orquestando...' : (useSmartMatch ? 'IA eligiendo skills...' : 'Analizando...'));
  stage.innerHTML = '';

  try {
    let skills, mode;
    if (useSmartMatch) {
      const cfg = getActiveConfig();
      try {
        const data = await smartMatch({
          task, provider: cfg.provider, apiKey: cfg.apiKey, model: cfg.model, customUrl: cfg.customUrl, skills: allSkills,
        });
        skills = data.skills || [];
        mode = 'smart';
      } catch (smartErr) {
        toast('Smart match falló, usando keyword: ' + smartErr.message, 'error');
        skills = localKeywordMatch(task);
        mode = 'keyword';
      }
    } else {
      skills = localKeywordMatch(task);
      mode = 'keyword';
    }
    lastMatchMode = mode;
    matchedSkills = skills;
    const preselectCount = mode === 'smart' ? matchedSkills.length : Math.min(4, matchedSkills.length);
    selectedSlugs = new Set(matchedSkills.slice(0, preselectCount).map(s => s.slug));
    renderSkillsStep();
    await buildPrompt();
    if (autoRun) {
      if (!hasUsableConfig()) {
        toast('Configura tu proveedor para auto-ejecutar', 'error');
        openSettings();
      } else {
        await runWithClaude();
      }
    }
  } catch (e) {
    toast(e.message || 'Error', 'error');
  } finally {
    triggerBtn.disabled = false;
    triggerBtn.innerHTML = origLabel;
  }
}

function renderSkillsStep() {
  if (matchedSkills.length === 0) {
    stage.innerHTML = `
      <div class="step">
        <div class="step-head"><div class="step-num">1</div><div class="step-title">Skills detectadas</div></div>
        <div class="empty-skills">No detecté skills relacionadas. Reformula la tarea con más detalle o usa el <a href="index.html" style="color:var(--accent-3)">explorador</a> para elegir manualmente.</div>
      </div>`;
    return;
  }
  const isSmart = lastMatchMode === 'smart';
  const cards = matchedSkills.map(s => {
    const footRight = isSmart
      ? `<span class="skill-pick-score" style="background:rgba(139,92,246,0.15);color:#c4b5fd;border-color:rgba(139,92,246,0.3)">elegido por IA</span>`
      : `<span class="skill-pick-score">match: ${s.score}</span>`;
    const reasonBlock = isSmart && s.reason
      ? `<div style="margin-top:10px;padding:8px 10px;background:rgba(139,92,246,0.06);border:1px solid rgba(139,92,246,0.18);border-radius:7px;font-size:12px;color:#d8b4fe;line-height:1.45"><strong style="color:#c4b5fd">¿Por qué?</strong> ${escapeHtml(s.reason)}</div>`
      : '';
    return `
      <div class="skill-pick ${selectedSlugs.has(s.slug) ? 'selected' : ''}" data-slug="${s.slug}">
        <div class="skill-pick-head">
          <span class="skill-pick-name">${escapeHtml(s.name)}</span>
          <span class="skill-pick-cat cat-${s.category}">${s.category}</span>
        </div>
        <div class="skill-pick-desc">${escapeHtml(s.description)}</div>
        ${reasonBlock}
        <div class="skill-pick-foot">
          ${footRight}
          <div class="check"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg></div>
        </div>
      </div>`;
  }).join('');
  const modeBadge = isSmart
    ? '<span style="font-size:11px;padding:3px 8px;border-radius:5px;background:rgba(139,92,246,0.15);color:#c4b5fd;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;margin-left:8px">IA</span>'
    : '<span style="font-size:11px;padding:3px 8px;border-radius:5px;background:rgba(161,161,170,0.15);color:#d4d4d8;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;margin-left:8px">keywords</span>';
  stage.innerHTML = `
    <div class="step">
      <div class="step-head">
        <div class="step-num">1</div>
        <div class="step-title">Skills ${isSmart ? 'elegidas por IA' : 'detectadas'}${modeBadge}</div>
        <div class="step-sub" id="selectionCount">${selectedSlugs.size} seleccionadas</div>
      </div>
      <div class="skill-grid" id="skillGrid">${cards}</div>
    </div>
    <div class="step" id="promptStep">
      <div class="step-head">
        <div class="step-num">2</div>
        <div class="step-title">Prompt orquestador</div>
        <div class="step-sub" id="tokenEst">— tokens</div>
      </div>
      <div id="promptArea"><div class="pulse" style="color:var(--text-mute)">Construyendo prompt...</div></div>
      <div class="actions-row" id="promptActions" style="display:none">
        <button class="btn btn-primary" id="runBtn">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          <span id="runBtnLabel">Ejecutar</span>
        </button>
        <button class="btn" id="copyBtn">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
          Copiar prompt
        </button>
        <button class="btn" id="openClaudeBtn">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" x2="21" y1="14" y2="3"/></svg>
          <span id="openExtLabel">Abrir en Claude</span>
        </button>
        <button class="btn btn-ghost" id="togglePreviewBtn">Ver prompt</button>
      </div>
    </div>
    <div class="step" id="resultStep" style="display:none">
      <div class="step-head">
        <div class="step-num">3</div>
        <div class="step-title">Resultado</div>
        <div class="step-sub" id="runStatus"></div>
      </div>
      <div class="actions-row" id="resultActions" style="display:none;margin-bottom:14px">
        <button class="btn" id="copyResultBtn">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
          Copiar resultado
        </button>
        <button class="btn" id="downloadPdfBtn">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>
          Descargar PDF
        </button>
      </div>
      <div class="output" id="resultOutput"></div>
    </div>`;

  document.querySelectorAll('.skill-pick').forEach(el => {
    el.addEventListener('click', () => {
      const slug = el.dataset.slug;
      if (selectedSlugs.has(slug)) selectedSlugs.delete(slug);
      else selectedSlugs.add(slug);
      el.classList.toggle('selected');
      document.getElementById('selectionCount').textContent = selectedSlugs.size + ' seleccionadas';
      buildPrompt();
    });
  });

  document.getElementById('copyBtn').addEventListener('click', async () => {
    await navigator.clipboard.writeText(currentPrompt);
    toast('¡Prompt copiado!');
  });
  document.getElementById('openClaudeBtn').addEventListener('click', async (e) => {
    const url = e.currentTarget.dataset.url || PROVIDERS[getActiveConfig().provider]?.chatUrl;
    if (!url) { toast('Este proveedor no tiene web de chat', 'error'); return; }
    await navigator.clipboard.writeText(currentPrompt);
    const short = PROVIDERS[getActiveConfig().provider]?.short || 'la web';
    toast(`Copiado. Abriendo ${short}...`);
    setTimeout(() => window.open(url, '_blank'), 400);
  });
  document.getElementById('togglePreviewBtn').addEventListener('click', () => {
    const area = document.getElementById('promptArea');
    const btn = document.getElementById('togglePreviewBtn');
    const visible = area.querySelector('.prompt-preview');
    if (visible) {
      area.innerHTML = '<div style="font-size:13px;color:var(--text-mute)">Prompt listo · ' + currentPrompt.length.toLocaleString() + ' caracteres</div>';
      btn.textContent = 'Ver prompt';
    } else {
      area.innerHTML = '<pre class="prompt-preview">' + escapeHtml(currentPrompt) + '</pre>';
      btn.textContent = 'Ocultar prompt';
    }
  });
  document.getElementById('runBtn').addEventListener('click', runWithClaude);
}

async function buildPrompt() {
  const area = document.getElementById('promptArea');
  const actions = document.getElementById('promptActions');
  if (!area) return;
  if (selectedSlugs.size === 0) {
    area.innerHTML = '<div style="color:var(--text-mute);font-size:13px">Selecciona al menos una skill arriba.</div>';
    actions.style.display = 'none';
    return;
  }
  try {
    const ctx = getContextPayload();
    if (ctx.urls.length) {
      area.innerHTML = '<div class="pulse" style="color:var(--text-mute);font-size:13px">Descargando y extrayendo contenido de ' + ctx.urls.length + ' URL vía Jina Reader...</div>';
    }
    const data = await buildPromptModule({
      task: taskInput.value.trim(),
      slugs: Array.from(selectedSlugs),
      skills: allSkills,
      context: {
        urls: ctx.urls,
        text: ctx.text,
        files: ctx.files,
        imagesCount: ctx.images.length,
      },
    });
    currentPrompt = data.prompt;
    const ctxBits = [];
    if (ctx.urls.length) ctxBits.push(`${ctx.urls.length} URL`);
    if (ctx.text) ctxBits.push('texto');
    if (ctx.files.length) ctxBits.push(`${ctx.files.length} archivo(s)`);
    if (ctx.images.length) ctxBits.push(`${ctx.images.length} imagen(es)`);
    const ctxLabel = ctxBits.length ? ' · contexto: ' + ctxBits.join(', ') : ' · sin contexto';
    document.getElementById('tokenEst').textContent = '~' + data.tokens_estimate.toLocaleString() + ' tokens';

    let fetchInfo = '';
    if (Array.isArray(data.fetched_urls) && data.fetched_urls.length) {
      const ok = data.fetched_urls.filter(f => f.ok);
      const fail = data.fetched_urls.filter(f => !f.ok);
      const okBits = ok.map(f => {
        const size = f.bytes ? Math.round(f.bytes / 1024) + ' KB' : '';
        const t = f.title ? ' — ' + escapeHtml(f.title.slice(0, 50)) : '';
        return `<div style="color:#6ee7b7">✓ ${escapeHtml(f.url)}${t} · ${size} extraídos</div>`;
      }).join('');
      const failBits = fail.map(f =>
        `<div style="color:#fca5a5">✗ ${escapeHtml(f.url)} — ${escapeHtml(f.error)} <span style="color:var(--text-mute)">(pega el contenido manualmente abajo)</span></div>`,
      ).join('');
      fetchInfo = `<div style="font-size:12px;line-height:1.6;margin-top:8px">${okBits}${failBits}</div>`;
    }

    area.innerHTML =
      '<div style="font-size:13px;color:var(--text-mute)">Prompt listo · ' + currentPrompt.length.toLocaleString() + ' caracteres' + ctxLabel + '</div>' + fetchInfo;
    actions.style.display = 'flex';
    updateProviderLabels();
  } catch (e) {
    console.error(e);
    toast('Error armando prompt: ' + (e.message || e), 'error');
  }
}

async function runWithClaude() {
  if (!hasUsableConfig()) {
    toast('Configura tu proveedor primero', 'error');
    openSettings();
    return;
  }
  const cfg = getActiveConfig();
  const provName = PROVIDERS[cfg.provider]?.name || cfg.provider;
  const resultStep = document.getElementById('resultStep');
  const output = document.getElementById('resultOutput');
  const status = document.getElementById('runStatus');
  const runBtn = document.getElementById('runBtn');
  const resultActions = document.getElementById('resultActions');

  resultStep.style.display = '';
  resultStep.scrollIntoView({ behavior: 'smooth', block: 'start' });
  output.innerHTML = `<div class="pulse" style="color:var(--text-mute)">Conectando con ${escapeHtml(provName)}...</div>`;
  status.textContent = `${cfg.model} · streaming`;
  runBtn.disabled = true;
  runBtn.innerHTML = '<span class="spinner"></span> Ejecutando...';
  if (resultActions) resultActions.style.display = 'none';

  if (currentRunController) currentRunController.abort();
  currentRunController = new AbortController();

  let fullText = '';
  let firstChunk = true;
  const startedAt = Date.now();

  try {
    const ctxImages = getContextPayload().images;
    await runStream({
      provider: cfg.provider,
      apiKey: cfg.apiKey,
      model: cfg.model,
      customUrl: cfg.customUrl,
      prompt: currentPrompt,
      images: ctxImages,
      signal: currentRunController.signal,
      onDelta: (text) => {
        if (firstChunk) { output.innerHTML = ''; firstChunk = false; }
        fullText += text;
        output.innerHTML = mdToHtml(fullText) + '<span class="stream-cursor"></span>';
      },
      onError: (msg) => { throw new Error(msg); },
    });
    output.innerHTML = mdToHtml(fullText);
    output.dataset.raw = fullText;
    if (resultActions) resultActions.style.display = 'flex';
    const secs = ((Date.now() - startedAt) / 1000).toFixed(1);
    status.textContent = `✓ ${secs}s · ${cfg.model}`;
    saveToHistory({
      task: taskInput.value.trim(),
      slugs: Array.from(selectedSlugs),
      prompt: currentPrompt,
      result: fullText,
      model: `${provName} · ${cfg.model}`,
    });
  } catch (e) {
    if (e.name === 'AbortError') {
      output.innerHTML = mdToHtml(fullText) + '<div style="color:var(--text-mute);margin-top:10px;font-size:12px">— Detenido por el usuario —</div>';
      status.textContent = '⏹ Detenido';
    } else {
      output.innerHTML = '<div style="color:#fca5a5">Error: ' + escapeHtml(e.message) + '</div>';
      status.textContent = '✗ Falló';
    }
  } finally {
    runBtn.disabled = false;
    runBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg> Ejecutar de nuevo';
    currentRunController = null;
  }
}

document.addEventListener('click', e => {
  if (e.target.closest('#copyResultBtn')) {
    const raw = document.getElementById('resultOutput').dataset.raw || '';
    navigator.clipboard.writeText(raw);
    toast('Resultado copiado');
  }
  if (e.target.closest('#downloadPdfBtn')) {
    downloadResultAsPdf();
  }
});

const PDF_STYLE_ID = '__pdf_export_styles__';

function ensurePdfStyles() {
  if (document.getElementById(PDF_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = PDF_STYLE_ID;
  style.textContent = `
    .pdf-body h1, .pdf-body h2, .pdf-body h3 { color: #0a0a0f; margin: 14px 0 8px; line-height: 1.3; }
    .pdf-body h1 { font-size: 17px; }
    .pdf-body h2 { font-size: 14px; color: #6d28d9; }
    .pdf-body h3 { font-size: 13px; }
    .pdf-body p { margin: 0 0 9px; color: #27272a; }
    .pdf-body ul, .pdf-body ol { margin: 6px 0 11px 22px; color: #27272a; padding: 0; }
    .pdf-body li { margin-bottom: 3px; }
    .pdf-body strong { color: #0a0a0f; }
    .pdf-body code { background: #f4f4f5; padding: 1px 5px; border-radius: 4px; font-family: 'JetBrains Mono', monospace; font-size: 11px; color: #be185d; border: 1px solid #e4e4e7; }
    .pdf-body pre { background: #f4f4f5; padding: 10px; border-radius: 6px; margin: 10px 0; border: 1px solid #e4e4e7; overflow: hidden; }
    .pdf-body pre code { background: none; border: none; padding: 0; color: #18181b; white-space: pre-wrap; }
    .pdf-body blockquote { border-left: 3px solid #8b5cf6; padding-left: 12px; margin: 10px 0; color: #52525b; font-style: italic; }
    .pdf-body hr { border: none; border-top: 1px solid #e4e4e7; margin: 14px 0; }
    .pdf-body table { border-collapse: collapse; width: 100%; margin: 10px 0; font-size: 11px; }
    .pdf-body th, .pdf-body td { border: 1px solid #e4e4e7; padding: 6px 9px; text-align: left; }
    .pdf-body th { background: #fafafa; font-weight: 600; }
  `;
  document.head.appendChild(style);
}

function buildPdfDocument(taskTitle, resultHtml) {
  ensurePdfStyles();
  const date = new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' });
  const wrap = document.createElement('div');
  wrap.style.cssText = [
    'width: 794px',
    'box-sizing: border-box',
    'padding: 36px 40px',
    'background: #ffffff',
    'color: #1a1a1f',
    'font-family: Inter, -apple-system, BlinkMacSystemFont, sans-serif',
    'font-size: 13px',
    'line-height: 1.55',
    'display: block',
  ].join(';');
  wrap.innerHTML = `
    <div style="border-bottom: 2px solid #8b5cf6; padding-bottom: 14px; margin-bottom: 22px;">
      <div style="font-size: 10px; color: #8b5cf6; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; margin-bottom: 6px;">Marketing Skills · Orquestador</div>
      <div style="font-size: 18px; font-weight: 700; color: #0a0a0f; line-height: 1.3; margin: 0;">${escapeHtml(taskTitle || 'Resultado')}</div>
      <div style="font-size: 11px; color: #71717a; margin-top: 6px;">${date}</div>
    </div>
    <div class="pdf-body">${resultHtml}</div>
  `;
  return wrap;
}

function downloadResultAsPdf() {
  if (typeof window.html2canvas !== 'function' || !(window.jspdf?.jsPDF || window.jsPDF)) {
    toast('Librerías de PDF no cargadas — recarga la página', 'error');
    return;
  }
  const output = document.getElementById('resultOutput');
  if (!output) return;
  const raw = output.dataset.raw || '';
  if (!raw.trim()) { toast('No hay resultado para exportar', 'error'); return; }

  const taskTitle = taskInput.value.trim() || 'Resultado';
  const html = mdToHtml(raw);
  const node = buildPdfDocument(taskTitle, html);

  // Clipping wrapper: 0x0 with overflow hidden hides the node visually,
  // but the inner node keeps its 794px layout so html2canvas captures it.
  // Avoid opacity/visibility — html2canvas honors them and produces blank output.
  const hider = document.createElement('div');
  hider.setAttribute('aria-hidden', 'true');
  hider.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;overflow:hidden;pointer-events:none;';
  hider.appendChild(node);
  document.body.appendChild(hider);

  const filename = `marketing-skills-${taskTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 50).replace(/^-|-$/g, '') || 'resultado'}.pdf`;

  toast('Generando PDF…');
  // Two RAFs ensure layout + fonts have settled before html2canvas captures.
  requestAnimationFrame(() => requestAnimationFrame(() => {
    // Bypass html2pdf entirely. Its toContainer step moves the source element
    // into an overlay positioned at left:-100000px, which causes html2canvas
    // to produce a canvas with blank space at the top. Calling html2canvas
    // directly captures the wrap from where we attached it.
    if (typeof window.html2canvas !== 'function') {
      toast('html2canvas no disponible', 'error');
      hider.remove();
      return;
    }
    window.html2canvas(node, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false,
    }).then(canvas => {
      console.log('[pdf] canvas →', { width: canvas.width, height: canvas.height });

      const jsPDFCtor = window.jspdf?.jsPDF || window.jsPDF;
      if (typeof jsPDFCtor !== 'function') {
        throw new Error('jsPDF no expuesto globalmente');
      }
      const pdf = new jsPDFCtor({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
      const pageWidthMm = pdf.internal.pageSize.getWidth();
      const pageHeightMm = pdf.internal.pageSize.getHeight();
      const pxPerMm = canvas.width / pageWidthMm;
      const pageHeightPx = Math.floor(pageHeightMm * pxPerMm);
      const nPages = Math.max(1, Math.ceil(canvas.height / pageHeightPx));

      const slice = document.createElement('canvas');
      const ctx = slice.getContext('2d');
      slice.width = canvas.width;

      for (let i = 0; i < nPages; i++) {
        const startY = i * pageHeightPx;
        const sliceH = Math.min(pageHeightPx, canvas.height - startY);
        slice.height = sliceH;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, slice.width, sliceH);
        ctx.drawImage(canvas, 0, startY, canvas.width, sliceH, 0, 0, canvas.width, sliceH);
        const imgData = slice.toDataURL('image/jpeg', 0.95);
        const sliceHmm = sliceH / pxPerMm;
        if (i > 0) pdf.addPage();
        pdf.addImage(imgData, 'JPEG', 0, 0, pageWidthMm, sliceHmm);
      }
      pdf.save(filename);
    })
      .catch(err => {
        console.error('[pdf]', err);
        toast('Error generando PDF: ' + (err.message || err), 'error');
      })
      .finally(() => {
        hider.remove();
      });
  }));
}

async function runImageGeneration() {
  const prompt = taskInput.value.trim();
  if (!prompt) { taskInput.focus(); toast('Escribe un prompt visual primero', 'error'); return; }
  if (!hasUsableImageConfig()) {
    toast('Configura un proveedor de imágenes primero', 'error');
    openSettings();
    return;
  }
  const cfg = getImageConfig();
  const prov = IMAGE_PROVIDERS[cfg.provider];
  const provName = prov?.name || cfg.provider;

  if (currentRunController) { try { currentRunController.abort(); } catch {} }
  currentRunController = new AbortController();

  stage.innerHTML = `
    <div class="step">
      <div class="step-head">
        <div class="step-num">1</div>
        <div class="step-title">Generación de imagen</div>
        <div class="step-sub" id="imgRunStatus">${escapeHtml(cfg.model)} · ${escapeHtml(cfg.size || '')}</div>
      </div>
      <div id="imgResultArea">
        <div class="pulse" style="color:var(--text-mute)">Generando con ${escapeHtml(provName)}…</div>
      </div>
      <div class="image-prompt"><strong style="color:var(--text-dim)">Prompt:</strong> ${escapeHtml(prompt)}</div>
    </div>`;
  stage.scrollIntoView({ behavior: 'smooth', block: 'start' });
  imageBtn.disabled = true;
  const origLabel = imageBtn.innerHTML;
  imageBtn.innerHTML = '<span class="spinner"></span> Generando...';

  try {
    const result = await generateImage({
      provider: cfg.provider,
      apiKey: cfg.apiKey,
      model: cfg.model,
      customUrl: cfg.customUrl,
      prompt,
      size: cfg.size,
      quality: cfg.quality,
      n: 1,
      signal: currentRunController.signal,
    });

    const area = document.getElementById('imgResultArea');
    const status = document.getElementById('imgRunStatus');
    const cards = result.images.map((img, i) => {
      const src = img.b64 ? `data:${img.mime};base64,${img.b64}` : img.url;
      const fileBase = `image-${Date.now()}-${i + 1}`;
      const ext = (img.mime?.split('/')[1] || 'png').replace('jpeg', 'jpg');
      return `
        <div class="image-card">
          <img src="${src}" alt="Imagen generada ${i + 1}">
          <div class="image-card-foot">
            <a class="btn" href="${src}" download="${fileBase}.${ext}">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>
              Descargar
            </a>
            <button class="btn img-copy-btn" data-src="${src}">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
              Copiar
            </button>
          </div>
        </div>`;
    }).join('');
    area.innerHTML = `<div class="image-grid">${cards}</div>`;
    status.textContent = `✓ ${(result.elapsedMs / 1000).toFixed(1)}s · ${cfg.model}`;

    const first = result.images[0];
    const thumb = first?.b64 ? await makeThumbnail(first.b64, first.mime) : (first?.url || null);
    saveToHistory({
      kind: 'image',
      task: prompt,
      thumbnail: thumb,
      model: `${prov?.short || cfg.provider} · ${cfg.model}`,
      size: cfg.size,
    });
  } catch (e) {
    const area = document.getElementById('imgResultArea');
    const status = document.getElementById('imgRunStatus');
    if (e.name === 'AbortError') {
      if (area) area.innerHTML = '<div style="color:var(--text-mute);font-size:13px">— Cancelado por el usuario —</div>';
      if (status) status.textContent = '⏹ Cancelado';
    } else {
      if (area) area.innerHTML = `<div style="color:#fca5a5">Error: ${escapeHtml(e.message)}</div>`;
      if (status) status.textContent = '✗ Falló';
    }
  } finally {
    imageBtn.disabled = false;
    imageBtn.innerHTML = origLabel;
    currentRunController = null;
  }
}

document.addEventListener('click', async e => {
  const copyBtn = e.target.closest('.img-copy-btn');
  if (!copyBtn) return;
  const src = copyBtn.dataset.src || '';
  try {
    if (src.startsWith('data:')) {
      const blob = await (await fetch(src)).blob();
      await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
    } else {
      await navigator.clipboard.writeText(src);
    }
    toast('Imagen copiada');
  } catch {
    try { await navigator.clipboard.writeText(src); toast('URL copiada'); }
    catch { toast('No se pudo copiar', 'error'); }
  }
});

/* Contexto adicional */
const ctxToggle = document.getElementById('ctxToggle');
const ctxPanel = document.getElementById('ctxPanel');
const ctxUrl = document.getElementById('ctxUrl');
const ctxText = document.getElementById('ctxText');
const ctxDrop = document.getElementById('ctxDrop');
const ctxFileInput = document.getElementById('ctxFileInput');
const ctxFilesEl = document.getElementById('ctxFiles');
const ctxCount = document.getElementById('ctxCount');
const MAX_FILES = 6;
const MAX_IMG_BYTES = 5 * 1024 * 1024;
const MAX_TXT_BYTES = 60 * 1024;
const TEXT_EXT = ['txt', 'md', 'csv', 'json', 'html', 'htm', 'log', 'xml'];
const ctxAttachments = [];

ctxToggle.addEventListener('click', () => { ctxPanel.classList.toggle('open'); });

function updateCtxBadge() {
  let n = 0;
  if (ctxUrl.value.trim()) n++;
  if (ctxText.value.trim()) n++;
  n += ctxAttachments.length;
  ctxCount.textContent = n;
  ctxCount.style.display = n > 0 ? '' : 'none';
}
ctxUrl.addEventListener('input', updateCtxBadge);
ctxText.addEventListener('input', updateCtxBadge);

function fmtBytes(b) {
  if (b < 1024) return b + ' B';
  if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB';
  return (b / 1024 / 1024).toFixed(1) + ' MB';
}

function renderCtxFiles() {
  ctxFilesEl.innerHTML = ctxAttachments.map((f, i) => {
    const thumb = f.kind === 'image' ? `<img class="ctx-thumb" src="${f.dataUrl}" alt="">` : '';
    const kindBadge = f.kind === 'image'
      ? '<span class="fkind img">img</span>'
      : '<span class="fkind">txt</span>';
    return `
      <div class="ctx-file">
        ${thumb}
        ${kindBadge}
        <span class="fname" title="${escapeHtml(f.name)}">${escapeHtml(f.name)}</span>
        <span class="fsize">${fmtBytes(f.size)}</span>
        <button class="frem" data-i="${i}" title="Quitar">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
        </button>
      </div>`;
  }).join('');
  updateCtxBadge();
}
ctxFilesEl.addEventListener('click', e => {
  const btn = e.target.closest('[data-i]');
  if (!btn) return;
  ctxAttachments.splice(+btn.dataset.i, 1);
  renderCtxFiles();
});

function readTextFile(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsText(file);
  });
}
function readImageFile(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

async function addFiles(fileList) {
  for (const file of Array.from(fileList)) {
    if (ctxAttachments.length >= MAX_FILES) {
      toast(`Máximo ${MAX_FILES} archivos`, 'error');
      break;
    }
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    const isImage = file.type.startsWith('image/');
    const isText = TEXT_EXT.includes(ext);
    if (!isImage && !isText) {
      toast(`${file.name}: tipo no soportado`, 'error');
      continue;
    }
    if (isImage && file.size > MAX_IMG_BYTES) {
      toast(`${file.name}: imagen mayor a ${fmtBytes(MAX_IMG_BYTES)}`, 'error');
      continue;
    }
    if (isText && file.size > MAX_TXT_BYTES) {
      toast(`${file.name}: texto mayor a ${fmtBytes(MAX_TXT_BYTES)}`, 'error');
      continue;
    }
    try {
      if (isImage) {
        const dataUrl = await readImageFile(file);
        const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
        if (!m) continue;
        ctxAttachments.push({
          kind: 'image', name: file.name, size: file.size,
          mime: m[1], data: m[2], dataUrl,
        });
      } else {
        const content = await readTextFile(file);
        ctxAttachments.push({
          kind: 'text', name: file.name, size: file.size, content,
        });
      }
      renderCtxFiles();
    } catch {
      toast('Error leyendo ' + file.name, 'error');
    }
  }
}

ctxDrop.addEventListener('click', () => ctxFileInput.click());
ctxFileInput.addEventListener('change', () => {
  addFiles(ctxFileInput.files);
  ctxFileInput.value = '';
});
['dragenter', 'dragover'].forEach(ev => {
  ctxDrop.addEventListener(ev, e => { e.preventDefault(); ctxDrop.classList.add('dragover'); });
});
['dragleave', 'drop'].forEach(ev => {
  ctxDrop.addEventListener(ev, e => { e.preventDefault(); ctxDrop.classList.remove('dragover'); });
});
ctxDrop.addEventListener('drop', e => {
  if (e.dataTransfer?.files) addFiles(e.dataTransfer.files);
});
taskInput.addEventListener('paste', e => {
  const items = e.clipboardData?.items;
  if (!items) return;
  const files = [];
  for (const it of items) {
    if (it.type.startsWith('image/')) {
      const f = it.getAsFile();
      if (f) files.push(f);
    }
  }
  if (files.length) {
    e.preventDefault();
    ctxPanel.classList.add('open');
    addFiles(files);
  }
});

function getContextPayload() {
  const urls = [];
  const u = ctxUrl.value.trim();
  if (u) urls.push(u);
  const text = ctxText.value.trim();
  const files = ctxAttachments
    .filter(f => f.kind === 'text')
    .map(f => ({ name: f.name, content: f.content }));
  const images = ctxAttachments
    .filter(f => f.kind === 'image')
    .map(f => ({ mime: f.mime, data: f.data }));
  return { urls, text, files, images };
}

/* Settings — multi-provider */
const settingsBtn = document.getElementById('settingsBtn');
const settingsModal = document.getElementById('settingsModal');
const providerSelect = document.getElementById('providerSelect');
const apiKeyInput = document.getElementById('apiKey');
const modelSelect = document.getElementById('modelSelect');
const customModelInput = document.getElementById('customModel');
const customUrlField = document.getElementById('customUrlField');
const customUrlInput = document.getElementById('customUrl');
const keyHint = document.getElementById('keyHint');
const keyHelpLink = document.getElementById('keyHelpLink');

const imgProviderSelect = document.getElementById('imgProviderSelect');
const imgApiKeyInput = document.getElementById('imgApiKey');
const imgModelSelect = document.getElementById('imgModelSelect');
const imgCustomModelInput = document.getElementById('imgCustomModel');
const imgSizeSelect = document.getElementById('imgSizeSelect');
const imgQualitySelect = document.getElementById('imgQualitySelect');
const imgQualityField = document.getElementById('imgQualityField');
const imgCustomUrlField = document.getElementById('imgCustomUrlField');
const imgCustomUrlInput = document.getElementById('imgCustomUrl');
const imgKeyHint = document.getElementById('imgKeyHint');
const imgKeyHelpLink = document.getElementById('imgKeyHelpLink');

function refreshKeyState() {
  settingsBtn.classList.toggle('has-key', hasUsableConfig());
  const c = getActiveConfig();
  if (hasUsableConfig()) {
    settingsBtn.title = `${PROVIDERS[c.provider]?.name || c.provider} · ${c.model}`;
  } else {
    settingsBtn.title = 'Configurar proveedor';
  }
  updateProviderLabels();
}

function updateProviderLabels() {
  const c = getActiveConfig();
  const prov = PROVIDERS[c.provider];
  const short = prov?.short || 'IA';
  const runLabel = document.getElementById('runBtnLabel');
  const openLabel = document.getElementById('openExtLabel');
  if (runLabel) runLabel.textContent = `Ejecutar con ${short}`;
  if (openLabel) {
    if (prov?.chatUrl) {
      openLabel.textContent = `Abrir en ${short}`;
      openLabel.parentElement.style.display = '';
      openLabel.parentElement.dataset.url = prov.chatUrl;
    } else {
      openLabel.parentElement.style.display = 'none';
    }
  }
}

function populateProviders() {
  providerSelect.innerHTML = Object.entries(PROVIDERS).map(([key, p]) =>
    `<option value="${key}">${p.name}</option>`,
  ).join('');
}

function populateImageProviders() {
  imgProviderSelect.innerHTML = Object.entries(IMAGE_PROVIDERS).map(([key, p]) =>
    `<option value="${key}">${p.name}</option>`,
  ).join('');
}

function populateImageProviderFields(providerKey) {
  const prov = IMAGE_PROVIDERS[providerKey];
  if (!prov) return;

  if (prov.models.length > 0) {
    imgModelSelect.innerHTML = prov.models.map(m => `<option value="${m}">${m}</option>`).join('') + '<option value="__custom__">Otro modelo (escribir)…</option>';
    imgModelSelect.style.display = '';
    imgCustomModelInput.style.display = 'none';
  } else {
    imgModelSelect.style.display = 'none';
    imgCustomModelInput.style.display = '';
  }

  imgSizeSelect.innerHTML = (prov.sizes || []).map(s => `<option value="${s}">${s}</option>`).join('');

  if (prov.qualities && prov.qualities.length > 0) {
    imgQualitySelect.innerHTML = prov.qualities.map(q => `<option value="${q}">${q}</option>`).join('');
    imgQualityField.style.display = '';
  } else {
    imgQualityField.style.display = 'none';
  }

  imgCustomUrlField.style.display = providerKey === 'custom' ? '' : 'none';
  imgKeyHint.textContent = providerKey === 'custom'
    ? 'Para servidores con endpoint compatible OpenAI Images. CORS debe estar habilitado.'
    : 'Tu key se guarda solo en tu navegador.';
  imgKeyHelpLink.innerHTML = prov.keyUrl
    ? `<a href="${prov.keyUrl}" target="_blank" style="color:var(--accent-3);text-decoration:none;font-size:11px">Conseguir key →</a>`
    : '';
  imgApiKeyInput.placeholder = prov.keyHint;
}

function populateModels(providerKey) {
  const prov = PROVIDERS[providerKey];
  modelSelect.innerHTML = '';
  if (prov.models && prov.models.length > 0) {
    modelSelect.innerHTML = prov.models.map(m => `<option value="${m}">${m}</option>`).join('') + '<option value="__custom__">Otro modelo (escribir)…</option>';
    modelSelect.style.display = '';
  } else {
    modelSelect.style.display = 'none';
  }
  customModelInput.style.display = prov.models.length === 0 ? '' : 'none';
  customUrlField.style.display = providerKey === 'custom' ? '' : 'none';
  keyHint.textContent = providerKey === 'custom'
    ? 'Para servidores locales (Ollama, LM Studio) puedes dejar la API key vacía. Asegúrate de que tu endpoint permita CORS.'
    : 'Tu key se guarda solo en tu navegador.';
  keyHelpLink.innerHTML = prov.keyUrl
    ? `<a href="${prov.keyUrl}" target="_blank" style="color:var(--accent-3);text-decoration:none;font-size:11px">Conseguir key →</a>`
    : '';
  apiKeyInput.placeholder = prov.keyHint;
}

function openSettings() {
  const c = getActiveConfig();
  populateProviders();
  providerSelect.value = c.provider;
  populateModels(c.provider);
  apiKeyInput.value = c.apiKey;
  if (c.model && PROVIDERS[c.provider].models.includes(c.model)) {
    modelSelect.value = c.model;
    customModelInput.style.display = 'none';
  } else if (c.model) {
    if (PROVIDERS[c.provider].models.length > 0) {
      modelSelect.value = '__custom__';
      customModelInput.style.display = '';
    }
    customModelInput.value = c.model;
  }
  customUrlInput.value = c.customUrl;

  const imgCfg = getImageConfig();
  populateImageProviders();
  imgProviderSelect.value = imgCfg.provider;
  populateImageProviderFields(imgCfg.provider);
  imgApiKeyInput.value = imgCfg.apiKey;
  const imgProv = IMAGE_PROVIDERS[imgCfg.provider];
  if (imgCfg.model && imgProv?.models.includes(imgCfg.model)) {
    imgModelSelect.value = imgCfg.model;
    imgCustomModelInput.style.display = 'none';
  } else if (imgCfg.model) {
    if (imgProv?.models.length > 0) {
      imgModelSelect.value = '__custom__';
      imgCustomModelInput.style.display = '';
    }
    imgCustomModelInput.value = imgCfg.model;
  }
  if (imgCfg.size && imgProv?.sizes.includes(imgCfg.size)) imgSizeSelect.value = imgCfg.size;
  if (imgCfg.quality && imgProv?.qualities.includes(imgCfg.quality)) imgQualitySelect.value = imgCfg.quality;
  imgCustomUrlInput.value = imgCfg.customUrl;

  settingsModal.classList.add('open');
}

providerSelect.addEventListener('change', () => {
  populateModels(providerSelect.value);
  apiKeyInput.value = localStorage.getItem('llm_apikey_' + providerSelect.value) || '';
  const savedModel = localStorage.getItem('llm_model_' + providerSelect.value);
  if (savedModel && PROVIDERS[providerSelect.value].models.includes(savedModel)) {
    modelSelect.value = savedModel;
  }
});
modelSelect.addEventListener('change', () => {
  customModelInput.style.display = modelSelect.value === '__custom__' ? '' : 'none';
});

imgProviderSelect.addEventListener('change', () => {
  const key = imgProviderSelect.value;
  populateImageProviderFields(key);
  imgApiKeyInput.value = localStorage.getItem('img_apikey_' + key) || '';
  const prov = IMAGE_PROVIDERS[key];
  const savedModel = localStorage.getItem('img_model_' + key);
  if (savedModel && prov.models.includes(savedModel)) imgModelSelect.value = savedModel;
  const savedSize = localStorage.getItem('img_size_' + key);
  if (savedSize && prov.sizes.includes(savedSize)) imgSizeSelect.value = savedSize;
  const savedQuality = localStorage.getItem('img_quality_' + key);
  if (savedQuality && prov.qualities.includes(savedQuality)) imgQualitySelect.value = savedQuality;
});
imgModelSelect.addEventListener('change', () => {
  imgCustomModelInput.style.display = imgModelSelect.value === '__custom__' ? '' : 'none';
});

settingsBtn.addEventListener('click', openSettings);
document.getElementById('cancelSettingsBtn').addEventListener('click', () => settingsModal.classList.remove('open'));

settingsModal.querySelectorAll('.tab').forEach(t => {
  t.addEventListener('click', () => {
    const target = t.dataset.tab;
    settingsModal.querySelectorAll('.tab').forEach(x => x.classList.toggle('active', x === t));
    settingsModal.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.dataset.panel === target));
  });
});
document.getElementById('saveSettingsBtn').addEventListener('click', () => {
  const provider = providerSelect.value;
  const apiKey = apiKeyInput.value.trim();
  const model = modelSelect.value === '__custom__' || modelSelect.style.display === 'none'
    ? customModelInput.value.trim()
    : modelSelect.value;
  if (!model) { toast('Falta el modelo', 'error'); return; }
  if (provider === 'custom' && !customUrlInput.value.trim()) { toast('Falta la URL del endpoint', 'error'); return; }

  localStorage.setItem('llm_provider', provider);
  if (apiKey) localStorage.setItem('llm_apikey_' + provider, apiKey);
  localStorage.setItem('llm_model_' + provider, model);
  if (provider === 'custom') localStorage.setItem('llm_custom_url', customUrlInput.value.trim());

  const imgProvider = imgProviderSelect.value;
  const imgApiKey = imgApiKeyInput.value.trim();
  const imgProv = IMAGE_PROVIDERS[imgProvider];
  const imgModel = imgModelSelect.value === '__custom__' || imgModelSelect.style.display === 'none'
    ? imgCustomModelInput.value.trim()
    : imgModelSelect.value;
  const imgSize = imgSizeSelect.value;
  const imgQuality = imgQualityField.style.display === 'none' ? '' : imgQualitySelect.value;
  const hasImgKey = imgApiKey || (imgProvider === 'custom' && imgCustomUrlInput.value.trim());
  if (hasImgKey || imgModel) {
    localStorage.setItem('img_provider', imgProvider);
    if (imgApiKey) localStorage.setItem('img_apikey_' + imgProvider, imgApiKey);
    if (imgModel) localStorage.setItem('img_model_' + imgProvider, imgModel);
    if (imgSize) localStorage.setItem('img_size_' + imgProvider, imgSize);
    if (imgQuality) localStorage.setItem('img_quality_' + imgProvider, imgQuality);
    if (imgProvider === 'custom') localStorage.setItem('img_custom_url', imgCustomUrlInput.value.trim());
  }

  settingsModal.classList.remove('open');
  toast(`Guardado: ${PROVIDERS[provider].name}${hasImgKey ? ' + ' + (imgProv?.short || imgProvider) : ''}`);
  refreshKeyState();
});
document.getElementById('clearKeyBtn').addEventListener('click', () => {
  const provider = providerSelect.value;
  localStorage.removeItem('llm_apikey_' + provider);
  apiKeyInput.value = '';
  toast(`API key de ${PROVIDERS[provider].name} borrada`);
  refreshKeyState();
});

(function migrate() {
  const old = localStorage.getItem('anthropic_api_key');
  if (old && !localStorage.getItem('llm_apikey_anthropic')) {
    localStorage.setItem('llm_apikey_anthropic', old);
    localStorage.setItem('llm_provider', 'anthropic');
    const oldModel = localStorage.getItem('anthropic_model');
    if (oldModel) localStorage.setItem('llm_model_anthropic', oldModel);
  }
})();
populateProviders();
refreshKeyState();
settingsModal.addEventListener('click', e => { if (e.target === settingsModal) settingsModal.classList.remove('open'); });
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    settingsModal.classList.remove('open');
    closeDrawer();
  }
});

/* Limpiar todo */
function hasUnsavedContent() {
  return taskInput.value.trim() !== '' ||
    ctxUrl.value.trim() !== '' ||
    ctxText.value.trim() !== '' ||
    ctxAttachments.length > 0 ||
    stage.innerHTML.trim() !== '';
}
function clearAll(skipConfirm = false) {
  if (!skipConfirm && hasUnsavedContent()) {
    if (!confirm('¿Limpiar tarea, contexto y resultados? Esta acción no se puede deshacer.')) return;
  }
  if (currentRunController) { try { currentRunController.abort(); } catch {} currentRunController = null; }
  taskInput.value = '';
  ctxUrl.value = '';
  ctxText.value = '';
  ctxAttachments.length = 0;
  renderCtxFiles();
  ctxPanel.classList.remove('open');
  matchedSkills = [];
  selectedSlugs.clear();
  currentPrompt = '';
  stage.innerHTML = '';
  taskInput.focus();
  toast('Listo para una nueva consulta');
}
document.getElementById('clearBtn').addEventListener('click', () => clearAll());
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    clearAll();
  }
});

/* History */
const historyBtn = document.getElementById('historyBtn');
const drawerBg = document.getElementById('drawerBg');
const historyDrawer = document.getElementById('historyDrawer');
const historyList = document.getElementById('historyList');

function renderHistory() {
  const arr = getHistory();
  if (arr.length === 0) {
    historyList.innerHTML = '<div class="drawer-empty">Aún no hay historial. Las tareas que ejecutes aparecerán aquí.</div>';
    return;
  }
  historyList.innerHTML = arr.map(h => {
    const isImage = h.kind === 'image';
    const meta = isImage
      ? `<span class="hist-skills">🖼 imagen · ${escapeHtml(h.model || '')}</span>`
      : `<span class="hist-skills">${(h.slugs || []).length} skills · ${escapeHtml(h.model || '')}</span>`;
    const thumb = isImage && h.thumbnail
      ? `<img src="${h.thumbnail}" alt="" style="width:100%;border-radius:6px;margin-bottom:8px;display:block">`
      : '';
    return `
      <div class="hist-item" data-id="${h.id}">
        <button class="hist-del" data-del="${h.id}" title="Borrar">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
        </button>
        ${thumb}
        <div class="hist-task">${escapeHtml(h.task)}</div>
        <div class="hist-meta">
          <span class="hist-time">${fmtTime(h.ts)}</span>
          ${meta}
        </div>
      </div>`;
  }).join('');
}
function openDrawer() {
  renderHistory();
  drawerBg.classList.add('open');
  historyDrawer.classList.add('open');
}
function closeDrawer() {
  drawerBg.classList.remove('open');
  historyDrawer.classList.remove('open');
}
historyBtn.addEventListener('click', openDrawer);
drawerBg.addEventListener('click', closeDrawer);
document.getElementById('closeDrawerBtn').addEventListener('click', closeDrawer);
document.getElementById('clearHistoryBtn').addEventListener('click', () => {
  if (!confirm('¿Borrar todo el historial?')) return;
  clearHistory();
  renderHistory();
  toast('Historial borrado');
});
historyList.addEventListener('click', e => {
  const delBtn = e.target.closest('[data-del]');
  if (delBtn) {
    e.stopPropagation();
    deleteFromHistory(delBtn.dataset.del);
    renderHistory();
    return;
  }
  const item = e.target.closest('.hist-item');
  if (!item) return;
  const entry = getHistory().find(h => h.id === item.dataset.id);
  if (!entry) return;
  restoreFromHistory(entry);
  closeDrawer();
});

function restoreFromHistory(entry) {
  taskInput.value = entry.task;
  if (entry.kind === 'image') {
    const thumb = entry.thumbnail
      ? `<img src="${entry.thumbnail}" alt="Imagen previa" style="max-width:100%;border-radius:8px;border:1px solid var(--border)">`
      : '<div style="color:var(--text-mute);font-size:13px">(sin miniatura guardada)</div>';
    stage.innerHTML = `
      <div class="step">
        <div class="step-head">
          <div class="step-num">1</div>
          <div class="step-title">Imagen anterior</div>
          <div class="step-sub">${fmtTime(entry.ts)} · ${escapeHtml(entry.model || '')}${entry.size ? ' · ' + escapeHtml(entry.size) : ''}</div>
        </div>
        <div style="font-size:13px;color:var(--text-dim);margin-bottom:12px">Solo se guardó una miniatura. Para volver a generarla, pulsa el botón <strong>Generar imagen</strong> arriba.</div>
        ${thumb}
        <div class="image-prompt"><strong style="color:var(--text-dim)">Prompt:</strong> ${escapeHtml(entry.task)}</div>
      </div>`;
    return;
  }
  currentPrompt = entry.prompt;
  selectedSlugs = new Set(entry.slugs || []);
  matchedSkills = (entry.slugs || []).map(slug => ({
    slug, name: slug, category: 'Other', description: '(restaurada del historial)', score: 0,
  }));
  stage.innerHTML = `
    <div class="step">
      <div class="step-head">
        <div class="step-num">1</div>
        <div class="step-title">Tarea restaurada</div>
        <div class="step-sub">${entry.slugs.length} skills · ${escapeHtml(entry.model || '')}</div>
      </div>
      <div style="font-size:13px;color:var(--text-dim)">Para reanalizar, edita la tarea y pulsa Analizar. Para volver a ejecutar tal cual, usa el botón abajo.</div>
      <div class="actions-row" style="margin-top:14px">
        <button class="btn btn-primary" id="rerunBtn">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          Re-ejecutar
        </button>
        <button class="btn" id="copyHistBtn">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
          Copiar prompt
        </button>
      </div>
    </div>
    <div class="step">
      <div class="step-head">
        <div class="step-num">2</div>
        <div class="step-title">Resultado anterior</div>
        <div class="step-sub">${fmtTime(entry.ts)}</div>
      </div>
      <div class="output">${mdToHtml(entry.result || '(sin resultado)')}</div>
    </div>`;
  document.getElementById('rerunBtn').addEventListener('click', runWithClaude);
  document.getElementById('copyHistBtn').addEventListener('click', () => {
    navigator.clipboard.writeText(entry.prompt);
    toast('Prompt copiado');
  });
}

(async function init() {
  try {
    allSkills = await loadSkills();
  } catch (err) {
    toast('Error cargando skills: ' + (err.message || err), 'error');
    console.error(err);
  }
})();
