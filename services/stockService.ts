import { onestockRequest, describeCallError } from './onestockClient';

export interface StockLine {
  item_id: string;
  endpoint_id: string;
  quantity: number;
}

export interface StockImportPayload {
  site_id: string;
  token: string;
  import: { incremental: boolean; import_id?: string };
  stocks: StockLine[];
}

export interface StockChunkResult {
  index: number;
  lines: number;
  ok: boolean;
  status: number | null;
  message: string;
  requestId?: string;
  durationMs?: number;
  url?: string;
  response?: unknown;
}

// PATCH /stock_import accepts up to 1,000 stock lines per request.
export const STOCK_IMPORT_MAX_LINES = 1000;

// Synchronous stock import; larger payloads are split into several requests sharing the same import_id.
export const pushStockImport = async (
  payload: StockImportPayload,
  onProgress?: (done: number, total: number) => void
): Promise<StockChunkResult[]> => {
  const chunks: StockLine[][] = [];
  for (let i = 0; i < payload.stocks.length; i += STOCK_IMPORT_MAX_LINES) {
    chunks.push(payload.stocks.slice(i, i + STOCK_IMPORT_MAX_LINES));
  }
  if (chunks.length === 0) chunks.push([]);
  const importId = payload.import.import_id || (chunks.length > 1 ? `import_${Date.now()}` : undefined);

  const results: StockChunkResult[] = [];
  for (const [index, stocks] of chunks.entries()) {
    try {
      const body = {
        ...payload,
        import: { ...payload.import, ...(importId ? { import_id: importId } : {}) },
        stocks,
      };
      const { url, envelope } = await onestockRequest({ method: 'PATCH', path: '/stock_import', body });
      results.push({
        index, lines: stocks.length, ok: envelope.ok, status: envelope.status,
        message: envelope.ok ? 'Imported' : describeCallError(envelope),
        requestId: envelope.headers?.['request-id'], durationMs: envelope.durationMs, url, response: envelope.body,
      });
    } catch (err: any) {
      results.push({ index, lines: stocks.length, ok: false, status: null, message: err?.message || String(err) });
    }
    onProgress?.(index + 1, chunks.length);
  }
  return results;
};
