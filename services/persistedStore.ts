import { useSyncExternalStore } from 'react';

// Minimal localStorage-backed store usable from React components (via the hook) and plain services.
export interface PersistedStore<T> {
  get: () => T;
  set: (next: T | ((prev: T) => T)) => void;
  subscribe: (listener: () => void) => () => void;
  use: () => T;
}

export const createPersistedStore = <T,>(key: string, initial: T): PersistedStore<T> => {
  let state: T = initial;
  try {
    const raw = localStorage.getItem(key);
    if (raw) state = JSON.parse(raw);
  } catch (e) {
    console.error(`Failed to read ${key} from localStorage`, e);
  }

  const listeners = new Set<() => void>();

  const set = (next: T | ((prev: T) => T)) => {
    const value = typeof next === 'function' ? (next as (prev: T) => T)(state) : next;
    // Persist first so a quota error surfaces to the caller without diverging from storage.
    localStorage.setItem(key, JSON.stringify(value));
    state = value;
    listeners.forEach(l => l());
  };

  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  };

  const get = () => state;

  return {
    get,
    set,
    subscribe,
    use: () => useSyncExternalStore(subscribe, get),
  };
};
