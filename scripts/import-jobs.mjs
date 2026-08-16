#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
/**
 * Import real jobs (worldwide) from public company ATS APIs (Greenhouse + Lever).
 * These are official, public hiring endpoints intended for consumption.
 * Each job links back to the company's own apply page.
 *
 * Usage: node scripts/import-jobs.mjs > jobs-import.sql
 * Then:  npx wrangler d1 execute dailyjobpost-jobs --remote --file=jobs-import.sql
 */

// ── Companies that publish via Greenhouse public boards (global hirers) ──
const GREENHOUSE = [...new Set([
  // food / restaurants / grocery
  'sweetgreen','cava','hellofresh',
  'instacart',
  // retail / consumer brands / commerce
  'glossier','everlane','reformation',
  'peloton','poshmark','stockx','mercari',
  'offerup','faire','thrivemarket',
  // health / wellness / care
  'oscar','modernhealth',
  'calm','talkspace',
  'tia','parsleyhealth',
  // finance / fintech / insurance
  'sofi','chime','current','marqeta',
  'ethoslife','betterment','robinhood',
  'brex','mercury','carta','gusto','melio',
  // real estate / mobility / logistics
  'flexport','samsara','verkada',
  'lyft','via','gofundme','life360',
  // sports / entertainment / media
  'fanduel','seatgeek','reddit','pinterest',
  'nextdoor','discord','twitch','medium',
  // education / staffing / hr
  'coursera','udemy','duolingo','outschool','guild',
  'justworks','instawork','indeedflex','remote',
  // MENA / UAE-focused
  'careem','tamara',
  // fintech / payments
  'stripe','coinbase','gemini','brex','mercury','gocardless',
  'sumup','affirm','sofi','chime','marqeta',
  'robinhood','fireblocks',
  // dev tools / infra / data
  'databricks','datadog','mongodb','elastic','cockroachlabs','clickhouse',
  'vercel','webflow','gitlab','launchdarkly',
  'pagerduty','sumologic','grafanalabs','newrelic',
  'planetscale','dataiku','scaleai',
  // saas / productivity
  'airtable','asana','figma',
  'calendly','dropbox','lattice','typeform','contentful',
  // consumer / social / media
  'reddit','pinterest','nextdoor','discord','twitch',
  'classpass','peloton',
  // delivery / mobility / logistics
  'instacart','lyft','via',
  'samsara','verkada','flexport','project44',
  // health / bio
  'swordhealth',
  // commerce / retail
  'glossier','faire','poshmark',
  'stockx','squarespace',
  // marketing / analytics
  'attentive','klaviyo','braze','iterable','amplitude','mixpanel',
  // hr / ops
  'gusto','remote','justworks',
  // deep tech / robotics / auto
  'nuro',
  // europe / global
  'getyourguide','hellofresh','celonis',
  'monzo','n26',
  // more US tech / consumer / enterprise
  'roblox','duolingo','coursera','udemy','khanacademy',
  'calm','modernhealth',
  'current','public',
  'toast','dashlane','okta','databricks',
  'gitlab','elastic','cockroachlabs','clickhouse','starburst','fivetran',
  'hightouch','amplitude','contentful',
  'algolia','postman','twilio','vonage','bandwidth',
  'gusto','justworks','remote',
  'sweetgreen','cava',
  'glossier','everlane','reformation',
  'faire','depop','mercari','offerup','nextdoor','life360',
  'asana','smartsheet','airtable','quip',
  'duolingo','outschool','newsela',
  // healthcare / medicine / clinical / pharma (nurses, physicians, care, biotech)
  'onemedical','honor','papa',
  'galileo','oscar',
  'tia','parsleyhealth','omadahealth',
  'strivehealth',
  'komodohealth',
  'rightway',
  // India
  'phonepe','inmobi','glance','stage','druva','turing','slice','postman',
  // DACH / Germany
  'flix','celonis','helsing','isaraerospace','parloa','solarisbank','raisin',
  'staffbase','grover','trivago','urbansportsclub',
  // Europe (other)
  'tide','graphcore','truecaller','mirakl','elastic',
  // SEA / APAC
  'xendit','thunes','flip','kargo',
  // Africa / MENA
  'moniepoint','jumia','luno','ozow',
])];

