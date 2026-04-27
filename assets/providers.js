export const PROVIDERS = {
  anthropic: {
    name: 'Anthropic (Claude)',
    short: 'Claude',
    chatUrl: 'https://claude.ai/new',
    url: 'https://api.anthropic.com/v1/messages',
    format: 'anthropic',
    auth: 'anthropic',
    models: ['claude-sonnet-4-5', 'claude-opus-4-5', 'claude-haiku-4-5', 'claude-3-7-sonnet-latest'],
    keyHint: 'sk-ant-...',
    keyUrl: 'https://console.anthropic.com/settings/keys',
  },
  openai: {
    name: 'OpenAI (ChatGPT)',
    short: 'ChatGPT',
    chatUrl: 'https://chat.openai.com',
    url: 'https://api.openai.com/v1/chat/completions',
    format: 'openai',
    auth: 'bearer',
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4.1', 'gpt-5', 'o3-mini', 'o1'],
    keyHint: 'sk-...',
    keyUrl: 'https://platform.openai.com/api-keys',
  },
  deepseek: {
    name: 'DeepSeek',
    short: 'DeepSeek',
    chatUrl: 'https://chat.deepseek.com',
    url: 'https://api.deepseek.com/v1/chat/completions',
    format: 'openai',
    auth: 'bearer',
    models: ['deepseek-chat', 'deepseek-reasoner'],
    keyHint: 'sk-...',
    keyUrl: 'https://platform.deepseek.com/api_keys',
  },
  groq: {
    name: 'Groq (Llama, Qwen)',
    short: 'Groq',
    chatUrl: 'https://groq.com',
    url: 'https://api.groq.com/openai/v1/chat/completions',
    format: 'openai',
    auth: 'bearer',
    models: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'qwen-2.5-72b', 'mixtral-8x7b-32768', 'deepseek-r1-distill-llama-70b'],
    keyHint: 'gsk_...',
    keyUrl: 'https://console.groq.com/keys',
  },
  openrouter: {
    name: 'OpenRouter (todos)',
    short: 'OpenRouter',
    chatUrl: 'https://openrouter.ai/chat',
    url: 'https://openrouter.ai/api/v1/chat/completions',
    format: 'openai',
    auth: 'bearer',
    models: ['anthropic/claude-sonnet-4.5', 'openai/gpt-4o', 'meta-llama/llama-3.3-70b-instruct', 'deepseek/deepseek-chat', 'google/gemini-2.0-flash-exp', 'qwen/qwen-2.5-72b-instruct', 'mistralai/mistral-large'],
    keyHint: 'sk-or-...',
    keyUrl: 'https://openrouter.ai/keys',
  },
  custom: {
    name: 'Custom (compatible OpenAI)',
    short: 'Custom',
    chatUrl: '',
    url: '',
    format: 'openai',
    auth: 'bearer',
    models: [],
    keyHint: 'tu-api-key',
    keyUrl: '',
  },
};

export function buildHeaders(providerKey, apiKey) {
  const prov = PROVIDERS[providerKey];
  if (!prov) throw new Error('Proveedor inválido: ' + providerKey);
  const headers = { 'Content-Type': 'application/json' };
  if (prov.format === 'anthropic') {
    headers['x-api-key'] = apiKey;
    headers['anthropic-version'] = '2023-06-01';
    headers['anthropic-dangerous-direct-browser-access'] = 'true';
  } else {
    if (apiKey) headers['Authorization'] = 'Bearer ' + apiKey;
    if (providerKey === 'openrouter') {
      headers['HTTP-Referer'] = window.location.origin || 'https://marketing-skills.local';
      headers['X-Title'] = 'Marketing Skills Orchestrator';
    }
  }
  return headers;
}

export function endpointUrl(providerKey, customUrl) {
  const prov = PROVIDERS[providerKey];
  if (!prov) throw new Error('Proveedor inválido: ' + providerKey);
  if (providerKey === 'custom') {
    if (!/^https?:\/\//i.test(customUrl || '')) throw new Error('URL custom inválida');
    return customUrl;
  }
  return prov.url;
}
