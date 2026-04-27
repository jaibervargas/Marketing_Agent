const HISTORY_KEY = 'orch_history_v1';
const HISTORY_MAX = 30;

export function getHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); }
  catch { return []; }
}

export function setHistory(arr) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(arr.slice(0, HISTORY_MAX)));
}

export function saveToHistory(entry) {
  const arr = getHistory();
  arr.unshift({
    id: Date.now() + '-' + Math.random().toString(36).slice(2, 7),
    ts: Date.now(),
    ...entry,
  });
  setHistory(arr);
}

export function deleteFromHistory(id) {
  setHistory(getHistory().filter(h => h.id !== id));
}

export function clearHistory() {
  localStorage.removeItem(HISTORY_KEY);
}

export function fmtTime(ts) {
  const d = new Date(ts);
  const diff = (Date.now() - ts) / 1000;
  if (diff < 60) return 'hace un momento';
  if (diff < 3600) return `hace ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `hace ${Math.floor(diff / 3600)} h`;
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}
