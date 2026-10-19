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
  orders), with the request and the saved / replay result side by side. Saved calls can be deleted one by one (✕) or
  in bulk (selection → Delete): a saved payload, a stock point of its set, an order (a parent order with its
  sub-orders); an emptied set / batch is deleted. Nothing is deleted in OneStock. Sub-folders: a project named `Client/Phase 1`
  is the sub-folder `Phase 1` of `Client`; selecting a folder replays it with its sub-folders (optional). Calls can be
  moved to another (new) sub-folder, and a folder can be renamed / moved with all its sub-folders.
- **API Settings**: the sites (label, site ID, and their own token returned by `POST /login` or a shared token
  used by several sites) and the API URLs (label, URL where
  `{site_id}` is replaced by the selected site; Qualif / Production by default), plus the API version. The site and
  the URL used by every call are chosen in the **top bar** dropdowns (QUALIF / PROD badge). Payloads keep
  `{{site_id}}` / `{{token}}` variables, resolved at call time. "Test token" calls `GET /sales_channels`.
- **Stock Points**: describe a network (context) and a count; OpenAI generates OneStock stock locations through
  `api/ai.ts` (batches of 25). Review them in a table and on a map, edit them, save the set under a project (synced
  to the database) and create them with `POST /endpoints` (one call per point, or bulk), with the result per point.
  OpenAI key: `OPENAI_API_KEY` on Vercel (usable only with the database access key), or a key typed in API Settings
  → OpenAI (stored encrypted). Model configurable (default `gpt-4.1-mini`).
  Every stock point sent with `POST /endpoints` (one by one, by 50, replay or downloaded payload) gets 24/7 opening
  hours (`opening_hours.timespans: [{start: 0, end: 604800}]` + timezone, Europe/Paris by default) unless it already has
  opening hours.
- **Order Generator**: N orders (one parent order each) with min–max sub-orders, items per sub-order and quantity per
  item; strategies SFS / CKC / ROPIS drawn per sub-order; CKC / ROPIS collection points drawn from a list; sales
  channels loaded with `GET /sales_channels` (shown as id — label); several destination countries (one drawn per order,
  customers generated per country); customers / addresses and
  prices of articles without price generated with ChatGPT (API Settings key), sample data otherwise.
  Generated batches are saved under a project (synced to the database) and created in OneStock: parent orders with
  `POST /parent_orders` (v4) then sub-orders with `POST /orders` (v3 / v4), status per order and retry of the failed ones.
  Several saved batches can be merged into one (duplicate parent orders ignored, creation results kept).
  Countries per sales channel (saved in the settings): each order takes a sales channel associated with its destination
  country (a channel without country serves every country); a selected country without channel blocks the generation.
  "Reset counters" puts the parent order number and the next sub-order number back to 1 (prefix and length kept).
- **Delivery Routes**: reads the Delivery Promise configuration of the selected site (`GET /delivery_routes`,
  `GET /zones`, `GET /endpoints`) and shows it: graph origin zones → destination zones (one colour per carrier, route
  detail with transit times, timetables and constraints), zones with their criteria and the stock points they contain.
  Route timetables (activity / opening, pickup, delivery) are read with `GET /timetables` and shown as weekly bars
  (spans = seconds from Monday 00:00; dated spans listed apart) with a status: OK, < 5 days, empty, not found, not set.
  Empty / missing timetables of the routes from the stock are reported in the article analysis and as a cause of the
  delivery promise failures (beyond_time_limit, no_eligible_route, missing_destination_timetable).
  Transit times (minimum / maximum transit hours) are shown per route; 0 h, not set or max < min is flagged (dashed curve
  in the graph, warnings in the analysis and the delivery promise causes).
  Delivery fees per route (`metric_values`, e.g. `cost`): null or not set is flagged (route table / detail, analysis,
  promise causes), and a valid delivery option without `cost` is flagged in the promise result.
  **Timetables** view: carrier timetables only (`GET /timetables` filtered on carrier_pickup / carrier_transit /
  carrier_delivery_timetable), weekly view, dated spans, detail read with `GET /timetables/{id}` (JSON),
  where it is used (routes, execution times) and the referenced timetables that GET /timetables does not return.
  **Execution times** (`GET /execution_times`): operation, duration ("2h", "30m"), execution moment and timetable
  (weekly view), the stock points using them (when GET /endpoints returns their `execution_times`); unreadable durations,
  missing / empty timetables and always_at_start without timetable are flagged, in the analysis and as promise causes.
  **Article analysis**: for an item and a destination (country, zip), reads the stock per stock point (`GET /stocks`
  and/or the saved `PATCH /stock_import` payloads), then tells for each stock point whether it can deliver and why not
  (in no origin zone, no route from its zones, destination not covered by the routes), on a map and in a table.
  Zone matching approximates the OneStock rules; sales channel, delivery method, timetables and constraints are not
  evaluated yet.
  **Delivery promise**: runs `GET /delivery_promises` for the item / destination (sales channel, delivery methods, qty,
  `debug.all`, fields `delivery_options.delivery_routes` / `excluded_line_items`; the payload can be edited) and shows
  per delivery option the status, ETA, routes used (matched with the configured routes), the failure reason with its
  meaning and what to check, compared with the local analysis, plus the debug data; the call can be saved. Per delivery
  method: the stock returned by its stock request (`debug.stocks`) and the delivery restrictions
  (`debug.delivery_restrictions`). Opening hours of the stock points with stock (`open`, next 7 days opening slots) are
  checked and reported as a possible cause (beyond_time_limit, no_eligible_route).
  When a delivery method has no (or a partial) result, the stock of the item through the **stock view** of that delivery
  method is read with `GET /stock_export` (`request_name` = OMC stock query, filtered on the item, per stock point and
  stock type, optional details): the stock view name is taken from the debug answer when present, else entered once and
  remembered per delivery method.
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
  Prices: price and strikethrough price (compare_at_price) per product and variant, from the schema.org offers
  (priceSpecification), the product JSON / Shopify API (compare_at_price) or the prices shown in the page; amounts are
  normalised ("1 299,90 €" → 1299.90 EUR) and fill the article price / compare-at price.
  Images: at most 4 per article, all related to the main image (gallery block holding the main image, same reference
  in the file name or same folder; size duplicates merged); a variant with its own image gets the images related to it.
  Variants are read from the schema.org data (hasVariant, one offer per SKU, Product objects of the same group), from the
  product JSON of the page (Shopify, Magento, themes), from the Shopify product API (`/products/<handle>.js`, bookmarklet)
  or, as a last resort, from the size / colour selectors of the page (then SKU = parent id + colour + size).
  **Images → PNG / Copy images as PNG** (Product Manager and capture panel): the images are downloaded by the server
  (public hosts only, 4 MB max; the browser retries when the host refuses the server), converted to PNG in the browser
  (2000 px max, under 3 MB), stored in the `app_images` table and served publicly at `https://<app>/img/<sha256>.png`
  (images already copied in another format are converted too); the product image URLs (`image`, `images_big`) used by the
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
