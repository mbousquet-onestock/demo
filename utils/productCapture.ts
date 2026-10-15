import { CapturedProduct, Product } from '../types';

// Product sheet capture. The same self-contained function runs:
//  - in the app, on a pasted page source (parse mode: { doc, url }),
//  - in the bookmarklet, on the client website opened by the user in their own browser (bookmarklet mode: { app }).
// It must not reference anything outside its body: the bookmarklet is built from its source code.
// Data sources, in order: schema.org JSON-LD, schema.org microdata, OpenGraph / meta tags, then the HTML of the page
// (specification tables, gallery images, description block).
export function captureRuntime(opts: { app?: string; doc?: Document; url?: string; maxPages?: number; delayMs?: number }): any {
  const clean = (v: any, max = 4000): string => {
    if (v === null || v === undefined) return '';
    if (typeof v === 'object') return clean(v.name ?? v['@value'] ?? v.value ?? v.text ?? '', max);
    return String(v).replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim().slice(0, max);
  };
  const abs = (u: any, base: string): string => {
    if (!u || typeof u !== 'string') return '';
    try {
      const x = new URL(u.trim(), base);
      return x.protocol === 'http:' || x.protocol === 'https:' ? x.href : '';
    } catch { return ''; }
  };
  const list = (v: any): any[] => (v === undefined || v === null ? [] : Array.isArray(v) ? v : [v]);
  const uniq = (a: string[]) => a.filter((x, i) => x && a.indexOf(x) === i);
  const typesOf = (o: any): string[] => list(o && o['@type']).map((t: any) => String(t));
  const isProduct = (o: any) => typesOf(o).some(t => /(^|[/:])(Product|ProductGroup|ProductModel|IndividualProduct)$/i.test(t));

  const extract = (doc: Document, pageUrl: string) => {
    const meta = (name: string) => {
      const el = doc.querySelector(`meta[property="${name}"], meta[name="${name}"], meta[itemprop="${name}"]`);
      return el ? clean(el.getAttribute('content')) : '';
    };
    const images = (v: any): string[] => list(v).flatMap((i: any) =>
      typeof i === 'string' ? [abs(i, pageUrl)] : i && typeof i === 'object' ? [abs(i.contentUrl || i.url || i['@id'], pageUrl)] : []);
    const measure = (v: any) => (v && typeof v === 'object' ? `${clean(v.value)} ${clean(v.unitText || v.unitCode)}`.trim() : clean(v));

    // ---- JSON-LD
    const fromJsonLd = (o: any): any => {
      const offers = list(o.offers).flatMap((x: any) => [x, ...list(x && x.offers)]).filter(Boolean);
      const offer = offers.find((x: any) => x.price !== undefined || x.lowPrice !== undefined) || offers[0] || {};
      const characteristics: { name: string; value: string }[] = [];
      list(o.additionalProperty).forEach((p: any) => {
        const name = clean(p && p.name, 80);
        const value = clean(p && (p.value ?? p.description), 300);
        if (name && value) characteristics.push({ name, value });
      });
      ['material', 'pattern', 'model', 'gender', 'ageGroup'].forEach(k => {
        const value = clean(o[k], 300);
        if (value) characteristics.push({ name: k, value });
      });
      ['weight', 'width', 'height', 'depth'].forEach(k => {
        const value = measure(o[k]);
        if (value) characteristics.push({ name: k, value });
      });
      const audience = o.audience && clean(o.audience.suggestedGender || o.audience.audienceType);
      if (audience) characteristics.push({ name: 'audience', value: audience });
      const product = {
        name: clean(o.name, 300),
        sku: clean(o.sku || o.productID || o.mpn, 120),
        gtin: clean(o.gtin13 || o.gtin || o.gtin14 || o.gtin12 || o.gtin8 || o.isbn, 40),
        productGroupId: clean(o.productGroupID || o.inProductGroupWithID, 120),
        brand: clean(o.brand, 120),
        description: clean(o.description),
        images: images(o.image),
        url: abs(o.url || o['@id'], pageUrl),
        price: clean(offer.price ?? offer.lowPrice, 40),
        currency: clean(offer.priceCurrency, 10),
        availability: clean(offer.availability, 80).split('/').pop() || '',
        color: clean(o.color, 120),
        size: clean(o.size, 120),
        category: list(o.category).map((c: any) => clean(c, 200)).filter(Boolean).join(' > '),
        characteristics,
        variants: list(o.hasVariant).filter((v: any) => v && typeof v === 'object').map(fromJsonLd)
          .map((v: any) => ({ sku: v.sku, gtin: v.gtin, name: v.name, color: v.color, size: v.size, price: v.price, currency: v.currency, image: v.images[0] || '', url: v.url, availability: v.availability })),
        source: 'json-ld',
      };
      // Product group: price of its first variant.
      const v0 = product.variants.find((v: any) => v.price);
      if (!product.price && v0) { product.price = v0.price; product.currency = product.currency || v0.currency; }
      return product;
    };
    const found: any[] = [];
    const listUrls: string[] = [];
    const walk = (node: any, depth: number) => {
      if (!node || typeof node !== 'object' || depth > 8) return;
      if (Array.isArray(node)) { node.forEach(n => walk(n, depth + 1)); return; }
      if (isProduct(node)) { found.push(fromJsonLd(node)); return; }
      if (typesOf(node).some(t => /ItemList$/i.test(t))) {
        list(node.itemListElement).forEach((e: any) => {
          const u = abs(e && (e.url || (e.item && (typeof e.item === 'string' ? e.item : e.item.url))), pageUrl);
          if (u) listUrls.push(u);
        });
      }
      Object.keys(node).forEach(k => { if (k !== '@context') walk(node[k], depth + 1); });
    };
    doc.querySelectorAll('script[type="application/ld+json"]').forEach(s => {
      try { walk(JSON.parse((s.textContent || '').trim()), 0); } catch { /* invalid JSON-LD */ }
    });

    // ---- Microdata
    if (found.length === 0) {
      doc.querySelectorAll('[itemscope][itemtype*="schema.org/Product"], [itemscope][itemtype*="schema.org/ProductGroup"]').forEach(el => {
        if (el.parentElement && el.parentElement.closest('[itemscope][itemtype*="schema.org/Product"]')) return;
        const all = (prop: string) => Array.from(el.querySelectorAll(`[itemprop="${prop}"]`));
        const val = (e: Element | undefined): string => !e ? '' : clean(e.getAttribute('content') || e.getAttribute('src') || e.getAttribute('href') || e.textContent);
        const get = (prop: string) => val(all(prop)[0]);
        const characteristics: { name: string; value: string }[] = [];
        all('additionalProperty').forEach(p => {
          const name = val(p.querySelector('[itemprop="name"]') || undefined);
          const value = val(p.querySelector('[itemprop="value"]') || undefined);
          if (name && value) characteristics.push({ name, value });
        });
        found.push({
          name: get('name'), sku: get('sku') || get('productID') || get('mpn'), gtin: get('gtin13') || get('gtin'),
          productGroupId: get('productGroupID'), brand: get('brand'), description: get('description'),
          images: all('image').map(e => abs(e.getAttribute('content') || e.getAttribute('src') || e.getAttribute('href'), pageUrl)),
          url: abs(get('url'), pageUrl), price: get('price') || get('lowPrice'), currency: get('priceCurrency'),
          availability: get('availability').split('/').pop() || '', color: get('color'), size: get('size'), category: get('category'),
          characteristics, variants: [], source: 'microdata',
        });
      });
    }

    // ---- OpenGraph / meta (product pages without structured data)
    if (found.length === 0 && (/product/i.test(meta('og:type')) || meta('product:price:amount') || meta('og:price:amount'))) {
      const h1 = doc.querySelector('h1');
      found.push({
        name: meta('og:title') || clean(h1 && h1.textContent, 300), sku: meta('product:retailer_item_id'), gtin: '', productGroupId: '',
        brand: meta('product:brand') || meta('og:brand'), description: meta('og:description') || meta('description'),
        images: [abs(meta('og:image'), pageUrl)], url: abs(meta('og:url'), pageUrl) || pageUrl,
        price: meta('product:price:amount') || meta('og:price:amount'), currency: meta('product:price:currency') || meta('og:price:currency'),
        availability: meta('product:availability'), color: meta('product:color'), size: meta('product:size'), category: meta('product:category'),
        characteristics: [], variants: [], source: 'opengraph',
      });
    }

    // ---- HTML enrichment of a single product page: specification tables, gallery images, description block.
    if (found.length === 1) {
      const p = found[0];
      const zone = /spec|caract|feature|attribut|detail|technical|technique|composition|entretien|info/i;
      const inZone = (el: Element) => {
        let e: Element | null = el;
        for (let i = 0; e && i < 5; i++, e = e.parentElement) if (zone.test(`${e.id} ${e.getAttribute('class') || ''}`)) return true;
        return false;
      };
      const known = new Set(p.characteristics.map((c: any) => c.name.toLowerCase()));
      const add = (name: string, value: string) => {
        name = clean(name, 80).replace(/\s*:$/, '');
        value = clean(value, 300);
        if (!name || !value || name.length > 60 || known.has(name.toLowerCase()) || p.characteristics.length >= 60) return;
        known.add(name.toLowerCase());
        p.characteristics.push({ name, value });
      };
      doc.querySelectorAll('table').forEach(t => {
        if (!inZone(t)) return;
        t.querySelectorAll('tr').forEach(tr => {
          const cells = tr.querySelectorAll('th, td');
          if (cells.length === 2) add(cells[0].textContent || '', cells[1].textContent || '');
        });
      });
      doc.querySelectorAll('dl').forEach(dl => {
        if (!inZone(dl)) return;
        dl.querySelectorAll('dt').forEach(dt => {
          const dd = dt.nextElementSibling;
          if (dd && dd.tagName === 'DD') add(dt.textContent || '', dd.textContent || '');
        });
      });
      doc.querySelectorAll('li').forEach(li => {
        if (li.children.length > 3 || !inZone(li)) return;
        const m = clean(li.textContent, 400).match(/^([^:]{2,60})\s:\s*(.+)$/);
        if (m) add(m[1], m[2]);
      });

      const gallery = /gallery|galerie|carousel|slider|swiper|product[-_]?(image|media|photo)|pdp|zoom|thumbnails|visuel/i;
      const imgs: string[] = [];
      doc.querySelectorAll('img, source').forEach(img => {
        let e: Element | null = img, ok = false;
        for (let i = 0; e && i < 6; i++, e = e.parentElement) if (gallery.test(`${e.id} ${e.getAttribute('class') || ''}`)) { ok = true; break; }
        if (!ok) return;
        const srcset = (img.getAttribute('srcset') || img.getAttribute('data-srcset') || '').split(',').map(s => s.trim().split(/\s+/)[0]).filter(Boolean);
        const candidates = [img.getAttribute('data-zoom-image'), img.getAttribute('data-large'), img.getAttribute('data-full'), srcset[srcset.length - 1], img.getAttribute('data-src'), img.getAttribute('src')];
        const u = candidates.map(c => abs(c, pageUrl)).find(Boolean);
        if (u && !/logo|icon|sprite|placeholder|loader|blank|\.svg(\?|$)|data:/i.test(u)) imgs.push(u);
      });
      p.images = uniq([...p.images, ...imgs, abs(meta('og:image'), pageUrl)]);
      if (!p.description) {
        const d = Array.from(doc.querySelectorAll('[class*="description" i], [id*="description" i]'))
          .map(e => clean(e.textContent)).find(t => t.length >= 40);
        p.description = d || meta('og:description') || meta('description');
      }
      if (!p.url) p.url = abs(meta('og:url'), pageUrl) || pageUrl;
    }

    const products = found.filter(p => p.name || p.sku).map(p => ({
      ...p,
      images: uniq(p.images).slice(0, 20),
      currency: p.currency || meta('product:price:currency'),
      page: pageUrl,
      capturedAt: new Date().toISOString(),
    }));

    // ---- Product links of a listing page (category, search results).
    const links: string[] = [...listUrls];
    if (products.length === 0) {
      const origin = new URL(pageUrl).origin;
      doc.querySelectorAll('a[href]').forEach(a => {
        if (a.closest('header, nav, footer, [role="navigation"]')) return;
        let e: Element | null = a, ok = false;
        for (let i = 0; e && i < 5; i++, e = e.parentElement) if (/product|produit|item|tile|card|article/i.test(e.getAttribute('class') || '')) { ok = true; break; }
        if (!ok) return;
        const u = abs(a.getAttribute('href'), pageUrl);
        if (!u || !u.startsWith(origin)) return;
        const x = new URL(u);
        x.hash = '';
        if (x.pathname.length <= 1 || /cart|panier|account|compte|login|wishlist|search|recherche|store-locator|magasin/i.test(x.pathname)) return;
        if (x.href !== pageUrl) links.push(x.href);
      });
    }
    return { products, links: uniq(links).slice(0, 300) };
  };

  if (!opts.app) return extract(opts.doc as Document, opts.url || '');

  // ---- Bookmarklet: runs on the client website, in the user's browser session.
  const app = opts.app;
  const maxPages = opts.maxPages || 50;
  const delayMs = opts.delayMs || 800;
  const banner = (html: string) => {
    let b = document.getElementById('__onestock_capture');
    if (!b) {
      b = document.createElement('div');
      b.id = '__onestock_capture';
      b.setAttribute('style', 'position:fixed;top:16px;right:16px;z-index:2147483647;max-width:420px;padding:14px 16px;background:#002D72;color:#fff;font:13px/1.4 sans-serif;border-radius:12px;box-shadow:0 8px 30px rgba(0,0,0,.3)');
      document.body.appendChild(b);
    }
    b.innerHTML = `<b>OneStock capture</b><br>${html}<div style="text-align:right;margin-top:6px"><a href="#" style="color:#9cf" onclick="this.closest('#__onestock_capture').remove();return false">close</a></div>`;
    return b;
  };
  // The tool window is opened right away (still inside the click, so it is not blocked as a pop-up), then the
  // products are posted to it until it acknowledges them.
  const w = window.open(`${app}/#capture-${Date.now()}`, 'onestock_capture');
  const captureId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let sent = false;
  let payload: any[] | null = null;
  window.addEventListener('message', e => {
    if (e.origin === app && e.data && e.data.type === 'onestock-capture-ack' && e.data.id === captureId && !sent) {
      sent = true;
      banner(`✓ ${(payload || []).length} product(s) sent to the OneStock tool.`);
    }
  });
  const fallback = () => {
    if (sent || !payload) return;
    const b = banner(`The tool window did not answer. Copy this and paste it in Product Manager → Capture → "Paste":<br><textarea style="width:100%;height:120px;margin-top:6px;font:11px monospace;color:#000"></textarea>`);
    const t = b.querySelector('textarea') as HTMLTextAreaElement;
    t.value = JSON.stringify({ type: 'onestock-capture', page: location.href, products: payload });
    t.select();
  };
  const finish = (products: any[]) => {
    payload = products;
    if (!w) { fallback(); return; }
    banner(`Sending ${products.length} product(s)…`);
    const started = Date.now();
    const timer = setInterval(() => {
      if (sent || w.closed || Date.now() - started > 15000) {
        clearInterval(timer);
        if (!sent) fallback();
        return;
      }
      w.postMessage({ type: 'onestock-capture', id: captureId, page: location.href, products }, app);
    }, 500);
  };

  const first = extract(document, location.href);
  const productPages = first.products.length > 1 ? first.products.map((p: any) => p.url).filter((u: string) => u && u !== location.href) : [];
  const pages: string[] = first.products.length === 0 ? first.links : productPages;
  if (pages.length > 0 && confirm(`${first.products.length ? `${first.products.length} products listed on this page.` : 'No product sheet on this page.'} Open the ${Math.min(pages.length, maxPages)} first product page(s) of ${pages.length} found to read their full sheet (one page every ${delayMs / 1000} s)?`)) {
    (async () => {
      const all: any[] = [];
      let failed = 0;
      for (let i = 0; i < Math.min(pages.length, maxPages); i++) {
        banner(`Reading product page ${i + 1} / ${Math.min(pages.length, maxPages)}… (${all.length} product(s))`);
        try {
          const r = await fetch(pages[i], { credentials: 'include' });
          if (!r.ok) throw new Error(String(r.status));
          const d = new DOMParser().parseFromString(await r.text(), 'text/html');
          extract(d, pages[i]).products.forEach((p: any) => all.push(p));
        } catch { failed++; }
        await new Promise(res => setTimeout(res, delayMs));
      }
      if (failed) banner(`${failed} page(s) could not be read.`);
      finish(all.length ? all : first.products);
    })();
  } else if (first.products.length) {
    finish(first.products);
  } else {
    banner('No product found on this page (no structured data). Open a product sheet, or use "Paste the page source" in the tool.');
    if (w) w.close();
  }
  return null;
}

