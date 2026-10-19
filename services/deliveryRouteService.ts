import { OnestockApiVersion } from '../types';
import { onestockRequest, describeCallError, getApiTarget } from './onestockClient';
import { savedPayloadsStore } from './payloadStore';
import { createStore } from './persistedStore';

// ---- OneStock configuration (Delivery Promise)

export interface Zone {
  id: string;
  name?: string;
  comment?: string;
  country_codes?: string[];
  regions?: string[];
  timezones?: string[];
  zip_code?: string;
  excluded_zip_code?: string;
  included_endpoint_ids?: string[];
  excluded_endpoint_ids?: string[];
  included_zones?: string[];
  excluded_zones?: string[];
}

export interface DeliveryRoute {
  id: string;
  origin_zone_id?: string;
  destination_zone_id?: string;
  carrier?: { name?: string; option?: string };
  minimum_transit_hours?: number;
  maximum_transit_hours?: number;
  delivery_timetable_id?: string;
  opening_timetable_id?: string;
  pickup_timetable_id?: string;
  constraints?: {
    order_constraints?: { name?: string; op?: string; value?: unknown }[];
    parcel_constraints?: { formula?: string; op?: string; value?: unknown }[];
    parcel_info?: Record<string, string>;
  };
  information?: Record<string, unknown>;
  carrier_information?: Record<string, unknown>;
  // Custom costs of the route (delivery fees…): { cost: 4.9, … }.
  metric_values?: Record<string, number | null>;
}

export interface RouteEndpoint {
  id: string;
  name?: string;
  timezone?: string;
  open?: boolean;
  address?: {
    city?: string;
    zip_code?: string;
    coordinates?: { lat?: number; lon?: number; lng?: number };
    regions?: { country?: { code?: string }; state?: { code?: string } };
  };
  classification?: { endpoint_type?: string[] };
  opening_hours?: { id?: string; timespans?: unknown[]; timezone?: string; type?: string };
  opening_hours_next_seven_days?: { opening_hours?: any[] };
}

// Opening problem of a stock point (closed, no opening in the next 7 days, no timetable), '' when none is visible.
export const openingIssue = (ep: RouteEndpoint): string => {
  if (ep.open === false) return 'closed (open: false)';
  const next = ep.opening_hours_next_seven_days?.opening_hours;
  if (Array.isArray(next)) {
    const slots = next.filter(x => x && (typeof x !== 'object' || !Array.isArray(x) || x.length));
    if (slots.length === 0) return 'no opening in the next 7 days';
  }
  if (ep.opening_hours && Array.isArray(ep.opening_hours.timespans) && ep.opening_hours.timespans.length === 0) return 'opening hours without timespan';
  return '';
};

