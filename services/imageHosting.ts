import { CapturedProduct, Product } from '../types';
import { getAccessKey } from './dbSync';

// Images copied to the app database and served at <app>/img/<id>.<ext> (public URL for the /items payloads).
export const isHostedImage = (url: string) => url.startsWith(`${window.location.origin}/img/`);
export const isLocalOrigin = () => /^(localhost|127\.|0\.0\.0\.0|\[::1\])/.test(window.location.hostname);

const call = async (method: string, query = '', body?: unknown): Promise<any> => {
  const r = await fetch(`/api/image${query}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-App-Key': getAccessKey() },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
  return data;
};
const post = async (body: unknown): Promise<string> => `${window.location.origin}${(await call('POST', '', body)).path}`;

// Images are filed under the project they were copied for ("" = no project).
export interface HostedImage {
  id: string;
  path: string;
  contentType: string;
  size: number;
  sourceUrl: string | null;
  createdAt: string;
  projects: string[];
}
export const listImageProjects = async (): Promise<{ project: string; count: number; size: number }[]> =>
  (await call('GET', '?list=projects')).projects;
export const listImages = async (project: string): Promise<HostedImage[]> =>
  (await call('GET', `?list=images&project=${encodeURIComponent(project)}`)).images;
export const renameImageProject = async (from: string, to: string): Promise<{ moved: number }> =>
  call('PATCH', '', { from, to });
// Detaches the images from the project (all of them, or ids); images left without a project are deleted.
export const deleteImages = async (project: string, ids?: string[], subfolders = false): Promise<{ detached: number; deleted: number }> =>
  call('DELETE', '', { project, ids, subfolders });

const toBase64 = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
  reader.onerror = () => reject(reader.error);
  reader.readAsDataURL(blob);
});

// Keeps uploads under the function body limit (4.5 MB): large images are resized to 2000 px, JPEG.
const shrink = async (blob: Blob): Promise<Blob> => {
  if (blob.size <= 2_500_000) return blob;
  const bitmap = await createImageBitmap(blob);
  const scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => canvas.toBlob(b => (b ? resolve(b) : reject(new Error('Resize failed'))), 'image/jpeg', 0.85));
};

export const uploadImageFile = async (file: Blob, project = ''): Promise<string> => {
  const blob = await shrink(file);
  return post({ dataBase64: await toBase64(blob), contentType: blob.type || 'image/jpeg', project });
};

// The server downloads the image; when the image host refuses it, the browser tries (needs CORS on the image host).
export const hostImage = async (url: string, project = ''): Promise<string> => {
  if (isHostedImage(url)) return url;
  try {
    return await post({ sourceUrl: url, project });
  } catch (serverError: any) {
    if (/access key|APP_ACCESS_KEY|Database not configured/i.test(serverError?.message || '')) throw serverError;
    try {
      const r = await fetch(url, { mode: 'cors', credentials: 'omit' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const blob = await r.blob();
      if (!blob.type.startsWith('image/')) throw new Error('not an image');
      return await uploadImageFile(blob, project);
    } catch {
      throw serverError;
    }
  }
};

export interface HostingReport {
  copied: number;
  failed: { url: string; error: string }[];
}

// Copies every image URL (3 at a time); returns original URL → hosted URL.
export const hostImages = async (
  urls: string[], project: string, onProgress?: (done: number, total: number) => void
): Promise<{ map: Map<string, string>; report: HostingReport }> => {
  const todo = [...new Set(urls.filter(u => /^https?:\/\//i.test(u) && !isHostedImage(u)))];
  const map = new Map<string, string>();
  const report: HostingReport = { copied: 0, failed: [] };
  let next = 0, done = 0;
  const worker = async () => {
    while (next < todo.length) {
      const url = todo[next++];
      try {
        map.set(url, await hostImage(url, project));
        report.copied++;
      } catch (err: any) {
        report.failed.push({ url, error: err?.message || String(err) });
      }
      onProgress?.(++done, todo.length);
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  return { map, report };
};

const IMAGE_FEATURES = ['image', 'images_big', 'image_url'];
const swap = (map: Map<string, string>) => (u: any) => (typeof u === 'string' && map.has(u) ? map.get(u)! : u);

export const productImageUrls = (products: Product[]) => products.flatMap(p => [
  p.imageUrl, ...(p.images_big || []),
  ...Object.values(p.features || {}).flatMap(f => IMAGE_FEATURES.flatMap(k => (f?.[k] || []) as unknown[])),
].filter((u): u is string => typeof u === 'string' && !!u));

export const replaceProductImages = (products: Product[], map: Map<string, string>): Product[] => products.map(p => {
  const s = swap(map);
  const features = p.features && Object.fromEntries(Object.entries(p.features).map(([lang, f]) =>
    [lang, Object.fromEntries(Object.entries(f || {}).map(([k, v]) => [k, IMAGE_FEATURES.includes(k) ? (v || []).map(s) : v]))]));
  return { ...p, imageUrl: s(p.imageUrl), images_big: (p.images_big || []).map(s), ...(features ? { features } : {}) };
});

export const capturedImageUrls = (products: CapturedProduct[]) =>
  products.flatMap(p => [...p.images, ...p.variants.map(v => v.image)]).filter(Boolean);

export const replaceCapturedImages = (products: CapturedProduct[], map: Map<string, string>): CapturedProduct[] => {
  const s = swap(map);
  return products.map(p => ({ ...p, images: p.images.map(s), variants: p.variants.map(v => ({ ...v, image: s(v.image) })) }));
};
