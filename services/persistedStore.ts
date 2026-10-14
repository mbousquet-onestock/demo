import { useSyncExternalStore } from 'react';

// Minimal store usable from React components (via the hook) and plain services.
export interface Store<T> {
  get: () => T;
  set: (next: T | ((prev: T) => T)) => void;
  subscribe: (listener: () => void) => () => void;
  use: () => T;
}

export const createStore = <T,>(initial: T, onChange?: (value: T) => void): Store<T> => {
  let state: T = initial;
  const listeners = new Set<() => void>();

  const set = (next: T | ((prev: T) => T)) => {
    const value = typeof next === 'function' ? (next as (prev: T) => T)(state) : next;
    if (value === state) return;
    state = value;
    onChange?.(value);
    listeners.forEach(l => l());
  };

  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  };

  const get = () => state;

  return { get, set, subscribe, use: () => useSyncExternalStore(subscribe, get) };
};

// Store cached in localStorage. The database (see dbSync.ts) is the shared copy;
// a full localStorage only degrades the local cache, it never blocks an update.
export const createPersistedStore = <T,>(key: string, initial: T): Store<T> => {
  let cached: T = initial;
  try {
    const raw = localStorage.getItem(key);
    if (raw) cached = JSON.parse(raw);
  } catch (e) {
    console.error(`Failed to read ${key} from localStorage`, e);
  }

  return createStore(cached, value => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      console.warn(`Local cache not updated for ${key} (storage full?)`, e);
    }
  });
};
