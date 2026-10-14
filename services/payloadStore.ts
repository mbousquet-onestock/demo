import { SavedPayload } from '../types';
import { createPersistedStore } from './persistedStore';

export const savedPayloadsStore = createPersistedStore<SavedPayload[]>('onestock_saved_payloads', []);

// Returns an error message when the browser storage quota is exceeded.
export const savePayload = (entry: Omit<SavedPayload, 'id' | 'createdAt'>): string | null => {
  const full: SavedPayload = {
    ...entry,
    id: Date.now().toString(36) + Math.random().toString(36).substring(2, 7),
    createdAt: new Date().toISOString(),
  };
  try {
    savedPayloadsStore.set(prev => [full, ...prev]);
    return null;
  } catch (e: any) {
    return `Could not save (browser storage full?): ${e?.message || e}. Download the JSON instead.`;
  }
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