// Bookmarklet that sends the products of the page to this app (opened in a window named "onestock_capture").
export const buildBookmarklet = (appOrigin: string) =>
  `javascript:${encodeURIComponent(`(${captureRuntime.toString()})(${JSON.stringify({ app: appOrigin })})`)}`;

// Products found in a pasted page source (HTML) or a pasted bookmarklet result (JSON).
export const parseCaptureInput = (input: string, url: string): { products: CapturedProduct[]; links: string[] } => {
  const trimmed = input.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    const data = JSON.parse(trimmed);
    const products = Array.isArray(data) ? data : data.products;
    return { products: sanitizeCaptured(products, data.page || url), links: [] };
  }
  const doc = new DOMParser().parseFromString(trimmed, 'text/html');
  const base = url || doc.querySelector('link[rel="canonical"]')?.getAttribute('href') || doc.querySelector('meta[property="og:url"]')?.getAttribute('content') || 'https://example.invalid/';
  const result = captureRuntime({ doc, url: base });
  return { products: sanitizeCaptured(result.products, base), links: result.links };
};

// Captured data comes from another website: keep known fields, strings only, http(s) URLs only.
const str = (v: unknown, max = 4000) => (typeof v === 'string' || typeof v === 'number' ? String(v).slice(0, max) : '');
const url = (v: unknown) => {
  const s = str(v, 2000);
  return /^https?:\/\//i.test(s) ? s : '';
};
export const sanitizeCaptured = (products: unknown, page = ''): CapturedProduct[] =>
  (Array.isArray(products) ? products : []).slice(0, 500).filter(p => p && typeof p === 'object').map((p: any) => ({
    name: str(p.name, 300),
    sku: str(p.sku, 120),
    gtin: str(p.gtin, 40),
    productGroupId: str(p.productGroupId, 120),
    brand: str(p.brand, 120),
    description: str(p.description),
    images: (Array.isArray(p.images) ? p.images : []).map(url).filter(Boolean).slice(0, 20),
    url: url(p.url),
    page: url(p.page) || url(page),
    price: str(p.price, 40),
    currency: str(p.currency, 10),
    availability: str(p.availability, 80),
    color: str(p.color, 120),
    size: str(p.size, 120),
    category: str(p.category, 300),
    characteristics: (Array.isArray(p.characteristics) ? p.characteristics : []).slice(0, 80)
      .map((c: any) => ({ name: str(c && c.name, 80), value: str(c && c.value, 300) })).filter((c: any) => c.name && c.value),
    variants: (Array.isArray(p.variants) ? p.variants : []).slice(0, 200).filter((v: any) => v && typeof v === 'object').map((v: any) => ({
      sku: str(v.sku, 120), gtin: str(v.gtin, 40), name: str(v.name, 300), color: str(v.color, 120), size: str(v.size, 120),
      price: str(v.price, 40), currency: str(v.currency, 10), image: url(v.image), url: url(v.url), availability: str(v.availability, 80),
    })),
    source: str(p.source, 20) || 'html',
    capturedAt: str(p.capturedAt, 40) || new Date().toISOString(),
  })).filter(p => p.name || p.sku);

