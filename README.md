# Marketing Agent

Hub estático en JavaScript que convierte el repositorio [`marketingskills`](marketingskills/) (40 skills de marketing en formato Markdown) en una aplicación visual con dos modos de uso:

1. **Explorador de Skills** ([index.html](index.html)) — busca, filtra por categoría y consulta cualquier skill como prompt listo para pegar en tu IA favorita.
2. **Orquestador** ([orchestrator.html](orchestrator.html)) — describes una tarea de marketing y un LLM (Claude, GPT, DeepSeek, Groq, OpenRouter o cualquier endpoint compatible con OpenAI) selecciona automáticamente las skills correctas, las combina con el contexto que aportes (URL, copy, archivos, capturas) y ejecuta la tarea con streaming en tiempo real. Incluye **generación de imágenes** (OpenAI, Google Imagen) cuando la tarea lo requiere.

> **100% estático.** Sin PHP, sin servidor backend. Sirve la carpeta desde GitHub Pages, Netlify, Vercel, Cloudflare Pages, Laragon, `npx serve`, o cualquier CDN. Las API keys nunca pasan por un servidor intermedio: viven en `localStorage` y van directo del navegador al proveedor.

---

## v5 — Sistema de Suscripciones

### Novedades
- **Sistema de usuarios con validación**: usuarios deben ser validados por un admin antes de usar
- **Planes**: Free (10 requests/día), Pro (100), Enterprise (ilimitado)
- **Dashboard de admin**: panel para validar usuarios, gestionar planes
- **Login obligatorio**: antes de usar el orquestador

### Archivos nuevos
- `login.html` — Pantalla de login/registro
- `admin.html` — Dashboard de administrador
- `assets/supabase-client.js` — Cliente Supabase con funciones de suscripciones

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
├── login.html                 # Login/registro (v5)
├── admin.html                # Dashboard admin (v5)
├── orchestrator.html         # Orquestador IA
├── assets/
│   ├── skills-loader.js     # tokenize + scoreSkills + loadSkills
│   ├── md.js              # parser Markdown ligero
│   ├── providers.js        # tabla de proveedores LLM
│   ├── image-providers.js  # tabla de proveedores de imagen
│   ├── url-fetcher.js     # extracción de URLs vía Jina Reader
│   ├── prompt-builder.js  # ensamble del prompt orquestador
│   ├── llm-client.js     # smartMatch + runStream
│   ├── image-client.js    # generateImage + makeThumbnail
│   ├── history.js        # historial (local + cloud)
│   ├── supabase-client.js # Cliente Supabase (v5)
│   ├── app-explorer.js   # bootstrap de index.html
│   └── app-orchestrator.js # bootstrap de orchestrator.html
├── data/
│   └── skills.json      # generado por scripts/build-skills.mjs
├── scripts/
│   └── build-skills.mjs # genera data/skills.json
├── .github/workflows/
│   └── deploy-pages.yml
├── marketingskills/        # submódulo git con las 40 skills
└── package.json
```

### Flujo del orquestador

```
Tarea del usuario
       │
       ▼
  Smart match  ──►  llm-client.smartMatch — el LLM elige 2��5 skills relevantes
                    + razón textual visible en cada card
       │
       ▼
  Contexto    ──►  url-fetcher (Jina Reader) extrae landing como markdown
                    + texto pegado + archivos + imágenes base64
                    + paste directo de capturas (Ctrl+V)
       │
       ▼
  Build prompt ──►  prompt-builder.buildPrompt — rol "Marketing Orchestrator"
                    con dos variantes (ROLE_WITH_CONTEXT / ROLE_NO_CONTEXT) +
                    cuerpo de cada skill + contexto + tarea
       │
       ▼
  Verificar suscripción ──►  checkSubscription + checkAndIncrementUsage
                    + verificar plan y límites
       │
       ▼
  Run (SSE)   ──►  llm-client.runStream — fetch directo al provider
       │
       ▼
  Imágenes    ──►  image-client.generateImage
       │
       ▼
  Historial   ──►  history.js — guarda en localStorage o Supabase
