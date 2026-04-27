# Marketing Agent

Hub estático en JavaScript que convierte el repositorio [`marketingskills`](marketingskills/) (40 skills de marketing en formato Markdown) en una aplicación visual con dos modos de uso:

1. **Explorador de Skills** ([index.html](index.html)) — busca, filtra por categoría y consulta cualquier skill como prompt listo para pegar en tu IA favorita.
2. **Orquestador** ([orchestrator.html](orchestrator.html)) — describes una tarea de marketing y un LLM (Claude, GPT, DeepSeek, Groq, OpenRouter o cualquier endpoint compatible con OpenAI) selecciona automáticamente las skills correctas, las combina con el contexto que aportes (URL, copy, archivos, capturas) y ejecuta la tarea con streaming en tiempo real.

> **100% estático.** Sin PHP, sin servidor backend. Sirve la carpeta desde GitHub Pages, Netlify, Vercel, Cloudflare Pages, Laragon, `npx serve`, o cualquier CDN. Las API keys nunca pasan por un servidor intermedio: viven en `localStorage` y van directo del navegador al proveedor.

---

## Capturas

> Las imágenes se cargan desde `docs/screenshots/`.

### 1. Explorador de Skills
![Explorador de skills](docs/screenshots/01-hub-explorer.png)

### 2. Modal de detalle de una skill
![Detalle de skill](docs/screenshots/02-skill-modal.png)

### 3. Orquestador — entrada
![Orquestador entrada](docs/screenshots/03-orchestrator-input.png)

### 4. Smart match — selección automática de skills
![Smart match](docs/screenshots/04-smart-match.png)

### 5. Ejecución con streaming
![Streaming](docs/screenshots/05-streaming-output.png)

---

## Arquitectura

```
Marketing/
├── index.html                  # Hub explorador
├── orchestrator.html           # Orquestador IA
├── assets/
│   ├── skills-loader.js        # tokenize + scoreSkills + loadSkills
│   ├── md.js                   # parser Markdown ligero
│   ├── providers.js            # tabla de proveedores (Anthropic / OpenAI / DeepSeek / Groq / OpenRouter / custom)
│   ├── url-fetcher.js          # extracción de URLs vía Jina Reader (r.jina.ai)
│   ├── prompt-builder.js       # ensamble del prompt orquestador
│   ├── llm-client.js           # smartMatch + runStream (SSE en el navegador)
│   ├── history.js              # historial localStorage
│   ├── app-explorer.js         # bootstrap de index.html
│   └── app-orchestrator.js     # bootstrap de orchestrator.html
├── data/
│   └── skills.json             # generado por scripts/build-skills.mjs
├── scripts/
│   └── build-skills.mjs        # genera data/skills.json desde marketingskills/skills/
├── .github/workflows/
│   └── deploy-pages.yml        # regenera skills.json y publica a GitHub Pages
├── marketingskills/            # submódulo git con las 40 skills (fuente de verdad)
└── package.json
```

**Flujo del orquestador:**

```
Tarea del usuario
       │
       ▼
  Smart match  ──►  llm-client.smartMatch — el LLM elige 2–5 skills relevantes
       │
       ▼
  Contexto    ──►  url-fetcher (Jina Reader) extrae landing como markdown
                    + texto pegado + archivos (.txt/.md/.csv/.json/...) + imágenes base64
       │
       ▼
  Build prompt ──►  prompt-builder.buildPrompt — rol "Marketing Orchestrator" + cuerpo
                    de cada skill + contexto + tarea, con regla anti-placeholders
       │
       ▼
  Run (SSE)   ──►  llm-client.runStream — fetch directo al provider, parseo SSE en
                   el browser (Anthropic content_block_delta | OpenAI delta.content)
```

---

## Características

