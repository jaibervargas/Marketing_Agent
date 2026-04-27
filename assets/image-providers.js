export const IMAGE_PROVIDERS = {
  openai: {
    name: 'OpenAI (gpt-image-1 / DALL·E)',
    short: 'OpenAI',
    format: 'openai',
    url: 'https://api.openai.com/v1/images/generations',
    auth: 'bearer',
    models: ['gpt-image-1', 'dall-e-3', 'dall-e-2'],
    sizes: ['1024x1024', '1024x1536', '1536x1024'],
    qualities: ['low', 'medium', 'high', 'auto'],
    keyHint: 'sk-...',
    keyUrl: 'https://platform.openai.com/api-keys',
    supportsN: true,
  },
  gemini: {
    name: 'Google (Imagen)',
    short: 'Imagen',
    format: 'gemini',
    urlTemplate: 'https://generativelanguage.googleapis.com/v1beta/models/{model}:predict',
    auth: 'apikey-query',
    models: ['imagen-3.0-generate-002', 'imagen-4.0-generate-preview'],
    sizes: ['1:1', '9:16', '16:9', '3:4', '4:3'],
    qualities: [],
    keyHint: 'AIza...',
    keyUrl: 'https://aistudio.google.com/apikey',
    supportsN: true,
  },
  custom: {
    name: 'Custom (compatible OpenAI Images)',
    short: 'Custom',
    format: 'openai',
    url: '',
    auth: 'bearer',
    models: [],
    sizes: ['1024x1024'],
    qualities: [],
    keyHint: 'tu-api-key',
    keyUrl: '',
    supportsN: true,
  },
};

export function buildImageHeaders(providerKey, apiKey) {
  const prov = IMAGE_PROVIDERS[providerKey];
  if (!prov) throw new Error('Proveedor de imagen inválido: ' + providerKey);
  const headers = { 'Content-Type': 'application/json' };
  if (prov.auth === 'bearer' && apiKey) {
    headers['Authorization'] = 'Bearer ' + apiKey;
  }
  return headers;
}

export function imageEndpointUrl(providerKey, model, apiKey, customUrl) {
  const prov = IMAGE_PROVIDERS[providerKey];
  if (!prov) throw new Error('Proveedor de imagen inválido: ' + providerKey);
  if (providerKey === 'custom') {
    if (!/^https?:\/\//i.test(customUrl || '')) throw new Error('URL custom inválida');
    return customUrl;
  }
  if (prov.urlTemplate) {
    let url = prov.urlTemplate.replace('{model}', encodeURIComponent(model || ''));
    if (prov.auth === 'apikey-query' && apiKey) {
      url += (url.includes('?') ? '&' : '?') + 'key=' + encodeURIComponent(apiKey);
    }
    return url;
  }
  return prov.url;
}
