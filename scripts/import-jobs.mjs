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
  // ── USA — 100+ companies, heavy non-technical hiring, front-loaded ──
  // food / restaurants / grocery
  'sweetgreen','cava','chipotle','wonder','blueapron','hellofresh','factor75','gopuff',
  'instacart','doordash','grubhub','toasttab','olo','sennder',
  // retail / consumer brands / commerce
  'warbyparker','glossier','allbirds','rothys','figs','everlane','reformation','away',
  'peloton','lululemon','equinox','wayfair','thredup','poshmark','stockx','goat','mercari',
  'offerup','faire','whatnot','etsy','chewy','overstock','thrivemarket','imperfectfoods',
  // health / wellness / care
  'oscar','cityblock','includedhealth','devoted','hims','ro','modernhealth','maven','carrot',
  'kindbody','calm','headspace','noom','cerebral','talkspace','heydoctor','grandrounds',
  'forwardhealth','tia','parsleyhealth','calibrate',
  // finance / fintech / insurance
  'sofi','chime','dave','varo','current','greenlight','creditkarma','nerdwallet','marqeta',
  'lemonade','rootinsurance','ethoslife','policygenius','betterment','wealthfront','robinhood',
  'brex','ramp','mercury','plaid','carta','gusto','divvy','bill','melio',
  // real estate / mobility / logistics
  'compass','opendoor','bettermortgage','flexport','convoy','samsara','verkada','turo',
  'lyft','via','getaround','gofundme','life360',
  // sports / entertainment / media
  'fanatics','draftkings','fanduel','seatgeek','stubhub','gametime','reddit','pinterest',
  'nextdoor','discord','twitch','patreon','substack','vimeo','medium','spotify',
  // education / staffing / hr
  'coursera','udemy','chegg','duolingo','outschool','guild','handshake','varsitytutors',
  'rippling','justworks','deel','betterup','instawork','wonolo','indeedflex','remote','oysterhr',
  // MENA / UAE-focused
  'careem','tabby','tamara','propertyfinder','kitopi','swvl','huspy','baraka',
  'trukker','floward','sarwa','lean','ziina','mamo','alma','rain','cartlow',
  'bayut','dubizzle','noon','talabat','chalhoubgroup','g42','presight',
  // fintech / payments
  'stripe','coinbase','gemini','brex','ramp','mercury','wise','gocardless','mollie',
  'sumup','pleo','gohenry','affirm','sofi','chime','marqeta','airwallex','rho',
  'robinhood','circle','fireblocks','chainalysis','plaid','checkout',
  // dev tools / infra / data
  'databricks','datadog','mongodb','elastic','confluent','cockroachlabs','clickhouse',
  'sourcegraph','retool','vercel','webflow','gitlab','hashicorp','sentry','launchdarkly',
  'pagerduty','sumologic','grafanalabs','newrelic','timescale','redpanda','supabase',
  'planetscale','render','dataiku','scaleai','huggingface','weightsandbiases','cohere',
  // saas / productivity
  'notion','coda','airtable','asana','clickup','miro','figma','canva','grammarly',
  'calendly','dropbox','box','lattice','culture','typeform','contentful','docsend',
  // consumer / social / media
  'reddit','pinterest','nextdoor','discord','twitch','patreon','substack',
  'bumble','strava','classpass','peloton','betterup',
  // delivery / mobility / logistics
  'instacart','deliveroo','gopuff','grubhub','lyft','via','turo','getaround',
  'samsara','verkada','flexport','convoy','project44',
  // health / bio
  'benchling','tempus','color','cedar','devoted','ro','swordhealth',
  // commerce / retail
  'wayfair','warbyparker','allbirds','glossier','faire','whatnot','poshmark',
  'thredup','stockx','goat','squarespace','shopify','bigcommerce',
  // marketing / analytics
  'attentive','klaviyo','braze','iterable','segment','amplitude','mixpanel','heap','posthog',
  // hr / ops
  'gusto','rippling','deel','remote','justworks',
  // deep tech / robotics / auto
  'anduril','skydio','zipline','cruise','nuro','aurora',
  // europe / global
  'getyourguide','hellofresh','celonis','personio','glovo','docplanner',
  'employmenthero','gohighlevel','revolut','monzo','n26',
  // more US tech / consumer / enterprise
  'roblox','unity','duolingo','coursera','udemy','chegg','quizlet','khanacademy',
  'calm','headspace','noom','hims','ro','modernhealth','springhealth','lyrahealth',
  'creditkarma','nerdwallet','dave','varo','current','greenlight','public','m1',
  'toast','dashlane','1password','okta','snowflake','databricks','hashicorp',
  'gitlab','elastic','confluent','cockroachlabs','clickhouse','starburst','fivetran',
  'airbyte','dbtlabs','hightouch','census','amplitude','heap','fullstory','contentful',
  'sanity','algolia','meilisearch','postman','mux','twilio','vonage','bandwidth',
  'gusto','justworks','rippling','deel','remote','oysterhr','velocityglobal',
  'doordash','grubhub','gopuff','wonder','sweetgreen','cava','blueapron',
  'warbyparker','glossier','rothys','figs','everlane','reformation','parade',
  'whatnot','faire','etsy','depop','mercari','offerup','nextdoor','life360',
  'asana','monday','smartsheet','airtable','coda','quip','loom','grain',
  'duolingo','brilliant','outschool','varsitytutors','newsela','classdojo',
  // healthcare / medicine / clinical / pharma (nurses, physicians, care, biotech)
  'carbonhealth','onemedical','dispatchhealth','sondermind','headway','honor','papa',
  'galileo','firefly','foldhealth','cityblock','includedhealth','devoted','oscar',
  'tia','parsleyhealth','calibrate','foundhealth','hingehealth','omadahealth',
  'crickethealth','strivehealth','aledade','vivanthealth','medely','trusted','incrediblehealth',
  'benchling','recursion','tempus','color','guardanthealth','grail','flatiron','komodohealth',
  'cohere','cohere-health','rightway','transcarent','garner','nuna','wellsky',
])];

