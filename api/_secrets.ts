// Encryption at rest of the secrets stored in the database (fields named "token", "password" or "openaiApiKey").
// AES-256-GCM, key derived from TOKEN_ENCRYPTION_KEY (or APP_ACCESS_KEY when it is not set).
// The browser always sees clear values: encryption / decryption happen in the data API only.
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';

const PREFIX = 'enc:v1:';
const SECRET_FIELDS = ['token', 'password', 'openaiapikey'];

let cachedKey: { secret: string; key: Buffer } | null = null;

const getKey = (): Buffer => {
  const secret = process.env.TOKEN_ENCRYPTION_KEY || process.env.APP_ACCESS_KEY || '';
  if (!secret) throw new Error('No encryption key: set TOKEN_ENCRYPTION_KEY (or APP_ACCESS_KEY).');
  if (cachedKey?.secret !== secret) {
    cachedKey = { secret, key: scryptSync(secret, 'onestock-app-documents', 32) };
  }
  return cachedKey.key;
};

const isPlaceholder = (value: string) => /^\{\{\s*[\w.-]+\s*\}\}$/.test(value.trim());

const isPlainSecret = (key: string, value: unknown): value is string =>
  SECRET_FIELDS.includes(key.toLowerCase()) && typeof value === 'string' && value !== ''
  && !value.startsWith(PREFIX) && !isPlaceholder(value);

export const encryptValue = (plain: string): string => {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return `${PREFIX}${iv.toString('base64')}:${cipher.getAuthTag().toString('base64')}:${encrypted.toString('base64')}`;
};

export const decryptValue = (stored: string): string => {
  const [iv, tag, data] = stored.slice(PREFIX.length).split(':');
  const decipher = createDecipheriv('aes-256-gcm', getKey(), Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8');
};

const walk = (value: unknown, onField: (key: string, v: unknown) => unknown): unknown => {
  if (Array.isArray(value)) return value.map(v => walk(v, onField));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => {
      const replaced = onField(k, v);
      return [k, replaced !== undefined ? replaced : walk(v, onField)];
    }));
  }
  return value;
};

// Encrypts every clear "token" / "password" value of a document.
export const encryptSecrets = (doc: unknown): unknown =>
  walk(doc, (key, v) => (isPlainSecret(key, v) ? encryptValue(v) : undefined));

// Decrypts them for the browser. A value that cannot be decrypted (key changed) comes back empty.
export const decryptSecrets = (doc: unknown): unknown =>
  walk(doc, (key, v) => {
    if (!SECRET_FIELDS.includes(key.toLowerCase()) || typeof v !== 'string' || !v.startsWith(PREFIX)) return undefined;
    try { return decryptValue(v); } catch { return ''; }
  });

// True when a stored document still holds a clear secret (written before encryption existed).
export const hasPlainSecrets = (doc: unknown): boolean => {
  let found = false;
  walk(doc, (key, v) => { if (isPlainSecret(key, v)) found = true; return undefined; });
  return found;
};
