import { rowToJob, type Job, type JobRow } from './db';

export const PAGE_SIZE = 24;

/** Columns for listing pages — everything except the heavy `body`. */
const LIST_COLS = ['id','slug','title','company','location','type','remote','urgent','salary','tags','posted','apply_url','experience','category']
  .map((c) => `jobs.${c}`).join(',');

export interface JobFilters {
  q?: string;
  type?: string;       // full-time | part-time | contract | internship | remote | urgent
  category?: string;
  country?: string;    // key of COUNTRY_KEYS, or 'Remote'
  posted?: string;     // days window: '1' | '3' | '7' | '14' | '30'
  locationKeys?: string[]; // city/location LIKE keywords (used by city landing pages)
  page?: number;
}

const POSTED_DAYS = new Set(['1', '3', '7', '14', '30']);

/** Country → location-string keywords (matched with LIKE). */
export const COUNTRY_KEYS: Record<string, string[]> = {
  USA:        ['united states','usa','remote - us','remote us','remote, us','remote-us','u.s','new york','san francisco','seattle','austin','los angeles','chicago','boston','denver','atlanta','washington','miami','dallas','houston','portland','san jose','mountain view','palo alto','sunnyvale','bellevue','san diego',', ca',', ny',', wa',', tx',', ma',', il',', co',', ga',', fl'],
  India:      ['india','bengaluru','bangalore','mumbai','delhi','hyderabad','pune','chennai','kolkata','gurgaon','noida'],
  UK:         ['united kingdom','london','manchester','edinburgh','birmingham','leeds','bristol',', uk'],
  Canada:     ['canada','toronto','vancouver','montreal','ottawa','calgary'],
  Australia:  ['australia','sydney','melbourne','brisbane','perth'],
  Germany:    ['germany','berlin','munich','hamburg','frankfurt'],
  Singapore:  ['singapore'],
  UAE:        ['uae','dubai','abu dhabi','united arab emirates'],
  Netherlands:['netherlands','amsterdam','rotterdam','utrecht'],
  France:     ['france','paris','lyon'],
  Japan:      ['japan','tokyo','osaka'],
  Ireland:    ['ireland','dublin'],
  Mexico:     ['mexico','mexico city','guadalajara'],
  Brazil:     ['brazil','brasil','são paulo','sao paulo','rio de janeiro','campinas','curitiba','belo horizonte','santa catarina','chapecó','chapeco'],
  Poland:     ['poland','warsaw','warszawa','krakow','kraków','wrocław','wroclaw','gdańsk','gdansk'],
  Spain:      ['spain','madrid','barcelona','españa','espana','valencia'],
  Italy:      ['italy','italia','milan','milano','rome','roma'],
  Portugal:   ['portugal','lisbon','lisboa','porto'],
  Philippines:['philippines','manila','cebu','makati'],
};

const TYPE_VALUES = ['full-time','part-time','contract','internship'];

// Relevance weight per jobs_fts column, in declaration order
// (title, tags, company, category, location, body) — higher = more important.
const BM25_WEIGHTS = '12.0, 6.0, 5.0, 4.0, 3.0, 1.0';

/**
 * Turn free text into an FTS5 MATCH expression: up to 6 prefix terms, all
 * required. Split on the same characters the jobs_fts tokenizer splits on
 * ('+' and '#' are kept, for "c++" / "c#"), and quote each term so user input
 * can never be parsed as FTS5 syntax (AND, NEAR, column filters, ...).
 */
