/**
 * Programmatic SEO landing pages.
 *
 * Job boards (Naukri, Indeed, LinkedIn) win long-tail search by having one
 * dedicated, indexable URL per facet — "Software jobs", "Jobs in USA",
 * "Software jobs in USA" — each with a unique title/H1/description and
 * JobPosting structured data. This module defines the clean slugs and a
 * single-scan counts index used by those pages and the sitemap.
 */
import { CATEGORIES, COUNTRY_META } from './homestats';
import { COUNTRY_KEYS } from './jobquery';

export function slugify(s: string): string {
  return s.toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\//g, ' ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/* ── Category slug ⇄ name ── */
export const CATEGORY_BY_SLUG: Record<string, string> =
  Object.fromEntries(CATEGORIES.map((c) => [slugify(c.name), c.name]));
export const CATEGORY_SLUG: Record<string, string> =
  Object.fromEntries(CATEGORIES.map((c) => [c.name, slugify(c.name)]));
export const categoryName = (slug: string): string | undefined => CATEGORY_BY_SLUG[slug];

/* ── Country slug ⇄ name (Remote lives at /remote, excluded here) ── */
const COUNTRIES = COUNTRY_META.filter((c) => c.name !== 'Remote');
export const COUNTRY_BY_SLUG: Record<string, string> =
  Object.fromEntries(COUNTRIES.map((c) => [slugify(c.name), c.name]));
export const COUNTRY_SLUG: Record<string, string> =
  Object.fromEntries(COUNTRIES.map((c) => [c.name, slugify(c.name)]));
export const COUNTRY_FLAG: Record<string, string> =
  Object.fromEntries(COUNTRY_META.map((c) => [c.name, c.flag]));
export const countryName = (slug: string): string | undefined => COUNTRY_BY_SLUG[slug];

export interface LandingIndex {
  categories: { name: string; slug: string; count: number }[];
  countries: { name: string; slug: string; flag: string; count: number }[];
  combos: { categoryName: string; categorySlug: string; countryName: string; countrySlug: string; count: number }[];
}

interface DBLike { prepare(q: string): { all<T>(): Promise<{ results: T[] }> } }
interface Row { location: string; category: string }

// One full scan, cached per isolate — same as homestats. Powers the sitemap and
// the cross-links between landing pages without N queries.
let cache: { at: number; data: LandingIndex } | null = null;
const TTL_MS = 30 * 60 * 1000;

export async function getLandingIndex(db: DBLike): Promise<LandingIndex> {
  const now = Date.now();
  if (cache && now - cache.at < TTL_MS) return cache.data;

  const res = await db.prepare('SELECT location, category FROM jobs').all<Row>();
  const rows = res.results ?? [];

  const catCount: Record<string, number> = {};
  const ctyCount: Record<string, number> = {};
  const comboCount: Record<string, number> = {};

  const countryOf = (loc: string): string[] => {
    const l = (loc || '').toLowerCase();
    const hits: string[] = [];
    for (const c of COUNTRIES) {
      const keys = COUNTRY_KEYS[c.name] || [];
      if (keys.some((k) => l.includes(k.toLowerCase()))) hits.push(c.name);
    }
    return hits;
  };

  for (const r of rows) {
    if (r.category) catCount[r.category] = (catCount[r.category] || 0) + 1;
    const countries = countryOf(r.location);
    for (const ct of countries) {
      ctyCount[ct] = (ctyCount[ct] || 0) + 1;
      if (r.category) {
        const k = `${r.category}|${ct}`;
        comboCount[k] = (comboCount[k] || 0) + 1;
      }
    }
  }

  const categories = CATEGORIES
    .map((c) => ({ name: c.name, slug: CATEGORY_SLUG[c.name], count: catCount[c.name] || 0 }))
    .filter((c) => c.count > 0);

  const countries = COUNTRIES
    .map((c) => ({ name: c.name, slug: COUNTRY_SLUG[c.name], flag: COUNTRY_FLAG[c.name], count: ctyCount[c.name] || 0 }))
    .filter((c) => c.count > 0);

  const combos = Object.entries(comboCount)
    .map(([k, count]) => {
      const [categoryName, countryName] = k.split('|');
      return { categoryName, categorySlug: CATEGORY_SLUG[categoryName], countryName, countrySlug: COUNTRY_SLUG[countryName], count };
    })
    // Only combos with real depth become indexable pages (avoids thin content).
    .filter((c) => c.count >= 3 && c.categorySlug && c.countrySlug)
    .sort((a, b) => b.count - a.count);

  const data: LandingIndex = { categories, countries, combos };
  cache = { at: now, data };
  return data;
}