// ── Companies that publish via Lever public boards ──
const LEVER = [...new Set([
  'palantir','spotify','plaid','kavak',
  'mistral',
  'cred','meesho',
  'ninjavan',
  // India — Paytm alone carries a few hundred Indian postings.
  'paytm','mindtickle','zeta','fampay','porter','fi',
  // Europe
  'aircall','qonto','malt','360learning','zopa','jobandtalent','swile',
  'contentsquare','younited','omnisend','finn',
  // APAC / LatAm / Africa
  'nium','lalamove','coins','maya','aleph','tala','copia',
])];

// ── Companies that publish via Ashby public boards ──
const ASHBY = [...new Set([
  'openai','ramp','notion','linear','vanta','hex','replit',
  'watershed','elevenlabs','baseten','modal','cursor',
  'mercury','airwallex',
  // India
  'sarvam','atlan','navi','titan',
  // DACH / Germany
  'statista','enpal','pliant','moss','egym','clark','langdock','forto',
  // Europe (other)
  'doctolib','pennylane','satispay','synthesia','multiverse','marshmallow',
  'ledger','tourlane','beamery','improbable','shift','float',
])];

const PER_COMPANY = 55;          // cap jobs per company
const TOTAL_CAP    = 8000;       // overall cap
const BODY_CAP     = 7000;       // chars (HTML)

// ── Delisting / expiry ──
// A posting is "expired" when its own ATS stops listing it (filled, closed,
// pulled) — not when it gets old. Every run stamps last_seen on every posting
// still present in a feed; anything missing for this many consecutive runs is
// deleted. Wide enough that a few days of transient board failures can't drop
// live jobs, tight enough that dead links don't linger.
const STALE_DAYS   = 7;
// Far backstop for anything the delisting check can never reach (e.g. rows
// whose source disappeared entirely). Deliberately NOT 45 days any more:
// delisting now removes closed jobs within STALE_DAYS, and roles legitimately
// stay open for months. The old 45-day rule deleted ~1,270 verified-open jobs
// every night, which the next import simply re-inserted.
const MAX_AGE_DAYS = 365;
// Guard against a broken run (network outage, ATS-wide failure) looking like
// "every job was delisted". Skip the stale prune unless the run was healthy.
const MIN_BOARD_SUCCESS_RATE = 0.8;
const MIN_LIVE_SLUGS         = 1000;

