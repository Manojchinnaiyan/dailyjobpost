import { defineMiddleware } from 'astro:middleware';
import { SESSION_COOKIE } from './lib/auth';

/**
 * Edge cache for public, anonymous GET pages — fail-safe edition.
 *
 * Goal: serve repeat/crawler hits from Cloudflare's edge cache so they don't hit
 * D1 (we were ~9x over the free read limit). The previous version cached a
 * *streamed* body, which corrupted on replay and 500'd cached pages. This version is
 * built so caching can NEVER break a response:
 *   - We always return Astro's ORIGINAL response untouched; only a fully
 *     BUFFERED clone is stored in the cache.
 *   - Every cache operation is wrapped in try/catch; on any error we just serve
 *     the page normally.
 *   - A versioned cache key ignores any previously-stored (corrupted) entries.
 */
const CACHE_VERSION = '2';
const CACHEABLE = [
  /^\/$/, /^\/jobs\/[^/]+\/?$/, /^\/category\//, /^\/jobs-in\//, /^\/roles\//,
  /^\/remote\/?$/, /^\/internships\/?$/, /^\/guides(\/|$)/, /^\/sitemap\.xml$/,
];
const STRIP = ['il', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'fbclid', 'gclid', 'ref'];

function cacheKey(url: URL): Request {
  const u = new URL(url.toString());
  for (const p of STRIP) u.searchParams.delete(p);
  u.searchParams.sort();
  u.searchParams.set('_cv', CACHE_VERSION); // version namespace — ignores old entries
  return new Request(u.toString(), { method: 'GET' });
}

export const onRequest = defineMiddleware(async (context, next) => {
  const { request } = context;
  const url = new URL(request.url);

  const eligible =
    request.method === 'GET' &&
    !url.pathname.startsWith('/admin') &&
    !url.pathname.startsWith('/api') &&
    !context.cookies.get(SESSION_COOKIE)?.value &&
    CACHEABLE.some((re) => re.test(url.pathname));

  const cache = (globalThis as unknown as { caches?: { default?: Cache } }).caches?.default;
  if (!eligible || !cache) return next();

  // 1) Try to serve from cache — never let a cache miss/error break the request.
  try {
    const hit = await cache.match(cacheKey(url));
    if (hit) return hit;
  } catch { /* fall through to render */ }

  // 2) Render normally.
  const res = await next();

  // 3) Best-effort store a BUFFERED clone. Always return the original response.
  try {
    const ct = res.headers.get('content-type') || '';
    const storable = res.status === 200 && /text\/html|application\/xml/.test(ct) && !res.headers.get('set-cookie');
    if (storable) {
      const ttl = url.pathname === '/sitemap.xml' || url.pathname.startsWith('/jobs/') ? 3600 : 1800;
      const cc = `public, s-maxage=${ttl}, stale-while-revalidate=86400`;
      const buf = await res.clone().arrayBuffer();            // buffer the CLONE, not the original
      const headers = new Headers(res.headers);
      headers.set('Cache-Control', cc);
      const stored = new Response(buf, { status: 200, headers });
      const rt = (context.locals as { runtime?: { ctx?: { waitUntil?: (p: Promise<unknown>) => void } } }).runtime;
      if (rt?.ctx?.waitUntil) rt.ctx.waitUntil(cache.put(cacheKey(url), stored));
      else await cache.put(cacheKey(url), stored.clone());
      try { res.headers.set('Cache-Control', cc); } catch { /* immutable headers — ignore */ }
    }
  } catch { /* caching is best-effort — never break the response */ }

  return res; // original, untouched, always valid
});