- **40 skills** indexadas y categorizadas automáticamente (mapeo `slug → categoría` en [scripts/build-skills.mjs](scripts/build-skills.mjs)).
- **Buscador** con tokenización en español + inglés y stopwords filtrados ([assets/skills-loader.js](assets/skills-loader.js)).
- **Smart match** con LLM como router (entre 2 y 5 skills, no más).
- **Multi-proveedor:** Anthropic, OpenAI, DeepSeek, Groq, OpenRouter y cualquier endpoint *OpenAI-compatible* (Ollama, LM Studio, vLLM, etc.) vía la opción `Custom`.
- **Streaming nativo** vía Server-Sent Events parseados en el navegador con `ReadableStream`.
- **Visión multimodal:** sube capturas y se envían como `image/base64` (Anthropic) o `image_url` (OpenAI-compatible).
- **Extracción de páginas web vía [Jina Reader](https://r.jina.ai/)**: gratis, sin auth, devuelve markdown limpio. Si falla, basta con pegar el contenido manualmente en el campo de texto.
- **Regla anti-alucinación:** si la tarea menciona un asset concreto (landing, email, anuncio…) y no se aportó material real, el orquestador devuelve solo una pregunta pidiendo el material en lugar de inventar ejemplos genéricos.
- **API keys nunca tocan un servidor:** se guardan en `localStorage` del navegador y se envían directo al provider en cada request.

---

## Requisitos

- Node.js ≥ 20 (solo para `scripts/build-skills.mjs`; en runtime no se necesita Node).
- Git con soporte de submódulos.
- API key de al menos un proveedor de IA si vas a usar el orquestador.

## Instalación

```bash
git clone --recurse-submodules <url-del-repo> Marketing
cd Marketing
```

Si ya clonaste sin `--recurse-submodules`:

```bash
git submodule update --init --recursive
```

Genera el catálogo y arranca un servidor estático:

```bash
node scripts/build-skills.mjs   # crea data/skills.json (40 skills)
npm run dev                     # levanta http://localhost:3000 con `npx serve`
```

Alternativas para servir:

```bash
python3 -m http.server 8000     # http://localhost:8000/
php -S localhost:8000            # también funciona, ya no necesita PHP en runtime
```

O simplemente coloca la carpeta en Laragon/XAMPP y abre `http://localhost/Marketing/`.

## Despliegue en GitHub Pages

1. Habilita Pages en Settings → Pages → Source: **GitHub Actions**.
2. Push a `main`. El workflow [.github/workflows/deploy-pages.yml](.github/workflows/deploy-pages.yml) hace checkout con submódulos, regenera `data/skills.json`, y publica todo el sitio.
3. La URL queda en `https://<usuario>.github.io/<repo>/`.

> El workflow regenera `skills.json` en cada deploy, así que no hace falta commitearlo (está en [.gitignore](.gitignore)). Si quieres versionarlo de todos modos, quita la línea `data/skills.json` del gitignore.

## Uso

### Explorador
1. Abre `index.html`.
2. Filtra por categoría o busca por palabra clave.
3. Clic en una card → leer la skill → **Copiar como prompt** → pegar en Claude/ChatGPT/etc.

### Orquestador
1. Abre `orchestrator.html` y haz clic en el ícono de llave para configurar proveedor, modelo y API key.
2. Describe tu tarea (ej.: *"audita el copy de mi landing https://miapp.com y reescribe la sección hero"*).
3. (Opcional) Aporta contexto en el panel "Adjuntar contexto":
   - **URL**: se extrae con Jina Reader (markdown limpio, hasta 25 KB).
   - **Texto / copy**: pegado directo.
   - **Archivos**: `.txt`, `.md`, `.csv`, `.json`, `.html`, `.log`, `.xml` hasta 60 KB.
   - **Imágenes**: hasta 5 MB cada una, máximo 6 archivos.
4. Pulsa **Smart match** para que el LLM elija las skills, o **Auto-ejecutar** para hacer todo en un click.
5. La respuesta se transmite en directo en el panel de salida.

---

## Notas de despliegue y CORS

- **Anthropic** requiere el header `anthropic-dangerous-direct-browser-access: true`, que ya manda [assets/providers.js](assets/providers.js).
- **OpenAI / DeepSeek / Groq / OpenRouter** soportan llamadas browser-direct con `Authorization: Bearer ...`.
- **Endpoint custom (Ollama, LM Studio, vLLM)**: tu servidor local debe permitir CORS. En Ollama: `OLLAMA_ORIGINS="*" ollama serve`.
- **Jina Reader** (`https://r.jina.ai/`) tiene rate limit razonable sin API key (~20 RPM). Si te bloquea, pega el contenido en el campo de texto.

---

## Créditos

- Skills originales: [`coreyhaines31/marketingskills`](marketingskills/) por Corey Haines.
- Hub estático, orquestador, smart match y vista UI: este repositorio.