// ── Region classification ────────────────────────────────────────────────────
// Keywords mirror COUNTRY_KEYS in src/lib/jobquery.ts so a job the importer
// files under "India" is the same job the /jobs-in/india landing page finds.
// Order matters: the first region whose keywords match wins, and the US is
// checked LAST because generic words like "remote" would otherwise swallow
// "Remote - Bengaluru".
const REGIONS = [
  ['India',        ['india','bengaluru','bangalore','mumbai','new delhi','delhi','hyderabad','pune','chennai','kolkata','gurgaon','gurugram','noida','ahmedabad','jaipur','indore','kochi','coimbatore','chandigarh']],
  ['Germany/DACH', ['germany','deutschland','berlin','munich','münchen','hamburg','frankfurt','cologne','köln','stuttgart','düsseldorf','leipzig','austria','vienna','wien','switzerland','zurich','zürich','geneva','basel']],
  ['UK/Ireland',   ['united kingdom',' uk','london','manchester','edinburgh','birmingham','leeds','bristol','glasgow','cambridge','oxford','ireland','dublin','cork']],
  ['Europe',       ['france','paris','lyon','netherlands','amsterdam','rotterdam','utrecht','spain','madrid','barcelona','valencia','italy','milan','rome','portugal','lisbon','porto','poland','warsaw','krakow','wroclaw','sweden','stockholm','denmark','copenhagen','norway','oslo','finland','helsinki','belgium','brussels','czech','prague','romania','bucharest','hungary','budapest','greece','athens','estonia','tallinn','lithuania','vilnius','latvia','riga','bulgaria','sofia','croatia','serbia','belgrade','ukraine','kyiv','emea']],
  ['Canada',       ['canada','toronto','vancouver','montreal','ottawa','calgary','edmonton','waterloo','ontario','quebec','british columbia']],
  ['SEA/APAC',     ['singapore','indonesia','jakarta','philippines','manila','cebu','malaysia','kuala lumpur','vietnam','hanoi','ho chi minh','thailand','bangkok','japan','tokyo','osaka','korea','seoul','china','shanghai','beijing','shenzhen','hong kong','taiwan','taipei','australia','sydney','melbourne','brisbane','perth','new zealand','auckland','apac']],
  ['Middle East',  ['uae','dubai','abu dhabi','united arab emirates','saudi','riyadh','jeddah','qatar','doha','kuwait','bahrain','oman','israel','tel aviv','turkey','istanbul','jordan','amman','egypt','cairo']],
  ['Africa',       ['nigeria','lagos','abuja','kenya','nairobi','south africa','johannesburg','cape town','ghana','accra','uganda','kampala','tanzania','rwanda','kigali','senegal','morocco','ethiopia']],
  ['LatAm',        ['mexico','guadalajara','brazil','brasil','são paulo','sao paulo','rio de janeiro','argentina','buenos aires','colombia','bogota','bogotá','chile','santiago','peru','lima','uruguay','montevideo','costa rica','latam']],
  ['United States',['united states','usa',' u.s','us-','remote - us','remote, us','remote (us','san francisco','new york','seattle','austin','los angeles','chicago','boston','denver','atlanta','washington','miami','dallas','houston','portland','san jose','mountain view','palo alto','sunnyvale','menlo park','bellevue','redwood','santa clara','san diego','san mateo','bay area','brooklyn','nyc','d.c','arlington','phoenix','philadelphia','nashville','charlotte','minneapolis','salt lake','raleigh','columbus','detroit','pittsburgh','california','texas','massachusetts','illinois','colorado','georgia','florida','oregon','virginia','arizona','utah',', ca',', ny',', wa',', tx',', ma',', il',', co',', ga',', fl',', or',', pa',', va',', nc',', az',', mn',', ut',', tn',', oh',', mi',', md',', nj',', dc',', wi',', mo',', nv']],
];

/** @returns one of the REGIONS names, or 'Remote/Global' when only "remote" is known. */
function classifyRegion(location) {
  const l = ` ${(location || '').toLowerCase()} `;
  for (const [region, keys] of REGIONS) {
    if (keys.some((k) => l.includes(k))) return region;
  }
  return /remote|anywhere|worldwide|global/.test(l) ? 'Remote/Global' : 'Other';
}

// How many of the TOTAL_CAP slots each region may claim. Without this the cap
// is filled first-come, and since the board list is mostly American (and
// Greenhouse is swept first) the US took ~82% of the table — India got 4%.
// A region cannot be crowded out by another: unclaimed slots are redistributed
// at the end, but only after every region has had its guaranteed share.
const REGION_QUOTA = {
  'India':          1400,
  'Germany/DACH':    700,
  'UK/Ireland':      600,
  'Europe':          700,
  'Canada':          400,
  'SEA/APAC':        500,
  'Middle East':     300,
  'Africa':          200,
  'LatAm':           200,
  'Remote/Global':   500,
  'Other':           300,
  'United States':  2200,
};
// India must never come back empty — the site is India-facing first.
const MIN_INDIA = 200;
// Rows held per region beyond its quota, so leftover slots can be reallocated
// instead of discarded. Bounded so memory stays predictable.
const OVERFLOW_RESERVE = 400;

// Global mode: accept any real location worldwide. Reject empty / junk values.
const JUNK_LOC = /^(n\/?a|tbd|various|multiple|see job|unknown|-+)$/i;
function acceptLoc(loc) {
  if (!loc) return false;
  const l = loc.trim();
  if (l.length < 2 || l.length > 120) return false;
  if (JUNK_LOC.test(l)) return false;
  return true;
}

