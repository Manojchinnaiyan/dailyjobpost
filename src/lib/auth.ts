export const ADMIN_EMAIL    = 'manojchinnaiyan111@gmail.com';
export const SESSION_COOKIE = 'djp_session';
const SESSION_MS            = 7 * 24 * 60 * 60 * 1000;

export interface SessionRow { id: string; email: string; expires_at: number; }

type DB = import('@cloudflare/workers-types').D1Database;

export async function getSession(db: DB, id: string | undefined): Promise<SessionRow | null> {
  if (!id) return null;
  const row = await db.prepare('SELECT id, email, expires_at FROM sessions WHERE id = ?').bind(id).first<SessionRow>();
  if (!row) return null;
  if (row.expires_at < Date.now()) {
    await db.prepare('DELETE FROM sessions WHERE id = ?').bind(id).run();
    return null;
  }
  return row;
}

export async function createSession(db: DB, email: string): Promise<string> {
  const id = crypto.randomUUID();
  await db.prepare('INSERT INTO sessions (id, email, expires_at) VALUES (?, ?, ?)')
    .bind(id, email, Date.now() + SESSION_MS).run();
  return id;
}

export async function destroySession(db: DB, id: string): Promise<void> {
  await db.prepare('DELETE FROM sessions WHERE id = ?').bind(id).run();
}
