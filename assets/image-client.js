import { IMAGE_PROVIDERS, buildImageHeaders, imageEndpointUrl } from './image-providers.js';

function buildImagePayload({ provider, model, prompt, size, quality, n }) {
  const prov = IMAGE_PROVIDERS[provider];
  if (prov.format === 'gemini') {
    const payload = {
      instances: [{ prompt }],
      parameters: { sampleCount: Math.max(1, Math.min(4, n || 1)) },
    };
    if (size) payload.parameters.aspectRatio = size;
    return payload;
  }
  const payload = {
    model,
    prompt,
    n: Math.max(1, Math.min(4, n || 1)),
  };
  if (size) payload.size = size;
  if (model === 'gpt-image-1') {
    if (quality && quality !== 'auto') payload.quality = quality;
  } else if (model === 'dall-e-3') {
    if (quality === 'high') payload.quality = 'hd';
    else if (quality === 'low' || quality === 'medium') payload.quality = 'standard';
    payload.response_format = 'b64_json';
    payload.n = 1;
  } else {
    payload.response_format = 'b64_json';
  }
  return payload;
}

function parseImageResponse(provider, data) {
  const prov = IMAGE_PROVIDERS[provider];
  const images = [];
  if (prov.format === 'gemini') {
    const preds = Array.isArray(data?.predictions) ? data.predictions : [];
    for (const p of preds) {
      const b64 = p?.bytesBase64Encoded || p?.imageBytes;
      const mime = p?.mimeType || 'image/png';
      if (b64) images.push({ b64, mime });
    }
    return images;
  }
  const arr = Array.isArray(data?.data) ? data.data : [];
  for (const item of arr) {
    if (item?.b64_json) {
      images.push({ b64: item.b64_json, mime: 'image/png' });
    } else if (item?.url) {
      images.push({ url: item.url, mime: 'image/png' });
    }
  }
  return images;
}

export async function generateImage({
  provider, apiKey, model, customUrl,
  prompt, size, quality, n = 1,
  signal,
}) {
  const prov = IMAGE_PROVIDERS[provider];
  if (!prov) throw new Error('Proveedor de imagen inválido');
  if (!prompt) throw new Error('Falta el prompt visual');
  if (!model && provider !== 'custom') throw new Error('Falta el modelo');
  if (!apiKey && provider !== 'custom') throw new Error('Falta la API key');

  const url = imageEndpointUrl(provider, model, apiKey, customUrl);
  const headers = buildImageHeaders(provider, apiKey);
  const body = buildImagePayload({ provider, model, prompt, size, quality, n });

  const startedAt = Date.now();
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
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

  const data = await res.json();
  const images = parseImageResponse(provider, data);
  if (!images.length) throw new Error('La respuesta no contiene imágenes');

  return {
    images,
    elapsedMs: Date.now() - startedAt,
    model,
    provider,
  };
}

export async function makeThumbnail(b64, mime, maxSide = 256) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const ratio = Math.min(maxSide / img.width, maxSide / img.height, 1);
      const w = Math.max(1, Math.round(img.width * ratio));
      const h = Math.max(1, Math.round(img.height * ratio));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.75);
      resolve(dataUrl);
    };
    img.onerror = () => resolve(null);
    img.src = `data:${mime};base64,${b64}`;
  });
}
