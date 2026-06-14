import { defineMiddleware } from 'astro:middleware';
import { SESSION_COOKIE } from './lib/auth';

/**
 * Edge cache for public, anonymous GET pages.
 *
 * Every page is SSR and hits D1. Crawlers (Google + the ~190 new SEO landing
 * pages) and repeat visitors were driving D1 reads ~9× over the free limit.
 * This caches rendered HTML/XML in Cloudflare's edge cache so repeat hits are
 * served without touching D1. Content changes at most daily, so a short TTL is
 * safe and cuts reads dramatically.
 */
const CACHEABLE = [
  /^\/$/, /^\/jobs\/[^/]+\/?$/, /^\/category\//, /^\/jobs-in\//, /^\/roles\//,
  /^\/remote\/?$/, /^\/internships\/?$/, /^\/guides(\/|$)/, /^\/sitemap\.xml$/,
];
// Tracking/junk params that shouldn't fragment the cache (esp. our ?il= links).
const STRIP = ['il', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'fbclid', 'gclid', 'ref'];

function cacheKey(url: URL): Request {
  const u = new URL(url.toString());
  for (const p of STRIP) u.searchParams.delete(p);
  u.searchParams.sort();
  return new Request(u.toString(), { method: 'GET' });
}

export const onRequest = defineMiddleware(async (context, next) => {
  const { request } = context;
  const url = new URL(request.url);

  const eligible =
    request.method === 'GET' &&
    !url.pathname.startsWith('/admin') &&
    !url.pathname.startsWith('/api') &&
    !context.cookies.get(SESSION_COOKIE)?.value &&        // never cache logged-in admin
    CACHEABLE.some((re) => re.test(url.pathname));

  const cache = (globalThis as unknown as { caches?: { default?: Cache } }).caches?.default;
  if (!eligible || !cache) return next();

  const key = cacheKey(url);
  const hit = await cache.match(key);
  if (hit) return hit;

  const res = await next();
  const ct = res.headers.get('content-type') || '';
  const cacheable = res.status === 200 && /text\/html|application\/xml/.test(ct) && !res.headers.get('set-cookie');
  if (!cacheable) return res;

  const ttl = url.pathname === '/sitemap.xml' ? 3600 : url.pathname.startsWith('/jobs/') ? 3600 : 1800;
  const cc = `public, s-maxage=${ttl}, stale-while-revalidate=86400`;

  // Store a clone in the edge cache; return the original with the same header.
  const toCache = new Response(res.clone().body, res);
  toCache.headers.set('Cache-Control', cc);
  const rt = (context.locals as { runtime?: { ctx?: { waitUntil?: (p: Promise<unknown>) => void } } }).runtime;
  if (rt?.ctx?.waitUntil) rt.ctx.waitUntil(cache.put(key, toCache));
  else await cache.put(key, toCache);

  const headers = new Headers(res.headers);
  headers.set('Cache-Control', cc);
  return new Response(res.body, { status: res.status, headers });
});
