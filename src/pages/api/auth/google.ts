import type { APIRoute } from 'astro';

export const prerender = false;

export const GET: APIRoute = async ({ locals, redirect, cookies }) => {
  const { env } = locals.runtime;
  const state = crypto.randomUUID();

  cookies.set('oauth_state', state, {
    httpOnly: true,
    secure: true,
    maxAge: 300,
    path: '/',
    sameSite: 'lax',
  });

  const params = new URLSearchParams({
    client_id:     env.GOOGLE_CLIENT_ID,
    redirect_uri:  'https://dailyjobpost.online/api/auth/callback',
    response_type: 'code',
    scope:         'email profile',
    state,
  });

  return redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
};
