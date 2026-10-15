import { createStore } from './persistedStore';
import { captureInboxStore } from './appStores';
import { sanitizeCaptured, mergeCaptured } from '../utils/productCapture';

// Asks Product Manager to open the capture drawer (products just received).
export const captureDrawerRequest = createStore(0);

// The bookmarklet opens this app in a window named "onestock_capture" and posts the products to it until it
// acknowledges them. Only that window accepts captures; they land in the inbox, to be reviewed before any use.
export const initCaptureListener = (onReceived: () => void) => {
  const received = new Set<string>();
  const onMessage = (e: MessageEvent) => {
    const data = e.data;
    if (window.name !== 'onestock_capture') return;
    if (!data || typeof data !== 'object' || data.type !== 'onestock-capture' || typeof data.id !== 'string' || !Array.isArray(data.products)) return;
    (e.source as Window | null)?.postMessage({ type: 'onestock-capture-ack', id: data.id }, e.origin);
    if (received.has(data.id)) return;
    received.add(data.id);
    const products = sanitizeCaptured(data.products, typeof data.page === 'string' ? data.page : '');
    captureInboxStore.set(prev => mergeCaptured(prev, products));
    if (location.hash.startsWith('#capture')) history.replaceState(null, '', location.pathname + location.search);
    captureDrawerRequest.set(n => n + 1);
    onReceived();
  };
  // Each capture may open its own tool tab: keep the captured list the same in every tab.
  const onStorage = (e: StorageEvent) => {
    if (e.key !== 'onestock_capture_inbox') return;
    try { captureInboxStore.set(e.newValue ? JSON.parse(e.newValue) : []); } catch { /* ignore */ }
  };
  window.addEventListener('message', onMessage);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener('message', onMessage);
    window.removeEventListener('storage', onStorage);
  };
};
