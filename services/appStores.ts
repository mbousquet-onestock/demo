import { AppSettings, DEFAULT_SETTINGS, StockPointSet, OrderBatch, ManualStep } from '../types';
import { createPersistedStore } from './persistedStore';

export const settingsStore = createPersistedStore<AppSettings>('onestock_app_settings', DEFAULT_SETTINGS);
export const stockPointSetsStore = createPersistedStore<StockPointSet[]>('onestock_stock_point_sets', []);
export const orderBatchesStore = createPersistedStore<OrderBatch[]>('onestock_order_batches', []);
export const manualStepsStore = createPersistedStore<ManualStep[]>('onestock_manual_steps', []);
