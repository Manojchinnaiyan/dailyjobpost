#!/usr/bin/env node
/**
 * Delete jobs whose posting is dead at the source.
 *
 * Why this exists: the nightly import is additive (INSERT OR IGNORE) and the
 * only expiry rule was age — `DELETE FROM jobs WHERE posted < -45 days`. A job
 * that gets filled or pulled two days after we import it therefore sat on the
 * site with a dead apply link for six more weeks. Google's JobPosting
 * guidelines require expired postings to come down promptly.
 *
 * Two signals, cheap one first:
 *
 *   1. FEED ABSENCE (scripts/import-jobs.mjs) stamps `last_seen` on every
 *      posting still present in its company's ATS feed. One request per
 *      company board covers the whole corpus. A job that stops being stamped
 *      is a suspect.
 *
 *   2. URL PROBE (this script) fetches the suspect's own apply_url and asks
 *      the ATS directly. Authoritative, but one request per job — so it runs
 *      only against suspects, never the full table.
 *
 * The probe both kills and rescues: a suspect that answers "alive" gets its
 * last_seen refreshed, which is what protects live jobs from a company board
 * that 404s for a few days or a job pushed out of the PER_COMPANY cap.
 *
 * Status codes are NOT uniform across ATSes — verified against real dead URLs:
 *
 *   Lever       dead -> 404
 *   Greenhouse  dead -> 302 to /{board}?error=true  (never 404)
 *   Ashby       dead -> 200 with an empty SPA shell (no og:title)
 *
 * so each host gets its own verdict rule and anything ambiguous (429, 5xx,
 * timeout, unknown host) returns `unknown` and is never deleted.
 *
 * Usage:
 *   node scripts/expire-jobs.mjs --dry-run          # report only, no writes
 *   node scripts/expire-jobs.mjs                    # probe + delete
 *   node scripts/expire-jobs.mjs --limit 20000 --concurrency 24
 *
 * Env: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, optional D1_DATABASE_ID.
 */

import { runSql, query as d1, sq, transportName } from './d1.mjs';


const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? fallback : Number(argv[i + 1]);
};
const DRY_RUN     = argv.includes('--dry-run');
const LIMIT       = flag('limit', 15000);        // suspects examined per run
const CONCURRENCY = flag('concurrency', 8);      // parallel HTML probes; higher just gets us blocked
const SUSPECT_DAYS = flag('suspect-days', 2);    // days missing from feeds before checking
const MAX_DELETE  = flag('max-delete', 8000);    // blast-radius cap per run
const TIMEOUT_MS  = 12000;
// Consecutive 403/406/429s from one host before we stop asking it anything.
// Fetching thousands of job pages WILL get the checker blocked; when that
// starts, every further request returns a bogus verdict, so bail on the host.
const HOST_BLOCK_THRESHOLD = 8;

// ── Greenhouse: ask the board API, not the job page ──────────────────────────
// A job URL carries its own board token (job-boards.greenhouse.io/{board}/jobs/{id}),
// so one JSON request lists every open job on that board and settles hundreds
// of suspects at once. This matters for more than politeness: fetching job
// pages one by one got this checker WAF-blocked (406) partway through a run,
// and the board API is both unblocked and authoritative.
//
// It also fixes a blind spot in feed-absence: the importer's company list has
// stale/guessed tokens that 404, and their jobs can never be stamped. Taking
// the token from the job's own URL verifies exactly those.
const ghBoardCache = new Map();   // board token -> Set of live job ids, or null if unreadable

/**
 * Two URL shapes carry a Greenhouse job id:
 *   job-boards.greenhouse.io/{board}/jobs/{id}   board token is authoritative
 *   careers.company.com/jobs/{id}?gh_jid={id}    company's own domain, no token
 * For the second we guess the token from the company name, so a 404 there
 * means "bad guess", not "board gone" — hence `trusted`.
 */