```

---

## Características

### Sistema de Usuarios y Suscripciones (v5)

| Feature | Descripción |
|---------|-----------|
| **Login/Registro** | `login.html` con email + password |
| **Validación** | Admin debe validar usuarios nuevos |
| **Planes** | Free (10/día), Pro (100), Enterprise (ilimitado) |
| **Dashboard Admin** | `admin.html` para gestionar usuarios |
| **API Keys propias** | Cada usuario puede guardar sus propias API keys |

### Roles

| Rol | Permisos |
|-----|---------|
| **Admin** | Valida usuarios, ve dashboard, cambia planes |
| **Usuario validado** | Acceso según plan |
| **Usuario pendiente** | No puede usar hasta validar |

### Límites por Plan

| Plan | Requests/día |
|------|-------------|
| Free | 10 |
| Pro | 100 |
| Enterprise | ilimitado |

### Skills y descubrimiento
- **40 skills** indexadas y categorizadas automáticamente.
- **Buscador** con tokenización en español + inglés.
- **Smart match** con LLM como router.

### Proveedores de IA
- **Multi-proveedor para texto:** Anthropic, OpenAI, DeepSeek, Groq, OpenRouter, Custom.
- **Multi-proveedor para imágenes:** OpenAI (`gpt-image-1`, `dall-e-3`), Google Imagen.
- **Streaming nativo** vía SSE.

### Contexto y multimodalidad
- **Visión multimodal:** sube capturas.
- **Paste directo** con `Ctrl+V`.
- **Extracción de URLs** vía Jina Reader.
- **Archivos**: `.txt`, `.md`, `.csv`, `.json`, etc.

### Productividad
- **Auto-ejecutar**: smart match → prompt → streaming.
- **Historial** lateral (30 entradas).
- **Nueva consulta**: `Ctrl+K`.
- **Exportar a PDF**: con `html2canvas` + `jsPDF`.

---

## Requisitos

- Node.js ≥ 20 (solo para build scripts).
- Git con soporte de submódulos.
- Proyecto Supabase (para sistema de suscripciones).
- API key de al menos un proveedor de IA.

---

## Instalación

```bash
git clone --recurse-submodules <url-del-repo> Marketing
cd Marketing
```

Si ya clonaste sin submódulos:

```bash
git submodule update --init --recursive
```

### 1. Configurar Supabase

1. Crea un proyecto en [supabase.com](https://supabase.com)
2. Ejecuta el SQL de [`SUPABASE_SQL.md`](SUPABASE_SQL.md) en el SQL Editor
3. Copia **Project URL** y **anon key**

### 2. Configurar en la app

1. Abre `orchestrator.html`
2. Click en **Settings** (ícono ⚙️)
3. Pestaña **Nube**
4. Ingresa URL y anon key
5. Click **Guardar**

### 3. Crear admin

1. Regístrate en `login.html`
2. Ejecuta el SQL para hacer admin (en [SUPABASE_SQL.md](SUPABASE_SQL.md))
3. Ve a `admin.html` para validar usuarios

### 4. Arrancar servidor

```bash
node scripts/build-skills.mjs
npm run dev  # http://localhost:3000
```

---

## Uso

### Login
1. Abre `login.html`
2. Regístrate o inicia sesión
3. Si es nuevo usuario, espera validación de admin

### Admin
1. Ve a `admin.html` (solo admins)
2. Valida usuarios pendientes
3. Asigna planes (Free/Pro/Enterprise)
4. Gestiona API Keys

### Explorador
1. Abre `index.html`
2. Filtra por categoría o busca
3. Clic en card → **Copiar como prompt**

### Orquestador
1. Abre `orchestrator.html`
2. Configura proveedor y API key
3. Describe tu tarea
4. (Opcional) Aporta contexto
5. **Smart match** o **Auto-ejecutar**
6. Descarga PDF si quieres

---

## Atajos

| Atajo | Acción |
|------|-------|
| `Ctrl + Enter` | Ejecutar tarea |
| `Ctrl + V` | Pegar captura |
| `Ctrl + K` | Nueva consulta |
| `Esc` | Cerrar modales |

---

## Modelos con visión

| Proveedor | Modelos con visión |
|----------|-----------------|
| **Anthropic** | Claude Sonnet/Opus/Haiku 3.x, 4.x |
| **OpenAI** | gpt-4o, gpt-4o-mini, gpt-5 |
| **DeepSeek** | Solo texto |
| **Groq** | llama-3.2-90b-vision-preview |

---

## Changelog

### v5 — Sistema de Suscripciones
- Sistema de usuarios con validación admin
- Planes: Free (10/día), Pro (100), Enterprise (ilimitado)
- Dashboard admin para gestionar usuarios
- Login obligatorio antes de usar
- `login.html` y `admin.html`

### v4 — Exportar resultado a PDF
- Botón **Descargar PDF** en panel de salida.
- Implementación con `html2canvas` + `jsPDF`.

### v3 — Generación de imágenes
- Módulo de imágenes (gpt-image-1, DALL-E, Imagen).
- Prompt context-aware.

### v2 — Migración a JS estático
- 100% client-side, API keys en localStorage.

### v1 — Orquestador multi-proveedor
- Soporte multi-proveedor con streaming SSE.

---

## Créditos

- Skills originales: [`coreyhaines31/marketingskills`](marketingskills/) por Corey Haines.
- Hub estático, orquestador, sistema de suscripciones: este repositorio.