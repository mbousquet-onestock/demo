<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/9a3fd48e-e3b5-4578-8bc1-b11f13a35c32

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## OneStock API access (Vercel proxy)

Every OneStock call goes through the serverless function `api/proxy.ts` (core logic in `api/_proxyCore.ts`):
the browser POSTs `{ url, method, body }` to `/api/proxy`, which forwards it to OneStock. GET routes with a JSON
body are sent with the documented `POST` + `X-HTTP-Method-Override: GET` transport.
`npm run dev` / `npm run preview` serve the same proxy locally.

- Only `*.onestock-retail.com` targets are allowed. Override with the `PROXY_ALLOWED_HOSTS` env var (comma-separated host suffixes).
- **Connections**: define instances (environment, version, site ID, user / password), get a token with `POST /login`
  and pick the active one. Its token and site ID are injected in every API call and payload of the app
  (automatic re-login on 401).
- **API Explorer**: all GET routes of the OneStock spec (`data/onestockGetEndpoints.json`, generated from the
  OpenAPI file), with request / result saving (local storage, import / export JSON).
- **Product Manager**: regenerate item / product IDs, build the `/items` payload, save it, and send it with `PATCH /items`.