function parseGreenhouseUrl(url, company) {
  const direct = /greenhouse\.io\/([^/?#]+)\/jobs\/(\d+)/i.exec(url);
  if (direct) return { board: direct[1], id: direct[2], trusted: true };

  const jid = /[?&]gh_jid=(\d+)/i.exec(url);
  if (jid && company) {
    const token = company.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (token) return { board: token, id: jid[1], trusted: false };
  }
  return null;
}

async function greenhouseBoardIds(board, trusted) {
  const key = `${board}:${trusted}`;
  if (ghBoardCache.has(key)) return ghBoardCache.get(key);
  let ids = null;
  try {
    const res = await fetchWithRetry(`https://boards-api.greenhouse.io/v1/boards/${board}/jobs`);
    if (res?.status === 200) {
      const data = await res.json();
      ids = new Set((data.jobs || []).map((j) => String(j.id)));
    } else if (res?.status === 404 && trusted) {
      // The board named by the job's own URL is gone, so every posting on it
      // is unreachable: an empty set, i.e. those jobs are dead. A 404 on a
      // GUESSED token proves nothing, so that stays null (unknown).
      ids = new Set();
    }
  } catch { /* leave null — unreadable, never a verdict */ }
  ghBoardCache.set(key, ids);
  return ids;
}

// ── Per-ATS verdict rules ────────────────────────────────────────────────────
const isGreenhouse = (u) => /greenhouse\.io/i.test(u);
const isLever      = (u) => /lever\.co/i.test(u);
const isAshby      = (u) => /ashbyhq\.com/i.test(u);

/** A Greenhouse/Lever redirect that drops the job identifier means "delisted". */
function redirectMeansDead(from, to) {
  if (isGreenhouse(from)) return !/\/jobs\/\d+/.test(to) || /error=true/.test(to);
  if (isLever(from))      return !/[0-9a-f]{8}-[0-9a-f]{4}-/i.test(to);
  return false;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchOnce(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, {
      redirect: 'manual',
      signal: ctrl.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; dailyjobpost-linkchecker/1.0; +https://dailyjobpost.online)' },
    });
  } finally { clearTimeout(t); }
}

/**
 * Throttling is the main source of useless verdicts: pushed hard, Greenhouse
 * starts refusing requests, and every refusal becomes an `unknown` that has to
 * be re-checked on another day. Back off and retry rather than burning the
 * suspect on a 429. Returns null when it stays unreachable — never a verdict.
 */
async function fetchWithRetry(url, tries = 3) {
  let delay = 2000;
  for (let i = 0; i < tries; i++) {
    let res = null;
    try { res = await fetchOnce(url); }
    catch { /* timeout / reset — fall through to the backoff below */ }

    if (res && res.status !== 429 && res.status < 500) {
      noteHostResult(url, res.status);
      return res;
    }

    const retryAfter = Number(res?.headers.get('retry-after'));
    await sleep(Number.isFinite(retryAfter) && retryAfter > 0
      ? Math.min(retryAfter * 1000, 30_000)
      : delay);
    delay *= 3;
  }
  noteHostResult(url, 429);
  return null;
}

// ── Host circuit breaker ─────────────────────────────────────────────────────
const hostStrikes = new Map();
const blockedHosts = new Set();

function hostOf(url) { try { return new URL(url).host; } catch { return url; } }

function noteHostResult(url, status) {
  const host = hostOf(url);
  if (status === 403 || status === 406 || status === 429) {
    const n = (hostStrikes.get(host) ?? 0) + 1;
    hostStrikes.set(host, n);
    if (n >= HOST_BLOCK_THRESHOLD && !blockedHosts.has(host)) {
      blockedHosts.add(host);
      console.log(`  ! ${host} is refusing the checker (${status}) — skipping its remaining jobs this run`);
    }
  } else {
    hostStrikes.set(host, 0);
  }
}

/** @returns {Promise<'dead'|'alive'|'unknown'>} */
async function probe(url, company) {
  // Greenhouse: settle it from the board listing instead of the job page.
  const gh = parseGreenhouseUrl(url, company);
  if (gh) {
    const ids = await greenhouseBoardIds(gh.board, gh.trusted);
    if (ids !== null) return ids.has(gh.id) ? 'alive' : 'dead';
    if (gh.trusted) return 'unknown';
    // Guessed token was wrong — fall through and check the page itself.
  }

  if (blockedHosts.has(hostOf(url))) return 'unknown';

  let current = url;
  for (let hop = 0; hop < 4; hop++) {
    const res = await fetchWithRetry(current);
    if (!res) return 'unknown';                       // throttled or unreachable, not dead

    const { status } = res;
    if (status === 404 || status === 410) return 'dead';

    if (status >= 300 && status < 400) {
      const loc = res.headers.get('location');
      if (!loc) return 'unknown';
      let next;
      try { next = new URL(loc, current).toString(); } catch { return 'unknown'; }
      if (redirectMeansDead(current, next)) return 'dead';
      current = next;
      continue;
    }

    if (status === 200) {
      // Ashby renders client-side: every URL is 200, so the shell is the tell.
      if (isAshby(current)) {
        const html = await res.text().catch(() => '');
        return /property=["']og:title["']/i.test(html) ? 'alive' : 'dead';
      }
      return 'alive';
    }
    return 'unknown';
  }
  return 'unknown';                                   // redirect loop
}

/** Run `worker` over `items` with a fixed number of parallel slots. */
async function pool(items, size, worker) {
  let next = 0;
  const runners = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      await worker(items[i], i);
    }
  });
  await Promise.all(runners);
}

