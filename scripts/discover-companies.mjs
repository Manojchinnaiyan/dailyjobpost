#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
/**
 * Auto-discover new Greenhouse / Lever / Ashby board tokens using the
 * Common Crawl URL index, validate each against the public ATS API, and
 * merge live ones into scripts/companies.json (read by import-jobs.mjs).
 *
 * Usage: node scripts/discover-companies.mjs
 * Designed to run weekly in CI; the companies list grows on its own.
 */

const OUT_FILE = new URL('./companies.json', import.meta.url);
const MAX_INDEX_PAGES = 8;      // CC index pages per source per run
const MAX_VALIDATE = 120;       // new tokens to probe per source per run
const MIN_JOBS = 5;             // board must have at least this many postings

const SOURCES = [
  {
    key: 'greenhouse',
    patterns: ['boards.greenhouse.io/*', 'job-boards.greenhouse.io/*'],
    validate: async (token) => {
      const d = await fetchJSON(`https://boards-api.greenhouse.io/v1/boards/${token}/jobs`);
      return (d.jobs || []).length;
    },
  },
  {
    key: 'lever',
    patterns: ['jobs.lever.co/*'],
    validate: async (token) => {
      const d = await fetchJSON(`https://api.lever.co/v0/postings/${token}?mode=json`);
      return Array.isArray(d) ? d.length : 0;
    },
  },
  {
    key: 'ashby',
    patterns: ['jobs.ashbyhq.com/*'],
    validate: async (token) => {
      const d = await fetchJSON(`https://api.ashbyhq.com/posting-api/job-board/${token}`);
      return (d.jobs || []).length;
    },
  },
];

// path segments that are pages/assets, not board tokens
const JUNK = new Set(['embed', 'api', 'apply', 'jobs', 'job', 'assets', 'static',
  'favicon.ico', 'robots.txt', 'sitemap.xml', 'careers', 'login', '404']);

const TOKEN_RE = /^[a-z0-9][a-z0-9._-]{1,60}$/;

async function fetchJSON(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'dailyjobpost-discovery/1.0' }, signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

async function fetchText(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 60000);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'dailyjobpost-discovery/1.0' }, signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

/** Latest Common Crawl index id, e.g. "CC-MAIN-2026-20". */
async function latestCrawl() {
  const info = await fetchJSON('https://index.commoncrawl.org/collinfo.json');
  return info[0].id;
}

/** Pull board tokens for one URL pattern from the CC index. */
async function tokensFromIndex(crawl, pattern) {
  const base = `https://index.commoncrawl.org/${crawl}-index?url=${encodeURIComponent(pattern)}&output=json&fl=url&collapse=urlkey`;
  const tokens = new Set();
  let pages = 1;
  try {
    const n = await fetchText(`${base}&showNumPages=true`);
    pages = Math.min(JSON.parse(n).pages || 1, MAX_INDEX_PAGES);
  } catch { /* fall back to a single page */ }

  for (let p = 0; p < pages; p++) {
    let body;
    try { body = await fetchText(`${base}&page=${p}`); }
    catch (e) { console.error(`  index page ${p} failed: ${e.message}`); continue; }
    for (const line of body.split('\n')) {
      if (!line.trim()) continue;
      try {
        const { url } = JSON.parse(line);
        const seg = new URL(url).pathname.split('/').filter(Boolean)[0];
        if (!seg) continue;
        const token = decodeURIComponent(seg).toLowerCase();
        if (TOKEN_RE.test(token) && !JUNK.has(token)) tokens.add(token);
      } catch { /* skip malformed line */ }
    }
  }
  return tokens;
}

async function main() {
  let existing = { greenhouse: [], lever: [], ashby: [], rejected: [] };
  try { existing = { ...existing, ...JSON.parse(await readFile(OUT_FILE, 'utf8')) }; } catch { /* first run */ }
  const rejected = new Set(existing.rejected);

  const crawl = await latestCrawl();
  console.error(`Using Common Crawl index: ${crawl}`);

  for (const src of SOURCES) {
    const known = new Set(existing[src.key]);
    const candidates = new Set();
    for (const pattern of src.patterns) {
      try {
        const found = await tokensFromIndex(crawl, pattern);
        console.error(`${src.key}: ${found.size} tokens in index for ${pattern}`);
        for (const t of found) if (!known.has(t) && !rejected.has(t)) candidates.add(t);
      } catch (e) {
        console.error(`${src.key}: index query failed for ${pattern}: ${e.message}`);
      }
    }

    let added = 0, probed = 0;
    for (const token of candidates) {
      if (probed >= MAX_VALIDATE) break;
      probed++;
      try {
        const jobs = await src.validate(token);
        if (jobs >= MIN_JOBS) { known.add(token); added++; console.error(`  + ${token} (${jobs} jobs)`); }
        else rejected.add(`${token}`);
      } catch {
        rejected.add(token);
      }
    }
    existing[src.key] = [...known].sort();
    console.error(`${src.key}: probed ${probed}, added ${added}, total ${known.size}`);
  }

  // remember dead/empty tokens so we never probe them again
  existing.rejected = [...rejected].sort();
  await writeFile(OUT_FILE, JSON.stringify(existing, null, 2) + '\n');
  console.error(`Wrote ${OUT_FILE.pathname}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
