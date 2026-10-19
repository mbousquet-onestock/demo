import { settingsStore } from './appStores';
import { getAccessKey } from './dbSync';
import { logApiCall } from './apiLog';

export const AI_ENDPOINT = '/api/ai';
export const DEFAULT_AI_MODEL = 'gpt-4.1-mini';

export type AiTask = 'stock_points' | 'customers' | 'prices' | 'delivery_config';

export interface AiStatus {
  serverKey: boolean;
  defaultModel: string;
}

export const getAiStatus = async (): Promise<AiStatus | null> => {
  try {
    const res = await fetch(AI_ENDPOINT);
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
};

// One OpenAI call through api/ai.ts, with the key / model of API Settings (or the server key).
export const callAi = async <T = any>(task: AiTask, request: Record<string, unknown>, label: string): Promise<T> => {
  const settings = settingsStore.get();
  const body = { task, model: settings.openaiModel || undefined, ...request };
  const started = Date.now();
  const res = await fetch(AI_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-App-Key': getAccessKey() },
    body: JSON.stringify({ ...body, apiKey: settings.openaiApiKey?.trim() || undefined }),
  });
  const data = await res.json().catch(() => null);
  logApiCall({
    method: 'POST',
    url: `OpenAI · ${label}`,
    request: body,
    status: res.status,
    ok: res.ok,
    durationMs: Date.now() - started,
    response: data,
    error: res.ok ? undefined : data?.error,
  });
  if (!res.ok) throw new Error(data?.error || `AI request failed (HTTP ${res.status})`);
  return data as T;
};
