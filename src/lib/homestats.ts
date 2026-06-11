import { COUNTRY_KEYS } from './jobquery';

export const CATEGORIES = [
  { name: 'Software / IT',    query: 'Software' },
  { name: 'Marketing',        query: 'Marketing' },
  { name: 'Sales',            query: 'Sales' },
  { name: 'Finance',          query: 'Finance' },
  { name: 'Design',           query: 'Design' },
  { name: 'Healthcare',       query: 'Healthcare' },
  { name: 'Data & Analytics', query: 'Data & Analytics' },
  { name: 'Product',          query: 'Product' },
  { name: 'Operations',       query: 'Operations' },
  { name: 'Human Resources',  query: 'Human Resources' },
  { name: 'Customer Support', query: 'Customer Support' },
  { name: 'Legal',            query: 'Legal' },
  { name: 'Engineering',      query: 'Engineering' },
];

export const COUNTRY_META = [
  { name: 'Remote', flag: '\u{1F310}' }, { name: 'USA', flag: '\u{1F1FA}\u{1F1F8}' },
  { name: 'India', flag: '\u{1F1EE}\u{1F1F3}' }, { name: 'UK', flag: '\u{1F1EC}\u{1F1E7}' },
  { name: 'Canada', flag: '\u{1F1E8}\u{1F1E6}' }, { name: 'Australia', flag: '\u{1F1E6}\u{1F1FA}' },
  { name: 'Germany', flag: '\u{1F1E9}\u{1F1EA}' }, { name: 'Ireland', flag: '\u{1F1EE}\u{1F1EA}' },
  { name: 'Netherlands', flag: '\u{1F1F3}\u{1F1F1}' }, { name: 'France', flag: '\u{1F1EB}\u{1F1F7}' },
  { name: 'Singapore', flag: '\u{1F1F8}\u{1F1EC}' }, { name: 'Mexico', flag: '\u{1F1F2}\u{1F1FD}' },
  { name: 'Japan', flag: '\u{1F1EF}\u{1F1F5}' }, { name: 'UAE', flag: '\u{1F1E6}\u{1F1EA}' },
];

export interface HomeStats {
  grandTotal: number;
  remoteCount: number;
  newThisWeek: number;
  categoryStats: { name: string; query: string; count: number }[];
  countryStats: { name: string; flag: string; count: number }[];
}

interface DBLike {
  prepare(q: string): { all<T>(): Promise<{ results: T[] }> };
}

interface MetaRow { type: string; remote: number; posted: string; location: string; category: string }

// In-memory, per-isolate cache. Browse counts are the same for every visitor,
// so we recompute at most once per TTL instead of scanning all rows per request.
let cache: { at: number; data: HomeStats } | null = null;
const TTL_MS = 10 * 60 * 1000;

export async function getHomeStats(db: DBLike): Promise<HomeStats> {
  const now = Date.now();
  if (cache && now - cache.at < TTL_MS) return cache.data;

  const res = await db.prepare('SELECT type, remote, posted, location, category FROM jobs').all<MetaRow>();
  const meta = res.results ?? [];

  const grandTotal = meta.length;
  const remoteCount = meta.filter(j => j.remote || j.type === 'remote').length;
  const weekAgo = new Date(now - 7 * 86_400_000).toISOString().split('T')[0];
  const newThisWeek = meta.filter(j => j.posted >= weekAgo).length;

  const catCounts: Record<string, number> = {};
  for (const j of meta) catCounts[j.category] = (catCounts[j.category] || 0) + 1;
  const categoryStats = CATEGORIES.map(c => ({ ...c, count: catCounts[c.name] || 0 })).filter(c => c.count > 0);

  const countryStats = COUNTRY_META.map(c => {
    let count = 0;
    if (c.name === 'Remote') count = remoteCount;
    else {
      const keys = COUNTRY_KEYS[c.name] || [];
      count = meta.filter(j => { const l = (j.location || '').toLowerCase(); return keys.some(k => l.includes(k.toLowerCase())); }).length;
    }
    return { ...c, count };
  }).filter(c => c.count > 0);

  const data: HomeStats = { grandTotal, remoteCount, newThisWeek, categoryStats, countryStats };
  cache = { at: now, data };
  return data;
}
