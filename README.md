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
- **Projects**: everything saved per project (payloads, stock point sets, order batches, manual steps) and replay of
  the API calls one by one or in bulk (selection by call, group or all; stock points first, parent orders before their
  orders), with the request and the saved / replay result side by side. Sub-folders: a project named `Client/Phase 1`
  is the sub-folder `Phase 1` of `Client`; selecting a folder replays it with its sub-folders (optional). Calls can be
  moved to another (new) sub-folder, and a folder can be renamed / moved with all its sub-folders.
- **API Settings**: API URL (qualif / prod shortcuts), version, site ID and token (paste the token returned by
  `POST /login`). Every call uses them; payloads keep `{{site_id}}` / `{{token}}` variables, resolved at call time.
  "Test token" calls `GET /sales_channels`.
- **Stock Points**: describe a network (context) and a count; OpenAI generates OneStock stock locations through
  `api/ai.ts` (batches of 25). Review them in a table and on a map, edit them, save the set under a project (synced
  to the database) and create them with `POST /endpoints` (one call per point, or bulk), with the result per point.
  OpenAI key: `OPENAI_API_KEY` on Vercel (usable only with the database access key), or a key typed in API Settings
  → OpenAI (stored encrypted). Model configurable (default `gpt-4.1-mini`).
- **Order Generator**: N orders (one parent order each) with min–max sub-orders, items per sub-order and quantity per
  item; strategies SFS / CKC / ROPIS drawn per sub-order; CKC / ROPIS collection points drawn from a list; sales
  channels loaded with `GET /sales_channels` (shown as id — label); several destination countries (one drawn per order,
  customers generated per country); customers / addresses and
  prices of articles without price generated with ChatGPT (API Settings key), sample data otherwise.
  Generated batches are saved under a project (synced to the database) and created in OneStock: parent orders with
  `POST /parent_orders` (v4) then sub-orders with `POST /orders` (v3 / v4), status per order and retry of the failed ones.
  Several saved batches can be merged into one (duplicate parent orders ignored, creation results kept).
- **Manual Steps**: checklist of the steps to perform by hand (OMC configuration, checks…), per project: status
  (to do / in progress / done), details, ordering, progress, copy as a Markdown checklist; synced to the database.
- **API Explorer**: all GET routes of the OneStock spec (`data/onestockGetEndpoints.json`, generated from the
  OpenAPI file). Requests / results are saved with a required name and an optional project, and listed by project.
  `GET /items` results can be opened in the Product Manager.
- **Product Manager**: open saved `GET /items` results, regenerate item / product IDs, build the `/items` payload, save it, and send it with `PATCH /items`.
  **Capture from a website**: a bookmarklet run by the user in their own browser, on the client website (product
  sheet, or category page whose product pages are read one by one in the user's session), reads the published product
  data (schema.org JSON-LD / microdata, OpenGraph) plus specification tables, gallery images and description; the page
  source can also be pasted. Captures (images as URLs, description, characteristics, variants with EAN / price) are
  saved per project in the database (`product_captures`) and become Product Manager articles (one per variant).
  Variants are read from the schema.org data (hasVariant, one offer per SKU, Product objects of the same group), from the
  product JSON of the page (Shopify, Magento, themes), from the Shopify product API (`/products/<handle>.js`, bookmarklet)
  or, as a last resort, from the size / colour selectors of the page (then SKU = parent id + colour + size).
  **Copy images to database** (Product Manager and capture panel): the images are downloaded by the server (public
  hosts only, 4 MB max; the browser retries when the host refuses the server), stored in the `app_images` table and
  served publicly at `https://<app>/img/<sha256>.<ext>`; the product image URLs (`image`, `images_big`) used by the
  `PATCH /items` payload are replaced by these URLs. Each image is filed under the project it was copied for (an image
  can belong to several projects); the Projects tab lists the images of a folder (and its sub-folders) and deletes them
  one by one or in bulk (an image still used by another project is kept), and renaming a folder renames its images. The app domain must be publicly reachable by OneStock (no Vercel
  deployment protection on that domain).

## Database (Vercel Postgres / Neon)

Settings (token included), saved payloads, stock point sets, order batches and manual steps are stored in
Postgres through the `api/data.ts` function (one `app_documents` table, created automatically). Each browser keeps a
localStorage copy as cache; the first sync of a browser uploads its local data, afterwards the database wins.

1. Vercel dashboard → project → **Storage** → create a **Neon** (Postgres) database and connect it to the project
   (this adds `DATABASE_URL`).
2. Add an `APP_ACCESS_KEY` environment variable (a long random secret) and redeploy. The data API refuses every call
   without it.
   Tokens / passwords are encrypted (AES-256-GCM) by the data API before reaching the database, with a key derived
   from `TOKEN_ENCRYPTION_KEY`, or from `APP_ACCESS_KEY` when it is not set. Changing that key makes stored tokens
   unreadable: paste the token again in API Settings.
3. In the app, **API Settings → Database**: enter the same key once per browser.

Local development: put `DATABASE_URL` and `APP_ACCESS_KEY` in `.env.local`. To use a local Postgres instead of Neon,
run the [local Neon HTTP proxy](https://github.com/TimoWilhelm/local-neon-http-proxy) and set
`NEON_FETCH_ENDPOINT=http://db.localtest.me:4444/sql`.

Limits: each request to a Vercel function is capped at 4.5 MB, so a single document (e.g. an import with many
base64 images) above ~3.5 MB cannot be saved; the sync status in the sidebar shows the error.
