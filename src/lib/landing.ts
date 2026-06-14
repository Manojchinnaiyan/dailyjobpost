/**
 * Programmatic SEO landing pages.
 *
 * Job boards (Naukri, Indeed, LinkedIn) win long-tail search by having one
 * dedicated, indexable URL per facet — "Software jobs", "Jobs in USA",
 * "Software jobs in USA" — each with a unique title/H1/description and
 * JobPosting structured data. This module defines the clean slugs and a
 * single-scan counts index used by those pages and the sitemap.
 */
import { CATEGORIES, COUNTRY_META } from './homestats';
import { COUNTRY_KEYS } from './jobquery';

export function slugify(s: string): string {
  return s.toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\//g, ' ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/* ── Category slug ⇄ name ── */
export const CATEGORY_BY_SLUG: Record<string, string> =
  Object.fromEntries(CATEGORIES.map((c) => [slugify(c.name), c.name]));
export const CATEGORY_SLUG: Record<string, string> =
  Object.fromEntries(CATEGORIES.map((c) => [c.name, slugify(c.name)]));
export const categoryName = (slug: string): string | undefined => CATEGORY_BY_SLUG[slug];

/* ── Country slug ⇄ name (Remote lives at /remote, excluded here) ── */
const COUNTRIES = COUNTRY_META.filter((c) => c.name !== 'Remote');
export const COUNTRY_BY_SLUG: Record<string, string> =
  Object.fromEntries(COUNTRIES.map((c) => [slugify(c.name), c.name]));
export const COUNTRY_SLUG: Record<string, string> =
  Object.fromEntries(COUNTRIES.map((c) => [c.name, slugify(c.name)]));
export const COUNTRY_FLAG: Record<string, string> =
  Object.fromEntries(COUNTRY_META.map((c) => [c.name, c.flag]));
export const countryName = (slug: string): string | undefined => COUNTRY_BY_SLUG[slug];

/* ── Roles (high-volume long-tail: "software engineer jobs") ──
   `re` matches the job title for counting; `q` drives the on-page search. */
export interface Role { slug: string; label: string; q: string; re: RegExp }
export const ROLES: Role[] = [
  { slug: 'software-engineer-jobs',          label: 'Software Engineer',          q: 'software engineer',          re: /software engineer|\bswe\b/i },
  { slug: 'frontend-developer-jobs',         label: 'Frontend Developer',         q: 'frontend developer',         re: /front[- ]?end/i },
  { slug: 'backend-developer-jobs',          label: 'Backend Developer',          q: 'backend developer',          re: /back[- ]?end/i },
  { slug: 'full-stack-developer-jobs',       label: 'Full Stack Developer',       q: 'full stack developer',       re: /full[- ]?stack/i },
  { slug: 'data-scientist-jobs',             label: 'Data Scientist',             q: 'data scientist',             re: /data scientist/i },
  { slug: 'data-analyst-jobs',               label: 'Data Analyst',               q: 'data analyst',               re: /data analyst/i },
  { slug: 'data-engineer-jobs',              label: 'Data Engineer',              q: 'data engineer',              re: /data engineer/i },
  { slug: 'machine-learning-engineer-jobs',  label: 'Machine Learning Engineer',  q: 'machine learning engineer', re: /machine learning|\bml engineer|\bai engineer/i },
  { slug: 'devops-engineer-jobs',            label: 'DevOps Engineer',            q: 'devops engineer',            re: /devops|site reliability|\bsre\b/i },
  { slug: 'product-manager-jobs',            label: 'Product Manager',            q: 'product manager',            re: /product manager/i },
  { slug: 'project-manager-jobs',            label: 'Project Manager',            q: 'project manager',            re: /project manager/i },
  { slug: 'ux-ui-designer-jobs',             label: 'UX/UI Designer',             q: 'designer',                   re: /\bux\b|\bui\b|product designer|ux\/ui/i },
  { slug: 'marketing-manager-jobs',          label: 'Marketing Manager',          q: 'marketing manager',          re: /marketing manager/i },
  { slug: 'digital-marketing-jobs',          label: 'Digital Marketing',          q: 'digital marketing',          re: /digital marketing/i },
  { slug: 'content-writer-jobs',             label: 'Content Writer',             q: 'content writer',             re: /content writer|copywriter|content marketing/i },
  { slug: 'sales-manager-jobs',              label: 'Sales Manager',              q: 'sales manager',              re: /sales manager/i },
  { slug: 'account-executive-jobs',          label: 'Account Executive',          q: 'account executive',          re: /account executive/i },
  { slug: 'account-manager-jobs',            label: 'Account Manager',            q: 'account manager',            re: /account manager/i },
  { slug: 'business-analyst-jobs',           label: 'Business Analyst',           q: 'business analyst',           re: /business analyst/i },
  { slug: 'financial-analyst-jobs',          label: 'Financial Analyst',          q: 'financial analyst',          re: /financial analyst|finance analyst/i },
  { slug: 'accountant-jobs',                 label: 'Accountant',                 q: 'accountant',                 re: /accountant|accounting/i },
  { slug: 'human-resources-jobs',            label: 'Human Resources',            q: 'human resources',            re: /human resources|\bhr\b|recruiter|talent acquisition/i },
  { slug: 'customer-success-manager-jobs',   label: 'Customer Success Manager',   q: 'customer success',           re: /customer success/i },
  { slug: 'customer-support-jobs',           label: 'Customer Support',           q: 'customer support',           re: /customer support|customer service|support specialist/i },
  { slug: 'qa-engineer-jobs',                label: 'QA Engineer',                q: 'qa engineer',                re: /\bqa\b|quality engineer|test engineer|\bsdet\b/i },
  { slug: 'mobile-developer-jobs',           label: 'Mobile Developer',           q: 'mobile developer',           re: /\bandroid\b|\bios\b|mobile (developer|engineer)/i },
  { slug: 'security-engineer-jobs',          label: 'Security Engineer',          q: 'security engineer',          re: /security engineer|cybersecurity|infosec/i },
  { slug: 'solutions-engineer-jobs',         label: 'Solutions Engineer',         q: 'solutions engineer',         re: /solutions engineer|sales engineer/i },
  { slug: 'operations-manager-jobs',         label: 'Operations Manager',         q: 'operations manager',         re: /operations manager|\bops manager/i },
  { slug: 'nurse-jobs',                      label: 'Nurse',                      q: 'nurse',                      re: /\bnurse\b|\brn\b|\blpn\b/i },
];
export const ROLE_BY_SLUG: Record<string, Role> = Object.fromEntries(ROLES.map((r) => [r.slug, r]));

/* ── Cities (location-keyword matched), grouped under their country slug ── */
export interface City { slug: string; name: string; countrySlug: string; keys: string[] }
const CITY_DEFS: { country: string; name: string; keys: string[] }[] = [
  { country: 'USA', name: 'New York', keys: ['new york', ', ny'] },
  { country: 'USA', name: 'San Francisco', keys: ['san francisco'] },
  { country: 'USA', name: 'Seattle', keys: ['seattle'] },
  { country: 'USA', name: 'Austin', keys: ['austin'] },
  { country: 'USA', name: 'Los Angeles', keys: ['los angeles'] },
  { country: 'USA', name: 'Chicago', keys: ['chicago'] },
  { country: 'USA', name: 'Boston', keys: ['boston'] },
  { country: 'USA', name: 'Atlanta', keys: ['atlanta'] },
  { country: 'USA', name: 'Denver', keys: ['denver'] },
  { country: 'USA', name: 'Dallas', keys: ['dallas'] },
  { country: 'USA', name: 'Washington DC', keys: ['washington'] },
  { country: 'USA', name: 'San Jose', keys: ['san jose'] },
  { country: 'India', name: 'Bangalore', keys: ['bengaluru', 'bangalore'] },
  { country: 'India', name: 'Mumbai', keys: ['mumbai'] },
  { country: 'India', name: 'Delhi', keys: ['delhi'] },
  { country: 'India', name: 'Hyderabad', keys: ['hyderabad'] },
  { country: 'India', name: 'Pune', keys: ['pune'] },
  { country: 'India', name: 'Chennai', keys: ['chennai'] },
  { country: 'India', name: 'Gurgaon', keys: ['gurgaon', 'gurugram'] },
  { country: 'India', name: 'Noida', keys: ['noida'] },
  { country: 'UK', name: 'London', keys: ['london'] },
  { country: 'UK', name: 'Manchester', keys: ['manchester'] },
  { country: 'UK', name: 'Edinburgh', keys: ['edinburgh'] },
  { country: 'Canada', name: 'Toronto', keys: ['toronto'] },
  { country: 'Canada', name: 'Vancouver', keys: ['vancouver'] },
  { country: 'Canada', name: 'Montreal', keys: ['montreal'] },
  { country: 'Germany', name: 'Berlin', keys: ['berlin'] },
  { country: 'Germany', name: 'Munich', keys: ['munich', 'münchen'] },
  { country: 'Australia', name: 'Sydney', keys: ['sydney'] },
  { country: 'Australia', name: 'Melbourne', keys: ['melbourne'] },
  { country: 'Netherlands', name: 'Amsterdam', keys: ['amsterdam'] },
  { country: 'France', name: 'Paris', keys: ['paris'] },
  { country: 'UAE', name: 'Dubai', keys: ['dubai'] },
];
export const CITIES: City[] = CITY_DEFS
  .filter((c) => COUNTRY_SLUG[c.country])
  .map((c) => ({ slug: slugify(c.name), name: c.name, countrySlug: COUNTRY_SLUG[c.country], keys: c.keys }));
export function findCity(countrySlug: string, citySlug: string): City | undefined {
  return CITIES.find((c) => c.countrySlug === countrySlug && c.slug === citySlug);
}

export interface LandingIndex {
  categories: { name: string; slug: string; count: number }[];
  countries: { name: string; slug: string; flag: string; count: number }[];
  combos: { categoryName: string; categorySlug: string; countryName: string; countrySlug: string; count: number }[];
  roles: { label: string; slug: string; count: number }[];
  cities: { name: string; slug: string; countrySlug: string; count: number }[];
}

interface DBLike { prepare(q: string): { all<T>(): Promise<{ results: T[] }> } }
interface Row { location: string; category: string; title: string }

// One full scan, cached per isolate — same as homestats. Powers the sitemap and
// the cross-links between landing pages without N queries.
let cache: { at: number; data: LandingIndex } | null = null;
const TTL_MS = 30 * 60 * 1000;

export async function getLandingIndex(db: DBLike): Promise<LandingIndex> {
  const now = Date.now();
  if (cache && now - cache.at < TTL_MS) return cache.data;

  const res = await db.prepare('SELECT location, category, title FROM jobs').all<Row>();
  const rows = res.results ?? [];

  const catCount: Record<string, number> = {};
  const ctyCount: Record<string, number> = {};
  const comboCount: Record<string, number> = {};
  const roleCount: Record<string, number> = {};
  const cityCount: Record<string, number> = {};

  const countryOf = (loc: string): string[] => {
    const l = (loc || '').toLowerCase();
    const hits: string[] = [];
    for (const c of COUNTRIES) {
      const keys = COUNTRY_KEYS[c.name] || [];
      if (keys.some((k) => l.includes(k.toLowerCase()))) hits.push(c.name);
    }
    return hits;
  };

  for (const r of rows) {
    if (r.category) catCount[r.category] = (catCount[r.category] || 0) + 1;
    const countries = countryOf(r.location);
    for (const ct of countries) {
      ctyCount[ct] = (ctyCount[ct] || 0) + 1;
      if (r.category) {
        const k = `${r.category}|${ct}`;
        comboCount[k] = (comboCount[k] || 0) + 1;
      }
    }
    const title = r.title || '';
    for (const role of ROLES) if (role.re.test(title)) roleCount[role.slug] = (roleCount[role.slug] || 0) + 1;
    const loc = (r.location || '').toLowerCase();
    for (const city of CITIES) if (city.keys.some((k) => loc.includes(k))) cityCount[`${city.countrySlug}/${city.slug}`] = (cityCount[`${city.countrySlug}/${city.slug}`] || 0) + 1;
  }

  const categories = CATEGORIES
    .map((c) => ({ name: c.name, slug: CATEGORY_SLUG[c.name], count: catCount[c.name] || 0 }))
    .filter((c) => c.count > 0);

  const countries = COUNTRIES
    .map((c) => ({ name: c.name, slug: COUNTRY_SLUG[c.name], flag: COUNTRY_FLAG[c.name], count: ctyCount[c.name] || 0 }))
    .filter((c) => c.count > 0);

  const combos = Object.entries(comboCount)
    .map(([k, count]) => {
      const [categoryName, countryName] = k.split('|');
      return { categoryName, categorySlug: CATEGORY_SLUG[categoryName], countryName, countrySlug: COUNTRY_SLUG[countryName], count };
    })
    // Only combos with real depth become indexable pages (avoids thin content).
    .filter((c) => c.count >= 3 && c.categorySlug && c.countrySlug)
    .sort((a, b) => b.count - a.count);

  const roles = ROLES
    .map((r) => ({ label: r.label, slug: r.slug, count: roleCount[r.slug] || 0 }))
    .filter((r) => r.count > 0)
    .sort((a, b) => b.count - a.count);

  const cities = CITIES
    .map((c) => ({ name: c.name, slug: c.slug, countrySlug: c.countrySlug, count: cityCount[`${c.countrySlug}/${c.slug}`] || 0 }))
    .filter((c) => c.count >= 3);

  const data: LandingIndex = { categories, countries, combos, roles, cities };
  cache = { at: now, data };
  return data;
}