// ── Companies that publish via Lever public boards ──
const LEVER = [...new Set([
  'careem','tabby','noon','talabat','tamara','sarwa','swvl','propertyfinder',
  'netflix','palantir','voiceflow','spotify','plaid','kavak','showpad',
  'mistral','fanatics','attentivemobile','nerdwallet','brex','ramp',
  'leadschool','swiggy','razorpay','cred','groww','meesho','sharechat',
  'gojek','grab','traveloka','tokopedia','carousell','ninjavan',
])];

// ── Companies that publish via Ashby public boards ──
const ASHBY = [...new Set([
  'openai','ramp','notion','linear','vanta','hex','clay','census','replit',
  'watershed','runwayml','elevenlabs','baseten','modal','cursor','together',
  'perplexity-ai','sourcegraph','retool','mercury','rippling','gem','airwallex',
])];

const PER_COMPANY = 55;          // cap jobs per company
const TOTAL_CAP    = 8000;       // overall cap
const BODY_CAP     = 7000;       // chars (HTML)

// ── US location filter ──
const NON_US = ['london','united kingdom',' uk','ireland','dublin','germany','berlin','munich','france','paris','india','bangalore','bengaluru','hyderabad','gurgaon','pune','chennai','noida','canada','toronto','vancouver','montreal','ottawa','singapore','australia','sydney','melbourne','japan','tokyo','netherlands','amsterdam','spain','madrid','barcelona','poland','warsaw','krakow','romania','bucharest','brazil','sao paulo','mexico','israel','tel aviv','china','shanghai','beijing','hong kong','emea','apac','latam','ontario','british columbia','portugal','lisbon','sweden','stockholm','denmark','copenhagen','italy','milan','switzerland','zurich','korea','seoul','philippines','manila','colombia','bogota','argentina','taiwan','vietnam','indonesia','jakarta','new zealand','auckland','dubai','uae','south africa','nigeria','kenya','egypt','turkey','istanbul'];

const US_MARKERS = ['united states','usa',' u.s','us-','remote','san francisco','new york','seattle','austin','los angeles','chicago','boston','denver','atlanta','washington','miami','dallas','houston','portland','san jose','mountain view','palo alto','sunnyvale','menlo park','bellevue','redwood','santa clara','san diego','san mateo','bay area','brooklyn','nyc','sf','d.c','arlington','phoenix','philadelphia','nashville','charlotte','minneapolis','salt lake','raleigh','columbus','detroit','pittsburgh','remote - us','remote, us','remote (us'];

const US_STATES = [', ca',', ny',', wa',', tx',', ma',', il',', co',', ga',', fl',', or',', pa',', va',', nc',', az',', mn',', ut',', tn',', oh',', mi',', md',', nj',', dc',', wi',', mo',', in',', nv','california','new york','washington','texas','massachusetts','illinois','colorado','georgia','florida','oregon','virginia','arizona','utah'];

