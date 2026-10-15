// Document store for the app data, backed by Postgres (Neon, via the Vercel Marketplace integration).
// Used by the Vercel function (api/data.ts) and by the Vite dev / preview middleware.
import { neon, neonConfig } from '@neondatabase/serverless';
import { timingSafeEqual } from 'node:crypto';
import { encryptSecrets, decryptSecrets, hasPlainSecrets } from './_secrets.js';

export const DATA_COLLECTIONS = ['history', 'connections', 'saved_payloads', 'settings', 'app_state', 'stock_point_sets', 'order_batches', 'manual_steps', 'product_captures'] as const;
export type DataCollection = typeof DATA_COLLECTIONS[number];

export interface DataDocument {
  id: string;
  data: unknown;
  updatedAt: string;
}

// Vercel functions refuse bodies above 4.5 MB: keep each response page under that.
const MAX_PAGE_BYTES = 3_000_000;
const MAX_PAGE_ROWS = 500;

const json = (status: number, data: unknown) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

const getDatabaseUrl = () => process.env.DATABASE_URL || process.env.POSTGRES_URL || '';

type Sql = ReturnType<typeof neon>;
let sqlClient: Sql | null = null;
let schemaReady: Promise<unknown> | null = null;

const getSql = async (): Promise<Sql> => {
  if (!sqlClient) {
    // Local development against a Neon HTTP proxy, e.g. "http://db.localtest.me:4444/sql".
    const localEndpoint = process.env.NEON_FETCH_ENDPOINT;
    if (localEndpoint) neonConfig.fetchEndpoint = localEndpoint;
    sqlClient = neon(getDatabaseUrl());
  }
  const sql = sqlClient;
  if (!schemaReady) {
    schemaReady = sql`
      CREATE TABLE IF NOT EXISTS app_documents (
        collection TEXT NOT NULL,
        id TEXT NOT NULL,
        data JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (collection, id)
      )`.catch(err => { schemaReady = null; throw err; });
  }
  await schemaReady;
  return sql;
};

const isAuthorized = (request: Request): boolean => {
  const expected = process.env.APP_ACCESS_KEY || '';
  const given = request.headers.get('x-app-key') || '';
  if (!expected || given.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(given), Buffer.from(expected));
};

const isCollection = (value: unknown): value is DataCollection =>
  typeof value === 'string' && (DATA_COLLECTIONS as readonly string[]).includes(value);

export const handleDataRequest = async (request: Request): Promise<Response> => {
  if (!getDatabaseUrl()) {
    return json(503, { error: 'Database not configured: connect a Postgres (Neon) database to the Vercel project (DATABASE_URL).' });
  }
  if (!process.env.APP_ACCESS_KEY) {
    return json(503, { error: 'APP_ACCESS_KEY is not set on the server: the database API stays closed until it is.' });
  }
  if (!isAuthorized(request)) {
    return json(401, { error: 'Invalid or missing access key.' });
  }

  try {
    const sql = await getSql();

    if (request.method === 'GET') {
      // GET ?collection=history&cursor=<last id> → one page of documents, ordered by id.
      const url = new URL(request.url);
      const collection = url.searchParams.get('collection');
      if (!isCollection(collection)) return json(400, { error: `Unknown collection "${collection}".` });
      const cursor = url.searchParams.get('cursor') || '';
      const rows = await sql`
        SELECT id, data::text AS data, updated_at
        FROM app_documents
        WHERE collection = ${collection} AND id > ${cursor}
        ORDER BY id
        LIMIT ${MAX_PAGE_ROWS}` as { id: string; data: string; updated_at: string }[];

      const documents: DataDocument[] = [];
      const toEncrypt: { id: string; data: unknown }[] = [];
      let size = 0;
      for (const row of rows) {
        if (documents.length > 0 && size + row.data.length > MAX_PAGE_BYTES) break;
        size += row.data.length;
        const stored = JSON.parse(row.data);
        // Documents written before encryption existed are re-saved encrypted.
        if (hasPlainSecrets(stored)) toEncrypt.push({ id: row.id, data: encryptSecrets(stored) });
        documents.push({ id: row.id, data: decryptSecrets(stored), updatedAt: new Date(row.updated_at).toISOString() });
      }
      if (toEncrypt.length > 0) {
        await sql`
          UPDATE app_documents AS d SET data = x.data
          FROM jsonb_to_recordset(${JSON.stringify(toEncrypt)}::jsonb) AS x(id text, data jsonb)
          WHERE d.collection = ${collection} AND d.id = x.id`;
      }
      const hasMore = documents.length < rows.length || rows.length === MAX_PAGE_ROWS;
      return json(200, { documents, nextCursor: hasMore ? documents[documents.length - 1]?.id ?? null : null });
    }

    if (request.method === 'POST') {
      // POST { collection, upserts?: [{ id, data }], deletes?: [id] }
      const body = await request.json().catch(() => null) as
        { collection?: unknown; upserts?: { id: string; data: unknown }[]; deletes?: string[] } | null;
      if (!body || !isCollection(body.collection)) return json(400, { error: 'Missing or unknown collection.' });
      const collection = body.collection;
      // Tokens / passwords are encrypted before they reach the database.
      const upserts = (Array.isArray(body.upserts) ? body.upserts.filter(u => u && typeof u.id === 'string' && u.id) : [])
        .map(u => ({ id: u.id, data: encryptSecrets(u.data) }));
      const deletes = Array.isArray(body.deletes) ? body.deletes.filter(id => typeof id === 'string') : [];

      if (upserts.length > 0) {
        await sql`
          INSERT INTO app_documents (collection, id, data, updated_at)
          SELECT ${collection}, x.id, x.data, now()
          FROM jsonb_to_recordset(${JSON.stringify(upserts)}::jsonb) AS x(id text, data jsonb)
          ON CONFLICT (collection, id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`;
      }
      if (deletes.length > 0) {
        await sql`DELETE FROM app_documents WHERE collection = ${collection} AND id = ANY(${deletes}::text[])`;
      }
      return json(200, { ok: true, upserted: upserts.length, deleted: deletes.length });
    }

    return json(405, { error: 'Method not allowed.' });
  } catch (err: any) {
    console.error('Data API error', err);
    return json(500, { error: `Database error: ${err?.message || String(err)}` });
  }
};
