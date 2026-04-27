import { PROVIDERS, buildHeaders, endpointUrl } from './providers.js';

const ROUTER_PROMPT_TEMPLATE = (catalogText, task) => `Eres un router experto de skills de marketing. Tu trabajo es leer la tarea del usuario y elegir las skills MÁS RELEVANTES y NECESARIAS para resolverla — ni más, ni menos.

REGLAS:
- Elige entre 2 y 5 skills (típicamente 3).
- NO incluyas skills que solo están relacionadas tangencialmente. Sé estricto.
- Si la tarea menciona signup/registro, incluye signup-flow-cro; si NO lo menciona, NO la incluyas aunque sea de CRO.
- Si la tarea menciona popup/modal, incluye popup-cro; si NO, NO la incluyas.
- Si la tarea es estratégica (ideas, planificación), prefiere marketing-ideas / marketing-psychology / customer-research sobre skills tácticas.
- Considera el orden lógico: research → estrategia → ejecución.

Devuelve EXCLUSIVAMENTE un JSON válido con esta forma exacta, sin texto adicional ni bloques de código:

{"skills": [{"slug": "skill-name", "reason": "una frase breve en español"}]}

CATÁLOGO DE SKILLS DISPONIBLES:
${catalogText}

TAREA DEL USUARIO:
"""
${task}
"""

Responde solo con el JSON.`;

function isReasoningModel(model) {
  return /^o[13]/i.test(model || '');
}

function buildCatalog(skills) {
  return skills
    .map(s => {
      const desc = (s.description || '').replace(/\s+/g, ' ').slice(0, 280);
      return `- \`${s.slug}\` (${s.category}): ${desc}`;
    })
    .join('\n');
}

function extractTextAnthropic(data) {
  if (!data || !Array.isArray(data.content)) return '';
  let text = '';
  for (const block of data.content) {
    if (block && block.type === 'text' && typeof block.text === 'string') text += block.text;
  }
  return text;
}

function extractTextOpenAI(data) {
  return data?.choices?.[0]?.message?.content || '';
}

function extractJsonFromText(text) {
  let trimmed = text.trim();
  const fenceMatch = trimmed.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
  if (fenceMatch) trimmed = fenceMatch[1];
  const objMatch = trimmed.match(/\{[\s\S]*\}/);
  if (objMatch) trimmed = objMatch[0];
  try { return JSON.parse(trimmed); } catch { return null; }
}