// ── Category inference ──
const CAT_RULES = [
  ['Healthcare',       ['nurse',' rn ',' rn,','registered nurse','physician','clinician','clinical','pharmacist','pharmacy','therapist','therapy','caregiver','care coordinator','patient care','patient access','medical assistant','phlebotom','behavioral health','mental health','psychiatr','psycholog','dentist','dental','social worker','health coach','case manager','medical director','nurse practitioner']],
  ['Data & Analytics', ['data scientist','data engineer','data analyst',' analytics','machine learning',' ml ','ai/ml','research scientist']],
  ['Design',           ['designer','ux ','ui ','design ',' design','user experience','creative','brand design']],
  ['Product',          ['product manager','product owner','group product','head of product','director of product','product lead']],
  ['Marketing',        ['marketing','growth','seo','content','brand','communications',' pr ','demand gen','lifecycle']],
  ['Sales',            ['sales','account executive','business development','partnerships','revenue','account manager','sdr','bdr']],
  ['Finance',          ['finance','accounting','accountant','controller','fp&a','treasury','audit','tax ','financial']],
  ['Human Resources',  ['recruiter','recruiting','talent','people ops','people partner','human resources',' hr ','sourcer']],
  ['Customer Support', ['customer support','customer success','customer experience','support engineer','technical support','success manager']],
  ['Legal',            ['legal','counsel','compliance','paralegal','privacy counsel','regulatory']],
  ['Operations',       ['operations','program manager','project manager','supply chain','logistics','strategy','chief of staff','biz ops','business operations']],
  ['Software / IT',    ['engineer','developer','software','backend','frontend','full stack','full-stack','devops',' sre','infrastructure','platform','mobile','ios','android','security','architect','qa ','reliability']],
];
function inferCategory(title) {
  const t = ` ${title.toLowerCase()} `;
  for (const [cat, kws] of CAT_RULES) if (kws.some(k => t.includes(k))) return cat;
  return 'Software / IT';
}

// ── Tag extraction ──
const TECH = ['React','Node.js','Node','Python','Golang','Go','Java','TypeScript','JavaScript','Rust','Ruby','Rails','AWS','GCP','Azure','Kubernetes','Docker','SQL','GraphQL','Kafka','Spark','Scala','C++','Swift','Kotlin','Terraform','PostgreSQL','Redis','Django','Flask','Next.js','Vue','Angular','PHP','Elixir','Tableau','Figma','Salesforce','SEO','Excel'];
const SENIORITY = ['Senior','Staff','Principal','Lead','Director','Manager','Head','VP','Junior','Intern'];
function extractTags(title, body) {
  const hay = `${title} ${body}`;
  const tags = [];
  for (const s of SENIORITY) if (new RegExp(`\\b${s}\\b`, 'i').test(title)) { tags.push(s); break; }
  for (const tech of TECH) {
    if (tags.length >= 5) break;
    const re = new RegExp(`(^|[^A-Za-z])${tech.replace(/[.+]/g, '\\$&')}([^A-Za-z]|$)`, 'i');
    if (re.test(hay) && !tags.some(t => t.toLowerCase() === tech.toLowerCase())) tags.push(tech);
  }
  return tags.slice(0, 5);
}

function inferType(title, location) {
  const t = title.toLowerCase();
  // Word-boundary match so "international" / "internal" don't count as "intern".
  if (/\bintern(ship|s)?\b/.test(t) || /\bco-?op\b/.test(t)) return 'internship';
  if (t.includes('contract') || t.includes('contractor')) return 'contract';
  if (t.includes('part-time') || t.includes('part time')) return 'part-time';
  if ((location || '').toLowerCase().includes('remote')) return 'remote';
  return 'full-time';
}