// Opening slots of the next 7 days, as returned by OneStock (for display).
export const nextOpenings = (ep: RouteEndpoint): string => {
  const next = ep.opening_hours_next_seven_days?.opening_hours;
  if (!Array.isArray(next)) return '';
  const fmt = (v: any) => (typeof v === 'number' ? new Date(v * 1000).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' }) : String(v));
  return next.slice(0, 4).map(x => (x && typeof x === 'object' && !Array.isArray(x)
    ? [x.start ?? x.from ?? x.open, x.end ?? x.to ?? x.close].filter(v => v !== undefined).map(fmt).join(' → ') || JSON.stringify(x)
    : Array.isArray(x) ? x.map(fmt).join(' → ') : fmt(x))).join(' · ');
};

export interface Timetable {
  id: string;
  name?: string;
  type?: string;
  description?: string;
  hours?: { timezone?: string; timespans?: { start?: number; end?: number; options?: Record<string, boolean> }[] };
  // Read from /timetable_versions (current version) or /timetables.
  source?: string;
  versionsCount?: number;
}

// Time of an operation (pick_pack…) and its timetable (GET /execution_times).
export interface ExecutionTime {
  id: string;
  name?: string;
  operation?: string;
  duration?: string;
  execution_moment?: string;
  timetable_id?: string;
  used_options?: string[];
}

export interface DeliveryConfig {
  routes: DeliveryRoute[];
  zones: Zone[];
  endpoints: RouteEndpoint[];
  // Timetables used by the routes (opening / pickup / delivery), by id.
  timetables?: Record<string, Timetable>;
  executionTimes?: ExecutionTime[];
  loadedAt: string;
  site: string;
}

// Last configuration read (kept while navigating between tabs).
export const deliveryConfigStore = createStore<DeliveryConfig | null>(null);

// First array of objects found in a response ({ delivery_routes: [...] }, { zones: [...] }, [...]).
const arrayIn = (body: unknown, keys: string[]): any[] => {
  if (Array.isArray(body)) return body;
  if (!body || typeof body !== 'object') return [];
  const o = body as Record<string, unknown>;
  for (const k of keys) if (Array.isArray(o[k])) return o[k] as any[];
  // Map { id: object }
  for (const k of keys) {
    const v = o[k];
    if (v && typeof v === 'object' && !Array.isArray(v)) return Object.entries(v).map(([id, x]) => ({ id, ...(x as object) }));
  }
  const first = Object.values(o).find(v => Array.isArray(v) && v.every(x => x && typeof x === 'object'));
  return (first as any[]) || [];
};

const get = async (path: string, body: Record<string, unknown>, version?: OnestockApiVersion) => {
  const { envelope } = await onestockRequest({ method: 'GET', path, body, version });
  if (envelope.status === 204) return null;
  if (!envelope.ok) throw new Error(`${path}: ${describeCallError(envelope)}`);
  return envelope.body;
};

const v3OrV4 = (): OnestockApiVersion => (getApiTarget().version === 'v4' ? 'v4' : 'v3');

export const fetchEndpoints = async (onProgress?: (n: number) => void): Promise<RouteEndpoint[]> => {
  const all: RouteEndpoint[] = [];
  const limit = 100;
  for (let start = 0; start < 20000; start += limit) {
    const body = await get('/endpoints', {
      // The id is always returned ("id" is not an accepted field).
      fields: ['name', 'address', 'classification', 'timezone', 'open', 'opening_hours', 'opening_hours_next_seven_days'],
      pagination: { start, limit },
    }, v3OrV4());
    const page = arrayIn(body, ['endpoints']);
    all.push(...page);
    onProgress?.(all.length);
    if (page.length < limit) break;
  }
  return all;
};

export const loadDeliveryConfig = async (onProgress?: (text: string) => void): Promise<DeliveryConfig> => {
  onProgress?.('Reading delivery routes…');
  const routes = arrayIn(await get('/delivery_routes', {}), ['delivery_routes', 'routes']) as DeliveryRoute[];
  onProgress?.('Reading zones…');
  const zones = arrayIn(await get('/zones', {}), ['zones']) as Zone[];
  onProgress?.('Reading stock points…');
  const endpoints = await fetchEndpoints(n => onProgress?.(`Reading stock points… ${n}`));
  onProgress?.('Reading execution times…');
  const executionTimes = arrayIn(await get('/execution_times', {}).catch(() => null), ['execution_times']) as ExecutionTime[];
  onProgress?.('Reading timetables…');
  const ttIds = [...new Set([...routeTimetableIds(routes), ...executionTimes.map(e => e.timetable_id).filter(Boolean) as string[]])];
  const timetables = await fetchTimetables(ttIds).catch(() => ({}));
  const config = { routes, zones, endpoints, timetables, executionTimes, loadedAt: new Date().toISOString(), site: getApiTarget().siteId };
  deliveryConfigStore.set(config);
  return config;
};

// ---- Zone matching (approximation of the OneStock rules, to explain the configuration)

export interface Place {
  country?: string;
  region?: string;
  zip?: string;
  timezone?: string;
  endpointId?: string;
}

export const placeOfEndpoint = (ep: RouteEndpoint): Place => ({
  country: ep.address?.regions?.country?.code,
  region: ep.address?.regions?.state?.code,
  zip: ep.address?.zip_code,
  timezone: ep.timezone,
  endpointId: ep.id,
});

const regexTest = (pattern: string | undefined, value: string | undefined) => {
  if (!pattern) return true;
  if (!value) return false;
  try { return new RegExp(pattern).test(value); } catch { return false; }
};

export interface ZoneMatch {
  match: boolean;
  // Why it matches / does not match (first decisive reason).
  reason: string;
}

// Exclusions first (stock points, zip, zones); then included stock points / zones; then the criteria, combined (AND).
export const matchZone = (zone: Zone | undefined, place: Place, zonesById: Map<string, Zone>, depth = 0): ZoneMatch => {
  if (!zone) return { match: false, reason: 'unknown zone' };
  if (depth > 8) return { match: false, reason: 'zone nesting too deep' };
  const id = place.endpointId;
  if (id && zone.excluded_endpoint_ids?.includes(id)) return { match: false, reason: `${id} is in excluded_endpoint_ids` };
  if (zone.excluded_zip_code && place.zip && regexTest(zone.excluded_zip_code, place.zip)) return { match: false, reason: `zip ${place.zip} matches excluded ${zone.excluded_zip_code}` };
  for (const ex of zone.excluded_zones || []) {
    if (matchZone(zonesById.get(ex), place, zonesById, depth + 1).match) return { match: false, reason: `in excluded zone ${ex}` };
  }
  if (id && zone.included_endpoint_ids?.includes(id)) return { match: true, reason: `${id} is in included_endpoint_ids` };
  for (const inc of zone.included_zones || []) {
    if (matchZone(zonesById.get(inc), place, zonesById, depth + 1).match) return { match: true, reason: `in included zone ${inc}` };
  }
  const hasCriteria = !!(zone.country_codes?.length || zone.regions?.length || zone.timezones?.length || zone.zip_code);
  if (!hasCriteria) {
    return { match: false, reason: zone.included_endpoint_ids?.length || zone.included_zones?.length ? 'not in the included stock points / zones' : 'zone without criteria' };
  }
  if (zone.country_codes?.length && !zone.country_codes.includes(place.country || '')) return { match: false, reason: `country ${place.country || '?'} not in ${zone.country_codes.join(', ')}` };
  if (zone.regions?.length && !zone.regions.includes(place.region || '')) return { match: false, reason: `region ${place.region || '?'} not in ${zone.regions.join(', ')}` };
  if (zone.timezones?.length && place.timezone !== undefined && !zone.timezones.includes(place.timezone)) return { match: false, reason: `timezone ${place.timezone} not in ${zone.timezones.join(', ')}` };
  if (!regexTest(zone.zip_code, place.zip)) return { match: false, reason: `zip ${place.zip || '?'} does not match ${zone.zip_code}` };
  return { match: true, reason: 'criteria match' };
};

export const zoneSummary = (z: Zone): string => [
  z.country_codes?.length && `countries ${z.country_codes.join(', ')}`,
  z.regions?.length && `regions ${z.regions.join(', ')}`,
  z.zip_code && `zip /${z.zip_code}/`,
  z.excluded_zip_code && `excl. zip /${z.excluded_zip_code}/`,
  z.timezones?.length && `tz ${z.timezones.join(', ')}`,
  z.included_endpoint_ids?.length && `+${z.included_endpoint_ids.length} stock point(s)`,
  z.excluded_endpoint_ids?.length && `-${z.excluded_endpoint_ids.length} stock point(s)`,
  z.included_zones?.length && `+zones ${z.included_zones.join(', ')}`,
  z.excluded_zones?.length && `-zones ${z.excluded_zones.join(', ')}`,
].filter(Boolean).join(' · ') || 'no criteria';

export const carrierLabel = (r: DeliveryRoute) => [r.carrier?.name, r.carrier?.option].filter(Boolean).join(' / ') || 'no carrier';

export const transitLabel = (r: DeliveryRoute) => {
  const a = r.minimum_transit_hours, b = r.maximum_transit_hours;
  if (a === undefined && b === undefined) return '';
  return a === b || b === undefined ? `${a ?? b} h` : `${a ?? 0}–${b} h`;
};

// ---- Stock of an article

export interface StockLine {
  endpoint_id: string;
  quantity: number;
  type?: string;
  source: 'onestock' | 'saved import';
}

const stockLinesIn = (body: unknown): any[] => {
  const out: any[] = [];
  const walk = (n: any, depth: number) => {
    if (!n || typeof n !== 'object' || depth > 6) return;
    if (Array.isArray(n)) { n.forEach(x => walk(x, depth + 1)); return; }
    if (typeof n.endpoint_id === 'string' && n.quantity !== undefined) { out.push(n); return; }
    Object.values(n).forEach(v => walk(v, depth + 1));
  };
  walk(body, 0);
  return out;
};

// Live stock (GET /stocks) of an item, per stock point.
export const fetchItemStock = async (itemId: string): Promise<StockLine[]> => {
  const body = await get('/stocks', { item_ids: [itemId] });
  return stockLinesIn(body)
    .filter(l => !l.item_id || String(l.item_id) === itemId)
    .map(l => ({ endpoint_id: String(l.endpoint_id), quantity: Number(l.quantity) || 0, type: l.type, source: 'onestock' as const }));
};

// Stock of an item in the PATCH /stock_import payloads saved in the app (latest payload wins per stock point).
export const savedImportStock = (itemId: string): StockLine[] => {
  const byEndpoint = new Map<string, StockLine>();
  [...savedPayloadsStore.get()]
    .filter(p => p.path.split('?')[0] === '/stock_import' && p.request && typeof p.request === 'object')
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .forEach(p => {
      stockLinesIn(p.request).filter(l => String(l.item_id) === itemId).forEach(l => {
        byEndpoint.set(String(l.endpoint_id), { endpoint_id: String(l.endpoint_id), quantity: Number(l.quantity) || 0, type: l.type, source: 'saved import' });
      });
    });
  return [...byEndpoint.values()];
};

// ---- Who can deliver

export type Verdict = 'deliverable' | 'no-origin-zone' | 'no-route' | 'destination-not-covered' | 'no-stock';

export interface EndpointAnalysis {
  endpoint: RouteEndpoint | { id: string; name?: string };
  quantity: number;
  originZones: Zone[];
  routes: DeliveryRoute[];
  // Routes whose destination zone matches the destination.
  deliveringRoutes: DeliveryRoute[];
  verdict: Verdict;
  explanation: string;
  // Closed / no opening hours: may prevent the promise (timetables) even when the routes exist.
  opening: string;
}

export const VERDICT_LABELS: Record<Verdict, { label: string; color: string }> = {
  deliverable: { label: 'Can deliver', color: '#059669' },
  'destination-not-covered': { label: 'Destination not covered', color: '#D97706' },
  'no-route': { label: 'No route from its zones', color: '#DC2626' },
  'no-origin-zone': { label: 'In no origin zone', color: '#7C3AED' },
  'no-stock': { label: 'No stock', color: '#9CA3AF' },
};

export const analyseDelivery = (
  config: DeliveryConfig,
  stock: StockLine[],
  destination: Place | null,
): EndpointAnalysis[] => {
  const zonesById = new Map(config.zones.map(z => [z.id, z]));
  const endpointsById = new Map(config.endpoints.map(e => [e.id, e]));
  const qty = new Map<string, number>();
  stock.forEach(l => qty.set(l.endpoint_id, (qty.get(l.endpoint_id) || 0) + l.quantity));
  const routeOrigins = new Set(config.routes.map(r => r.origin_zone_id).filter(Boolean) as string[]);
  const hasDestination = !!destination && !!(destination.country || destination.zip || destination.region);

  const ids = new Set([...qty.keys(), ...config.endpoints.map(e => e.id)]);
  return [...ids].map(id => {
    const endpoint = endpointsById.get(id) || { id };
    const quantity = qty.get(id) || 0;
    const place = placeOfEndpoint(endpoint as RouteEndpoint);
    // Only zones used as route origins matter for the delivery.
    const originZones = config.zones.filter(z => routeOrigins.has(z.id) && matchZone(z, place, zonesById).match);
    const routes = config.routes.filter(r => originZones.some(z => z.id === r.origin_zone_id));
    const deliveringRoutes = hasDestination
      ? routes.filter(r => matchZone(zonesById.get(r.destination_zone_id || ''), destination!, zonesById).match)
      : routes;
    let verdict: Verdict;
    let explanation: string;
    if (quantity <= 0) {
      verdict = 'no-stock';
      explanation = 'No stock for this article.';
    } else if (originZones.length === 0) {
      verdict = 'no-origin-zone';
      explanation = endpointsById.has(id)
        ? `Not in any origin zone of a route (country ${place.country || '?'}, zip ${place.zip || '?'}).`
        : 'Unknown stock point (not returned by GET /endpoints).';
    } else if (routes.length === 0) {
      verdict = 'no-route';
      explanation = `In zone(s) ${originZones.map(z => z.id).join(', ')} but no route starts there.`;
    } else if (deliveringRoutes.length === 0) {
      verdict = 'destination-not-covered';
      const reasons = routes.slice(0, 3).map(r => `${r.destination_zone_id}: ${matchZone(zonesById.get(r.destination_zone_id || ''), destination!, zonesById).reason}`);
      explanation = `Routes from ${originZones.map(z => z.id).join(', ')} do not reach the destination (${reasons.join(' ; ')}).`;
    } else {
      verdict = 'deliverable';
      explanation = `Via ${deliveringRoutes.map(r => `${carrierLabel(r)}${transitLabel(r) ? ` (${transitLabel(r)})` : ''}`).join(', ')}.`;
    }
    const opening = endpointsById.has(id) ? openingIssue(endpoint as RouteEndpoint) : '';
    return { endpoint, quantity, originZones, routes, deliveringRoutes, verdict, explanation, opening };
  });
};

// ---- Route timetables (activity / opening, pickup, delivery)

export const TIMETABLE_KINDS = [
  { key: 'opening_timetable_id', label: 'Activity (opening)' },
  { key: 'pickup_timetable_id', label: 'Pickup' },
  { key: 'delivery_timetable_id', label: 'Delivery' },
] as const;
export type TimetableKind = typeof TIMETABLE_KINDS[number]['key'];

export const routeTimetableIds = (routes: DeliveryRoute[]) =>
  [...new Set(routes.flatMap(r => TIMETABLE_KINDS.map(k => r[k.key])).filter(Boolean) as string[])];

// Route / execution time timetables: GET /timetables (filters.ids), then the whole list, then GET /timetables/{id}.
// ---- Timetables of the routes / execution times: GET /timetable_versions (current version of each timetable),
// then GET /timetables as a fallback.
const toSeconds = (v: any): number | null => {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return v > 1e12 ? v / 1000 : v;
  const t = Date.parse(String(v));
  return isNaN(t) ? null : t / 1000;
};
// Version in force: flagged active / current, else the one whose validity period covers now, else the latest.
const currentVersion = (versions: any[]): any => {
  if (versions.length <= 1) return versions[0];
  const flagged = versions.find(v => v?.active === true || v?.current === true || v?.is_current === true || /^(active|current|published|live)$/i.test(String(v?.status || '')));
  if (flagged) return flagged;
  const now = Date.now() / 1000;
  const covering = versions.filter(v => {
    const from = toSeconds(v?.from ?? v?.start_date ?? v?.valid_from ?? v?.start);
    const to = toSeconds(v?.to ?? v?.end_date ?? v?.valid_to ?? v?.end);
    return (from === null || from <= now) && (to === null || to >= now) && (from !== null || to !== null);
  });
  const pool = covering.length ? covering : versions;
  return [...pool].sort((x, y) => (Number(y?.version ?? y?.version_number ?? 0) - Number(x?.version ?? x?.version_number ?? 0))
    || String(y?.updated_at ?? y?.created_at ?? '').localeCompare(String(x?.updated_at ?? x?.created_at ?? '')))[0];
};
// Timetable id of a version entry (versions may carry the timetable id apart from their own id).
const versionTimetableId = (v: any): string => String(v?.timetable_id ?? v?.timetable?.id ?? v?.id ?? '');
const fromVersion = (id: string, v: any, count: number): Timetable => {
  const inner = v?.timetable && typeof v.timetable === 'object' ? { ...v.timetable, ...v } : v;
  return { ...inner, id, versionsCount: count, source: '/timetable_versions' } as Timetable;
};

export const fetchTimetables = async (ids: string[]): Promise<Record<string, Timetable>> => {
  const out: Record<string, Timetable> = {};
  if (ids.length === 0) return out;
  const keep = (id: string, versions: any[]) => {
    const v = currentVersion(versions.filter(Boolean));
    if (v && (!out[id] || rawSpans(v).length > 0)) out[id] = fromVersion(id, v, versions.length);
  };
  // 1. Versions of the listed timetables.
  for (let i = 0; i < ids.length; i += 100) {
    try {
      const list = arrayIn(await get('/timetable_versions', { filters: { ids: ids.slice(i, i + 100) } }), ['timetable_versions', 'versions', 'timetables']);
      const byId = new Map<string, any[]>();
      list.forEach((v: any) => { const id = versionTimetableId(v); if (ids.includes(id)) byId.set(id, [...(byId.get(id) || []), v]); });
      byId.forEach((versions, id) => keep(id, versions));
    } catch { /* per id below */ }
  }
  // 2. Versions of one timetable (GET /timetable_versions/{id}).
  for (const id of ids.filter(x => !out[x] || rawSpans(out[x]).length === 0)) {
    try {
      const body: any = await get(`/timetable_versions/${encodeURIComponent(id)}`, {});
      const list = arrayIn(body, ['timetable_versions', 'versions', 'timetables']);
      keep(id, list.length ? list : body && typeof body === 'object' ? [body.timetable_version || body.version || body] : []);
    } catch { /* fallback below */ }
  }
  // 3. Fallback: GET /timetables (filtered, then detail).
  const missing = ids.filter(x => !out[x] || rawSpans(out[x]).length === 0);
  if (missing.length) {
    try {
      arrayIn(await get('/timetables', { filters: { ids: missing } }), ['timetables']).forEach((t: any) => {
        const id = String(t?.id || '');
        if (missing.includes(id) && (!out[id] || rawSpans(t).length > 0)) out[id] = { ...t, source: '/timetables' };
      });
    } catch { /* detail below */ }
    for (const id of missing.filter(x => !out[x] || rawSpans(out[x]).length === 0)) {
      try {
        const body: any = await get(`/timetables/${encodeURIComponent(id)}`, {});
        const t = body?.timetable || body;
        if (t && typeof t === 'object' && (!out[id] || rawSpans(t).length > 0)) out[id] = { id, ...t, source: '/timetables' };
      } catch { /* reported as not found */ }
    }
  }
  return out;
};

const WEEK = 7 * 86400;
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const hhmm = (sec: number) => `${String(Math.floor(sec / 3600) % 24).padStart(2, '0')}:${String(Math.floor(sec / 60) % 60).padStart(2, '0')}`;

export interface TimetableReport {
  status: 'ok' | 'not-set' | 'not-found' | 'empty' | 'partial';
  // Weekly spans per day (0 = Monday), seconds from the start of the day.
  days: { start: number; end: number }[][];
  hoursPerWeek: number;
  // Spans given as dates (exceptions / one-off openings).
  exceptions: string[];
  summary: string;
}


// ---- Timetable formats: spans in hours.timespans (spec) or elsewhere; seconds / minutes from Monday 00:00,
// dates (seconds or ms), or "HH:MM" with a day.
const SPAN_KEYS = ['start', 'end', 'from', 'to', 'open', 'close', 'opening', 'closing', 'start_time', 'end_time'];
export const rawSpans = (t: any): any[] => {
  if (!t || typeof t !== 'object') return [];
  const direct = [t.hours?.timespans, t.timespans, Array.isArray(t.hours) ? t.hours : null, t.hours?.timespan, t.timetable?.hours?.timespans, t.opening_hours?.timespans]
    .find(a => Array.isArray(a) && a.length);
  if (direct) return direct as any[];
  // Any array of objects carrying a start / end.
  let found: any[] = [];
  const walk = (n: any, depth: number) => {
    if (found.length || !n || typeof n !== 'object' || depth > 6) return;
    if (Array.isArray(n)) {
      if (n.length && n.every(x => x && typeof x === 'object' && SPAN_KEYS.some(k => k in x))) { found = n; return; }
      n.forEach(x => walk(x, depth + 1));
      return;
    }
    Object.values(n).forEach(v => walk(v, depth + 1));
  };
  walk(t, 0);
  return found;
};

const DAY_INDEX: Record<string, number> = {
  monday: 0, mon: 0, lundi: 0, tuesday: 1, tue: 1, mardi: 1, wednesday: 2, wed: 2, mercredi: 2, thursday: 3, thu: 3, jeudi: 3,
  friday: 4, fri: 4, vendredi: 4, saturday: 5, sat: 5, samedi: 5, sunday: 6, sun: 6, dimanche: 6,
};
const clockSeconds = (v: string) => {
  const m = v.match(/^(\d{1,2})[:h](\d{2})(?::(\d{2}))?$/);
  return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3] || 0) : NaN;
};

