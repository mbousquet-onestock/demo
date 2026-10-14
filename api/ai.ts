// Vercel serverless function: AI generation of stock locations (OpenAI).
import { handleAiRequest } from './_aiCore.js';

export async function GET(request: Request): Promise<Response> {
  return handleAiRequest(request);
}

export async function POST(request: Request): Promise<Response> {
  return handleAiRequest(request);
}
