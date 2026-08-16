#!/usr/bin/env node
/**
 * Auto-post today's jobs to X (Twitter) via the v2 API (POST /2/tweets),
 * signed with OAuth 1.0a user context. Free X tier allows ~500 posts/month
 * (~16/day) — we default to 10/day, well under the cap.
 *
 * Usage:
 *   X_API_KEY=.. X_API_SECRET=.. X_ACCESS_TOKEN=.. X_ACCESS_SECRET=.. \
 *     node scripts/post-to-x.mjs            # dry run (prints tweets)
 *     node scripts/post-to-x.mjs --publish  # actually post
 *   Flags: --max=10  --links=2  --category="Software / IT,Data & Analytics"
 *
 * Env: X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_SECRET (required to post)
 *      X_TRACK (tracking tag, default 763cb402), SITE (default site)
 */
import crypto from 'node:crypto';

const SITE = process.env.SITE || 'https://dailyjobpost.online';
const TRACK = process.env.X_TRACK || '763cb402';
const CK = process.env.X_API_KEY, CS = process.env.X_API_SECRET;
const AT = process.env.X_ACCESS_TOKEN, AS = process.env.X_ACCESS_SECRET;

const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const opt = (n, d) => { const h = args.find((a) => a.startsWith(`--${n}=`)); return h ? h.split('=').slice(1).join('=') : d; };
const LINKS = parseInt(opt('links', '2'), 10);
const MAX = parseInt(opt('max', '10'), 10);
const PUBLISH = flag('publish');
const CAT_FILTER = (opt('category', '') || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
const AI_RE = /\b(ai|ml|machine[ -]?learning|data|llm|gen[ -]?ai|deep learning|nlp)\b/i;

const THEMES = {
  'Software / IT':    { emoji: '💻', label: 'Engineering & IT roles',   tags: '#hiring #techjobs #nowhiring' },
  'Data & Analytics': { emoji: '📊', label: 'Data & analytics roles',   tags: '#datajobs #hiring #analytics' },
  'Design':           { emoji: '🎨', label: 'Design jobs hiring',       tags: '#designjobs #hiring #uxui' },
  'Marketing':        { emoji: '📣', label: 'Marketing roles hiring',   tags: '#marketingjobs #hiring' },
  'Sales':            { emoji: '💼', label: 'Sales roles hiring now',   tags: '#salesjobs #hiring' },
  'Customer Support': { emoji: '🤝', label: 'Customer success roles',   tags: '#customersuccess #hiring' },
  'Legal':            { emoji: '⚖️', label: 'Legal & compliance roles', tags: '#legaljobs #hiring' },
  'Finance':          { emoji: '💰', label: 'Finance roles hiring',     tags: '#financejobs #hiring' },
  'Healthcare':       { emoji: '🏥', label: 'Healthcare roles hiring',  tags: '#healthcarejobs #hiring' },
  _default:           { emoji: '🚀', label: 'Fresh jobs hiring now',    tags: '#hiring #jobs #nowhiring' },
};
const themeFor = (c) => THEMES[c] || THEMES._default;

/* ── scrape (widen posted window until enough) ── */
const decode = (s) => s.replace(/&amp;/g, '&').replace(/&#x2011;/g, '-').replace(/&#x2010;/g, '-').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ');
const titleCase = (s) => s.replace(/\b\w/g, (c) => c.toUpperCase());

function jobAllowed(j) {
  if (!CAT_FILTER.length) return true;
  const cat = j.category.toLowerCase();
  return CAT_FILTER.some((c) => cat.includes(c) || c.includes(cat)) || AI_RE.test(j.title);
}
async function scrapeWindow(win) {
  const seen = new Set(); const jobs = [];
  for (let page = 1; page <= 6; page++) {
    const res = await fetch(`${SITE}/?${win}&page=${page}`);
    if (!res.ok) break;
    const html = await res.text();
    const anchors = [...html.matchAll(/<a[^>]*href="(\/jobs\/[^"]+)"[^>]*>(.*?)<\/a>/gs)];
    if (!anchors.length) break;
    let added = 0;
    for (const [, href, inner] of anchors) {
      if (seen.has(href)) continue;
      seen.add(href);
      const parts = inner.replace(/<[^>]+>/g, '\t').split('\t').map((p) => decode(p.trim())).filter(Boolean);
      const dot = parts.indexOf('·');
      if (dot < 1) continue;
      const job = { href, title: parts[1], company: titleCase(parts[dot - 1]), location: parts[dot + 1] || '', remote: parts.slice(2, dot - 1).includes('REMOTE') || /remote/i.test(parts[dot + 1] || ''), category: parts.slice(2, dot - 1).filter((t) => t !== 'REMOTE')[0] || 'Jobs' };
      if (!job.title || !job.company) continue;
      if (!jobAllowed(job)) continue;
      jobs.push(job); added++;
    }
    if (!added) break;
  }
  return jobs;
}
async function scrapeJobs(needed) {
  let best = [];
  for (const win of ['posted=1', 'posted=3', 'posted=7']) {
    const jobs = await scrapeWindow(win);
    if (jobs.length > best.length) best = jobs;
    if (jobs.length >= needed) return jobs;
  }
  return best;
}

/* ── build tweets (<=280, t.co counts links as 23) ── */
const jobUrl = (href) => `${SITE}${href}?il=${TRACK}`;
const tweetLen = (t) => t.replace(/https?:\/\/\S+/g, 'x'.repeat(23)).length;

function buildTweets(jobs) {
  const byCat = new Map();
  for (const j of jobs) { if (!byCat.has(j.category)) byCat.set(j.category, []); byCat.get(j.category).push(j); }
  const out = [];
  for (const [cat, list] of byCat) {
    for (let i = 0; i + LINKS <= list.length && out.length < MAX; i += LINKS) {
      out.push(renderTweet(cat, list.slice(i, i + LINKS)));
    }
  }
  return out.slice(0, MAX);
}
function renderTweet(cat, jobs) {
  const t = themeFor(cat);
  const line = (j) => {
    const loc = j.remote ? 'Remote' : (j.location || '').split(',')[0];
    let lbl = `${j.company} — ${j.title}`;
    if (lbl.length > 64) lbl = lbl.slice(0, 61) + '…';
    return `${lbl}${loc ? ` (${loc})` : ''}\n${jobUrl(j.href)}`;
  };
  let body = `${t.emoji} ${t.label} 👇\n\n` + jobs.map(line).join('\n\n');
  let tweet = `${body}\n\n${t.tags}`;
  if (tweetLen(tweet) > 280) tweet = body;           // drop hashtags if needed
  return tweet;
}

/* ── OAuth 1.0a signed POST /2/tweets ── */
const pe = (s) => encodeURIComponent(s).replace(/[!*'()]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
async function postTweet(text) {
  const url = 'https://api.twitter.com/2/tweets';
  const oauth = {
    oauth_consumer_key: CK,
    oauth_nonce: crypto.randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: String(Math.floor(Date.now() / 1000)),
    oauth_token: AT,
    oauth_version: '1.0',
  };
  const paramStr = Object.keys(oauth).sort().map((k) => `${pe(k)}=${pe(oauth[k])}`).join('&');
  const base = ['POST', pe(url), pe(paramStr)].join('&');
  const key = `${pe(CS)}&${pe(AS)}`;
  oauth.oauth_signature = crypto.createHmac('sha1', key).update(base).digest('base64');
  const header = 'OAuth ' + Object.keys(oauth).sort().map((k) => `${pe(k)}="${pe(oauth[k])}"`).join(', ');
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: header, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

/* ── main ── */
(async () => {
  const jobs = await scrapeJobs(MAX * LINKS);
  const tweets = buildTweets(jobs);
  console.log(`Scraped ${jobs.length} jobs → built ${tweets.length} tweets.\n`);

  if (!PUBLISH) {
    tweets.forEach((t, i) => { console.log(`──── TWEET ${i + 1} (${tweetLen(t)} chars) ────\n${t}\n`); });
    console.log('DRY RUN — re-run with --publish to post.');
    return;
  }
  if (!CK || !CS || !AT || !AS) { console.error('Missing X_API_KEY/X_API_SECRET/X_ACCESS_TOKEN/X_ACCESS_SECRET'); process.exit(1); }

  for (let i = 0; i < tweets.length; i++) {
    const r = await postTweet(tweets[i]);
    if (r.status === 201) console.log(`✅ TWEET ${i + 1}/${tweets.length} → id ${r.json?.data?.id}`);
    else { console.error(`❌ TWEET ${i + 1} failed: ${r.status} ${JSON.stringify(r.json)}`); }
    await new Promise((res) => setTimeout(res, 2000)); // gentle spacing
  }
})();