export function ftsQuery(q: string): string {
  return q.toLowerCase()
    .split(/[^\p{L}\p{N}+#]+/u)
    .filter((t) => /[\p{L}\p{N}]/u.test(t))
    .slice(0, 6)
    .map((t) => `"${t}"*`)
    .join(' ');
}

interface WhereResult { sql: string; binds: (string | number)[]; match: string }

/**
 * Build the WHERE clause from filters. A search becomes an FTS5 MATCH
 * (`match`), which the caller joins in; every other column is qualified with
 * `jobs.` because jobs_fts shares some column names.
 */
export function buildWhere(f: JobFilters): WhereResult {
  const where: string[] = [];
  const binds: (string | number)[] = [];

  const match = f.q && f.q.trim() ? ftsQuery(f.q) : '';
  if (match) { where.push('jobs_fts MATCH ?'); binds.push(match); }

  if (f.type) {
    if (f.type === 'remote') where.push("(jobs.remote = 1 OR jobs.type = 'remote')");
    else if (f.type === 'urgent') where.push('jobs.urgent = 1');
    else if (TYPE_VALUES.includes(f.type)) { where.push('jobs.type = ?'); binds.push(f.type); }
  }
  if (f.category) { where.push('jobs.category = ?'); binds.push(f.category); }
  if (f.posted && POSTED_DAYS.has(f.posted)) {
    where.push("jobs.posted >= date('now', ?)");
    binds.push(`-${f.posted} days`);
  }
  if (f.country) {
    if (f.country === 'Remote') where.push("(jobs.remote = 1 OR jobs.type = 'remote')");
    else {
      const keys = COUNTRY_KEYS[f.country];
      if (keys?.length) {
        where.push('(' + keys.map(() => 'lower(jobs.location) LIKE ?').join(' OR ') + ')');
        keys.forEach(k => binds.push(`%${k.toLowerCase()}%`));
      }
    }
  }
  if (f.locationKeys?.length) {
    where.push('(' + f.locationKeys.map(() => 'lower(jobs.location) LIKE ?').join(' OR ') + ')');
    f.locationKeys.forEach(k => binds.push(`%${k.toLowerCase()}%`));
  }

  return { sql: where.length ? 'WHERE ' + where.join(' AND ') : '', binds, match };
}

interface DBLike {
  prepare(q: string): {
    bind(...a: (string | number)[]): { first<T>(): Promise<T | null>; all<T>(): Promise<{ results: T[] }> };
  };
}

/**
 * Run a paginated, filtered query. Returns the page of jobs + total count.
 * Pass `total` when it is already known (see precomputedTotal) to skip the
 * COUNT(*), which on location filters scans the whole table.
 */
export async function queryJobs(
  db: DBLike, f: JobFilters, opts: { total?: number } = {},
): Promise<{ jobs: Job[]; total: number; page: number; pages: number }> {
  const { sql, binds, match } = buildWhere(f);
  const from = match ? 'jobs_fts JOIN jobs ON jobs.id = jobs_fts.rowid' : 'jobs';
  const page = Math.max(1, f.page || 1);

  let total = opts.total;
  if (total === undefined) {
    const countRow = await db.prepare(`SELECT COUNT(*) AS c FROM ${from} ${sql}`).bind(...binds).first<{ c: number }>();
    total = countRow?.c ?? 0;
  }
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const offset = (Math.min(page, pages) - 1) * PAGE_SIZE;

  // When searching, rank by relevance (bm25: lower is better) then recency; otherwise newest first.
  const order = match
    ? `bm25(jobs_fts, ${BM25_WEIGHTS}), jobs.posted DESC, jobs.created_at DESC`
    : 'jobs.posted DESC, jobs.created_at DESC';

  const res = await db
    .prepare(`SELECT ${LIST_COLS} FROM ${from} ${sql} ORDER BY ${order} LIMIT ? OFFSET ?`)
    .bind(...binds, PAGE_SIZE, offset)
    .all<JobRow>();

  return { jobs: (res.results ?? []).map(rowToJob), total, page: Math.min(page, pages), pages };
}

/** Read filters from a URL's search params. */
export function filtersFromUrl(url: URL): JobFilters {
  return {
    q:        url.searchParams.get('q')        || undefined,
    type:     url.searchParams.get('type')     || undefined,
    category: url.searchParams.get('category') || undefined,
    country:  url.searchParams.get('country')  || undefined,
    posted:   url.searchParams.get('posted')   || undefined,
    page:     parseInt(url.searchParams.get('page') || '1', 10) || 1,
  };
}

/** Build a querystring for a page link, preserving active filters. */
export function pageHref(f: JobFilters, page: number): string {
  const p = new URLSearchParams();
  if (f.q)        p.set('q', f.q);
  if (f.type)     p.set('type', f.type);
  if (f.category) p.set('category', f.category);
  if (f.country)  p.set('country', f.country);
  if (f.posted)   p.set('posted', f.posted);
  if (page > 1)   p.set('page', String(page));
  const s = p.toString();
  return s ? `?${s}` : '?';
}
