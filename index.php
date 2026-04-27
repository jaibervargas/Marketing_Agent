<?php
require_once __DIR__ . '/skills_loader.php';
$skills = load_skills();

$categories = [];
foreach ($skills as $s) {
    $categories[$s['category']] = ($categories[$s['category']] ?? 0) + 1;
}
ksort($categories);

if (isset($_GET['skill'])) {
    $slug = preg_replace('/[^a-z0-9-]/', '', $_GET['skill']);
    foreach ($skills as $s) {
        if ($s['slug'] === $slug) {
            header('Content-Type: application/json; charset=utf-8');
            echo json_encode($s);
            exit;
        }
    }
    http_response_code(404);
    exit;
}
?>
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Marketing Skills · Hub</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
        --bg: #0a0a0f;
        --bg-elev: #12121a;
        --bg-card: rgba(255,255,255,0.03);
        --border: rgba(255,255,255,0.08);
        --border-hover: rgba(255,255,255,0.18);
        --text: #f5f5f7;
        --text-dim: #a1a1aa;
        --text-mute: #71717a;
        --accent: #8b5cf6;
        --accent-2: #ec4899;
        --accent-3: #06b6d4;
        --success: #10b981;
        --shadow: 0 10px 40px -10px rgba(139, 92, 246, 0.25);
    }
    html, body {
        background: var(--bg);
        color: var(--text);
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
        font-size: 15px;
        line-height: 1.6;
        min-height: 100vh;
        overflow-x: hidden;
    }
    body::before {
        content: '';
        position: fixed;
        top: -50%; left: -50%;
        width: 200%; height: 200%;
        background:
            radial-gradient(circle at 20% 20%, rgba(139,92,246,0.15), transparent 40%),
            radial-gradient(circle at 80% 60%, rgba(236,72,153,0.12), transparent 40%),
            radial-gradient(circle at 50% 90%, rgba(6,182,212,0.10), transparent 40%);
        pointer-events: none;
        z-index: 0;
        animation: drift 30s linear infinite;
    }
    @keyframes drift {
        0%, 100% { transform: translate(0, 0); }
        50% { transform: translate(-2%, -2%); }
    }
    .container { position: relative; z-index: 1; max-width: 1400px; margin: 0 auto; padding: 0 32px; }

    .topnav {
        display: flex; justify-content: space-between; align-items: center;
        padding: 20px 0; border-bottom: 1px solid var(--border);
    }
    .brand { display: flex; align-items: center; gap: 10px; font-weight: 700; font-size: 15px; letter-spacing: -0.01em; }
    .brand-dot {
        width: 10px; height: 10px; border-radius: 50%;
        background: linear-gradient(135deg, var(--accent), var(--accent-2));
        box-shadow: 0 0 12px var(--accent);
    }
    .nav-links { display: flex; gap: 4px; }
    .nav-link {
        padding: 8px 14px; border-radius: 9px;
        color: var(--text-dim); text-decoration: none;
        font-size: 13px; font-weight: 500;
        transition: all 0.15s;
    }
    .nav-link:hover { background: var(--bg-card); color: var(--text); }
    .nav-link.active {
        background: linear-gradient(135deg, rgba(139,92,246,0.2), rgba(236,72,153,0.15));
        color: var(--text);
        border: 1px solid rgba(139,92,246,0.3);
    }

    /* Header */
    header { padding: 40px 0 40px; }
    .badge {
        display: inline-flex; align-items: center; gap: 8px;
        padding: 6px 14px;
        background: rgba(139,92,246,0.12);
        border: 1px solid rgba(139,92,246,0.3);
        border-radius: 999px;
        font-size: 12px;
        color: #c4b5fd;
        font-weight: 500;
        margin-bottom: 20px;
    }
    .badge::before {
        content: ''; width: 6px; height: 6px; border-radius: 50%;
        background: var(--accent); box-shadow: 0 0 8px var(--accent);
    }
    h1 {
        font-size: clamp(32px, 5vw, 56px);
        font-weight: 800;
        letter-spacing: -0.03em;
        line-height: 1.05;
        margin-bottom: 16px;
        background: linear-gradient(135deg, #fff 0%, #c4b5fd 50%, #f9a8d4 100%);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
    }
    .subtitle {
        font-size: 18px;
        color: var(--text-dim);
        max-width: 640px;
        margin-bottom: 32px;
    }
    .stats { display: flex; gap: 32px; flex-wrap: wrap; padding-top: 24px; border-top: 1px solid var(--border); }
    .stat-num { font-size: 28px; font-weight: 700; color: var(--text); letter-spacing: -0.02em; }
    .stat-label { font-size: 12px; color: var(--text-mute); text-transform: uppercase; letter-spacing: 0.08em; margin-top: 4px; }

    /* Toolbar */
    .toolbar {
        position: sticky; top: 0; z-index: 50;
        background: rgba(10,10,15,0.85);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        border-bottom: 1px solid var(--border);
        padding: 16px 0;
        margin-bottom: 32px;
    }
    .toolbar-inner { display: flex; gap: 16px; align-items: center; flex-wrap: wrap; }
    .search-wrap { position: relative; flex: 1; min-width: 240px; }
    .search-wrap svg {
        position: absolute; left: 16px; top: 50%; transform: translateY(-50%);
        color: var(--text-mute);
    }
    .search {
        width: 100%; height: 44px;
        padding: 0 16px 0 46px;
        background: var(--bg-elev);
        border: 1px solid var(--border);
        border-radius: 12px;
        color: var(--text);
        font-family: inherit; font-size: 14px;
        transition: all 0.2s;
    }
    .search:focus {
        outline: none;
        border-color: var(--accent);
        box-shadow: 0 0 0 4px rgba(139,92,246,0.15);
    }
    .search::placeholder { color: var(--text-mute); }
    .filters { display: flex; gap: 8px; flex-wrap: wrap; }
    .filter-btn {
        height: 36px; padding: 0 14px;
        background: var(--bg-elev);
        border: 1px solid var(--border);
        border-radius: 10px;
        color: var(--text-dim);
        font-family: inherit; font-size: 13px; font-weight: 500;
        cursor: pointer; transition: all 0.15s;
        display: inline-flex; align-items: center; gap: 6px;
    }
    .filter-btn:hover { border-color: var(--border-hover); color: var(--text); }
    .filter-btn.active {
        background: linear-gradient(135deg, var(--accent), var(--accent-2));
        border-color: transparent; color: white;
        box-shadow: var(--shadow);
    }
    .filter-btn .count {
        font-size: 11px; padding: 2px 6px; border-radius: 6px;
        background: rgba(255,255,255,0.1);
    }

    /* Grid */
    .grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
        gap: 16px;
        padding-bottom: 80px;
    }
    .card {
        background: var(--bg-card);
        border: 1px solid var(--border);
        border-radius: 16px;
        padding: 20px;
        cursor: pointer;
        transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
        position: relative;
        overflow: hidden;
        backdrop-filter: blur(10px);
    }
    .card::before {
        content: '';
        position: absolute; inset: 0;
        background: radial-gradient(circle at var(--mx, 50%) var(--my, 50%), rgba(139,92,246,0.08), transparent 50%);
        opacity: 0; transition: opacity 0.3s;
        pointer-events: none;
    }
    .card:hover {
        border-color: var(--border-hover);
        transform: translateY(-2px);
        box-shadow: 0 20px 40px -20px rgba(0,0,0,0.5);
    }
    .card:hover::before { opacity: 1; }
    .card-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-bottom: 12px; }
    .card-title { font-size: 16px; font-weight: 600; color: var(--text); letter-spacing: -0.01em; }
    .card-cat {
        font-size: 10px; font-weight: 600;
        padding: 4px 8px; border-radius: 6px;
        text-transform: uppercase; letter-spacing: 0.06em;
        white-space: nowrap;
    }
    .cat-CRO { background: rgba(139,92,246,0.15); color: #c4b5fd; }
    .cat-Content { background: rgba(236,72,153,0.15); color: #f9a8d4; }
    .cat-SEO { background: rgba(6,182,212,0.15); color: #67e8f9; }
    .cat-Paid { background: rgba(245,158,11,0.15); color: #fcd34d; }
    .cat-Measurement { background: rgba(16,185,129,0.15); color: #6ee7b7; }
    .cat-Retention { background: rgba(239,68,68,0.15); color: #fca5a5; }
    .cat-Growth { background: rgba(34,197,94,0.15); color: #86efac; }
    .cat-Sales { background: rgba(99,102,241,0.15); color: #a5b4fc; }
    .cat-Strategy { background: rgba(168,85,247,0.15); color: #d8b4fe; }
    .cat-Other { background: rgba(161,161,170,0.15); color: #d4d4d8; }
    .card-desc {
        font-size: 13px; color: var(--text-dim); line-height: 1.55;
        display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical;
        overflow: hidden;
    }
    .card-foot { display: flex; justify-content: space-between; align-items: center; margin-top: 16px; padding-top: 14px; border-top: 1px solid var(--border); }
    .card-meta { font-size: 11px; color: var(--text-mute); font-family: 'JetBrains Mono', monospace; }
    .card-arrow { color: var(--text-mute); transition: all 0.2s; }
    .card:hover .card-arrow { color: var(--accent); transform: translateX(4px); }

    /* Modal */
    .modal-bg {
        position: fixed; inset: 0;
        background: rgba(0,0,0,0.7);
        backdrop-filter: blur(8px);
        z-index: 100;
        display: none;
        align-items: center; justify-content: center;
        padding: 20px;
        animation: fadeIn 0.2s;
    }
    .modal-bg.open { display: flex; }
    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
    .modal {
        background: var(--bg-elev);
        border: 1px solid var(--border);
        border-radius: 20px;
        max-width: 900px; width: 100%;
        max-height: 90vh;
        display: flex; flex-direction: column;
        overflow: hidden;
        box-shadow: 0 40px 80px -20px rgba(0,0,0,0.6);
        animation: slideUp 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    }
    @keyframes slideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
    .modal-head {
        padding: 24px 28px;
        border-bottom: 1px solid var(--border);
        display: flex; justify-content: space-between; align-items: flex-start; gap: 16px;
    }
    .modal-title-wrap { flex: 1; min-width: 0; }
    .modal-title { font-size: 24px; font-weight: 700; letter-spacing: -0.02em; margin-bottom: 6px; }
    .modal-sub { font-size: 13px; color: var(--text-mute); font-family: 'JetBrains Mono', monospace; }
    .modal-close {
        width: 36px; height: 36px;
        background: var(--bg-card); border: 1px solid var(--border);
        border-radius: 10px;
        color: var(--text-dim); cursor: pointer;
        display: flex; align-items: center; justify-content: center;
        transition: all 0.15s; flex-shrink: 0;
    }
    .modal-close:hover { background: rgba(239,68,68,0.1); border-color: rgba(239,68,68,0.4); color: #fca5a5; }
    .modal-actions {
        padding: 16px 28px;
        background: var(--bg-card);
        border-bottom: 1px solid var(--border);
        display: flex; gap: 8px; flex-wrap: wrap;
    }
    .btn {
        padding: 9px 14px;
        background: var(--bg-elev); border: 1px solid var(--border);
        border-radius: 9px;
        color: var(--text); font-family: inherit; font-size: 13px; font-weight: 500;
        cursor: pointer; transition: all 0.15s;
        display: inline-flex; align-items: center; gap: 8px;
    }
    .btn:hover { border-color: var(--border-hover); }
    .btn-primary {
        background: linear-gradient(135deg, var(--accent), var(--accent-2));
        border-color: transparent; color: white;
    }
    .btn-primary:hover { box-shadow: var(--shadow); transform: translateY(-1px); }
    .btn.copied { background: var(--success); border-color: var(--success); color: white; }
    .modal-body {
        padding: 28px;
        overflow-y: auto;
        font-size: 14px;
        line-height: 1.7;
    }
    .modal-body::-webkit-scrollbar { width: 8px; }
    .modal-body::-webkit-scrollbar-track { background: transparent; }
    .modal-body::-webkit-scrollbar-thumb { background: var(--border); border-radius: 4px; }
    .modal-body h1, .modal-body h2, .modal-body h3 { margin-top: 24px; margin-bottom: 12px; letter-spacing: -0.01em; }
    .modal-body h1 { font-size: 22px; }
    .modal-body h2 { font-size: 18px; color: #c4b5fd; }
    .modal-body h3 { font-size: 15px; color: var(--text); }
    .modal-body p { margin-bottom: 12px; color: var(--text-dim); }
    .modal-body ul, .modal-body ol { margin: 12px 0 12px 24px; color: var(--text-dim); }
    .modal-body li { margin-bottom: 6px; }
    .modal-body code {
        background: var(--bg);
        padding: 2px 6px;
        border-radius: 4px;
        font-family: 'JetBrains Mono', monospace;
        font-size: 12px;
        color: #f9a8d4;
        border: 1px solid var(--border);
    }
    .modal-body pre {
        background: var(--bg);
        padding: 14px;
        border-radius: 10px;
        overflow-x: auto;
        margin: 12px 0;
        border: 1px solid var(--border);
    }
    .modal-body pre code { background: none; border: none; padding: 0; color: var(--text); }
    .modal-body strong { color: var(--text); font-weight: 600; }
    .modal-body hr { border: none; border-top: 1px solid var(--border); margin: 20px 0; }
    .modal-body a { color: var(--accent-3); text-decoration: none; }
    .modal-body a:hover { text-decoration: underline; }
    .modal-body blockquote {
        border-left: 3px solid var(--accent);
        padding-left: 14px; margin: 12px 0;
        color: var(--text-dim); font-style: italic;
    }

    .empty {
        grid-column: 1/-1;
        text-align: center;
        padding: 80px 20px;
        color: var(--text-mute);
    }
    .empty svg { margin-bottom: 16px; opacity: 0.5; }

    @media (max-width: 640px) {
        .container { padding: 0 20px; }
        header { padding: 32px 0 24px; }
        .grid { grid-template-columns: 1fr; }
        .modal { max-height: 95vh; border-radius: 16px; }
        .modal-head, .modal-body, .modal-actions { padding-left: 20px; padding-right: 20px; }
    }
</style>
</head>
<body>
<div class="container">
    <nav class="topnav">
        <div class="brand">
            <span class="brand-dot"></span>
            <span>Marketing Skills</span>
        </div>
        <div class="nav-links">
            <a href="orchestrator.php" class="nav-link">Orquestador</a>
            <a href="index.php" class="nav-link active">Explorar skills</a>
        </div>
    </nav>
    <header>
        <span class="badge">Explorador · <?= count($skills) ?> skills</span>
        <h1>Tu arsenal de marketing,<br>listo para tu agente IA</h1>
        <p class="subtitle">¿No sabes qué skill usar? Ve al <a href="orchestrator.php" style="color:#c4b5fd;text-decoration:underline">Orquestador</a> y describe lo que quieres lograr — él elige las skills correctas por ti.</p>
        <div class="stats">
            <div><div class="stat-num"><?= count($skills) ?></div><div class="stat-label">Skills</div></div>
            <div><div class="stat-num"><?= count($categories) ?></div><div class="stat-label">Categorías</div></div>
            <div><div class="stat-num"><?= number_format(array_sum(array_column($skills, 'wordCount'))) ?></div><div class="stat-label">Palabras de conocimiento</div></div>
        </div>
    </header>

    <div class="toolbar">
        <div class="toolbar-inner">
            <div class="search-wrap">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                <input class="search" id="search" placeholder="Buscar skill, palabra clave o tema...">
            </div>
            <div class="filters" id="filters">
                <button class="filter-btn active" data-cat="all">Todas <span class="count"><?= count($skills) ?></span></button>
                <?php foreach ($categories as $cat => $count): ?>
                    <button class="filter-btn" data-cat="<?= htmlspecialchars($cat) ?>"><?= htmlspecialchars($cat) ?> <span class="count"><?= $count ?></span></button>
                <?php endforeach; ?>
            </div>
        </div>
    </div>

    <div class="grid" id="grid">
        <?php foreach ($skills as $s): ?>
            <article class="card" data-slug="<?= htmlspecialchars($s['slug']) ?>" data-cat="<?= htmlspecialchars($s['category']) ?>" data-search="<?= htmlspecialchars(strtolower($s['name'].' '.$s['description'])) ?>">
                <div class="card-head">
                    <h3 class="card-title"><?= htmlspecialchars($s['name']) ?></h3>
                    <span class="card-cat cat-<?= htmlspecialchars($s['category']) ?>"><?= htmlspecialchars($s['category']) ?></span>
                </div>
                <p class="card-desc"><?= htmlspecialchars($s['description']) ?></p>
                <div class="card-foot">
                    <span class="card-meta"><?= $s['version'] ? 'v'.htmlspecialchars($s['version']) : '' ?> · <?= number_format($s['wordCount']) ?> palabras</span>
                    <svg class="card-arrow" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                </div>
            </article>
        <?php endforeach; ?>
        <div class="empty" id="empty" style="display:none">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            <p>No se encontraron skills con esa búsqueda</p>
        </div>
    </div>
</div>

<div class="modal-bg" id="modalBg">
    <div class="modal" id="modal">
        <div class="modal-head">
            <div class="modal-title-wrap">
                <h2 class="modal-title" id="modalTitle"></h2>
                <p class="modal-sub" id="modalSub"></p>
            </div>
            <button class="modal-close" id="modalClose">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
            </button>
        </div>
        <div class="modal-actions">
            <button class="btn btn-primary" id="copyPrompt">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
                Copiar como prompt
            </button>
            <button class="btn" id="copyMarkdown">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                Copiar Markdown
            </button>
            <button class="btn" id="downloadBtn">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                Descargar
            </button>
        </div>
        <div class="modal-body" id="modalBody"></div>
    </div>
</div>

<script>
    const cards = document.querySelectorAll('.card');
    const searchInput = document.getElementById('search');
    const filters = document.getElementById('filters');
    const empty = document.getElementById('empty');
    let activeCat = 'all';

    cards.forEach(card => {
        card.addEventListener('mousemove', e => {
            const r = card.getBoundingClientRect();
            card.style.setProperty('--mx', ((e.clientX - r.left) / r.width * 100) + '%');
            card.style.setProperty('--my', ((e.clientY - r.top) / r.height * 100) + '%');
        });
    });

    function applyFilter() {
        const q = searchInput.value.toLowerCase().trim();
        let visible = 0;
        cards.forEach(card => {
            const matchCat = activeCat === 'all' || card.dataset.cat === activeCat;
            const matchSearch = !q || card.dataset.search.includes(q);
            const show = matchCat && matchSearch;
            card.style.display = show ? '' : 'none';
            if (show) visible++;
        });
        empty.style.display = visible === 0 ? 'block' : 'none';
    }
    searchInput.addEventListener('input', applyFilter);
    filters.addEventListener('click', e => {
        const btn = e.target.closest('.filter-btn');
        if (!btn) return;
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        activeCat = btn.dataset.cat;
        applyFilter();
    });

    const modalBg = document.getElementById('modalBg');
    const modalTitle = document.getElementById('modalTitle');
    const modalSub = document.getElementById('modalSub');
    const modalBody = document.getElementById('modalBody');
    const modalClose = document.getElementById('modalClose');
    let currentSkill = null;

    function mdToHtml(md) {
        const escape = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const blocks = [];
        md = md.replace(/```([a-z]*)\n([\s\S]*?)```/g, (_, lang, code) => {
            blocks.push(`<pre><code>${escape(code)}</code></pre>`);
            return ` ${blocks.length - 1} `;
        });
        let html = escape(md)
            .replace(/^### (.*$)/gm, '<h3>$1</h3>')
            .replace(/^## (.*$)/gm, '<h2>$1</h2>')
            .replace(/^# (.*$)/gm, '<h1>$1</h1>')
            .replace(/^---$/gm, '<hr>')
            .replace(/^&gt; (.*$)/gm, '<blockquote>$1</blockquote>')
            .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
            .replace(/`([^`]+)`/g, '<code>$1</code>')
            .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

        const lines = html.split('\n');
        let out = [], inUl = false, inOl = false, para = [];
        const flushPara = () => { if (para.length) { out.push('<p>' + para.join(' ') + '</p>'); para = []; } };
        for (let line of lines) {
            if (/^\s*[-*]\s+/.test(line)) {
                flushPara();
                if (inOl) { out.push('</ol>'); inOl = false; }
                if (!inUl) { out.push('<ul>'); inUl = true; }
                out.push('<li>' + line.replace(/^\s*[-*]\s+/, '') + '</li>');
            } else if (/^\s*\d+\.\s+/.test(line)) {
                flushPara();
                if (inUl) { out.push('</ul>'); inUl = false; }
                if (!inOl) { out.push('<ol>'); inOl = true; }
                out.push('<li>' + line.replace(/^\s*\d+\.\s+/, '') + '</li>');
            } else if (/^<(h[1-3]|hr|blockquote|pre)/.test(line)) {
                flushPara();
                if (inUl) { out.push('</ul>'); inUl = false; }
                if (inOl) { out.push('</ol>'); inOl = false; }
                out.push(line);
            } else if (line.trim() === '') {
                flushPara();
                if (inUl) { out.push('</ul>'); inUl = false; }
                if (inOl) { out.push('</ol>'); inOl = false; }
            } else {
                para.push(line);
            }
        }
        flushPara();
        if (inUl) out.push('</ul>');
        if (inOl) out.push('</ol>');
        let result = out.join('\n');
        result = result.replace(/ (\d+) /g, (_, i) => blocks[+i]);
        return result;
    }

    async function openSkill(slug) {
        try {
            const res = await fetch('?skill=' + encodeURIComponent(slug));
            const data = await res.json();
            currentSkill = data;
            modalTitle.textContent = data.name;
            modalSub.textContent = `${data.category}${data.version ? ' · v' + data.version : ''} · ${data.wordCount.toLocaleString()} palabras`;
            modalBody.innerHTML = mdToHtml(data.body);
            modalBg.classList.add('open');
            document.body.style.overflow = 'hidden';
        } catch (e) {
            alert('No se pudo cargar la skill');
        }
    }
    function closeModal() {
        modalBg.classList.remove('open');
        document.body.style.overflow = '';
    }
    cards.forEach(card => card.addEventListener('click', () => openSkill(card.dataset.slug)));
    modalClose.addEventListener('click', closeModal);
    modalBg.addEventListener('click', e => { if (e.target === modalBg) closeModal(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

    function flashCopied(btn, label) {
        const orig = btn.innerHTML;
        btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> ' + label;
        btn.classList.add('copied');
        setTimeout(() => { btn.innerHTML = orig; btn.classList.remove('copied'); }, 1800);
    }

    document.getElementById('copyPrompt').addEventListener('click', async (e) => {
        if (!currentSkill) return;
        const prompt = `Activa la skill "${currentSkill.name}" para mi tarea de marketing. Aquí están las instrucciones que debes seguir al pie de la letra:\n\n---\n\n${currentSkill.body}\n\n---\n\nAhora ayúdame con: [DESCRIBE AQUÍ TU TAREA]`;
        await navigator.clipboard.writeText(prompt);
        flashCopied(e.currentTarget, '¡Copiado!');
    });
    document.getElementById('copyMarkdown').addEventListener('click', async (e) => {
        if (!currentSkill) return;
        await navigator.clipboard.writeText(currentSkill.body);
        flashCopied(e.currentTarget, '¡Copiado!');
    });
    document.getElementById('downloadBtn').addEventListener('click', () => {
        if (!currentSkill) return;
        const blob = new Blob([currentSkill.body], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = currentSkill.slug + '.md';
        a.click();
        URL.revokeObjectURL(url);
    });
</script>
</body>
</html>
