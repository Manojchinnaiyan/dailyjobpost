export const prerender = false;
import type { APIRoute } from 'astro';
import { GUIDES } from '../lib/guides';
import { getLandingIndex } from '../lib/landing';

interface JobSlugRow { slug: string; posted: string; }

export const GET: APIRoute = async ({ locals }) => {
  const { env } = locals.runtime;
  const result = await env.DB
    .prepare('SELECT slug, posted FROM jobs ORDER BY posted DESC')
    .all<JobSlugRow>();
  const jobs = result.results ?? [];
  const { categories, countries, combos, roles, cities } = await getLandingIndex(env.DB);

  const base = 'https://dailyjobpost.online';

  const staticUrls = [
    { loc: base + '/',             priority: '1.0', changefreq: 'daily' },
    { loc: base + '/remote',       priority: '0.9', changefreq: 'daily' },
    { loc: base + '/internships',  priority: '0.8', changefreq: 'daily' },
    { loc: base + '/guides',       priority: '0.6', changefreq: 'weekly' },
    { loc: base + '/about',        priority: '0.4', changefreq: 'monthly' },
    { loc: base + '/contact',      priority: '0.3', changefreq: 'monthly' },
    { loc: base + '/privacy',      priority: '0.3', changefreq: 'yearly' },
  ];

  // Programmatic landing pages — these are what win long-tail search.
  const landingUrls = [
    ...categories.map(c => ({ loc: `${base}/category/${c.slug}`, priority: '0.8', changefreq: 'daily' })),
    ...countries.map(c => ({ loc: `${base}/jobs-in/${c.slug}`, priority: '0.8', changefreq: 'daily' })),
    ...combos.map(c => ({ loc: `${base}/jobs-in/${c.countrySlug}/${c.categorySlug}`, priority: '0.7', changefreq: 'daily' })),
    ...roles.map(r => ({ loc: `${base}/roles/${r.slug}`, priority: '0.8', changefreq: 'daily' })),
    ...cities.map(c => ({ loc: `${base}/jobs-in/${c.countrySlug}/${c.slug}`, priority: '0.7', changefreq: 'daily' })),
  ];

  const urlBlocks = [
    ...staticUrls.map(u => `
  <url>
    <loc>${u.loc}</loc>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`),
    ...landingUrls.map(u => `
  <url>
    <loc>${u.loc}</loc>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`),
    ...GUIDES.map(g => `
  <url>
    <loc>${base}/guides/${g.slug}</loc>
    <lastmod>${g.date}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>`),
    ...jobs.map(j => `
  <url>
    <loc>${base}/jobs/${j.slug}</loc>
    <lastmod>${j.posted}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>`),
  ].join('');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urlBlocks}
</urlset>`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  });
};