export const normalizedSpans = (t: any): { start: number; end: number; date: boolean; options?: Record<string, boolean> }[] => {
  const raw = rawSpans(t).map(sp => ({
    s: sp.start ?? sp.from ?? sp.open ?? sp.opening ?? sp.start_time,
    e: sp.end ?? sp.to ?? sp.close ?? sp.closing ?? sp.end_time,
    day: sp.day ?? sp.weekday ?? sp.day_of_week,
    options: sp.options,
  }));
  // Week offsets: minutes when every offset fits in a week of minutes, else seconds.
  const offsets = raw.flatMap(r => [r.s, r.e]).filter(v => typeof v === 'number' && v < 1e9) as number[];
  const inMinutes = offsets.length > 0 && Math.max(...offsets) <= 7 * 1440;
  return raw.map(r => {
    if (typeof r.s === 'string' && typeof r.e === 'string') {
      // ISO dates, or "09:00" with a day.
      if (/^\d{4}-\d{2}-\d{2}/.test(r.s)) return { start: Date.parse(r.s) / 1000, end: Date.parse(r.e) / 1000, date: true, options: r.options };
      const day = typeof r.day === 'number' ? (r.day + 6) % 7 : DAY_INDEX[String(r.day || '').toLowerCase()];
      const base = (day ?? 0) * 86400;
      return { start: base + clockSeconds(r.s), end: base + clockSeconds(r.e), date: false, options: r.options };
    }
    let s = Number(r.s), e = Number(r.e);
    if (s > 1e12) return { start: s / 1000, end: e / 1000, date: true, options: r.options };
    if (s > 1e9 || s >= WEEK * 2) return { start: s, end: e, date: true, options: r.options };
    if (inMinutes) { s *= 60; e *= 60; }
    return { start: s, end: e, date: false, options: r.options };
  });
};