function escapeRe(s) { return s.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

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

async function importGreenhouse(token) {
  const data = await fetchJSON(`https://boards-api.greenhouse.io/v1/boards/${token}/jobs?content=true`);
  const company = company_name(token);
  let count = 0;
  for (const j of (data.jobs || [])) {
    if (count >= PER_COMPANY) break;
    const location = (j.location && j.location.name) || '';
    if (!acceptLoc(location)) continue;
    const title = (j.title || '').trim();
    if (!title) continue;
    const body = sanitizeHtml(j.content || '');
    if (textLen(body) < 120) continue;
    const slug = toSlug(`${company}-${title}-${j.id}`);
    if (seen.has(slug)) continue;
    seen.add(slug);
    rows.push({
      slug, title, company, location,
      type: inferType(title, location),
      remote: /remote/i.test(location) ? 1 : 0,
      tags: extractTags(title, body),
      posted: (j.updated_at || '').slice(0, 10) || new Date().toISOString().slice(0, 10),
      apply_url: j.absolute_url || '',
      category: inferCategory(title),
      body,
    });
    count++;
  }
  return count;
}

async function importLever(token) {
  const data = await fetchJSON(`https://api.lever.co/v0/postings/${token}?mode=json`);
  const company = company_name(token);
  let count = 0;
  for (const j of (Array.isArray(data) ? data : [])) {
    if (count >= PER_COMPANY) break;
    const location = (j.categories && j.categories.location) || '';
    if (!acceptLoc(location)) continue;
    const title = (j.text || '').trim();
    if (!title) continue;
    const body = sanitizeHtml(j.description || j.descriptionPlain || '');
    if (textLen(body) < 120) continue;
    const slug = toSlug(`${company}-${title}-${j.id}`);
    if (seen.has(slug)) continue;
    seen.add(slug);
    const commitment = (j.categories && j.categories.commitment) || '';
    let type = inferType(title, location);
    if (/intern/i.test(commitment)) type = 'internship';
    else if (/contract/i.test(commitment)) type = 'contract';
    rows.push({
      slug, title, company, location,
      type,
      remote: /remote/i.test(location) ? 1 : 0,
      tags: extractTags(title, body),
      posted: j.createdAt ? new Date(j.createdAt).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
      apply_url: j.hostedUrl || '',
      category: inferCategory(title),
      body,
    });
    count++;
  }
  return count;
}

async function importAshby(org) {
  const data = await fetchJSON(`https://api.ashbyhq.com/posting-api/job-board/${org}?includeCompensation=true`);
  const company = company_name(org);
  let count = 0;
  for (const j of (data.jobs || [])) {
    if (count >= PER_COMPANY) break;
    const location = j.location || (j.isRemote ? 'Remote' : '') || (j.address?.postalAddress?.addressLocality) || '';
    if (!acceptLoc(location)) continue;
    const title = (j.title || '').trim();
    if (!title) continue;
    const body = sanitizeHtml(j.descriptionHtml || '');
    if (textLen(body) < 120) continue;
    const slug = toSlug(`${company}-${title}-${j.id || j.jobId || title}`);
    if (seen.has(slug)) continue;
    seen.add(slug);
    let type = inferType(title, location);
    const emp = (j.employmentType || '').toLowerCase();
    if (emp.includes('intern')) type = 'internship';
    else if (emp.includes('contract')) type = 'contract';
    else if (emp.includes('part')) type = 'part-time';
    rows.push({
      slug, title, company, location,
      type,
      remote: j.isRemote || /remote/i.test(location) ? 1 : 0,
      tags: extractTags(title, body),
      posted: (j.publishedDate || j.publishedAt || '').slice(0, 10) || new Date().toISOString().slice(0, 10),
      apply_url: j.jobUrl || j.applyUrl || '',
      category: inferCategory(title),
      body,
    });
    count++;
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

  for (const token of GREENHOUSE) {
    if (rows.length >= TOTAL_CAP) break;
    try { const n = await importGreenhouse(token); log(`✓ greenhouse/${token}: ${n}`); }
    catch (e) { log(`✗ greenhouse/${token}: ${e.message}`); }
  }
  for (const token of ASHBY) {
    if (rows.length >= TOTAL_CAP) break;
    try { const n = await importAshby(token); log(`✓ ashby/${token}: ${n}`); }
    catch (e) { log(`✗ ashby/${token}: ${e.message}`); }
  }
  for (const token of LEVER) {
    if (rows.length >= TOTAL_CAP) break;
    try { const n = await importLever(token); log(`✓ lever/${token}: ${n}`); }
    catch (e) { log(`✗ lever/${token}: ${e.message}`); }
  }

  log(`\nTotal jobs collected: ${rows.length}`);

  const stmts = rows.slice(0, TOTAL_CAP).map(r =>
    `INSERT OR IGNORE INTO jobs (slug,title,company,location,type,remote,urgent,salary,tags,posted,apply_url,experience,category,body) VALUES (` +
    `${sq(r.slug)},${sq(r.title)},${sq(r.company)},${sq(r.location)},${sq(r.type)},${r.remote},0,'',` +
    `${sq(JSON.stringify(r.tags))},${sq(r.posted)},${sq(r.apply_url)},'',${sq(r.category)},${sq(r.body)});`
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
