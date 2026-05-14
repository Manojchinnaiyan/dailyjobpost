const fs   = require('fs');
const path = require('path');

const raw  = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'a.json'), 'utf8'));
const jobs = raw.data.jobPosts;

const OUT = path.join(__dirname, '..', 'src', 'content', 'jobs');

/* ── helpers ─────────────────────────────────── */
function parseTitle(title) {
  // "Company is hiring for Role | Location, Country"
  const [head = '', tail = ''] = title.split(' is hiring for ');
  const company = head.trim();
  const [role = tail, location = 'India'] = tail.split(' | ');
  return { company: company || 'Unknown', role: role.trim(), location: location.trim() };
}

function htmlToMd(html = '') {
  return html
    .replace(/<h3[^>]*>/gi, '\n### ')
    .replace(/<\/h3>/gi, '\n')
    .replace(/<h[1-2][^>]*>/gi, '\n## ')
    .replace(/<\/h[1-2]>/gi, '\n')
    .replace(/<ul[^>]*>|<ol[^>]*>/gi, '')
    .replace(/<\/ul>|<\/ol>/gi, '\n')
    .replace(/<li[^>]*>\s*<div[^>]*>/gi, '\n- ')
    .replace(/<li[^>]*>/gi, '\n- ')
    .replace(/<\/div><\/li>|<\/li>/gi, '')
    .replace(/<div[^>]*>/gi, '')
    .replace(/<\/div>/gi, '')
    .replace(/<p[^>]*>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<strong[^>]*>/gi, '**')
    .replace(/<\/strong>/gi, '**')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\*\*About the job\*\*/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function mapType(t = '') {
  return { 'Full Time': 'full-time', 'Part Time': 'part-time', 'Contract': 'contract', 'Remote': 'remote', 'Internship': 'internship' }[t] || 'full-time';
}

function mapCategory(d = '') {
  if (/frontend|ui|react|angular|vue/i.test(d))   return 'Frontend';
  if (/full.?stack/i.test(d))                       return 'Full-Stack';
  if (/mobile|android|ios|flutter/i.test(d))        return 'Mobile';
  if (/devops|cloud|infra|sre/i.test(d))            return 'DevOps';
  if (/data|analytics|bi/i.test(d))                 return 'Data';
  if (/ai|ml|machine|deep/i.test(d))                return 'AI / ML';
  if (/design|ux|ui/i.test(d))                      return 'Design';
  if (/security|cyber/i.test(d))                    return 'Security';
  if (/product|pm/i.test(d))                        return 'Product';
  return 'Backend';
}

function expLabel(e = '') {
  const n = parseInt(e);
  if (isNaN(n)) return '';
  if (n === 0) return '0–1 years';
  if (n === 1) return '1–2 years';
  if (n <= 3)  return `${n}–${n + 1} years`;
  return `${n}+ years`;
}

function extractTags(title = '', role = '') {
  const src = (title + ' ' + role).toLowerCase();
  const keywords = [
    ['Next.js','next.js'], ['React','react'], ['Node.js','node.js'], ['Python','python'],
    ['Java','java'], ['TypeScript','typescript'], ['JavaScript','javascript'],
    ['Angular','angular'], ['Vue','vue'], ['Go','golang'], ['Kotlin','kotlin'],
    ['Swift','swift'], ['Flutter','flutter'], ['AWS','aws'], ['Azure','azure'],
    ['GCP','gcp'], ['Docker','docker'], ['Kubernetes','kubernetes'], ['.NET','.net'],
    ['PostgreSQL','postgresql'], ['MongoDB','mongodb'], ['SQL','sql'],
    ['C#','c#'], ['PHP','php'], ['Ruby','ruby'], ['Spring','spring'],
  ];
  return keywords.filter(([, kw]) => src.includes(kw)).map(([label]) => label).slice(0, 5);
}

function esc(s = '') {
  return '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
}

function toSlug(s = '') {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
}

/* ── clear existing sample jobs ─────────────── */
fs.readdirSync(OUT).filter(f => f.endsWith('.md')).forEach(f => fs.unlinkSync(path.join(OUT, f)));

/* ── generate markdown files ─────────────────── */
const seen = new Set();
let count = 0;

for (const job of jobs) {
  const { company, role, location } = parseTitle(job.title);
  const type      = mapType(job.jobTypeReference?.jobType);
  const category  = mapCategory(job.domain?.domain);
  const experience= expLabel(job.experience?.experience);
  const posted    = (job.createdAt || '').split('T')[0] || new Date().toISOString().split('T')[0];
  const isRemote  = /remote/i.test(location) || /remote/i.test(job.title);
  const tags      = extractTags(job.title, role);
  const body      = htmlToMd(job.body?.html || '');

  let slug = job.slug ? toSlug(job.slug) : toSlug(`${company}-${role}`);
  if (seen.has(slug)) slug = `${slug}-${++count}`;
  seen.add(slug);

  const md = `---
title: ${esc(role)}
slug: ${esc(slug)}
company: ${esc(company)}
location: ${esc(location)}
type: "${type}"
remote: ${isRemote}
urgent: false
salary: ${esc(job.salary || '')}
tags: [${tags.map(t => `"${t}"`).join(', ')}]
posted: ${posted}
applyUrl: ${esc(job.apply || '')}
experience: ${esc(experience)}
category: ${esc(category)}
---

${body}
`;

  fs.writeFileSync(path.join(OUT, `${slug}.md`), md, 'utf8');
  count++;
}

console.log(`✓ Imported ${count} jobs into src/content/jobs/`);
