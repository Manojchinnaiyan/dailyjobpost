export interface JobRow {
  id: number;
  slug: string;
  title: string;
  company: string;
  location: string;
  type: string;
  remote: number;
  urgent: number;
  salary: string;
  tags: string;
  posted: string;
  apply_url: string;
  experience: string;
  category: string;
  body: string;
  created_at: string;
}

export interface Job {
  id: number;
  slug: string;
  title: string;
  company: string;
  location: string;
  type: string;
  remote: boolean;
  urgent: boolean;
  salary: string;
  tags: string[];
  posted: string;
  applyUrl: string;
  experience: string;
  category: string;
  body: string;
}

export function rowToJob(row: JobRow): Job {
  return {
    id:         row.id,
    slug:       row.slug,
    title:      row.title,
    company:    row.company,
    location:   row.location,
    type:       row.type,
    remote:     Boolean(row.remote),
    urgent:     Boolean(row.urgent),
    salary:     row.salary ?? '',
    tags:       JSON.parse(row.tags || '[]') as string[],
    posted:     row.posted,
    applyUrl:   row.apply_url ?? '',
    experience: row.experience ?? '',
    category:   row.category ?? '',
    body:       row.body ?? '',
  };
}

export function toSlug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
}
