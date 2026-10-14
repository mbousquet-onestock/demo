import { SavedPayload } from '../types';
import { createPersistedStore } from './persistedStore';

export const savedPayloadsStore = createPersistedStore<SavedPayload[]>('onestock_saved_payloads', []);

export const savePayload = (entry: Omit<SavedPayload, 'id' | 'createdAt'>) => {
  const full: SavedPayload = {
    ...entry,
    id: Date.now().toString(36) + Math.random().toString(36).substring(2, 7),
    createdAt: new Date().toISOString(),
  };
  savedPayloadsStore.set(prev => [full, ...prev]);
};

export const deleteSavedPayload = (id: string) => {
  savedPayloadsStore.set(prev => prev.filter(p => p.id !== id));
};

export const downloadJson = (data: unknown, fileName: string) => {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName.endsWith('.json') ? fileName : `${fileName}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

export const updateSavedPayload = (id: string, patch: Partial<SavedPayload>) => {
  savedPayloadsStore.set(prev => prev.map(p => (p.id === id ? { ...p, ...patch } : p)));
};

export const listProjects = (payloads: SavedPayload[]): string[] =>
  Array.from(new Set(payloads.map(p => (p.project || '').trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b));

// Remembers the last project typed in this browser, to prefill the next save.
const LAST_PROJECT_KEY = 'onestock_last_project';
export const getLastProject = () => {
  try { return localStorage.getItem(LAST_PROJECT_KEY) || ''; } catch { return ''; }
};
export const setLastProject = (project: string) => {
  try { localStorage.setItem(LAST_PROJECT_KEY, project); } catch { /* ignore */ }
};
