// Vercel serverless function: images copied to the database, public GET for the OneStock payloads.
import { handleImageRequest } from './_imageCore.js';

export async function GET(request: Request): Promise<Response> {
  return handleImageRequest(request);
}

export async function HEAD(request: Request): Promise<Response> {
  return handleImageRequest(request);
}

export async function POST(request: Request): Promise<Response> {
  return handleImageRequest(request);
}
