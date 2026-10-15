// Images copied to the database (Neon), served at a public URL for the OneStock /items payloads.
//   POST /api/image (X-App-Key)  { sourceUrl } or { dataBase64, contentType }  → { id, url, contentType, size }
//   GET  /img/<id>.<ext>  (public, rewritten to /api/image?id=<id>)            → the image
// Ids are the SHA-256 of the content: an image is stored once, and its URL cannot be guessed.
import { createHash } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { getSql, getDatabaseUrl, isAuthorized, Sql } from './_dataCore.js';

const MAX_BYTES = 4_000_000;
const TYPES: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif',
};

const json = (status: number, data: unknown) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

let tableReady: Promise<unknown> | null = null;
const imagesTable = async (): Promise<Sql> => {
  const sql = await getSql();
  if (!tableReady) {
    tableReady = sql`
      CREATE TABLE IF NOT EXISTS app_images (
        id TEXT PRIMARY KEY,
        content_type TEXT NOT NULL,
        data TEXT NOT NULL,
        size INTEGER NOT NULL,
        source_url TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )`.catch(err => { tableReady = null; throw err; });
  }
  await tableReady;
  return sql;
};

// Only public addresses: the server never fetches the local network / cloud metadata.
const isPrivateAddress = (ip: string) => {
  if (isIP(ip) === 6) {
    const v = ip.toLowerCase();
    if (v.startsWith('::ffff:')) return isPrivateAddress(v.slice(7));
    return v === '::1' || v === '::' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe8') || v.startsWith('fe9') || v.startsWith('fea') || v.startsWith('feb');
  }
  const [a, b] = ip.split('.').map(Number);
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
};

const fetchImage = async (sourceUrl: string): Promise<{ bytes: Buffer; contentType: string }> => {
  let current = sourceUrl;
  for (let hop = 0; hop < 4; hop++) {
    const u = new URL(current);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error('Only http(s) image URLs.');
    const addresses = isIP(u.hostname) ? [{ address: u.hostname }] : await lookup(u.hostname, { all: true });
    if (addresses.length === 0 || addresses.some(a => isPrivateAddress(a.address))) throw new Error(`Host not allowed: ${u.hostname}`);
    const r = await fetch(u, {
      redirect: 'manual',
      signal: AbortSignal.timeout(15000),
      headers: { Accept: 'image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8', 'User-Agent': 'Mozilla/5.0 (compatible; OneStockDemoTools/1.0)' },
    });
    if (r.status >= 300 && r.status < 400 && r.headers.get('location')) {
      current = new URL(r.headers.get('location')!, u).href;
      continue;
    }
    if (!r.ok) throw new Error(`HTTP ${r.status} from the image host`);
    const contentType = (r.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (!TYPES[contentType]) throw new Error(`Not a supported image (${contentType || 'unknown type'})`);
    const bytes = Buffer.from(await r.arrayBuffer());
    if (bytes.length > MAX_BYTES) throw new Error('Image larger than 4 MB');
    return { bytes, contentType };
  }
  throw new Error('Too many redirects');
};

export const handleImageRequest = async (request: Request): Promise<Response> => {
  if (!getDatabaseUrl()) return json(503, { error: 'Database not configured (DATABASE_URL).' });
  try {
    if (request.method === 'GET' || request.method === 'HEAD') {
      const id = (new URL(request.url).searchParams.get('id') || '').replace(/\.[a-z0-9]+$/i, '');
      if (!/^[a-f0-9]{32}$/.test(id)) return json(400, { error: 'Invalid image id.' });
      const sql = await imagesTable();
      const rows = await sql`SELECT content_type, data FROM app_images WHERE id = ${id}` as { content_type: string; data: string }[];
      if (rows.length === 0) return json(404, { error: 'Image not found.' });
      const bytes = Buffer.from(rows[0].data, 'base64');
      return new Response(request.method === 'HEAD' ? null : bytes, {
        status: 200,
        headers: {
          'Content-Type': rows[0].content_type,
          'Content-Length': String(bytes.length),
          'Cache-Control': 'public, max-age=31536000, immutable',
          'Access-Control-Allow-Origin': '*',
          'X-Content-Type-Options': 'nosniff',
        },
      });
    }

    if (request.method === 'POST') {
      if (!process.env.APP_ACCESS_KEY) return json(503, { error: 'APP_ACCESS_KEY is not set on the server.' });
      if (!isAuthorized(request)) return json(401, { error: 'Invalid or missing access key.' });
      const body = await request.json().catch(() => null) as { sourceUrl?: unknown; dataBase64?: unknown; contentType?: unknown } | null;
      let image: { bytes: Buffer; contentType: string };
      let sourceUrl: string | null = null;
      if (body && typeof body.sourceUrl === 'string') {
        sourceUrl = body.sourceUrl.slice(0, 2000);
        try {
          image = await fetchImage(sourceUrl);
        } catch (err: any) {
          return json(502, { error: `Image not copied: ${err?.message || err}` });
        }
      } else if (body && typeof body.dataBase64 === 'string' && typeof body.contentType === 'string' && TYPES[body.contentType]) {
        image = { bytes: Buffer.from(body.dataBase64, 'base64'), contentType: body.contentType };
        if (image.bytes.length === 0 || image.bytes.length > MAX_BYTES) return json(400, { error: 'Empty image or larger than 4 MB.' });
      } else {
        return json(400, { error: 'Expected { sourceUrl } or { dataBase64, contentType } (jpeg, png, webp, gif, avif).' });
      }
      const id = createHash('sha256').update(image.bytes).digest('hex').slice(0, 32);
      const sql = await imagesTable();
      await sql`
        INSERT INTO app_images (id, content_type, data, size, source_url)
        VALUES (${id}, ${image.contentType}, ${image.bytes.toString('base64')}, ${image.bytes.length}, ${sourceUrl})
        ON CONFLICT (id) DO NOTHING`;
      return json(200, { id, path: `/img/${id}.${TYPES[image.contentType]}`, contentType: image.contentType, size: image.bytes.length });
    }

    return json(405, { error: 'Method not allowed.' });
  } catch (err: any) {
    console.error('Image API error', err);
    return json(500, { error: `Image error: ${err?.message || String(err)}` });
  }
};
