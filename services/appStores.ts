import { AppSettings, DEFAULT_SETTINGS, StockPointSet, OrderBatch, ManualStep, ProductCaptureSet, CapturedProduct } from '../types';
import { createPersistedStore } from './persistedStore';

export const settingsStore = createPersistedStore<AppSettings>('onestock_app_settings', DEFAULT_SETTINGS);
export const stockPointSetsStore = createPersistedStore<StockPointSet[]>('onestock_stock_point_sets', []);
export const orderBatchesStore = createPersistedStore<OrderBatch[]>('onestock_order_batches', []);
export const manualStepsStore = createPersistedStore<ManualStep[]>('onestock_manual_steps', []);
export const productCapturesStore = createPersistedStore<ProductCaptureSet[]>('onestock_product_captures', []);
// Products received from the capture bookmarklet, not saved yet (this browser only).
export const captureInboxStore = createPersistedStore<CapturedProduct[]>('onestock_capture_inbox', []);