// Weekly spans are seconds from Monday 00:00 (values above one week are read as dates).
export const timetableReport = (id: string | undefined, timetables: Record<string, Timetable> | undefined): TimetableReport => {
  const days: { start: number; end: number }[][] = DAYS.map(() => []);
  if (!id) return { status: 'not-set', days, hoursPerWeek: 0, exceptions: [], summary: 'not set on the route' };
  const t = timetables?.[id];
  if (!t) return { status: 'not-found', days, hoursPerWeek: 0, exceptions: [], summary: `timetable ${id} not found` };
  const spans = normalizedSpans(t);
  const exceptions: string[] = [];
  let seconds = 0;
  spans.forEach(sp => {
    const { start, end } = sp;
    if (!isFinite(start) || !isFinite(end) || end <= start) return;
    if (sp.date) {
      const closed = sp.options && Object.entries(sp.options).filter(([, v]) => v).map(([k]) => k).join(', ');
      exceptions.push(`${new Date(start * 1000).toLocaleString()} → ${new Date(end * 1000).toLocaleString()}${closed ? ` (${closed})` : ''}`);
      return;
    }
    seconds += end - start;
    // A span may run over several days.
    for (let from = start; from < end;) {
      const day = Math.floor(from / 86400) % 7;
      const dayEnd = (Math.floor(from / 86400) + 1) * 86400;
      const to = Math.min(end, dayEnd);
      days[day].push({ start: from % 86400, end: to - Math.floor(from / 86400) * 86400 });
      from = to;
    }
  });
  const hoursPerWeek = Math.round(seconds / 360) / 10;
  const openDays = days.filter(d => d.length).length;
  const status: TimetableReport['status'] = hoursPerWeek === 0 ? 'empty' : openDays < 5 ? 'partial' : 'ok';
  const summary = hoursPerWeek === 0
    ? `${t.name || id}: no weekly time span${exceptions.length ? ` (${exceptions.length} dated span(s) only)` : ''}${rawSpans(t).length === 0 ? ` — no time span found in the timetable (fields: ${Object.keys(t).join(', ')})` : ''}`
    : `${t.name || id}: ${hoursPerWeek} h / week, ${openDays} day(s) · ${days.map((d, i) => (d.length ? `${DAYS[i]} ${d.map(x => `${hhmm(x.start)}-${hhmm(x.end)}`).join(',')}` : '')).filter(Boolean).join(' · ')}`;
  return { status, days, hoursPerWeek, exceptions, summary };
};

