import type { APIRoute } from 'astro';
import { SESSION_COOKIE, getSession } from '../../../lib/auth';

export const prerender = false;

async function requireAdmin(locals: App.Locals, cookies: Parameters<APIRoute>[0]['cookies']) {
  const { env } = locals.runtime;
  const sid = cookies.get(SESSION_COOKIE)?.value;
  const session = await getSession(env.DB, sid);
  return session ? env.DB : null;
}

export const POST: APIRoute = async ({ locals, cookies, request, params, redirect }) => {
  const db = await requireAdmin(locals, cookies);
  if (!db) return new Response('Unauthorized', { status: 401 });

  const id   = params.id;
  const form = await request.formData();
  const method = (form.get('_method') as string)?.toUpperCase();

  if (method === 'DELETE') {
    await db.prepare('DELETE FROM jobs WHERE id = ?').bind(id).run();
    return redirect('/admin/dashboard');
  }

  // UPDATE
  const title    = (form.get('title') as string)?.trim();
  const company  = (form.get('company') as string)?.trim();
  const location = (form.get('location') as string)?.trim();
  const type     = (form.get('type') as string) || 'full-time';
  const remote   = form.get('remote') === 'on' ? 1 : 0;
  const urgent   = form.get('urgent') === 'on' ? 1 : 0;
  const salary   = (form.get('salary') as string)?.trim() || '';
  const tagsRaw  = (form.get('tags') as string)?.trim() || '';
  const posted   = (form.get('posted') as string) || new Date().toISOString().split('T')[0];
  const applyUrl = (form.get('apply_url') as string)?.trim() || '';
  const experience = (form.get('experience') as string)?.trim() || '';
  const category = (form.get('category') as string)?.trim() || '';
  const body     = (form.get('body') as string)?.trim() || '';

  if (!title || !company || !location) {
    return redirect(`/admin/jobs/${id}?error=missing`);
  }

  const tags = JSON.stringify(tagsRaw.split(',').map((t: string) => t.trim()).filter(Boolean));

  await db.prepare(
    `UPDATE jobs SET title=?, company=?, location=?, type=?, remote=?, urgent=?, salary=?, tags=?, posted=?, apply_url=?, experience=?, category=?, body=?
     WHERE id=?`
  ).bind(title, company, location, type, remote, urgent, salary, tags, posted, applyUrl, experience, category, body, id).run();

  return redirect('/admin/dashboard');
};