const featureKey = (name: string) => name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40) || 'feature';

// Captured products → Product Manager products: one product per variant (same product_id), characteristics in the features.
export const capturedToProducts = (captured: CapturedProduct[], defaultCurrency = 'EUR'): Product[] => {
  const stamp = Date.now().toString(36);
  let n = 0;
  return captured.flatMap(c => {
    const char = (re: RegExp) => c.characteristics.find(x => re.test(x.name))?.value || '';
    const parentSku = c.productGroupId || c.sku || c.gtin || `CAPT-${stamp}-${n}`;
    const rows = c.variants.length > 0 ? c.variants : [{ sku: c.sku, gtin: c.gtin, name: c.name, color: c.color, size: c.size, price: c.price, currency: c.currency, image: '', url: c.url, availability: c.availability }];
    return rows.map(v => {
      const index = n++;
      const sku = v.sku || v.gtin || (c.variants.length ? `${parentSku}-${index}` : parentSku);
      const images = [v.image, ...c.images].filter((x, i, a) => x && a.indexOf(x) === i);
      const color = v.color || c.color || char(/colou?r|couleur/i);
      const size = v.size || c.size || char(/size|taille|pointure/i);
      const price = v.price || c.price;
      const features: Record<string, (string | number | boolean)[]> = {
        name: [v.name || c.name],
        long_description: [c.description],
        image: [images[0] || ''],
        images_big: images,
        color: [color],
        size: [size],
        price: [price],
        brand: [c.brand],
        ean: [v.gtin || c.gtin],
        url: [v.url || c.url || c.page],
      };
      c.characteristics.forEach(x => {
        const key = featureKey(x.name);
        if (!(key in features)) features[key] = [x.value];
      });
      Object.keys(features).forEach(k => { if (features[k].every(x => x === '')) delete features[k]; });
      return {
        id: `${sku}-${stamp}${index}`,
        sku,
        parentSku,
        name: v.name || c.name,
        description: c.description,
        imageUrl: images[0] || '',
        productUrl: v.url || c.url || c.page,
        price,
        currency: v.currency || c.currency || defaultCurrency,
        color,
        size,
        category: c.category,
        department: c.brand,
        subdepartment: '',
        weight: parseFloat(char(/weight|poids/i)) || 0,
        length: 0,
        width: 0,
        height: 0,
        images_big: images,
        features: { fr: features, en: { ...features } },
      };
    });
  });
};

const identity = (p: CapturedProduct) => `${p.productGroupId || p.sku || p.gtin || p.name}|${p.url || p.page}`;

// Adds products to a captured list; a product captured again replaces the previous capture.
export const mergeCaptured = (current: CapturedProduct[], added: CapturedProduct[]): CapturedProduct[] => {
  const keys = new Set(added.map(identity));
  return [...added, ...current.filter(p => !keys.has(identity(p)))];
};
