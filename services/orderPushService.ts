import { OnestockApiVersion, StockPointPushResult } from '../types';
import { onestockRequest, describeCallError, getApiTarget } from './onestockClient';

export type OrderPushResult = StockPointPushResult;

export const parentKey = (id: string) => `parent:${id}`;
export const orderKey = (id: string) => `order:${id}`;

const toResult = (ok: boolean, status: number | null, message: string, requestId?: string): OrderPushResult =>
  ({ ok, status, message, requestId, at: new Date().toISOString() });

const send = async (path: string, body: Record<string, unknown>, version: OnestockApiVersion): Promise<OrderPushResult> => {
  try {
    const { envelope } = await onestockRequest({ method: 'POST', path, body, version });
    return toResult(envelope.ok, envelope.status, envelope.ok ? 'Created' : describeCallError(envelope), envelope.headers?.['request-id']);
  } catch (err: any) {
    return toResult(false, null, err?.message || String(err));
  }
};

export interface PushOptions {
  // POST /parent_orders (v4 only) before the sub-orders.
  createParents: boolean;
  // Skip what was already created successfully (retry).
  previous?: Record<string, OrderPushResult>;
}

// Creates the parent order (POST /parent_orders, v4) then its sub-orders (POST /orders, v3 / v4),
// package after package. Sub-orders of a parent that could not be created are skipped.
export const pushOrderPackages = async (
  packages: { parent: any; subOrders: any[] }[],
  options: PushOptions,
  onProgress?: (results: Record<string, OrderPushResult>, done: number, total: number) => void
): Promise<Record<string, OrderPushResult>> => {
  const results: Record<string, OrderPushResult> = {};
  const ordersVersion: OnestockApiVersion = getApiTarget().version === 'v4' ? 'v4' : 'v3';
  const total = packages.reduce((n, p) => n + p.subOrders.length + (options.createParents ? 1 : 0), 0);
  let done = 0;
  const alreadyOk = (key: string) => options.previous?.[key]?.ok;

  for (const pkg of packages) {
    const parentId = pkg.parent.parent_order.id;
    let parentOk = true;
    if (options.createParents) {
      const key = parentKey(parentId);
      if (!alreadyOk(key)) {
        results[key] = await send('/parent_orders', pkg.parent, 'v4');
        parentOk = results[key].ok;
      }
      onProgress?.({ ...results }, ++done, total);
    }

    for (const sub of pkg.subOrders) {
      const key = orderKey(sub.order.id);
      if (!alreadyOk(key)) {
        results[key] = parentOk
          ? await send('/orders', sub, ordersVersion)
          : toResult(false, null, `Skipped: parent order ${parentId} was not created.`);
      }
      onProgress?.({ ...results }, ++done, total);
    }
  }
  return results;
};
