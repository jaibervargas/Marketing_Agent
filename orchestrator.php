<?php
require_once __DIR__ . '/skills_loader.php';
$skills = load_skills();

$PROVIDERS = [
    'anthropic' => [
        'name' => 'Anthropic (Claude)',
        'short' => 'Claude',
        'chatUrl' => 'https://claude.ai/new',
        'url' => 'https://api.anthropic.com/v1/messages',
        'format' => 'anthropic',
        'auth' => 'anthropic',
        'models' => ['claude-sonnet-4-5', 'claude-opus-4-5', 'claude-haiku-4-5', 'claude-3-7-sonnet-latest'],
        'keyHint' => 'sk-ant-...',
        'keyUrl' => 'https://console.anthropic.com/settings/keys',
    ],
    'openai' => [
        'name' => 'OpenAI (ChatGPT)',
        'short' => 'ChatGPT',
        'chatUrl' => 'https://chat.openai.com',
        'url' => 'https://api.openai.com/v1/chat/completions',
        'format' => 'openai',
        'auth' => 'bearer',
        'models' => ['gpt-4o', 'gpt-4o-mini', 'gpt-4.1', 'gpt-5', 'o3-mini', 'o1'],
        'keyHint' => 'sk-...',
        'keyUrl' => 'https://platform.openai.com/api-keys',
    ],
    'deepseek' => [
        'name' => 'DeepSeek',
        'short' => 'DeepSeek',
        'chatUrl' => 'https://chat.deepseek.com',
        'url' => 'https://api.deepseek.com/v1/chat/completions',
        'format' => 'openai',
        'auth' => 'bearer',
        'models' => ['deepseek-chat', 'deepseek-reasoner'],
        'keyHint' => 'sk-...',
        'keyUrl' => 'https://platform.deepseek.com/api_keys',
    ],
    'groq' => [
        'name' => 'Groq (Llama, Qwen)',
        'short' => 'Groq',
        'chatUrl' => 'https://groq.com',
        'url' => 'https://api.groq.com/openai/v1/chat/completions',
        'format' => 'openai',
        'auth' => 'bearer',
        'models' => ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'qwen-2.5-72b', 'mixtral-8x7b-32768', 'deepseek-r1-distill-llama-70b'],
        'keyHint' => 'gsk_...',
        'keyUrl' => 'https://console.groq.com/keys',
    ],
    'openrouter' => [
        'name' => 'OpenRouter (todos)',
        'short' => 'OpenRouter',
        'chatUrl' => 'https://openrouter.ai/chat',
        'url' => 'https://openrouter.ai/api/v1/chat/completions',
        'format' => 'openai',
        'auth' => 'bearer',
        'models' => ['anthropic/claude-sonnet-4.5', 'openai/gpt-4o', 'meta-llama/llama-3.3-70b-instruct', 'deepseek/deepseek-chat', 'google/gemini-2.0-flash-exp', 'qwen/qwen-2.5-72b-instruct', 'mistralai/mistral-large'],
        'keyHint' => 'sk-or-...',
        'keyUrl' => 'https://openrouter.ai/keys',
    ],
    'custom' => [
        'name' => 'Custom (compatible OpenAI)',
        'short' => 'Custom',
        'chatUrl' => '',
        'url' => '',
        'format' => 'openai',
        'auth' => 'bearer',
        'models' => [],
        'keyHint' => 'tu-api-key',
        'keyUrl' => '',
    ],
];

if (isset($_POST['analyze']) || (isset($_GET['action']) && $_GET['action'] === 'analyze')) {
    header('Content-Type: application/json; charset=utf-8');
    $input = json_decode(file_get_contents('php://input'), true);
    $task = isset($input['task']) ? trim($input['task']) : '';
    if ($task === '') {
        echo json_encode(['error' => 'Describe la tarea']);
        exit;
    }
    $scored = score_skills($task, $skills);
    $top = array_slice($scored, 0, 8);
    $out = [];
    foreach ($top as $s) {
        $out[] = [
            'slug' => $s['skill']['slug'],
            'name' => $s['skill']['name'],
            'description' => $s['skill']['description'],
            'category' => $s['skill']['category'],
            'score' => $s['score'],
            'matches' => $s['matches'],
        ];
    }
    echo json_encode(['skills' => $out]);
    exit;
}

if (isset($_GET['action']) && $_GET['action'] === 'build') {
    header('Content-Type: application/json; charset=utf-8');
    $input = json_decode(file_get_contents('php://input'), true);
    $task = isset($input['task']) ? trim($input['task']) : '';
    $slugs = isset($input['slugs']) && is_array($input['slugs']) ? $input['slugs'] : [];
    $bySlug = [];
    foreach ($skills as $s) $bySlug[$s['slug']] = $s;

    $bundle = [];
    foreach ($slugs as $slug) {
        if (isset($bySlug[$slug])) {
            $sk = $bySlug[$slug];
            $bundle[] = "## SKILL: {$sk['name']}\n_Categoría: {$sk['category']}_\n\n{$sk['body']}";
        }
    }
    $skillsBlock = implode("\n\n---\n\n", $bundle);
    $skillListLines = [];
    foreach ($slugs as $slug) {
        if (isset($bySlug[$slug])) $skillListLines[] = "- **{$bySlug[$slug]['name']}** — {$bySlug[$slug]['category']}";
    }
    $skillsListMarkdown = implode("\n", $skillListLines);

    $prompt = <<<PROMPT
# Rol: Marketing Orchestrator

Eres un **agente orquestador de marketing**. Tu misión es analizar la tarea del usuario y ejecutarla aplicando, en el orden correcto, las skills especializadas que te paso a continuación. Cada skill es un experto: léelas, decide cuáles usar y en qué secuencia, y entrega un resultado final accionable.

## Cómo trabajar

1. **Diagnóstico**: lee la tarea del usuario y resume en 1-2 frases qué hay que producir y para quién.
2. **Plan de ejecución**: enumera las skills que vas a aplicar y por qué, en el orden óptimo (ej: primero `customer-research`, luego `copywriting`, luego `page-cro`).
3. **Si falta contexto crítico**, haz máximo 3 preguntas concretas antes de empezar. Si la tarea ya tiene suficiente contexto, NO preguntes — ejecuta directamente.
4. **Ejecuta** cada skill siguiendo SUS instrucciones al pie de la letra. No improvises ni mezcles frameworks.
5. **Entregable**: produce el resultado final (copy, plan, auditoría, lista, etc.) en formato listo para usar. Incluye una sección "Próximos pasos" al final.

## Skills disponibles para esta tarea

$skillsListMarkdown

A continuación tienes el contenido completo de cada skill. **Síguelas literalmente** cuando las apliques.

---

$skillsBlock

---

## Tarea del usuario

> $task

Empieza ahora. Primero el diagnóstico + plan; después las preguntas (si hacen falta) o directamente la ejecución.
PROMPT;

    echo json_encode([
        'prompt' => $prompt,
        'tokens_estimate' => (int) round(mb_strlen($prompt) / 4),
    ]);
    exit;
}