function decodeEntities(s) {
  return (s || '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, ' ').replace(/&rsquo;/g, "'").replace(/&ldquo;/g, '"')
    .replace(/&rdquo;/g, '"').replace(/&mdash;/g, '—').replace(/&ndash;/g, '–')
    .replace(/&amp;/g, '&');
}

/** Keep structural HTML (headings, lists, bold) but strip anything unsafe. */
function sanitizeHtml(raw) {
  let h = decodeEntities(raw);
  h = h.replace(/<script[\s\S]*?<\/script>/gi, '')
       .replace(/<style[\s\S]*?<\/style>/gi, '')
       .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
       .replace(/<!--[\s\S]*?-->/g, '')
       .replace(/\son\w+\s*=\s*"[^"]*"/gi, '')
       .replace(/\son\w+\s*=\s*'[^']*'/gi, '')
       .replace(/(href|src)\s*=\s*"javascript:[^"]*"/gi, '$1="#"')
       // drop images/styles/classes that won't match our theme
       .replace(/<img[^>]*>/gi, '')
       .replace(/\s(style|class|id|width|height|align)\s*=\s*"[^"]*"/gi, '')
       .replace(/\s(style|class|id|width|height|align)\s*=\s*'[^']*'/gi, '')
       .replace(/[ \t]{2,}/g, ' ')
       .replace(/(\s*<br\s*\/?>\s*){2,}/gi, '<br>')
       .trim();
  if (h.length > BODY_CAP) {
    h = h.slice(0, BODY_CAP);
    const cut = h.lastIndexOf('</p>');
    if (cut > 1500) h = h.slice(0, cut + 4);
  }
  return h;
}
function textLen(html) {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().length;
}

const NAME_OVERRIDES = {
  gitlab: 'GitLab', mongodb: 'MongoDB', scaleai: 'Scale AI', sofi: 'SoFi',
  doordash: 'DoorDash', hashicorp: 'HashiCorp', sofar: 'Sofar', leetcode: 'LeetCode',
  ro: 'Ro', voiceflow: 'Voiceflow', netflix: 'Netflix', palantir: 'Palantir',
  fanatics: 'Fanatics', opensea: 'OpenSea',
};
function company_name(slug) {
  if (NAME_OVERRIDES[slug]) return NAME_OVERRIDES[slug];
  return slug.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
    .replace(/\bAi\b/, 'AI').replace(/\bIo\b/, 'IO');
}

function toSlug(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
}
function sq(s) { return `'${String(s ?? '').replace(/'/g, "''")}'`; }

async function fetchJSON(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 12000);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'dailyjobpost-importer/1.0' }, signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

const seen = new Set();
const rows = [];
// Every slug the feeds still list — including postings we skip on location,
// body length or the PER_COMPANY cap. This is the delisting signal, so it has
// to reflect the whole feed, not just the subset we import.
const liveSlugs = new Set();

// ── Region-quota admission ───────────────────────────────────────────────────
const regionCount = new Map();      // region -> rows admitted
const overflow = new Map();         // region -> rows that did not fit its quota

/**
 * Take a row if its region still has quota left, otherwise park it in that
 * region's overflow for possible redistribution once every board is in.
 * @returns true when the row was admitted outright.
 */
function admit(row) {
  const region = classifyRegion(row.location);
  row.region = region;
  const used = regionCount.get(region) ?? 0;
  const quota = REGION_QUOTA[region] ?? 0;

  if (used < quota && rows.length < TOTAL_CAP) {
    regionCount.set(region, used + 1);
    rows.push(row);
    return true;
  }
  const spill = overflow.get(region) ?? [];
  if (spill.length < OVERFLOW_RESERVE) {
    spill.push(row);
    overflow.set(region, spill);
  }
  return false;
}

/** Hand unclaimed slots to regions that still have candidates waiting. */
function redistributeOverflow(log) {
  // Non-US first: the US is the region that would otherwise absorb everything.
  const order = [...overflow.keys()].sort((a, b) =>
    (a === 'United States' ? 1 : 0) - (b === 'United States' ? 1 : 0));
  let added = 0;
  for (const region of order) {
    for (const row of overflow.get(region) ?? []) {
      if (rows.length >= TOTAL_CAP) break;
      rows.push(row);
      regionCount.set(region, (regionCount.get(region) ?? 0) + 1);
      added++;
    }
    if (rows.length >= TOTAL_CAP) break;
  }
  if (added) log(`Redistributed ${added} spare slot(s) to regions with candidates left over`);
}

