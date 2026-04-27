import { fetchUrlContent } from './url-fetcher.js';

const ROLE_BASE = `# Rol: Marketing Orchestrator

Eres un **agente orquestador de marketing**. Tu misión es analizar la tarea del usuario y ejecutarla aplicando, en el orden correcto, las skills especializadas que te paso a continuación. Cada skill es un experto: léelas, decide cuáles usar y en qué secuencia, y entrega un resultado final accionable.`;

const ROLE_WITH_CONTEXT = `${ROLE_BASE}

## Material provisto — úsalo directamente

El usuario YA proporcionó el material concreto (ver sección "Contexto provisto por el usuario" más abajo: URL extraída con Jina Reader, copy pegado, archivos o capturas). **NO vuelvas a pedir la URL, el copy ni capturas: ese contenido ya está en este mismo mensaje.** Trabaja sobre él literalmente, citando frases reales cuando hagas auditorías o reescrituras.

## Cómo trabajar

1. **Diagnóstico**: 1-2 frases sobre qué hay que producir, para quién, y qué material concreto vas a usar (cita la URL/archivo del contexto).
2. **Plan de ejecución**: enumera las skills que vas a aplicar y por qué, en el orden óptimo.
3. **Ejecuta** cada skill siguiendo SUS instrucciones al pie de la letra, sobre el material real provisto. No improvises ni mezcles frameworks.
4. **Entregable**: resultado final (copy reescrito con antes/después, auditoría con citas literales del copy actual, plan accionable, etc.). Incluye sección "Próximos pasos" al final.`;

const ROLE_NO_CONTEXT = `${ROLE_BASE}

## REGLA CRÍTICA — falta el material

El usuario NO proporcionó URL, copy real, archivos ni capturas. Si la tarea menciona un asset concreto (landing page, homepage, email específico, anuncio, blog post, secuencia, paywall, formulario, etc.), tu PRIMERA Y ÚNICA respuesta debe ser una pregunta breve pidiendo el material faltante (URL pública, copy pegado o captura). **NUNCA inventes ejemplos genéricos** del tipo "Nuestra solución integral optimiza…" — eso es inútil para el usuario.

Formula la pregunta con tus propias palabras, adaptada al asset concreto que mencionó la tarea. No copies frases plantilla.

**Excepción**: si la tarea es puramente estratégica (ej. "ideas de marketing para mi SaaS", "plantilla de email de bienvenida desde cero", "estrategia de pricing") y no requiere material existente, procede directamente con las skills.

## Cómo trabajar (si la tarea es estratégica y no requiere material)

1. **Diagnóstico**: 1-2 frases sobre qué hay que producir y para quién.
2. **Plan de ejecución**: enumera las skills que vas a aplicar y por qué, en el orden óptimo.
3. **Ejecuta** cada skill siguiendo SUS instrucciones al pie de la letra. No improvises ni mezcles frameworks.
4. **Entregable**: resultado final accionable. Incluye sección "Próximos pasos" al final.`;

export async function buildPrompt({ task, slugs, skills, context }, { onProgress } = {}) {
  const bySlug = Object.fromEntries(skills.map(s => [s.slug, s]));

  const bundleParts = [];
  const skillListLines = [];
  for (const slug of slugs) {
    const sk = bySlug[slug];
    if (!sk) continue;
    bundleParts.push(`## SKILL: ${sk.name}\n_Categoría: ${sk.category}_\n\n${sk.body}`);
    skillListLines.push(`- **${sk.name}** — ${sk.category}`);
  }
  const skillsBlock = bundleParts.join('\n\n---\n\n');
  const skillsListMarkdown = skillListLines.join('\n');

  const contextParts = [];
  let hasContext = false;
  const fetchedReports = [];

  const ctxUrls = (context && Array.isArray(context.urls) ? context.urls : [])
    .map(u => (u || '').trim())
    .filter(Boolean)
    .slice(0, 3);

  for (const url of ctxUrls) {
    if (onProgress) onProgress({ type: 'fetch_start', url });
    const page = await fetchUrlContent(url);
    if (page.error) {
      contextParts.push(`**URL: ${url}**\n_(no se pudo extraer contenido: ${page.error})_`);
      fetchedReports.push({ url, ok: false, error: page.error });
    } else {
      let part = `**URL extraída: ${page.url}**\n`;
      if (page.title) part += `- **<title>:** ${page.title}\n`;
      if (page.og_title && page.og_title !== page.title) part += `- **og:title:** ${page.og_title}\n`;
      if (page.description) part += `- **Meta description:** ${page.description}\n`;
      if (page.headings && page.headings.length) {
        part += `- **Headings (H1–H3):**\n  - ${page.headings.join('\n  - ')}\n`;
      }
      if (page.ctas && page.ctas.length) {
        part += `- **CTAs / botones detectados:** ${page.ctas.map(c => `"${c}"`).join(' · ')}\n`;
      }
      part += `\n**Contenido extraído de la página (markdown):**\n\`\`\`\n${page.text}\n\`\`\``;
      contextParts.push(part);
      fetchedReports.push({ url, ok: true, bytes: page.text_length, title: page.title });
    }
    hasContext = true;
  }

  const ctxText = (context && context.text ? context.text : '').trim();
  if (ctxText) {
    contextParts.push(`**Texto / copy / notas:**\n\`\`\`\n${ctxText}\n\`\`\``);
    hasContext = true;
  }

  const ctxFiles = context && Array.isArray(context.files) ? context.files : [];
  for (const f of ctxFiles) {
    if (!f || !f.name || typeof f.content !== 'string') continue;
    const safeName = f.name.replace(/[^\w.\- ]/gu, '');
    const body = f.content.slice(0, 60000);
    contextParts.push(`**Archivo adjunto: ${safeName}**\n\`\`\`\n${body}\n\`\`\``);
    hasContext = true;
  }

  const imagesCount = context && Number(context.imagesCount) || 0;
  if (imagesCount > 0) {
    contextParts.push(`**Imágenes adjuntas:** ${imagesCount} captura(s)/imagen(es) — están incluidas en este mismo mensaje como contenido visual. Analízalas directamente.`);
    hasContext = true;
  }

  const contextBlock = hasContext
    ? `## Contexto provisto por el usuario\n\n${contextParts.join('\n\n')}`
    : `## Contexto provisto por el usuario\n\n_(El usuario NO proporcionó URL, copy real, archivos ni capturas)_`;

  const rolePrompt = hasContext ? ROLE_WITH_CONTEXT : ROLE_NO_CONTEXT;

  const finalInstruction = hasContext
    ? 'Empieza ahora. El material está arriba en el contexto: úsalo directamente, no lo pidas de nuevo. Ejecuta el plan completo.'
    : 'Empieza ahora. Si falta material concreto y la tarea no es puramente estratégica, haz solo la pregunta de pedido. Si tienes lo necesario, ejecuta el plan completo.';

  const prompt = `${rolePrompt}

---

${contextBlock}

---

## Skills disponibles para esta tarea

${skillsListMarkdown}

A continuación tienes el contenido completo de cada skill. **Síguelas literalmente** cuando las apliques.

---

${skillsBlock}

---

## Tarea del usuario

> ${task}

${finalInstruction}`;

  return {
    prompt,
    tokens_estimate: Math.round(prompt.length / 4),
    has_context: hasContext,
    fetched_urls: fetchedReports,
  };
}
