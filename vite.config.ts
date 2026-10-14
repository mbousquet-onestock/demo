import path from 'path';
import { defineConfig, loadEnv, Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { handleProxyRequest } from './api/_proxyCore';

// Serves /api/proxy during `vite dev` / `vite preview` with the same logic as the Vercel function.
const proxyMiddleware = async (req: any, res: any) => {
  try {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const request = new Request('http://localhost/api/proxy', {
      method: req.method,
      headers: { 'Content-Type': 'application/json' },
      body: req.method === 'GET' || req.method === 'HEAD' ? undefined : Buffer.concat(chunks),
    });
    const response = await handleProxyRequest(request);
    res.statusCode = response.status;
    response.headers.forEach((value, key) => res.setHeader(key, value));
    res.end(await response.text());
  } catch (err: any) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: err?.message || String(err) }));
  }
};

const onestockProxyDevPlugin = (): Plugin => ({
  name: 'onestock-proxy-dev',
  configureServer(server) {
    server.middlewares.use('/api/proxy', proxyMiddleware);
  },
  configurePreviewServer(server) {
    server.middlewares.use('/api/proxy', proxyMiddleware);
  },
});

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    if (env.PROXY_ALLOWED_HOSTS) process.env.PROXY_ALLOWED_HOSTS = env.PROXY_ALLOWED_HOSTS;
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react(), onestockProxyDevPlugin()],
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