async function importGreenhouse(token) {
  const data = await fetchJSON(`https://boards-api.greenhouse.io/v1/boards/${token}/jobs?content=true`);
  const company = company_name(token);
  let count = 0;
  for (const j of (data.jobs || [])) {
    const title = (j.title || '').trim();
    if (!title) continue;
    const slug = toSlug(`${company}-${title}-${j.id}`);
    liveSlugs.add(slug);
    if (count >= PER_COMPANY || rows.length >= TOTAL_CAP) continue;
    const location = (j.location && j.location.name) || '';
    if (!acceptLoc(location)) continue;
    const body = sanitizeHtml(j.content || '');
    if (textLen(body) < 120) continue;
    if (seen.has(slug)) continue;
    seen.add(slug);
    if (admit({
      slug, title, company, location,
      type: inferType(title, location),
      remote: /remote/i.test(location) ? 1 : 0,
      tags: extractTags(title, body),
      posted: (j.updated_at || '').slice(0, 10) || new Date().toISOString().slice(0, 10),
      apply_url: j.absolute_url || '',
      category: inferCategory(title),
      body,
    })) count++;
  }
  return count;
}

async function importLever(token) {
  const data = await fetchJSON(`https://api.lever.co/v0/postings/${token}?mode=json`);
  const company = company_name(token);
  let count = 0;
  for (const j of (Array.isArray(data) ? data : [])) {
    const title = (j.text || '').trim();
    if (!title) continue;
    const slug = toSlug(`${company}-${title}-${j.id}`);
    liveSlugs.add(slug);
    if (count >= PER_COMPANY || rows.length >= TOTAL_CAP) continue;
    const location = (j.categories && j.categories.location) || '';
    if (!acceptLoc(location)) continue;
    const body = sanitizeHtml(j.description || j.descriptionPlain || '');
    if (textLen(body) < 120) continue;
    if (seen.has(slug)) continue;
    seen.add(slug);
    const commitment = (j.categories && j.categories.commitment) || '';
    let type = inferType(title, location);
    if (/intern/i.test(commitment)) type = 'internship';
    else if (/contract/i.test(commitment)) type = 'contract';
    if (admit({
      slug, title, company, location,
      type,
      remote: /remote/i.test(location) ? 1 : 0,
      tags: extractTags(title, body),
      posted: j.createdAt ? new Date(j.createdAt).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
      apply_url: j.hostedUrl || '',
      category: inferCategory(title),
      body,
    })) count++;
  }
  return count;
}

async function importAshby(org) {
  const data = await fetchJSON(`https://api.ashbyhq.com/posting-api/job-board/${org}?includeCompensation=true`);
  const company = company_name(org);
  let count = 0;
  for (const j of (data.jobs || [])) {
    const title = (j.title || '').trim();
    if (!title) continue;
    const slug = toSlug(`${company}-${title}-${j.id || j.jobId || title}`);
    liveSlugs.add(slug);
    if (count >= PER_COMPANY || rows.length >= TOTAL_CAP) continue;
    const location = j.location || (j.isRemote ? 'Remote' : '') || (j.address?.postalAddress?.addressLocality) || '';
    if (!acceptLoc(location)) continue;
    const body = sanitizeHtml(j.descriptionHtml || '');
    if (textLen(body) < 120) continue;
    if (seen.has(slug)) continue;
    seen.add(slug);
    let type = inferType(title, location);
    const emp = (j.employmentType || '').toLowerCase();
    if (emp.includes('intern')) type = 'internship';
    else if (emp.includes('contract')) type = 'contract';
    else if (emp.includes('part')) type = 'part-time';
    if (admit({
      slug, title, company, location,
      type,
      remote: j.isRemote || /remote/i.test(location) ? 1 : 0,
      tags: extractTags(title, body),
      posted: (j.publishedDate || j.publishedAt || '').slice(0, 10) || new Date().toISOString().slice(0, 10),
      apply_url: j.jobUrl || j.applyUrl || '',
      category: inferCategory(title),
      body,
    })) count++;
  }
  return count;
}