if (isset($_GET['action']) && $_GET['action'] === 'run') {
    @set_time_limit(600);
    while (ob_get_level() > 0) ob_end_clean();
    ob_implicit_flush(true);
    header('Content-Type: text/event-stream; charset=utf-8');
    header('Cache-Control: no-cache, no-transform');
    header('X-Accel-Buffering: no');
    header('Connection: keep-alive');

    $input = json_decode(file_get_contents('php://input'), true);
    $providerKey = isset($input['provider']) ? trim($input['provider']) : 'anthropic';
    $apiKey = isset($input['apiKey']) ? trim($input['apiKey']) : '';
    $model = isset($input['model']) ? trim($input['model']) : '';
    $prompt = isset($input['prompt']) ? $input['prompt'] : '';
    $maxTokens = isset($input['maxTokens']) ? (int)$input['maxTokens'] : 4096;
    $customUrl = isset($input['customUrl']) ? trim($input['customUrl']) : '';

    $send = function($event, $data) {
        echo "event: $event\n";
        echo 'data: ' . json_encode($data) . "\n\n";
        flush();
    };

    if (!isset($PROVIDERS[$providerKey])) { $send('error', ['message' => 'Proveedor inválido']); exit; }
    $prov = $PROVIDERS[$providerKey];
    if (!$apiKey && $providerKey !== 'custom') { $send('error', ['message' => 'Falta API key']); exit; }
    if (!$model) { $send('error', ['message' => 'Falta modelo']); exit; }
    if (!$prompt) { $send('error', ['message' => 'Falta prompt']); exit; }

    $url = $prov['url'];
    if ($providerKey === 'custom') {
        $url = $customUrl;
        if (!preg_match('#^https?://#i', $url)) { $send('error', ['message' => 'URL custom inválida']); exit; }
    }

    if ($prov['format'] === 'anthropic') {
        $payload = json_encode([
            'model' => $model,
            'max_tokens' => $maxTokens,
            'stream' => true,
            'messages' => [['role' => 'user', 'content' => $prompt]],
        ]);
        $headers = [
            'Content-Type: application/json',
            'x-api-key: ' . $apiKey,
            'anthropic-version: 2023-06-01',
        ];
        $writer = function($ch, $data) {
            static $buf = '';
            $buf .= $data;
            while (($pos = strpos($buf, "\n\n")) !== false) {
                $chunk = substr($buf, 0, $pos);
                $buf = substr($buf, $pos + 2);
                $payload = '';
                foreach (explode("\n", $chunk) as $line) {
                    if (strpos($line, 'data:') === 0) $payload .= substr($line, 5);
                }
                $payload = trim($payload);
                if ($payload === '') continue;
                $obj = json_decode($payload, true);
                if (!is_array($obj) || !isset($obj['type'])) continue;
                if ($obj['type'] === 'content_block_delta' && isset($obj['delta']['text'])) {
                    echo "event: delta\ndata: " . json_encode(['text' => $obj['delta']['text']]) . "\n\n";
                    flush();
                } elseif ($obj['type'] === 'message_stop') {
                    echo "event: done\ndata: {}\n\n"; flush();
                } elseif ($obj['type'] === 'error') {
                    echo "event: error\ndata: " . json_encode(['message' => isset($obj['error']['message']) ? $obj['error']['message'] : 'API error']) . "\n\n";
                    flush();
                }
            }
            return strlen($data);
        };
    } else {
        $body = [
            'model' => $model,
            'stream' => true,
            'messages' => [['role' => 'user', 'content' => $prompt]],
        ];
        if (strpos($model, 'o1') !== 0 && strpos($model, 'o3') !== 0) {
            $body['max_tokens'] = $maxTokens;
        }
        $payload = json_encode($body);
        $headers = [
            'Content-Type: application/json',
            'Authorization: Bearer ' . $apiKey,
        ];
        if ($providerKey === 'openrouter') {
            $headers[] = 'HTTP-Referer: http://localhost/Marketing';
            $headers[] = 'X-Title: Marketing Skills Orchestrator';
        }
        $writer = function($ch, $data) {
            static $buf = '';
            $buf .= $data;
            while (($pos = strpos($buf, "\n")) !== false) {
                $line = rtrim(substr($buf, 0, $pos), "\r");
                $buf = substr($buf, $pos + 1);
                if ($line === '' || strpos($line, ':') === 0) continue;
                if (strpos($line, 'data:') !== 0) continue;
                $payload = trim(substr($line, 5));
                if ($payload === '' || $payload === '[DONE]') {
                    if ($payload === '[DONE]') { echo "event: done\ndata: {}\n\n"; flush(); }
                    continue;
                }
                $obj = json_decode($payload, true);
                if (!is_array($obj)) continue;
                if (isset($obj['error'])) {
                    $msg = is_array($obj['error']) ? (isset($obj['error']['message']) ? $obj['error']['message'] : json_encode($obj['error'])) : $obj['error'];
                    echo "event: error\ndata: " . json_encode(['message' => $msg]) . "\n\n";
                    flush();
                    continue;
                }
                if (isset($obj['choices'][0]['delta']['content']) && $obj['choices'][0]['delta']['content'] !== null) {
                    echo "event: delta\ndata: " . json_encode(['text' => $obj['choices'][0]['delta']['content']]) . "\n\n";
                    flush();
                }
            }
            return strlen($data);
        };
    }

    $ch = curl_init($url);
    $curlOpts = [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => $payload,
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_TIMEOUT => 600,
        CURLOPT_WRITEFUNCTION => $writer,
    ];
    $caBundle = ini_get('curl.cainfo') ?: ini_get('openssl.cafile');
    if ($caBundle && is_file($caBundle)) {
        $curlOpts[CURLOPT_CAINFO] = $caBundle;
    } else {
        $curlOpts[CURLOPT_SSL_VERIFYPEER] = false;
        $curlOpts[CURLOPT_SSL_VERIFYHOST] = 0;
    }
    curl_setopt_array($ch, $curlOpts);
    $ok = curl_exec($ch);
    $err = curl_error($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if (!$ok) $send('error', ['message' => 'Red: ' . $err]);
    elseif ($code !== 200) $send('error', ['message' => "HTTP $code — verifica API key y modelo"]);
    exit;
}
?>
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Orquestador · Marketing Skills</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
        --bg: #0a0a0f; --bg-elev: #12121a; --bg-card: rgba(255,255,255,0.03);
        --border: rgba(255,255,255,0.08); --border-hover: rgba(255,255,255,0.18);
        --text: #f5f5f7; --text-dim: #a1a1aa; --text-mute: #71717a;
        --accent: #8b5cf6; --accent-2: #ec4899; --accent-3: #06b6d4;
        --success: #10b981; --warning: #f59e0b; --danger: #ef4444;
        --shadow: 0 10px 40px -10px rgba(139, 92, 246, 0.25);
    }
    html, body {
        background: var(--bg); color: var(--text);
        font-family: 'Inter', -apple-system, sans-serif; font-size: 15px; line-height: 1.6;
        min-height: 100vh; overflow-x: hidden;
    }
    body::before {
        content: ''; position: fixed; top: -50%; left: -50%; width: 200%; height: 200%;
        background:
            radial-gradient(circle at 20% 20%, rgba(139,92,246,0.18), transparent 40%),
            radial-gradient(circle at 80% 60%, rgba(236,72,153,0.14), transparent 40%),
            radial-gradient(circle at 50% 90%, rgba(6,182,212,0.10), transparent 40%);
        pointer-events: none; z-index: 0; animation: drift 30s linear infinite;
    }
    @keyframes drift { 0%,100%{transform:translate(0,0)} 50%{transform:translate(-2%,-2%)} }
    .container { position: relative; z-index: 1; max-width: 1100px; margin: 0 auto; padding: 0 32px; }

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
    .nav-links { display: flex; gap: 4px; align-items: center; }
    .nav-link {
        padding: 8px 14px; border-radius: 9px;
        color: var(--text-dim); text-decoration: none;
        font-size: 13px; font-weight: 500; transition: all 0.15s;
    }
    .nav-link:hover { background: var(--bg-card); color: var(--text); }
    .nav-link.active {
        background: linear-gradient(135deg, rgba(139,92,246,0.2), rgba(236,72,153,0.15));
        color: var(--text); border: 1px solid rgba(139,92,246,0.3);
    }
    .icon-btn {
        width: 36px; height: 36px; border-radius: 9px;
        background: var(--bg-card); border: 1px solid var(--border);
        color: var(--text-dim); cursor: pointer;
        display: inline-flex; align-items: center; justify-content: center;
        transition: all 0.15s;
    }
    .icon-btn:hover { color: var(--text); border-color: var(--border-hover); }
    .icon-btn.has-key { color: var(--success); border-color: rgba(16,185,129,0.4); }

    header { padding: 48px 0 32px; text-align: center; }
    .badge {
        display: inline-flex; align-items: center; gap: 8px;
        padding: 6px 14px; background: rgba(139,92,246,0.12);
        border: 1px solid rgba(139,92,246,0.3); border-radius: 999px;
        font-size: 12px; color: #c4b5fd; font-weight: 500; margin-bottom: 20px;
    }
    .badge::before { content:''; width:6px; height:6px; border-radius:50%; background:var(--accent); box-shadow:0 0 8px var(--accent); }
    h1 {
        font-size: clamp(32px, 5vw, 52px); font-weight: 800;
        letter-spacing: -0.03em; line-height: 1.05; margin-bottom: 14px;
        background: linear-gradient(135deg, #fff 0%, #c4b5fd 50%, #f9a8d4 100%);
        -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;
    }
    .subtitle { font-size: 17px; color: var(--text-dim); max-width: 620px; margin: 0 auto 24px; }

    .composer {
        background: var(--bg-elev); border: 1px solid var(--border);
        border-radius: 20px; padding: 8px;
        box-shadow: 0 20px 60px -20px rgba(0,0,0,0.5);
        position: relative;
    }
    .composer:focus-within { border-color: rgba(139,92,246,0.4); box-shadow: 0 0 0 4px rgba(139,92,246,0.12), 0 20px 60px -20px rgba(0,0,0,0.5); }
    .composer textarea {
        width: 100%; min-height: 120px; max-height: 280px;
        background: transparent; border: none; resize: none;
        padding: 18px 20px; color: var(--text);
        font-family: inherit; font-size: 16px; line-height: 1.6;
    }
    .composer textarea:focus { outline: none; }
    .composer textarea::placeholder { color: var(--text-mute); }
    .composer-bar {
        display: flex; justify-content: space-between; align-items: center;
        padding: 8px 12px 8px 20px; gap: 12px; flex-wrap: wrap;
    }
    .composer-hint { font-size: 12px; color: var(--text-mute); display: flex; gap: 6px; align-items: center; }
    .kbd {
        font-family: 'JetBrains Mono', monospace; font-size: 11px;
        padding: 2px 6px; background: var(--bg); border: 1px solid var(--border);
        border-radius: 5px; color: var(--text-dim);
    }
    .btn {
        padding: 10px 18px; background: var(--bg-card);
        border: 1px solid var(--border); border-radius: 10px;
        color: var(--text); font-family: inherit; font-size: 14px; font-weight: 500;
        cursor: pointer; transition: all 0.15s;
        display: inline-flex; align-items: center; gap: 8px;
    }
    .btn:hover:not(:disabled) { border-color: var(--border-hover); }
    .btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .btn-primary {
        background: linear-gradient(135deg, var(--accent), var(--accent-2));
        border-color: transparent; color: white;
    }
    .btn-primary:hover:not(:disabled) { box-shadow: var(--shadow); transform: translateY(-1px); }
    .btn-success { background: var(--success); border-color: var(--success); color: white; }
    .btn-ghost { background: transparent; }

    .examples { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 16px; justify-content: center; }
    .example-chip {
        padding: 6px 12px; background: var(--bg-card); border: 1px solid var(--border);
        border-radius: 999px; font-size: 12px; color: var(--text-dim);
        cursor: pointer; transition: all 0.15s;
    }
    .example-chip:hover { color: var(--text); border-color: rgba(139,92,246,0.4); background: rgba(139,92,246,0.08); }

    .stage { padding: 40px 0 80px; }
    .step {
        background: var(--bg-card); border: 1px solid var(--border);
        border-radius: 16px; padding: 24px; margin-bottom: 20px;
        backdrop-filter: blur(10px);
        animation: fadeUp 0.4s cubic-bezier(0.4,0,0.2,1);
    }
    @keyframes fadeUp { from{opacity:0; transform:translateY(12px);} to{opacity:1; transform:translateY(0);} }
    .step-head { display: flex; align-items: center; gap: 12px; margin-bottom: 18px; }
    .step-num {
        width: 28px; height: 28px; border-radius: 50%;
        background: linear-gradient(135deg, var(--accent), var(--accent-2));
        display: flex; align-items: center; justify-content: center;
        font-weight: 700; font-size: 13px; color: white;
        box-shadow: 0 4px 12px rgba(139,92,246,0.3);
    }
    .step-title { font-size: 17px; font-weight: 600; letter-spacing: -0.01em; }
    .step-sub { font-size: 13px; color: var(--text-mute); margin-left: auto; }

    .skill-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px; }
    .skill-pick {
        background: var(--bg-elev); border: 1px solid var(--border);
        border-radius: 12px; padding: 14px; cursor: pointer;
        transition: all 0.15s; position: relative;
    }
    .skill-pick:hover { border-color: var(--border-hover); }
    .skill-pick.selected {
        border-color: var(--accent); background: rgba(139,92,246,0.08);
        box-shadow: 0 0 0 1px var(--accent);
    }
    .skill-pick-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; margin-bottom: 6px; }
    .skill-pick-name { font-size: 14px; font-weight: 600; }
    .skill-pick-cat {
        font-size: 10px; font-weight: 600; padding: 3px 7px; border-radius: 5px;
        text-transform: uppercase; letter-spacing: 0.05em; white-space: nowrap;
    }
    .cat-CRO{background:rgba(139,92,246,0.15);color:#c4b5fd}.cat-Content{background:rgba(236,72,153,0.15);color:#f9a8d4}
    .cat-SEO{background:rgba(6,182,212,0.15);color:#67e8f9}.cat-Paid{background:rgba(245,158,11,0.15);color:#fcd34d}
    .cat-Measurement{background:rgba(16,185,129,0.15);color:#6ee7b7}.cat-Retention{background:rgba(239,68,68,0.15);color:#fca5a5}
    .cat-Growth{background:rgba(34,197,94,0.15);color:#86efac}.cat-Sales{background:rgba(99,102,241,0.15);color:#a5b4fc}
    .cat-Strategy{background:rgba(168,85,247,0.15);color:#d8b4fe}.cat-Other{background:rgba(161,161,170,0.15);color:#d4d4d8}
    .skill-pick-desc {
        font-size: 12px; color: var(--text-dim); line-height: 1.5;
        display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
    }
    .skill-pick-foot { display: flex; justify-content: space-between; align-items: center; margin-top: 10px; }
    .skill-pick-score {
        font-size: 10px; font-family: 'JetBrains Mono', monospace;
        color: var(--text-mute); padding: 2px 6px; background: var(--bg);
        border-radius: 4px; border: 1px solid var(--border);
    }
    .check {
        width: 18px; height: 18px; border-radius: 6px;
        border: 1.5px solid var(--border); display: flex; align-items: center; justify-content: center;
        flex-shrink: 0; transition: all 0.15s;
    }
    .skill-pick.selected .check { background: var(--accent); border-color: var(--accent); }
    .skill-pick.selected .check svg { opacity: 1; }
    .check svg { opacity: 0; color: white; transition: opacity 0.15s; }

    .actions-row { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 8px; }

    .prompt-preview {
        background: #06060b; border: 1px solid var(--border); border-radius: 10px;
        padding: 16px; max-height: 320px; overflow: auto;
        font-family: 'JetBrains Mono', monospace; font-size: 12px;
        color: var(--text-dim); white-space: pre-wrap; line-height: 1.55;
    }
    .prompt-preview::-webkit-scrollbar { width: 6px; }
    .prompt-preview::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }

    .output {
        background: var(--bg-elev); border: 1px solid var(--border); border-radius: 10px;
        padding: 20px; min-height: 80px;
        font-size: 14px; line-height: 1.7;
    }
    .output h1, .output h2, .output h3 { margin: 18px 0 10px; letter-spacing: -0.01em; }
    .output h1 { font-size: 20px; } .output h2 { font-size: 17px; color: #c4b5fd; } .output h3 { font-size: 14px; }
    .output p { margin-bottom: 12px; color: var(--text-dim); }
    .output ul, .output ol { margin: 10px 0 10px 22px; color: var(--text-dim); }
    .output li { margin-bottom: 4px; }
    .output code { background: var(--bg); padding: 2px 5px; border-radius: 4px; font-family: 'JetBrains Mono', monospace; font-size: 12px; color: #f9a8d4; border: 1px solid var(--border); }
    .output pre { background: var(--bg); padding: 12px; border-radius: 8px; overflow-x: auto; margin: 12px 0; border: 1px solid var(--border); }
    .output pre code { background: none; border: none; padding: 0; color: var(--text); }
    .output strong { color: var(--text); }
    .output hr { border: none; border-top: 1px solid var(--border); margin: 16px 0; }
    .output blockquote { border-left: 3px solid var(--accent); padding-left: 14px; margin: 12px 0; color: var(--text-dim); font-style: italic; }

    .spinner {
        display: inline-block; width: 14px; height: 14px;
        border: 2px solid currentColor; border-right-color: transparent;
        border-radius: 50%; animation: spin 0.7s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .pulse { animation: pulse 1.5s ease-in-out infinite; }
    @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }

    .empty-skills { text-align: center; padding: 32px; color: var(--text-mute); font-size: 14px; }

    /* Modal */
    .modal-bg {
        position: fixed; inset: 0; background: rgba(0,0,0,0.7);
        backdrop-filter: blur(8px); z-index: 100;
        display: none; align-items: center; justify-content: center; padding: 20px;
    }
    .modal-bg.open { display: flex; }
    .modal {
        background: var(--bg-elev); border: 1px solid var(--border);
        border-radius: 16px; max-width: 520px; width: 100%;
        padding: 28px;
        box-shadow: 0 40px 80px -20px rgba(0,0,0,0.6);
        animation: fadeUp 0.25s cubic-bezier(0.4,0,0.2,1);
    }
    .modal h3 { font-size: 20px; margin-bottom: 8px; }
    .modal p { font-size: 13px; color: var(--text-dim); margin-bottom: 18px; }
    .field { margin-bottom: 14px; }
    .field label { display: block; font-size: 12px; font-weight: 600; color: var(--text-dim); margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.06em; }
    .field input, .field select {
        width: 100%; height: 42px; padding: 0 14px;
        background: var(--bg); border: 1px solid var(--border); border-radius: 9px;
        color: var(--text); font-family: inherit; font-size: 14px;
    }
    .field input:focus, .field select:focus { outline: none; border-color: var(--accent); }
    .field-hint { font-size: 11px; color: var(--text-mute); margin-top: 6px; }
    .modal-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px; }

    .toast {
        position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
        background: var(--success); color: white; padding: 12px 20px;
        border-radius: 10px; font-size: 14px; font-weight: 500;
        box-shadow: 0 10px 30px rgba(0,0,0,0.4);
        z-index: 200; animation: fadeUp 0.25s;
    }
    .toast.error { background: var(--danger); }

    /* History drawer */
    .drawer-bg {
        position: fixed; inset: 0; background: rgba(0,0,0,0.5);
        backdrop-filter: blur(4px); z-index: 90;
        opacity: 0; pointer-events: none; transition: opacity 0.2s;
    }
    .drawer-bg.open { opacity: 1; pointer-events: auto; }
    .drawer {
        position: fixed; top: 0; right: 0; bottom: 0;
        width: 380px; max-width: 100vw;
        background: var(--bg-elev); border-left: 1px solid var(--border);
        z-index: 91; transform: translateX(100%);
        transition: transform 0.3s cubic-bezier(0.4,0,0.2,1);
        display: flex; flex-direction: column;
    }
    .drawer.open { transform: translateX(0); }
    .drawer-head {
        padding: 20px 22px; border-bottom: 1px solid var(--border);
        display: flex; justify-content: space-between; align-items: center;
    }
    .drawer-head h3 { font-size: 16px; font-weight: 700; }
    .drawer-list { flex: 1; overflow-y: auto; padding: 12px; }
    .drawer-list::-webkit-scrollbar { width: 6px; }
    .drawer-list::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }
    .hist-item {
        background: var(--bg-card); border: 1px solid var(--border);
        border-radius: 10px; padding: 12px 14px; margin-bottom: 8px;
        cursor: pointer; transition: all 0.15s;
        position: relative;
    }
    .hist-item:hover { border-color: var(--border-hover); background: rgba(255,255,255,0.04); }
    .hist-task {
        font-size: 13px; color: var(--text); line-height: 1.4;
        display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
        margin-bottom: 8px;
    }
    .hist-meta { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
    .hist-time { font-size: 11px; color: var(--text-mute); font-family: 'JetBrains Mono', monospace; }
    .hist-skills { font-size: 10px; color: var(--text-dim); }
    .hist-del {
        position: absolute; top: 8px; right: 8px;
        width: 22px; height: 22px; border-radius: 6px;
        background: transparent; border: none; cursor: pointer;
        color: var(--text-mute); opacity: 0;
        display: flex; align-items: center; justify-content: center;
        transition: all 0.15s;
    }
    .hist-item:hover .hist-del { opacity: 1; }
    .hist-del:hover { background: rgba(239,68,68,0.15); color: #fca5a5; }
    .drawer-empty { padding: 60px 20px; text-align: center; color: var(--text-mute); font-size: 13px; }

    .btn-auto {
        background: linear-gradient(135deg, var(--accent-3), var(--accent));
        border-color: transparent; color: white;
    }
    .btn-auto:hover:not(:disabled) { box-shadow: 0 10px 30px -10px rgba(6,182,212,0.5); transform: translateY(-1px); }

    .stream-cursor {
        display: inline-block; width: 8px; height: 16px;
        background: var(--accent); margin-left: 2px; vertical-align: text-bottom;
        animation: blink 1s step-end infinite;
    }
    @keyframes blink { 50% { opacity: 0; } }

    @media (max-width: 640px) {
        .container { padding: 0 18px; }
        header { padding: 28px 0 20px; }
        .skill-grid { grid-template-columns: 1fr; }
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
            <a href="orchestrator.php" class="nav-link active">Orquestador</a>
            <a href="index.php" class="nav-link">Explorar skills</a>
            <button class="icon-btn" id="historyBtn" title="Historial">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/></svg>
            </button>
            <button class="icon-btn" id="settingsBtn" title="Configurar API key">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
            </button>
        </div>
    </nav>

    <header>
        <span class="badge">Orquestador IA</span>
        <h1>Describe lo que quieres,<br>te lo orquesto.</h1>
        <p class="subtitle">El orquestador analiza tu tarea, elige las skills correctas, arma un plan y te entrega el resultado listo para usar.</p>
    </header>

    <div class="composer">
        <textarea id="taskInput" placeholder="Ej: Quiero rediseñar la home de mi SaaS de facturación electrónica para que convierta más, además necesito copy nuevo, una secuencia de bienvenida y mejorar el SEO técnico de la página."></textarea>
        <div class="composer-bar">
            <div class="composer-hint">
                <span class="kbd">Ctrl</span> + <span class="kbd">Enter</span> para analizar
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap">
                <button class="btn" id="analyzeBtn">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.582a.5.5 0 0 1 0 .962L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/></svg>
                    Analizar
                </button>
                <button class="btn btn-auto" id="autoBtn" title="Detecta skills, arma prompt y ejecuta — todo en un click">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                    Auto-ejecutar
                </button>
            </div>
        </div>
    </div>

    <div class="examples">
        <span class="example-chip" data-ex="Mi landing page de un SaaS B2B no convierte. Tengo 5% de CR y quiero llegar al 10%. Audita el copy y dame recomendaciones priorizadas.">Auditar landing B2B</span>
        <span class="example-chip" data-ex="Necesito una secuencia de bienvenida de 5 emails para usuarios que se registran al trial de mi app de productividad.">Secuencia de onboarding</span>
        <span class="example-chip" data-ex="Quiero lanzar campañas en Google Ads y Meta para mi nuevo plan Pro. Dame estrategia, copy de anuncios y plan de medición.">Plan paid + creatives</span>
        <span class="example-chip" data-ex="Mi competencia me está ganando en SEO. Necesito un audit técnico, plan de contenido y páginas de comparación vs ellos.">SEO + competencia</span>
    </div>

    <div class="stage" id="stage"></div>
</div>

<div class="drawer-bg" id="drawerBg"></div>
<div class="drawer" id="historyDrawer">
    <div class="drawer-head">
        <h3>Historial</h3>
        <div style="display:flex;gap:6px">
            <button class="icon-btn" id="clearHistoryBtn" title="Borrar todo">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
            <button class="icon-btn" id="closeDrawerBtn" title="Cerrar">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
            </button>
        </div>
    </div>
    <div class="drawer-list" id="historyList"></div>
</div>

<div class="modal-bg" id="settingsModal">
    <div class="modal">
        <h3>Configurar proveedor de IA</h3>
        <p>Elige tu proveedor y pega tu API key. Cada key se guarda en tu navegador (localStorage). Puedes alternar entre proveedores sin perder las keys.</p>
        <div class="field">
            <label>Proveedor</label>
            <select id="providerSelect"></select>
        </div>
        <div class="field" id="customUrlField" style="display:none">
            <label>Endpoint URL (compatible OpenAI)</label>
            <input type="text" id="customUrl" placeholder="http://localhost:11434/v1/chat/completions">
            <div class="field-hint">Ej: Ollama, LocalAI, vLLM, LM Studio.</div>
        </div>
        <div class="field">
            <label>API Key <span id="keyHelpLink" style="float:right;font-weight:400;text-transform:none;letter-spacing:0"></span></label>
            <input type="password" id="apiKey" placeholder="sk-...">
            <div class="field-hint" id="keyHint">Tu key se guarda solo en tu navegador.</div>
        </div>
        <div class="field">
            <label>Modelo</label>
            <select id="modelSelect"></select>
            <input type="text" id="customModel" placeholder="ID del modelo (ej: llama3.1)" style="display:none;margin-top:6px">
        </div>
        <div class="modal-actions">
            <button class="btn btn-ghost" id="clearKeyBtn">Borrar key</button>
            <button class="btn btn-ghost" id="cancelSettingsBtn">Cancelar</button>
            <button class="btn btn-primary" id="saveSettingsBtn">Guardar</button>
        </div>
    </div>
</div>

<script>
window.PROVIDERS = <?= json_encode($PROVIDERS) ?>;
</script>

<script>
    const taskInput = document.getElementById('taskInput');
    const analyzeBtn = document.getElementById('analyzeBtn');
    const autoBtn = document.getElementById('autoBtn');
    const stage = document.getElementById('stage');
    let matchedSkills = [];
    let selectedSlugs = new Set();
    let currentPrompt = '';
    let currentRunController = null;

    document.querySelectorAll('.example-chip').forEach(c => {
        c.addEventListener('click', () => { taskInput.value = c.dataset.ex; taskInput.focus(); });
    });
    taskInput.addEventListener('keydown', e => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') analyze();
    });
    analyzeBtn.addEventListener('click', () => analyze());
    autoBtn.addEventListener('click', () => analyze(true));

    function escapeHtml(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

    function toast(msg, type = 'ok') {
        const t = document.createElement('div');
        t.className = 'toast' + (type === 'error' ? ' error' : '');
        t.textContent = msg;
        document.body.appendChild(t);
        setTimeout(() => t.remove(), 2200);
    }

    async function analyze(autoRun = false) {
        const task = taskInput.value.trim();
        if (!task) { taskInput.focus(); return; }
        const triggerBtn = autoRun ? autoBtn : analyzeBtn;
        const origLabel = triggerBtn.innerHTML;
        triggerBtn.disabled = true;
        triggerBtn.innerHTML = '<span class="spinner"></span> ' + (autoRun ? 'Orquestando...' : 'Analizando...');
        stage.innerHTML = '';

        try {
            const res = await fetch('?action=analyze', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ task }),
            });
            const data = await res.json();
            if (data.error) throw new Error(data.error);
            matchedSkills = data.skills || [];
            selectedSlugs = new Set(matchedSkills.slice(0, Math.min(4, matchedSkills.length)).map(s => s.slug));
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
                    <div class="empty-skills">No detecté skills relacionadas. Reformula la tarea con más detalle o usa el <a href="index.php" style="color:var(--accent-3)">explorador</a> para elegir manualmente.</div>
                </div>`;
            return;
        }
        const cards = matchedSkills.map(s => `
            <div class="skill-pick ${selectedSlugs.has(s.slug) ? 'selected' : ''}" data-slug="${s.slug}">
                <div class="skill-pick-head">
                    <span class="skill-pick-name">${escapeHtml(s.name)}</span>
                    <span class="skill-pick-cat cat-${s.category}">${s.category}</span>
                </div>
                <div class="skill-pick-desc">${escapeHtml(s.description)}</div>
                <div class="skill-pick-foot">
                    <span class="skill-pick-score">match: ${s.score}</span>
                    <div class="check"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg></div>
                </div>
            </div>
        `).join('');
        stage.innerHTML = `
            <div class="step">
                <div class="step-head">
                    <div class="step-num">1</div>
                    <div class="step-title">Skills detectadas</div>
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
                <div class="output" id="resultOutput"></div>
                <div class="actions-row" style="margin-top:14px">
                    <button class="btn" id="copyResultBtn" style="display:none">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
                        Copiar resultado
                    </button>
                </div>
            </div>
        `;

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
            const res = await fetch('?action=build', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ task: taskInput.value.trim(), slugs: Array.from(selectedSlugs) }),
            });
            const data = await res.json();
            currentPrompt = data.prompt;
            document.getElementById('tokenEst').textContent = '~' + data.tokens_estimate.toLocaleString() + ' tokens';
            area.innerHTML = '<div style="font-size:13px;color:var(--text-mute)">Prompt listo · ' + currentPrompt.length.toLocaleString() + ' caracteres</div>';
            actions.style.display = 'flex';
            updateProviderLabels();
        } catch (e) { toast('Error armando prompt', 'error'); }
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
        const copyResultBtn = document.getElementById('copyResultBtn');

        resultStep.style.display = '';
        resultStep.scrollIntoView({ behavior: 'smooth', block: 'start' });
        output.innerHTML = `<div class="pulse" style="color:var(--text-mute)">Conectando con ${escapeHtml(provName)}...</div>`;
        status.textContent = `${cfg.model} · streaming`;
        runBtn.disabled = true;
        runBtn.innerHTML = '<span class="spinner"></span> Ejecutando...';
        copyResultBtn.style.display = 'none';

        if (currentRunController) currentRunController.abort();
        currentRunController = new AbortController();

        let fullText = '';
        let firstChunk = true;
        const startedAt = Date.now();

        try {
            const res = await fetch('?action=run', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    provider: cfg.provider,
                    apiKey: cfg.apiKey,
                    model: cfg.model,
                    customUrl: cfg.customUrl,
                    prompt: currentPrompt,
                }),
                signal: currentRunController.signal,
            });
            if (!res.ok || !res.body) throw new Error('HTTP ' + res.status);

            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let buf = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buf += decoder.decode(value, { stream: true });
                let idx;
                while ((idx = buf.indexOf('\n\n')) !== -1) {
                    const chunk = buf.slice(0, idx);
                    buf = buf.slice(idx + 2);
                    let event = 'message', data = '';
                    for (const line of chunk.split('\n')) {
                        if (line.startsWith('event:')) event = line.slice(6).trim();
                        else if (line.startsWith('data:')) data += line.slice(5).trim();
                    }
                    if (!data) continue;
                    let parsed;
                    try { parsed = JSON.parse(data); } catch { continue; }
                    if (event === 'delta' && parsed.text) {
                        if (firstChunk) { output.innerHTML = ''; firstChunk = false; }
                        fullText += parsed.text;
                        output.innerHTML = mdToHtml(fullText) + '<span class="stream-cursor"></span>';
                    } else if (event === 'error') {
                        throw new Error(parsed.message || 'Error de API');
                    } else if (event === 'done') {
                        // finished cleanly
                    }
                }
            }
            output.innerHTML = mdToHtml(fullText);
            output.dataset.raw = fullText;
            copyResultBtn.style.display = '';
            const secs = ((Date.now() - startedAt) / 1000).toFixed(1);
            status.textContent = `✓ ${secs}s · ${cfg.model}`;
            saveToHistory({ task: taskInput.value.trim(), slugs: Array.from(selectedSlugs), prompt: currentPrompt, result: fullText, model: `${provName} · ${cfg.model}` });
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
    });

    function mdToHtml(md) {
        const escape = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
        const blocks = [];
        md = md.replace(/```([a-z]*)\n([\s\S]*?)```/g, (_, lang, code) => {
            blocks.push(`<pre><code>${escape(code)}</code></pre>`);
            return ` ${blocks.length - 1} `;
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
        return out.join('\n').replace(/ (\d+) /g, (_, i) => blocks[+i]);
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
            `<option value="${key}">${p.name}</option>`
        ).join('');
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
            ? 'Para servidores locales (Ollama, LM Studio) puedes dejar la API key vacía.'
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

    settingsBtn.addEventListener('click', openSettings);
    document.getElementById('cancelSettingsBtn').addEventListener('click', () => settingsModal.classList.remove('open'));
    document.getElementById('saveSettingsBtn').addEventListener('click', () => {
        const provider = providerSelect.value;
        const apiKey = apiKeyInput.value.trim();
        let model = modelSelect.value === '__custom__' || modelSelect.style.display === 'none'
            ? customModelInput.value.trim()
            : modelSelect.value;
        if (!model) { toast('Falta el modelo', 'error'); return; }
        if (provider === 'custom' && !customUrlInput.value.trim()) { toast('Falta la URL del endpoint', 'error'); return; }

        localStorage.setItem('llm_provider', provider);
        if (apiKey) localStorage.setItem('llm_apikey_' + provider, apiKey);
        localStorage.setItem('llm_model_' + provider, model);
        if (provider === 'custom') localStorage.setItem('llm_custom_url', customUrlInput.value.trim());

        settingsModal.classList.remove('open');
        toast(`Guardado: ${PROVIDERS[provider].name}`);
        refreshKeyState();
    });
    document.getElementById('clearKeyBtn').addEventListener('click', () => {
        const provider = providerSelect.value;
        localStorage.removeItem('llm_apikey_' + provider);
        apiKeyInput.value = '';
        toast(`API key de ${PROVIDERS[provider].name} borrada`);
        refreshKeyState();
    });

    /* Migración desde versión anterior solo Anthropic */
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
    refreshKeyState();

    /* History */
    const HISTORY_KEY = 'orch_history_v1';
    const HISTORY_MAX = 30;
    const historyBtn = document.getElementById('historyBtn');
    const drawerBg = document.getElementById('drawerBg');
    const historyDrawer = document.getElementById('historyDrawer');
    const historyList = document.getElementById('historyList');

    function getHistory() {
        try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); } catch { return []; }
    }
    function setHistory(arr) { localStorage.setItem(HISTORY_KEY, JSON.stringify(arr.slice(0, HISTORY_MAX))); }
    function saveToHistory(entry) {
        const arr = getHistory();
        arr.unshift({ id: Date.now() + '-' + Math.random().toString(36).slice(2, 7), ts: Date.now(), ...entry });
        setHistory(arr);
    }
    function fmtTime(ts) {
        const d = new Date(ts), now = Date.now(), diff = (now - ts) / 1000;
        if (diff < 60) return 'hace un momento';
        if (diff < 3600) return `hace ${Math.floor(diff/60)} min`;
        if (diff < 86400) return `hace ${Math.floor(diff/3600)} h`;
        return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
    }
    function renderHistory() {
        const arr = getHistory();
        if (arr.length === 0) {
            historyList.innerHTML = '<div class="drawer-empty">Aún no hay historial. Las tareas que ejecutes aparecerán aquí.</div>';
            return;
        }
        historyList.innerHTML = arr.map(h => `
            <div class="hist-item" data-id="${h.id}">
                <button class="hist-del" data-del="${h.id}" title="Borrar">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
                </button>
                <div class="hist-task">${escapeHtml(h.task)}</div>
                <div class="hist-meta">
                    <span class="hist-time">${fmtTime(h.ts)}</span>
                    <span class="hist-skills">${(h.slugs || []).length} skills · ${escapeHtml(h.model || '')}</span>
                </div>
            </div>
        `).join('');
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
        localStorage.removeItem(HISTORY_KEY);
        renderHistory();
        toast('Historial borrado');
    });
    historyList.addEventListener('click', e => {
        const delBtn = e.target.closest('[data-del]');
        if (delBtn) {
            e.stopPropagation();
            const id = delBtn.dataset.del;
            setHistory(getHistory().filter(h => h.id !== id));
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
        currentPrompt = entry.prompt;
        selectedSlugs = new Set(entry.slugs || []);
        matchedSkills = (entry.slugs || []).map(slug => ({
            slug, name: slug, category: 'Other', description: '(restaurada del historial)', score: 0
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
            </div>
        `;
        document.getElementById('rerunBtn').addEventListener('click', runWithClaude);
        document.getElementById('copyHistBtn').addEventListener('click', () => {
            navigator.clipboard.writeText(entry.prompt);
            toast('Prompt copiado');
        });
    }
</script>
</body>
</html>
