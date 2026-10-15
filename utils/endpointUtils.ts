// Stock point (endpoint) ids found in a saved payload: GET /endpoints result ({ endpoints: [...] }),
// POST /endpoints payload ({ endpoint } or { endpoints }), or a plain array of ids / endpoints.
export const extractEndpointIds = (data: unknown): string[] | null => {
  const d = data as any;
  const list = Array.isArray(d) ? d : Array.isArray(d?.endpoints) ? d.endpoints : d?.endpoint ? [d.endpoint] : null;
  if (!list) return null;
  const ids = list
    .map((e: any) => (typeof e === 'string' ? e : e?.id))
    .filter((id: unknown): id is string => typeof id === 'string' && id.trim() !== '')
    .map((id: string) => id.trim());
  return ids.length > 0 ? Array.from(new Set(ids)) : null;
};

// Merges id lists keeping the first occurrence order.
export const mergeIds = (...lists: string[][]): string[] => Array.from(new Set(lists.flat()));
