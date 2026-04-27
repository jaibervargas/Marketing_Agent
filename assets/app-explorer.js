import { loadSkills, categoriesByCount } from './skills-loader.js';
import { mdToHtml, escapeHtml } from './md.js';

const grid = document.getElementById('grid');
const empty = document.getElementById('empty');
const searchInput = document.getElementById('search');
const filters = document.getElementById('filters');
const headerBadge = document.getElementById('headerBadge');
const statSkills = document.getElementById('statSkills');
const statCategories = document.getElementById('statCategories');
const statWords = document.getElementById('statWords');

const modalBg = document.getElementById('modalBg');
const modalTitle = document.getElementById('modalTitle');
const modalSub = document.getElementById('modalSub');
const modalBody = document.getElementById('modalBody');
const modalClose = document.getElementById('modalClose');

let skills = [];
let bySlug = {};
let activeCat = 'all';
let currentSkill = null;

function renderHeader() {
  const cats = categoriesByCount(skills);
  const totalWords = skills.reduce((sum, s) => sum + (s.wordCount || 0), 0);
  headerBadge.textContent = `Explorador · ${skills.length} skills`;
  statSkills.textContent = skills.length.toString();
  statCategories.textContent = Object.keys(cats).length.toString();
  statWords.textContent = totalWords.toLocaleString('es-ES');

  const catButtons = [
    `<button class="filter-btn active" data-cat="all">Todas <span class="count">${skills.length}</span></button>`,
    ...Object.entries(cats).map(([cat, count]) =>
      `<button class="filter-btn" data-cat="${escapeHtml(cat)}">${escapeHtml(cat)} <span class="count">${count}</span></button>`,
    ),
  ];
  filters.innerHTML = catButtons.join('');
}

function renderGrid() {
  const fragments = skills.map(s => {
    const search = `${s.name} ${s.description}`.toLowerCase();
    const meta = `${s.version ? 'v' + escapeHtml(s.version) + ' · ' : ''}${(s.wordCount || 0).toLocaleString('es-ES')} palabras`;
    return `
      <article class="card" data-slug="${escapeHtml(s.slug)}" data-cat="${escapeHtml(s.category)}" data-search="${escapeHtml(search)}">
        <div class="card-head">
          <h3 class="card-title">${escapeHtml(s.name)}</h3>
          <span class="card-cat cat-${escapeHtml(s.category)}">${escapeHtml(s.category)}</span>
        </div>
        <p class="card-desc">${escapeHtml(s.description)}</p>
        <div class="card-foot">
          <span class="card-meta">${meta}</span>
          <svg class="card-arrow" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
        </div>
      </article>`;
  });
  grid.insertAdjacentHTML('afterbegin', fragments.join(''));

  for (const card of grid.querySelectorAll('.card')) {
    card.addEventListener('mousemove', e => {
      const r = card.getBoundingClientRect();
      card.style.setProperty('--mx', ((e.clientX - r.left) / r.width * 100) + '%');
      card.style.setProperty('--my', ((e.clientY - r.top) / r.height * 100) + '%');
    });
    card.addEventListener('click', () => openSkill(card.dataset.slug));
  }
}

function applyFilter() {
  const q = searchInput.value.toLowerCase().trim();
  let visible = 0;
  for (const card of grid.querySelectorAll('.card')) {
    const matchCat = activeCat === 'all' || card.dataset.cat === activeCat;
    const matchSearch = !q || card.dataset.search.includes(q);
    const show = matchCat && matchSearch;
    card.style.display = show ? '' : 'none';
    if (show) visible++;
  }
  empty.style.display = visible === 0 ? 'block' : 'none';
}

function openSkill(slug) {
  const skill = bySlug[slug];
  if (!skill) return;
  currentSkill = skill;
  modalTitle.textContent = skill.name;
  modalSub.textContent = `${skill.category}${skill.version ? ' · v' + skill.version : ''} · ${(skill.wordCount || 0).toLocaleString('es-ES')} palabras`;
  modalBody.innerHTML = mdToHtml(skill.body || '');
  modalBg.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  modalBg.classList.remove('open');
  document.body.style.overflow = '';
}

function flashCopied(btn, label) {
  const orig = btn.innerHTML;
  btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> ' + label;
  btn.classList.add('copied');
  setTimeout(() => { btn.innerHTML = orig; btn.classList.remove('copied'); }, 1800);
}

searchInput.addEventListener('input', applyFilter);
filters.addEventListener('click', e => {
  const btn = e.target.closest('.filter-btn');
  if (!btn) return;
  for (const b of filters.querySelectorAll('.filter-btn')) b.classList.remove('active');
  btn.classList.add('active');
  activeCat = btn.dataset.cat;
  applyFilter();
});

modalClose.addEventListener('click', closeModal);
modalBg.addEventListener('click', e => { if (e.target === modalBg) closeModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

document.getElementById('copyPrompt').addEventListener('click', async (e) => {
  if (!currentSkill) return;
  const prompt = `Activa la skill "${currentSkill.name}" para mi tarea de marketing. Aquí están las instrucciones que debes seguir al pie de la letra:\n\n---\n\n${currentSkill.body}\n\n---\n\nAhora ayúdame con: [DESCRIBE AQUÍ TU TAREA]`;
  await navigator.clipboard.writeText(prompt);
  flashCopied(e.currentTarget, '¡Copiado!');
});
document.getElementById('copyMarkdown').addEventListener('click', async (e) => {
  if (!currentSkill) return;
  await navigator.clipboard.writeText(currentSkill.body || '');
  flashCopied(e.currentTarget, '¡Copiado!');
});
document.getElementById('downloadBtn').addEventListener('click', () => {
  if (!currentSkill) return;
  const blob = new Blob([currentSkill.body || ''], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = currentSkill.slug + '.md';
  a.click();
  URL.revokeObjectURL(url);
});

(async function init() {
  try {
    skills = await loadSkills();
    bySlug = Object.fromEntries(skills.map(s => [s.slug, s]));
    renderHeader();
    renderGrid();
    applyFilter();
  } catch (err) {
    grid.innerHTML = `<div class="empty"><p>Error cargando skills: ${escapeHtml(err.message || err)}</p><p style="margin-top:8px;font-size:12px">Ejecuta <code>node scripts/build-skills.mjs</code> para regenerar <code>data/skills.json</code>.</p></div>`;
    console.error(err);
  }
})();
