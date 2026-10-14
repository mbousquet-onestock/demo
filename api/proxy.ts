// Vercel serverless function: every OneStock API call made by the app goes through POST /api/proxy.
import { handleProxyRequest } from './_proxyCore';

export async function POST(request: Request): Promise<Response> {
  return handleProxyRequest(request);
}

export async function GET(request: Request): Promise<Response> {
  return handleProxyRequest(request);
}
