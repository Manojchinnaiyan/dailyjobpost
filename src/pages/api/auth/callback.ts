import type { APIRoute } from 'astro';
import { ADMIN_EMAIL, SESSION_COOKIE, createSession } from '../../../lib/auth';

export const prerender = false;

export const GET: APIRoute = async ({ locals, request, redirect, cookies }) => {
  const { env } = locals.runtime;
  const url    = new URL(request.url);
  const code   = url.searchParams.get('code');
  const state  = url.searchParams.get('state') ?? '';

  const [stateKey, role] = state.split(':');
  const stored = cookies.get('oauth_state')?.value;

  const isAdmin   = role === 'admin';
  const errBase   = isAdmin ? '/admin/login' : '/';

  if (!code || !stateKey || stateKey !== stored) {
    return redirect(`${errBase}?error=state`);
  }

  cookies.delete('oauth_state', { path: '/' });

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id:     env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri:  'https://dailyjobpost.online/api/auth/callback',
      grant_type:    'authorization_code',
    }),
  });

  if (!tokenRes.ok) return redirect(`${errBase}?error=token`);

  const { access_token } = await tokenRes.json<{ access_token: string }>();

  const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${access_token}` },
  });

  if (!userRes.ok) return redirect(`${errBase}?error=userinfo`);

  const { email } = await userRes.json<{ email: string }>();

  if (isAdmin) {
    if (email !== ADMIN_EMAIL) return redirect('/admin/login?error=unauthorized');
    const sessionId = await createSession(env.DB, email, 'admin');
    cookies.set(SESSION_COOKIE, sessionId, {
      httpOnly: true, secure: true, maxAge: 7 * 24 * 60 * 60, path: '/', sameSite: 'lax',
    });
    return redirect('/admin/dashboard');
  } else {
    const sessionId = await createSession(env.DB, email, 'user');
    cookies.set(SESSION_COOKIE, sessionId, {
      httpOnly: true, secure: true, maxAge: 7 * 24 * 60 * 60, path: '/', sameSite: 'lax',
    });
    return redirect('/');
  }
};
