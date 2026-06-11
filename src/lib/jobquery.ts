import { rowToJob, type Job, type JobRow } from './db';

export const PAGE_SIZE = 24;

/** Columns for listing pages — everything except the heavy `body`. */
const LIST_COLS = 'id,slug,title,company,location,type,remote,urgent,salary,tags,posted,apply_url,experience,category';

export interface JobFilters {
  q?: string;
  type?: string;       // full-time | part-time | contract | internship | remote | urgent
  category?: string;
  country?: string;    // key of COUNTRY_KEYS, or 'Remote'
  posted?: string;     // days window: '1' | '3' | '7' | '14' | '30'
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
};

const TYPE_VALUES = ['full-time','part-time','contract','internship'];

// Fields searched, with their relevance weight (higher = more important).
const SEARCH_FIELDS: [string, number][] = [
  ['title', 12], ['tags', 6], ['company', 5], ['category', 4], ['location', 3], ['body', 1],
];

/** Split a query into up to 6 clean lowercase terms. */
function queryTerms(q: string): string[] {
  return q.toLowerCase().replace(/[%_]/g, ' ').split(/\s+/).map(t => t.trim()).filter(Boolean).slice(0, 6);
}

interface WhereResult { sql: string; binds: (string | number)[]; scoreSql: string; scoreBinds: (string | number)[] }

/** Build WHERE + a relevance-score expression from filters. */
export function buildWhere(f: JobFilters): WhereResult {
  const where: string[] = [];
  const binds: (string | number)[] = [];
  let scoreSql = '0';
  const scoreBinds: (string | number)[] = [];

  const terms = f.q && f.q.trim() ? queryTerms(f.q) : [];
  if (terms.length) {
    // Each term must appear in at least one field (AND across terms, OR across fields).
    for (const t of terms) {
      const like = `%${t}%`;
      where.push('(' + SEARCH_FIELDS.map(([c]) => `lower(${c}) LIKE ?`).join(' OR ') + ')');
      SEARCH_FIELDS.forEach(() => binds.push(like));
    }
    // Relevance: weighted field hits per term + a bonus when the title starts with a term.
    const parts: string[] = [];
    for (const t of terms) {
      const like = `%${t}%`;
      for (const [c, w] of SEARCH_FIELDS) {
        parts.push(`(CASE WHEN lower(${c}) LIKE ? THEN ${w} ELSE 0 END)`);
        scoreBinds.push(like);
      }
      parts.push('(CASE WHEN lower(title) LIKE ? THEN 8 ELSE 0 END)');
      scoreBinds.push(`${t}%`);
    }
    scoreSql = parts.join(' + ');
  }

  if (f.type) {
    if (f.type === 'remote') where.push("(remote = 1 OR type = 'remote')");
    else if (f.type === 'urgent') where.push('urgent = 1');
    else if (TYPE_VALUES.includes(f.type)) { where.push('type = ?'); binds.push(f.type); }
  }
  if (f.category) { where.push('category = ?'); binds.push(f.category); }
  if (f.posted && POSTED_DAYS.has(f.posted)) {
    where.push("posted >= date('now', ?)");
    binds.push(`-${f.posted} days`);
  }
  if (f.country) {
    if (f.country === 'Remote') where.push("(remote = 1 OR type = 'remote')");
    else {
      const keys = COUNTRY_KEYS[f.country];
      if (keys?.length) {
        where.push('(' + keys.map(() => 'lower(location) LIKE ?').join(' OR ') + ')');
        keys.forEach(k => binds.push(`%${k.toLowerCase()}%`));
      }
    }
  }

  return { sql: where.length ? 'WHERE ' + where.join(' AND ') : '', binds, scoreSql, scoreBinds };
}

interface DBLike {
  prepare(q: string): {
    bind(...a: (string | number)[]): { first<T>(): Promise<T | null>; all<T>(): Promise<{ results: T[] }> };
  };
}

/** Run a paginated, filtered query. Returns the page of jobs + total count. */
export async function queryJobs(db: DBLike, f: JobFilters): Promise<{ jobs: Job[]; total: number; page: number; pages: number }> {
  const { sql, binds, scoreSql, scoreBinds } = buildWhere(f);
  const hasQ = !!(f.q && f.q.trim());
  const page = Math.max(1, f.page || 1);

  const countRow = await db.prepare(`SELECT COUNT(*) AS c FROM jobs ${sql}`).bind(...binds).first<{ c: number }>();
  const total = countRow?.c ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const offset = (Math.min(page, pages) - 1) * PAGE_SIZE;

  // When searching, rank by relevance score then recency; otherwise newest first.
  const select = hasQ ? `${LIST_COLS}, (${scoreSql}) AS _score` : LIST_COLS;
  const order  = hasQ ? '_score DESC, posted DESC, created_at DESC' : 'posted DESC, created_at DESC';
  const pageBinds = hasQ ? [...scoreBinds, ...binds, PAGE_SIZE, offset] : [...binds, PAGE_SIZE, offset];

  const res = await db
    .prepare(`SELECT ${select} FROM jobs ${sql} ORDER BY ${order} LIMIT ? OFFSET ?`)
    .bind(...pageBinds)
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