/** Apply statements in small chunks so no single request gets too large. */
async function applyAll(stmts, label) {
  if (!stmts.length) return;
  if (DRY_RUN) { console.log(`  [dry-run] would apply ${stmts.length} ${label} statement(s)`); return; }
  for (let i = 0; i < stmts.length; i += 20) {
    await runSql(stmts.slice(i, i + 20).join('\n'));
  }
  console.log(`  applied ${stmts.length} ${label} statement(s)`);
}

/** DELETE/UPDATE by slug, batched into IN (...) lists. */
function batchStatements(slugs, build, per = 150) {
  const out = [];
  for (let i = 0; i < slugs.length; i += per) {
    out.push(build(slugs.slice(i, i + per).map(sq).join(',')));
  }
  return out;
}

async function main() {
  const today = new Date().toISOString().slice(0, 10);
  console.log(`expire-jobs ${DRY_RUN ? '(DRY RUN) ' : ''}— ${today} — via ${transportName}`);

  const [{ n: total } = { n: 0 }] = await d1('SELECT COUNT(*) AS n FROM jobs;');
  console.log(`Jobs in D1: ${total}`);

  // Suspects: tracked ATS rows the feeds have stopped listing.
  const rows = await d1(`
    SELECT slug, apply_url, company, posted, last_seen, last_checked
    FROM jobs
    WHERE apply_url != ''
      AND last_seen != ''
      AND last_seen < date('now','-${SUSPECT_DAYS} days')
    ORDER BY last_checked ASC, posted ASC
    LIMIT ${LIMIT};`);
  console.log(`Suspects (missing from feeds ${SUSPECT_DAYS}+ days): ${rows.length}`);
  if (!rows.length) { console.log('Nothing to check.'); return; }

  const dead = [], alive = [], unknown = [];
  let done = 0;
  await pool(rows, CONCURRENCY, async (row) => {
    const verdict = await probe(row.apply_url, row.company);
    (verdict === 'dead' ? dead : verdict === 'alive' ? alive : unknown).push(row.slug);
    if (++done % 500 === 0) {
      console.log(`  probed ${done}/${rows.length} — dead ${dead.length}, alive ${alive.length}, unknown ${unknown.length}`);
    }
  });

  console.log(`\nVerdicts: dead ${dead.length} · alive ${alive.length} · unknown ${unknown.length}`);

  if (dead.length > MAX_DELETE) {
    console.error(`\nABORT: ${dead.length} deletions exceeds --max-delete ${MAX_DELETE}.`);
    console.error('That usually means an ATS changed its URL scheme, not that every job died.');
    console.error('Re-run with a higher --max-delete only after spot-checking the URLs above.');
    process.exit(1);
  }

  // Dead -> gone. Alive -> re-stamp last_seen so the feed gap can't kill them
  // on a later run. Unknown -> only touch last_checked so the queue rotates.
  await applyAll(batchStatements(dead, (list) => `DELETE FROM jobs WHERE slug IN (${list});`), 'delete');
  await applyAll(batchStatements(alive, (list) =>
    `UPDATE jobs SET last_seen='${today}', last_checked='${today}' WHERE slug IN (${list});`), 'rescue');
  await applyAll(batchStatements(unknown, (list) =>
    `UPDATE jobs SET last_checked='${today}' WHERE slug IN (${list});`), 'recheck');

  console.log(`\nDone. Removed ${DRY_RUN ? 0 : dead.length} expired job(s).`);
}

main().catch((e) => { console.error(e); process.exit(1); });
