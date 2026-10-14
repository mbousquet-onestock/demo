import path from 'path';
import { defineConfig, loadEnv, Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { handleProxyRequest } from './api/_proxyCore';
import { handleDataRequest } from './api/_dataCore';

// Serves the /api functions during `vite dev` / `vite preview` with the same logic as on Vercel.
const apiMiddleware = (route: string, handler: (request: Request) => Promise<Response>) => async (req: any, res: any) => {
  try {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const headers = new Headers({ 'Content-Type': 'application/json' });
    if (req.headers['x-app-key']) headers.set('X-App-Key', req.headers['x-app-key']);
    // Connect strips the mount path: req.url only holds the query string part.
    const request = new Request(`http://localhost${route}${req.url === '/' ? '' : req.url}`, {
      method: req.method,
      headers,
      body: req.method === 'GET' || req.method === 'HEAD' ? undefined : Buffer.concat(chunks),
    });
    const response = await handler(request);
    res.statusCode = response.status;
    response.headers.forEach((value, key) => res.setHeader(key, value));
    res.end(await response.text());
  } catch (err: any) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: err?.message || String(err) }));
  }
};

const mountApi = (middlewares: any) => {
  middlewares.use('/api/proxy', apiMiddleware('/api/proxy', handleProxyRequest));
  middlewares.use('/api/data', apiMiddleware('/api/data', handleDataRequest));
};

const onestockApiDevPlugin = (): Plugin => ({
  name: 'onestock-api-dev',
  configureServer(server) { mountApi(server.middlewares); },
  configurePreviewServer(server) { mountApi(server.middlewares); },
});

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    // Server-side variables used by the local /api middleware (read from .env.local).
    for (const key of ['PROXY_ALLOWED_HOSTS', 'DATABASE_URL', 'POSTGRES_URL', 'APP_ACCESS_KEY', 'TOKEN_ENCRYPTION_KEY', 'NEON_FETCH_ENDPOINT']) {
      if (env[key]) process.env[key] = env[key];
    }
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react(), onestockApiDevPlugin()],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