// Timetable problems of a route (empty / missing timetables), '' when none.
export const routeTimetableIssues = (r: DeliveryRoute, timetables: Record<string, Timetable> | undefined): string =>
  TIMETABLE_KINDS.map(k => ({ k, rep: timetableReport(r[k.key], timetables) }))
    .filter(({ rep }) => rep.status === 'empty' || rep.status === 'not-found')
    .map(({ k, rep }) => `${k.label}: ${rep.summary}`).join(' ; ');

// ---- Route transit time (minimum / maximum transit hours): 0 or missing is a configuration problem.
export const transitIssue = (r: DeliveryRoute): string => {
  const min = r.minimum_transit_hours, max = r.maximum_transit_hours;
  if (min === undefined && max === undefined) return 'transit time not set';
  if (!max) return `maximum transit time is ${max ?? 'not set'}`;
  if (min !== undefined && max < min) return `maximum (${max} h) lower than minimum (${min} h)`;
  if (min === 0) return 'minimum transit time is 0 h';
  return '';
};

// Reads again only the timetables of the routes / execution times of the loaded configuration.
export const reloadTimetables = async (config: DeliveryConfig): Promise<DeliveryConfig> => {
  const ids = [...new Set([...routeTimetableIds(config.routes), ...(config.executionTimes || []).map(e => e.timetable_id).filter(Boolean) as string[]])];
  const timetables = await fetchTimetables(ids);
  const next = { ...config, timetables };
  deliveryConfigStore.set(next);
  return next;
};

