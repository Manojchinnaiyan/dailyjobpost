#!/usr/bin/env node
/**
 * Auto-post today's jobs to the DailyJobPost LinkedIn Page via WoopSocial.
 *
 * Pipeline:
 *   1. Scrape jobs posted in the last 24h from the live site (?posted=1).
 *   2. Group by category into "posts" of N links each (default 3).
 *   3. Build LinkedIn-formatted text with the ?il= tracking tag on every link.
 *   4. Push to WoopSocial (DRAFT by default — must opt in to actually publish).
 *
 * Why WoopSocial: it owns the LinkedIn-approved app, so we skip the whole
 * LinkedIn developer-app + org-verification dance. We just hold an API key.
 *
 * Usage:
 *   WOOPSOCIAL_API_KEY=wsk_... node scripts/post-to-linkedin.mjs            # dry run, prints posts
 *   WOOPSOCIAL_API_KEY=wsk_... node scripts/post-to-linkedin.mjs --draft    # create as drafts in WoopSocial
 *   WOOPSOCIAL_API_KEY=wsk_... node scripts/post-to-linkedin.mjs --publish  # publish NOW (outward-facing!)
 *   ... --schedule --start=09:00 --interval=45   # schedule across the day, 45 min apart, from 09:00 UTC
 *
 * Flags:
 *   --links=3     links per post      (default 3)
 *   --max=10      max posts to create (default 10)
 *   --draft       create posts as DRAFT in WoopSocial (review before posting)
 *   --publish     publish immediately (PUBLISH_NOW)
 *   --schedule    schedule for later  (needs --start + --interval)
 *   --start=HH:MM first slot, UTC     (default: now + 5 min)
 *   --interval=45 minutes between scheduled posts (default 45)
 *   (no mode flag) = dry run, prints what it WOULD post and exits
 *
 * Env:
 *   WOOPSOCIAL_API_KEY   (required)
 *   WOOPSOCIAL_PROJECT_ID, WOOPSOCIAL_ACCOUNT_ID  (optional — auto-discovered)
 *   LINKEDIN_TRACK       tracking id  (default dda301f4)
 *   SITE                 base url     (default https://dailyjobpost.online)
 */

const API   = 'https://api.woopsocial.com/v1';
const SITE   = process.env.SITE || 'https://dailyjobpost.online';
const TRACK  = process.env.LINKEDIN_TRACK || 'dda301f4';
const KEY    = process.env.WOOPSOCIAL_API_KEY;

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const opt  = (name, def) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : def;
};

const LINKS_PER_POST = parseInt(opt('links', '3'), 10);
const MAX_POSTS      = parseInt(opt('max', '10'), 10);
const INTERVAL_MIN   = parseInt(opt('interval', '45'), 10);
const MODE = flag('publish') ? 'PUBLISH_NOW'
           : flag('schedule') ? 'SCHEDULE_FOR_LATER'
           : flag('draft') ? 'DRAFT'
           : 'DRY_RUN';

if (!KEY) { console.error('ERROR: WOOPSOCIAL_API_KEY is required'); process.exit(1); }

