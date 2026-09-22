/**
 * Browse counts for the homepage, landing pages and sitemap, stored as one
 * JSON row in `site_stats` (migrations/004_stats_and_fts.sql).
 *
 * Counts only change when the nightly import runs, so a page reads this one
 * row instead of scanning all ~11k jobs. The row is rebuilt with a single
 * scan when it is missing or older than a day; the import deletes it when it
 * finishes, and then fetches the homepage to rebuild it straight away.
 *
 * The per-isolate cache is only a first layer: Workers run many short-lived
 * isolates, so on its own it missed on most requests.
 */
import { computeHomeStats, type HomeStats, type MetaRow } from './homestats';
import { computeLandingIndex, CITIES, type LandingIndex, type LandingRow } from './landing';
import type { JobFilters } from './jobquery';

export interface SiteStats { home: HomeStats; landing: LandingIndex; at: number }

interface DBLike {
  prepare(q: string): {
    bind(...a: (string | number)[]): { run(): Promise<unknown> };
    first<T>(): Promise<T | null>;
    all<T>(): Promise<{ results: T[] }>;
  };
}

const MEMORY_TTL_MS = 5 * 60 * 1000;
// Longer than a day so a slightly late import does not trigger a rebuild, short
// enough that a failed import still leaves counts at most ~a day stale.
const ROW_TTL_MS = 26 * 60 * 60 * 1000;

let memory: SiteStats | null = null;

async function readRow(db: DBLike): Promise<SiteStats | null> {
  try {
    const row = await db.prepare('SELECT data, updated_at FROM site_stats WHERE id = 1')
      .first<{ data: string; updated_at: number }>();
    if (!row || Date.now() - row.updated_at > ROW_TTL_MS) return null;
    return { ...JSON.parse(row.data), at: row.updated_at };
  } catch {
    return null; // table missing (migration not applied yet): fall back to a scan
  }
}

async function rebuild(db: DBLike): Promise<SiteStats> {
  const now = Date.now();
  const res = await db.prepare('SELECT type, remote, posted, location, category, title FROM jobs')
    .all<MetaRow & LandingRow>();
  const rows = res.results ?? [];
  const stats: SiteStats = { home: computeHomeStats(rows, now), landing: computeLandingIndex(rows), at: now };
  try {
    await db.prepare('INSERT OR REPLACE INTO site_stats (id, data, updated_at) VALUES (1, ?, ?)')
      .bind(JSON.stringify({ home: stats.home, landing: stats.landing }), now).run();
  } catch { /* table missing: serve the fresh numbers anyway */ }
  return stats;
}

export async function getSiteStats(db: DBLike): Promise<SiteStats> {
  if (memory && Date.now() - memory.at < MEMORY_TTL_MS) return memory;
  const stats = (await readRow(db)) ?? (await rebuild(db));
  // Cache by fetch time, not build time, so a day-old row is not re-read per request.
  memory = { ...stats, at: Date.now() };
  return stats;
}

export const getLandingIndex = async (db: DBLike) => (await getSiteStats(db)).landing;

/** Called after admin edits so the next request recounts. */
export async function invalidateSiteStats(db: DBLike): Promise<void> {
  memory = null;
  try { await db.prepare('DELETE FROM site_stats WHERE id = ?').bind(1).run(); } catch { /* table missing */ }
}

/**
 * The row count for a listing, when the stats already hold it — saves a
 * COUNT(*) that would otherwise scan the table (location filters are
 * `LIKE '%x%'` and cannot use an index). Returns undefined for anything the
 * stats do not cover: search, date and type filters, and thin combos/cities
 * (the index drops those below 3 jobs).
 */
export function precomputedTotal(stats: SiteStats, f: JobFilters): number | undefined {
  if (f.q?.trim() || f.posted) return undefined;
  const { home, landing } = stats;
  const remoteOnly = (f.type === 'remote' && !f.country) || (f.country === 'Remote' && (!f.type || f.type === 'remote'));
  if (f.type && !remoteOnly) return undefined;

  if (f.locationKeys?.length) {
    if (f.category || f.country || f.type) return undefined;
    const key = f.locationKeys.join('|');
    const city = CITIES.find((c) => c.keys.join('|') === key);
    return city && landing.cities.find((c) => c.countrySlug === city.countrySlug && c.slug === city.slug)?.count;
  }
  if (remoteOnly) return f.category ? undefined : home.remoteCount;
  if (f.category && f.country) {
    return landing.combos.find((c) => c.categoryName === f.category && c.countryName === f.country)?.count;
  }
  if (f.category) return landing.categories.find((c) => c.name === f.category)?.count;
  if (f.country) return landing.countries.find((c) => c.name === f.country)?.count;
  return home.grandTotal;
}