// ---- Execution times: duration ("2h", "30m", "1d") and timetable
export const durationMinutes = (d?: string): number | null => {
  if (!d) return null;
  const m = String(d).trim().match(/^(\d+(?:\.\d+)?)\s*([dhms]?)$/i);
  if (!m) return null;
  const n = parseFloat(m[1]);
  const unit = m[2].toLowerCase();
  return unit === 'd' ? n * 1440 : unit === 'h' ? n * 60 : unit === 's' ? n / 60 : n;
};

export const executionTimeIssue = (et: ExecutionTime, timetables: Record<string, Timetable> | undefined): string => {
  const issues: string[] = [];
  const minutes = durationMinutes(et.duration);
  if (minutes === null) issues.push(`duration "${et.duration ?? ''}" not readable`);
  if (et.timetable_id) {
    const rep = timetableReport(et.timetable_id, timetables);
    if (rep.status === 'empty' || rep.status === 'not-found') issues.push(rep.summary);
  } else if (/always_at_start/i.test(et.execution_moment || '')) {
    issues.push('timetable required (execution_moment always_at_start) but not set');
  }
  return issues.join(' ; ');
};

// Execution times of a stock point (when GET /endpoints returns them).
export const endpointExecutionTimes = (ep: RouteEndpoint, all: ExecutionTime[] | undefined): ExecutionTime[] => {
  const refs = (ep as any).execution_times;
  if (!Array.isArray(refs) || !all) return [];
  return refs.map((r: any) => all.find(e => e.id === (r?.id ?? r)) || { id: String(r?.id ?? r), operation: r?.operation }) as ExecutionTime[];
};

// ---- Route delivery fees (metric_values: custom costs of the route)
const FEE_KEY = /cost|fee|price|frais|shipping|tarif/i;
export const routeFees = (r: DeliveryRoute): { entries: [string, number | null][]; fee: number | null | undefined; key?: string } => {
  const entries = Object.entries(r.metric_values || {}) as [string, number | null][];
  const hit = entries.find(([k]) => FEE_KEY.test(k)) || entries[0];
  return { entries, fee: hit ? hit[1] : undefined, key: hit?.[0] };
};
export const feesIssue = (r: DeliveryRoute): string => {
  const { entries, fee, key } = routeFees(r);
  if (entries.length === 0) return 'no delivery fees (metric_values not set)';
  const nulls = entries.filter(([, v]) => v === null || v === undefined).map(([k]) => k);
  if (fee === null || fee === undefined) return `delivery fees null (${key})`;
  if (nulls.length) return `null value(s): ${nulls.join(', ')}`;
  return '';
};
export const feesLabel = (r: DeliveryRoute) => {
  const { entries } = routeFees(r);
  return entries.length ? entries.map(([k, v]) => `${k} ${v ?? 'null'}`).join(' · ') : '';
};
