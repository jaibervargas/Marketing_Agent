const JINA_BASE = 'https://r.jina.ai/';
const MAX_TEXT = 25000;

function parseFrontHeaderLine(line, target, key) {
  const re = new RegExp('^' + key + ':\\s*(.+)$', 'im');
  const m = line.match(re);
  if (m) target[key.toLowerCase()] = m[1].trim();
}

function splitJinaPayload(raw) {
  const headerEnd = raw.indexOf('\n\nMarkdown Content:');
  if (headerEnd === -1) {
    return { meta: {}, body: raw };
  }
  const head = raw.slice(0, headerEnd);
  const body = raw.slice(headerEnd + '\n\nMarkdown Content:'.length).trimStart();
  const meta = {};
  for (const line of head.split('\n')) {
    if (line.startsWith('Title:')) meta.title = line.slice(6).trim();
    else if (line.startsWith('URL Source:')) meta.url = line.slice(11).trim();
    else if (line.startsWith('Description:')) meta.description = line.slice(12).trim();
  }
  return { meta, body };
}

export async function fetchUrlContent(url, { signal } = {}) {
  if (!/^https?:\/\//i.test(url)) {
    return { url, error: 'URL inválida' };
  }
  try {
    const target = JINA_BASE + url;
    const res = await fetch(target, {
      headers: { 'X-Return-Format': 'markdown' },
      signal,
    });
    if (!res.ok) {
      return { url, error: `Jina HTTP ${res.status}` };
    }
    const raw = await res.text();
    const { meta, body } = splitJinaPayload(raw);
    const text = body.slice(0, MAX_TEXT);
    return {
      url: meta.url || url,
      title: meta.title || '',
      og_title: '',
      description: meta.description || '',
      headings: [],
      ctas: [],
      text,
      text_length: text.length,
    };
  } catch (err) {
    if (err.name === 'AbortError') return { url, error: 'Cancelado' };
    return { url, error: 'Red: ' + (err.message || err) };
  }
}