const auth = { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

/* ── Category → theme (emoji header + hashtags) ── */
const THEMES = {
  'Software / IT':     { emoji: '💻', label: 'Engineering & IT roles',        tags: '#hiring #techjobs #engineeringjobs #softwarejobs #nowhiring' },
  'Data & Analytics':  { emoji: '📊', label: 'Data & Analytics roles',        tags: '#datajobs #analytics #hiring #dataanalytics #jobsearch' },
  'Design':            { emoji: '🎨', label: 'Design & Creative jobs',        tags: '#designjobs #uxui #hiring #creativejobs #remotejobs' },
  'Marketing':         { emoji: '📣', label: 'Marketing & Growth roles',      tags: '#marketingjobs #growth #hiring #digitalmarketing #jobsearch' },
  'Sales':             { emoji: '💼', label: 'Sales roles hiring now',        tags: '#salesjobs #hiring #accountexecutive #nowhiring #careers' },
  'Customer Support':  { emoji: '🤝', label: 'Customer Success roles',        tags: '#customersuccess #hiring #support #remotejobs #careers' },
  'Legal':             { emoji: '⚖️', label: 'Legal & Compliance roles',     tags: '#legaljobs #compliance #hiring #careers #jobsearch' },
  'Finance':           { emoji: '💰', label: 'Finance roles hiring now',      tags: '#financejobs #hiring #accounting #careers #jobsearch' },
  'Healthcare':        { emoji: '🏥', label: 'Healthcare & clinical roles',   tags: '#healthcarejobs #nursing #hiring #clinicaljobs #nowhiring' },
  _default:            { emoji: '🚀', label: 'Fresh jobs posted today',       tags: '#hiring #jobs #nowhiring #jobsearch #careers' },
};
const themeFor = (cat) => THEMES[cat] || THEMES._default;

/* ── 1. Scrape today's jobs ── */
async function scrapeJobs() {
  const seen = new Set();
  const jobs = [];
  for (let page = 1; page <= 5; page++) {
    const res = await fetch(`${SITE}/?posted=1&page=${page}`);
    if (!res.ok) break;
    const html = await res.text();
    const anchors = [...html.matchAll(/<a[^>]*href="(\/jobs\/[^"]+)"[^>]*>(.*?)<\/a>/gs)];
    if (!anchors.length) break;
    let added = 0;
    for (const [, href, inner] of anchors) {
      if (seen.has(href)) continue;
      seen.add(href);
      const parts = inner.replace(/<[^>]+>/g, '\t').split('\t')
        .map((p) => decodeEntities(p.trim())).filter(Boolean);
      const dot = parts.indexOf('·');
      if (dot < 1) continue;
      const title    = parts[1];
      const company  = parts[dot - 1];
      const location = parts[dot + 1] || '';
      const between  = parts.slice(2, dot - 1);
      const remote   = between.includes('REMOTE') || /remote/i.test(location);
      const category = between.filter((t) => t !== 'REMOTE')[0] || 'Jobs';
      if (!title || !company) continue;
      jobs.push({ href, title, company: titleCase(company), location, remote, category });
      added++;
    }
    if (!added) break;
  }
  return jobs;
}

function decodeEntities(s) {
  return s.replace(/&amp;/g, '&').replace(/&#x2011;/g, '-').replace(/&#x2010;/g, '-')
          .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ');
}
const titleCase = (s) => s.replace(/\b\w/g, (c) => c.toUpperCase());
const jobUrl = (href) => `${SITE}${href}?il=${TRACK}`;

/* ── 2/3. Group into themed posts of N, build LinkedIn text ── */
function buildPosts(jobs) {
  const byCat = new Map();
  for (const j of jobs) {
    if (!byCat.has(j.category)) byCat.set(j.category, []);
    byCat.get(j.category).push(j);
  }
  const chunks = [];
  for (const [cat, list] of byCat) {
    for (let i = 0; i < list.length; i += LINKS_PER_POST) {
      const slice = list.slice(i, i + LINKS_PER_POST);
      if (slice.length === LINKS_PER_POST) chunks.push({ cat, jobs: slice });
    }
  }
  return chunks.slice(0, MAX_POSTS).map(({ cat, jobs }) => ({ text: renderPost(cat, jobs), jobs }));
}

function renderPost(cat, jobs) {
  const t = themeFor(cat);
  const lines = [];
  lines.push(`${t.emoji} ${t.label}`);
  lines.push('');
  lines.push(`Fresh roles posted in the last 24h 👇`);
  lines.push('');
  for (const j of jobs) {
    const loc = j.remote ? 'Remote' : (j.location || '').split(',')[0];
    lines.push(`🔹 ${j.company} — ${j.title}${loc ? ` (${loc})` : ''}`);
    lines.push(jobUrl(j.href));
    lines.push('');
  }
  lines.push(`More added daily 👉 ${SITE}?il=${TRACK}`);
  lines.push('');
  lines.push(t.tags);
  return lines.join('\n');
}

/* ── WoopSocial helpers ── */
async function discover() {
  let projectId = process.env.WOOPSOCIAL_PROJECT_ID;
  let accountId = process.env.WOOPSOCIAL_ACCOUNT_ID;
  let platform  = 'LINKEDIN_PAGES';
  if (!projectId) {
    const p = await (await fetch(`${API}/projects`, { headers: auth })).json();
    projectId = p[0]?.id;
  }
  const accs = await (await fetch(`${API}/social-accounts?projectId=${projectId}`, { headers: auth })).json();
  const li = accs.find((a) => /LINKEDIN/.test(a.platform) && a.status === 'CONNECTED');
  if (li) { accountId = accountId || li.id; platform = li.platform; }
  if (!projectId || !accountId) throw new Error('Could not resolve project/account — set WOOPSOCIAL_PROJECT_ID / WOOPSOCIAL_ACCOUNT_ID');
  return { projectId, accountId, platform };
}

async function createPost({ text, accountId, platform, scheduledFor }) {
  const schedule = MODE === 'SCHEDULE_FOR_LATER'
    ? { type: 'SCHEDULE_FOR_LATER', scheduledFor }
    : MODE === 'PUBLISH_NOW' ? { type: 'PUBLISH_NOW' } : { type: 'DRAFT' };
  const body = {
    content: [{ text }],
    schedule,
    socialAccounts: [{ platform, socialAccountId: accountId }],
  };
  const res = await fetch(`${API}/posts`, { method: 'POST', headers: auth, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`WoopSocial ${res.status}: ${JSON.stringify(json)}`);
  return json;
}

/* ── main ── */
(async () => {
  const jobs = await scrapeJobs();
  console.log(`Scraped ${jobs.length} jobs posted in the last 24h.`);
  const posts = buildPosts(jobs);
  console.log(`Built ${posts.length} posts (${LINKS_PER_POST} links each).\n`);

  if (MODE === 'DRY_RUN') {
    posts.forEach((p, i) => {
      console.log(`──────── POST ${i + 1} ────────`);
      console.log(p.text);
      console.log('');
    });
    console.log('DRY RUN — nothing sent. Re-run with --draft, --publish, or --schedule.');
    return;
  }

  const { projectId, accountId, platform } = await discover();
  console.log(`Target: project ${projectId}, account ${accountId} (${platform}), mode ${MODE}\n`);

  // scheduling base time
  let slot = null;
  if (MODE === 'SCHEDULE_FOR_LATER') {
    const start = opt('start', null);
    const base = new Date();
    if (start) {
      const [h, m] = start.split(':').map(Number);
      base.setUTCHours(h, m, 0, 0);
      if (base < new Date()) base.setUTCDate(base.getUTCDate() + 1);
    } else {
      base.setUTCMinutes(base.getUTCMinutes() + 5);
    }
    slot = base;
  }

  for (let i = 0; i < posts.length; i++) {
    let scheduledFor;
    if (slot) {
      scheduledFor = slot.toISOString();
      slot = new Date(slot.getTime() + INTERVAL_MIN * 60 * 1000);
    }
    try {
      const r = await createPost({ text: posts[i].text, accountId, platform, scheduledFor });
      console.log(`✅ POST ${i + 1}/${posts.length} ${MODE}${scheduledFor ? ` @ ${scheduledFor}` : ''} → id ${r.id || '(ok)'}`);
    } catch (e) {
      console.error(`❌ POST ${i + 1} failed: ${e.message}`);
    }
  }
})();
