import { defineMiddleware } from 'astro:middleware';
import { SESSION_COOKIE } from './lib/auth';

/**
 * Edge-cache public pages for a few minutes with the Workers Cache API, so a
 * burst of crawler or visitor traffic on one URL costs one render and a few
 * D1 queries instead of one per request.
 *
 * Only anonymous GETs are cached: Base.astro renders the signed-in user, so
 * any request carrying a session cookie always renders fresh. The cache is
 * per data center and does not apply on *.workers.dev, only the custom domain.
 */
const TTL_SECONDS = 300;

export const onRequest = defineMiddleware(async (context, next) => {
  const { request, url, locals, cookies } = context;
  const runtime = locals.runtime;
  if (
    !runtime?.caches ||
    request.method !== 'GET' ||
    url.pathname.startsWith('/admin') ||
    url.pathname.startsWith('/api') ||
    cookies.has(SESSION_COOKIE)
  ) {
    return next();
  }

  const cache = runtime.caches.default;
  const key = url.toString();
  const hit = await cache.match(key);
  // Cache API responses have immutable headers, and Astro appends to them.
  if (hit) return new Response(hit.body as unknown as BodyInit, hit as unknown as ResponseInit);

  const response = await next();
  if (response.status !== 200 || response.headers.has('Set-Cookie')) return response;

  const headers = new Headers(response.headers);
  // Keep a route's own policy (the sitemap sets an hour); otherwise cache at
  // the edge only, so browsers still revalidate after someone signs in.
  if (!headers.has('Cache-Control')) headers.set('Cache-Control', `public, max-age=0, s-maxage=${TTL_SECONDS}`);
  const cacheable = new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  runtime.ctx.waitUntil(cache.put(key, cacheable.clone() as any));
  return cacheable;
});
