// Vercel serverless function: app data persistence (history, connections, saved payloads, settings).
import { handleDataRequest } from './_dataCore.js';

export async function GET(request: Request): Promise<Response> {
  return handleDataRequest(request);
}

export async function POST(request: Request): Promise<Response> {
  return handleDataRequest(request);
}
