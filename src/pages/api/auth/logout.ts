import type { APIRoute } from 'astro';
import { SESSION_COOKIE, destroySession } from '../../../lib/auth';

export const prerender = false;

export const POST: APIRoute = async ({ locals, cookies, redirect }) => {
  const { env } = locals.runtime;
  const sid = cookies.get(SESSION_COOKIE)?.value;
  if (sid) await destroySession(env.DB, sid);
  cookies.delete(SESSION_COOKIE, { path: '/' });
  return redirect('/admin/login');
};