async function main() {
  const log = (...a) => process.stderr.write(a.join(' ') + '\n');

  // Merge in auto-discovered boards (written by scripts/discover-companies.mjs).
  try {
    const extra = JSON.parse(await readFile(new URL('./companies.json', import.meta.url), 'utf8'));
    for (const t of extra.greenhouse || []) if (!GREENHOUSE.includes(t)) GREENHOUSE.push(t);
    for (const t of extra.lever || []) if (!LEVER.includes(t)) LEVER.push(t);
    for (const t of extra.ashby || []) if (!ASHBY.includes(t)) ASHBY.push(t);
    log(`Merged discovered companies: ${GREENHOUSE.length} greenhouse, ${LEVER.length} lever, ${ASHBY.length} ashby`);
  } catch { log('No companies.json — using built-in list only'); }

  // NOTE: every board is fetched even once TOTAL_CAP is reached — the caps
  // limit what we INSERT, but skipping a board would leave its live postings
  // out of liveSlugs and get them expired as if they had been delisted.
  // A 404 board is a PERMANENT state (the token never existed, or the company
  // left that ATS) and is normal here — the discovered-company list is full of
  // guesses. Only transient failures (timeout, 429, 5xx) mean "we cannot see
  // the truth right now", so only those get a say in whether pruning is safe.
  let boardsOk = 0, boardsMissing = 0, boardsErrored = 0;
  const runBoard = async (kind, token, fn) => {
    try { const n = await fn(token); boardsOk++; log(`✓ ${kind}/${token}: ${n}`); }
    catch (e) {
      if (/HTTP 404/.test(e.message)) { boardsMissing++; log(`· ${kind}/${token}: no such board`); }
      else { boardsErrored++; log(`✗ ${kind}/${token}: ${e.message}`); }
    }
  };
  for (const token of GREENHOUSE) await runBoard('greenhouse', token, importGreenhouse);
  for (const token of ASHBY)      await runBoard('ashby', token, importAshby);
  for (const token of LEVER)      await runBoard('lever', token, importLever);

  const reachable = boardsOk + boardsErrored;
  const successRate = reachable ? boardsOk / reachable : 0;
  log(`\nBoards: ${boardsOk} ok, ${boardsMissing} missing (404), ${boardsErrored} errored`);
  log(`Transient health: ${(successRate * 100).toFixed(1)}% of reachable boards responded`);
  log(`Live postings seen across all feeds: ${liveSlugs.size}`);

  redistributeOverflow(log);

  log(`Total jobs collected: ${rows.length}`);
  log('Region mix:');
  for (const [region, n] of [...regionCount.entries()].sort((a, b) => b[1] - a[1])) {
    const pct = ((n / Math.max(rows.length, 1)) * 100).toFixed(1);
    log(`  ${region.padEnd(15)} ${String(n).padStart(5)}  ${pct.padStart(5)}%  (quota ${REGION_QUOTA[region] ?? 0})`);
  }
  const indiaCount = regionCount.get('India') ?? 0;
  if (indiaCount < MIN_INDIA) {
    log(`WARNING: only ${indiaCount} India jobs this run (floor is ${MIN_INDIA}) — check the India boards above for 404s.`);
  }

  const today = new Date().toISOString().slice(0, 10);

  const stmts = rows.slice(0, TOTAL_CAP).map(r =>
    `INSERT OR IGNORE INTO jobs (slug,title,company,location,type,remote,urgent,salary,tags,posted,apply_url,experience,category,body,last_seen) VALUES (` +
    `${sq(r.slug)},${sq(r.title)},${sq(r.company)},${sq(r.location)},${sq(r.type)},${r.remote},0,'',` +
    `${sq(JSON.stringify(r.tags))},${sq(r.posted)},${sq(r.apply_url)},'',${sq(r.category)},${sq(r.body)},${sq(today)});`
  );

  // Write batched SQL files. ADDITIVE: uses INSERT OR IGNORE on the unique
  // slug, so existing jobs are kept and only genuinely-new postings are added.
  // (No DELETE — re-running accumulates instead of wiping. Prune old jobs
  // separately, e.g. DELETE FROM jobs WHERE posted < date('now','-45 days').)
  const BATCH = 200;
  const files = [];
  for (let i = 0; i < stmts.length; i += BATCH) {
    const idx = i / BATCH;
    const name = `jobs-batch-${String(idx).padStart(2, '0')}.sql`;
    await writeFile(name, stmts.slice(i, i + BATCH).join('\n') + '\n');
    files.push(name);
  }
  log(`Wrote ${files.length} batch file(s): ${files.join(' ')}`);

  // Statements as JSON for scripts/apply-sql.mjs (D1 HTTP API — no DB lock,
  // unlike `wrangler d1 execute --file`, which takes the site down).
  await writeFile('jobs-statements.json', JSON.stringify(stmts));
  log(`Wrote jobs-statements.json (${stmts.length} statements)`);

  // ── Delisting: stamp every posting the feeds still list ──────────────────
  // A job that stops appearing here stops being stamped, which is what marks
  // it as expired. Must be applied BEFORE any prune runs.
  const live = [...liveSlugs];
  const seenStmts = [];
  for (let i = 0; i < live.length; i += 150) {
    const list = live.slice(i, i + 150).map(sq).join(',');
    seenStmts.push(`UPDATE jobs SET last_seen=${sq(today)} WHERE last_seen<>${sq(today)} AND slug IN (${list});`);
  }
  await writeFile('seen-statements.json', JSON.stringify(seenStmts));
  log(`Wrote seen-statements.json (${seenStmts.length} statements for ${live.length} live slugs)`);

  // ── Prune ────────────────────────────────────────────────────────────────
  // Emitted only when the run looks healthy. A network outage that fails most
  // boards would otherwise read as "every job was delisted" and empty the DB.
  const healthy = successRate >= MIN_BOARD_SUCCESS_RATE && liveSlugs.size >= MIN_LIVE_SLUGS;
  const pruneStmts = healthy
    ? [
        // Delisted: gone from its own ATS for STALE_DAYS consecutive runs.
        // last_seen<>'' skips hand-made admin jobs, which are never stamped.
        `DELETE FROM jobs WHERE last_seen<>'' AND last_seen < date('now','-${STALE_DAYS} days');`,
        // Backstop: nothing outlives the validThrough window we publish.
        `DELETE FROM jobs WHERE posted < date('now','-${MAX_AGE_DAYS} days');`,
      ]
    : [];
  await writeFile('prune-statements.json', JSON.stringify(pruneStmts));
  if (healthy) log(`Wrote prune-statements.json (${pruneStmts.length} statements)`);
  else log(`SKIPPING PRUNE — unhealthy run (${(successRate * 100).toFixed(1)}% boards ok, ${liveSlugs.size} live slugs)`);

  // URLs to push to IndexNow + Google Indexing API for fast crawling.
  // Recently-posted jobs (the time-sensitive ones) + stable key landing pages.
  const SITE = 'https://dailyjobpost.online';
  const recent = (() => { const d = new Date(); d.setDate(d.getDate() - 3); return d.toISOString().split('T')[0]; })();
  const jobUrls = rows
    .filter(r => (r.posted || '') >= recent)
    .map(r => `${SITE}/jobs/${r.slug}`);
  const landingUrls = [
    `${SITE}/`, `${SITE}/remote`, `${SITE}/internships`, `${SITE}/guides`,
    'software-it', 'data-and-analytics', 'marketing', 'sales', 'finance', 'design', 'healthcare',
    'product', 'operations', 'human-resources', 'customer-support', 'legal', 'engineering',
  ].map(s => s.startsWith('http') ? s : `${SITE}/category/${s}`);
  const indexUrls = [...new Set([...jobUrls, ...landingUrls])];
  await writeFile('index-urls.json', JSON.stringify(indexUrls));
  log(`Wrote index-urls.json (${indexUrls.length} URLs: ${jobUrls.length} jobs + ${landingUrls.length} landing)`);
}

main();
