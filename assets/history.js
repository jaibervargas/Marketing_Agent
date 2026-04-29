import { supabase, isSupabaseConfigured, onAuthStateChange, getCurrentUser } from './supabase-client.js';

const HISTORY_KEY = 'orch_history_v1';
const HISTORY_MAX = 30;

const HISTORY_TABLE = 'history';
const USER_ID_FIELD = 'user_id';
const TASK_FIELD = 'task';
const SLUGS_FIELD = 'slugs';
const PROMPT_FIELD = 'prompt';
const RESULT_FIELD = 'result';
const MODEL_FIELD = 'model';
const IMAGES_FIELD = 'images';
const CREATED_AT_FIELD = 'created_at';

let currentUser = null;
let useSupabase = false;
let pendingQueue = [];

onAuthStateChange((event, user) => {
  currentUser = user;
  useSupabase = !!user && isSupabaseConfigured();
  if (useSupabase && pendingQueue.length > 0) {
    flushPendingQueue();
  }
});

async function flushPendingQueue() {
  while (pendingQueue.length > 0) {
    const entry = pendingQueue.shift();
    try {
      await saveToHistory(entry);
    } catch (e) {
      console.error('Error flushing pending:', e);
    }
  }
}

export function isCloudMode() {
  return useSupabase;
}

export async function getHistory() {
  if (!useSupabase || !currentUser) {
    return getLocalHistory();
  }

  const { data, error } = await supabase
    .from(HISTORY_TABLE)
    .select('*')
    .eq(USER_ID_FIELD, currentUser.id)
    .order(CREATED_AT_FIELD, { ascending: false })
    .limit(HISTORY_MAX);

  if (error) {
    console.error('Error fetching cloud history:', error);
    return getLocalHistory();
  }

  return data || [];
}

function getLocalHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); }
  catch { return []; }
}

function setLocalHistory(arr) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(arr.slice(0, HISTORY_MAX)));
}

export function setHistory(arr) {
  if (!useSupabase || !currentUser) {
    setLocalHistory(arr);
    return;
  }
}

export async function saveToHistory(entry) {
  const record = {
    id: Date.now() + '-' + Math.random().toString(36).slice(2, 7),
    ts: Date.now(),
    ...entry,
  };

  if (!useSupabase || !currentUser) {
    const arr = getLocalHistory();
    arr.unshift(record);
    setLocalHistory(arr);
    return record;
  }

  const { error } = await supabase.from(HISTORY_TABLE).insert({
    [USER_ID_FIELD]: currentUser.id,
    [TASK_FIELD]: entry.task,
    [SLUGS_FIELD]: entry.slugs,
    [PROMPT_FIELD]: entry.prompt,
    [RESULT_FIELD]: entry.result,
    [MODEL_FIELD]: entry.model,
    [IMAGES_FIELD]: entry.images || null,
  });

  if (error) {
    console.error('Error saving to cloud history:', error);
    const arr = getLocalHistory();
    arr.unshift(record);
    setLocalHistory(arr);
  }

  return record;
}

export async function deleteFromHistory(id) {
  if (!useSupabase || !currentUser) {
    const arr = getLocalHistory().filter(h => h.id !== id);
    setLocalHistory(arr);
    return;
  }

  await supabase.from(HISTORY_TABLE).delete().eq('id', id);
}

export async function clearHistory() {
  if (!useSupabase || !currentUser) {
    localStorage.removeItem(HISTORY_KEY);
    return;
  }

  await supabase.from(HISTORY_TABLE).delete().eq(USER_ID_FIELD, currentUser.id);
}

export function fmtTime(ts) {
  const d = new Date(ts);
  const diff = (Date.now() - ts) / 1000;
  if (diff < 60) return 'hace un momento';
  if (diff < 3600) return `hace ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `hace ${Math.floor(diff / 3600)} h`;
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}