import { AppSettings, DEFAULT_SETTINGS, ProcessedSite, StockPointSet } from '../types';
import { createPersistedStore } from './persistedStore';

export const historyStore = createPersistedStore<ProcessedSite[]>('onestock_import_history', []);
export const settingsStore = createPersistedStore<AppSettings>('onestock_app_settings', DEFAULT_SETTINGS);
export const stockPointSetsStore = createPersistedStore<StockPointSet[]>('onestock_stock_point_sets', []);
