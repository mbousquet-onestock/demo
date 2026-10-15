import { AppSettings, DEFAULT_SETTINGS, ProcessedSite, StockPointSet, OrderBatch } from '../types';
import { createPersistedStore } from './persistedStore';

export const historyStore = createPersistedStore<ProcessedSite[]>('onestock_import_history', []);
export const settingsStore = createPersistedStore<AppSettings>('onestock_app_settings', DEFAULT_SETTINGS);
export const stockPointSetsStore = createPersistedStore<StockPointSet[]>('onestock_stock_point_sets', []);
export const orderBatchesStore = createPersistedStore<OrderBatch[]>('onestock_order_batches', []);