export async function smartMatch({ task, provider, apiKey, model, customUrl, skills }, { signal } = {}) {
  const prov = PROVIDERS[provider];
  if (!prov) throw new Error('Proveedor inválido');
  if (!task) throw new Error('Falta la tarea');
  if (!model) throw new Error('Falta el modelo');

  const url = endpointUrl(provider, customUrl);
  const headers = buildHeaders(provider, apiKey);
  const routerPrompt = ROUTER_PROMPT_TEMPLATE(buildCatalog(skills), task);

  let payload;
  if (prov.format === 'anthropic') {
    payload = {
      model,
      max_tokens: 1024,
      messages: [{ role: 'user', content: routerPrompt }],
    };
  } else {
    payload = {
      model,
      messages: [{ role: 'user', content: routerPrompt }],
    };
    if (!isReasoningModel(model)) payload.max_tokens = 1024;
  }

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
    signal,
  });
  if (!res.ok) {
    const raw = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}${raw ? ' — ' + raw.slice(0, 200) : ''}`);
  }
  const data = await res.json();
  const textOut = prov.format === 'anthropic' ? extractTextAnthropic(data) : extractTextOpenAI(data);
  const parsed = extractJsonFromText(textOut);
  if (!parsed || !Array.isArray(parsed.skills)) {
    throw new Error('Respuesta no parseable');
  }

  const bySlug = Object.fromEntries(skills.map(s => [s.slug, s]));
  const picks = [];
  for (const p of parsed.skills) {
    const slug = (p?.slug || '').trim();
    if (!slug || !bySlug[slug]) continue;
    picks.push({
      slug,
      name: bySlug[slug].name,
      category: bySlug[slug].category,
      description: bySlug[slug].description,
      reason: (p.reason || '').trim(),
    });
  }
  return { skills: picks };
}

function buildRunPayload({ provider, model, prompt, images, maxTokens }) {
  const prov = PROVIDERS[provider];
  if (prov.format === 'anthropic') {
    let content;
    if (images && images.length) {
      const blocks = [{ type: 'text', text: prompt }];
      for (const img of images) {
        if (!img?.mime || !img?.data) continue;
        blocks.push({
          type: 'image',
          source: { type: 'base64', media_type: img.mime, data: img.data },
        });
      }
      content = blocks;
    } else {
      content = prompt;
    }
    return {
      model,
      max_tokens: maxTokens,
      stream: true,
      messages: [{ role: 'user', content }],
    };
  } else {
    let content;
    if (images && images.length) {
      const blocks = [{ type: 'text', text: prompt }];
      for (const img of images) {
        if (!img?.mime || !img?.data) continue;
        blocks.push({
          type: 'image_url',
          image_url: { url: `data:${img.mime};base64,${img.data}` },
        });
      }
      content = blocks;
    } else {
      content = prompt;
    }
    const body = {
      model,
      stream: true,
      messages: [{ role: 'user', content }],
    };
    if (!isReasoningModel(model)) body.max_tokens = maxTokens;
    return body;
  }
}

async function* iterateSseLines(reader) {
  const decoder = new TextDecoder();
  let buf = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf('\n')) !== -1) {
      const line = buf.slice(0, idx).replace(/\r$/, '');
      buf = buf.slice(idx + 1);
      yield line;
    }
  }
  if (buf.length) yield buf;
}

async function processAnthropicStream(reader, { onDelta, onDone, onError }) {
  let dataPayload = '';
  for await (const line of iterateSseLines(reader)) {
    if (line === '') {
      if (dataPayload) {
        try {
          const obj = JSON.parse(dataPayload);
          if (obj?.type === 'content_block_delta' && obj.delta?.text) {
            onDelta(obj.delta.text);
          } else if (obj?.type === 'message_stop') {
            onDone?.();
          } else if (obj?.type === 'error') {
            onError?.(obj.error?.message || 'API error');
          }
        } catch { /* ignore parse */ }
        dataPayload = '';
      }
      continue;
    }
    if (line.startsWith('data:')) {
      dataPayload += line.slice(5).trimStart();
    }
  }
  if (dataPayload) {
    try {
      const obj = JSON.parse(dataPayload);
      if (obj?.type === 'content_block_delta' && obj.delta?.text) onDelta(obj.delta.text);
    } catch { /* ignore */ }
  }
}

async function processOpenAIStream(reader, { onDelta, onDone, onError }) {
  for await (const line of iterateSseLines(reader)) {
    if (line === '' || line.startsWith(':')) continue;
    if (!line.startsWith('data:')) continue;
    const payload = line.slice(5).trim();
    if (payload === '' ) continue;
    if (payload === '[DONE]') { onDone?.(); continue; }
    let obj;
    try { obj = JSON.parse(payload); } catch { continue; }
    if (obj?.error) {
      const msg = typeof obj.error === 'string' ? obj.error : (obj.error.message || JSON.stringify(obj.error));
      onError?.(msg);
      continue;
    }
    const delta = obj?.choices?.[0]?.delta?.content;
    if (delta) onDelta(delta);
  }
}

export async function runStream({
  provider, apiKey, model, customUrl, prompt, images, maxTokens = 8192,
  onDelta, onDone, onError, signal,
}) {
  const prov = PROVIDERS[provider];
  if (!prov) throw new Error('Proveedor inválido');
  if (!apiKey && provider !== 'custom') throw new Error('Falta API key');
  if (!model) throw new Error('Falta modelo');
  if (!prompt) throw new Error('Falta prompt');

  const url = endpointUrl(provider, customUrl);
  const headers = buildHeaders(provider, apiKey);
  const payload = buildRunPayload({ provider, model, prompt, images, maxTokens });

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
    signal,
  });

  if (!res.ok) {
    const raw = await res.text().catch(() => '');
    let message = `HTTP ${res.status}`;
    try {
      const parsed = JSON.parse(raw);
      message += ' — ' + (parsed?.error?.message || parsed?.error || raw.slice(0, 200));
    } catch {
      if (raw) message += ' — ' + raw.slice(0, 200);
    }
    throw new Error(message);
  }
  if (!res.body) throw new Error('Respuesta sin stream');

  const reader = res.body.getReader();
  if (prov.format === 'anthropic') {
    await processAnthropicStream(reader, { onDelta, onDone, onError });
  } else {
    await processOpenAIStream(reader, { onDelta, onDone, onError });
  }
}
