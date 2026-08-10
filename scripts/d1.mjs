/**
 * One way to talk to the production D1 database, used by apply-sql.mjs and
 * expire-jobs.mjs.
 *
 * Two transports, same SQL:
 *   - CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID -> the D1 HTTP /query API.
 *     This is what CI uses.
 *   - Neither set -> shell out to the wrangler CLI and reuse its OAuth session
 *     (`wrangler login`), so a developer can run these scripts without pasting
 *     a token into a file.
 *
 * Both transports execute statements as ordinary queries. Never switch this to
 * `wrangler d1 execute --file`: that uses the bulk-import endpoint, which locks
 * the database and takes the live site down while it runs.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const TOKEN   = process.env.CLOUDFLARE_API_TOKEN;
const ACCOUNT = process.env.CLOUDFLARE_ACCOUNT_ID;
const DB_ID   = process.env.D1_DATABASE_ID   || 'bb3bfa4b-e01a-4698-a21f-a89d4a5881a5';
const DB_NAME = process.env.D1_DATABASE_NAME || 'dailyjobpost-jobs';

export const USE_WRANGLER = !TOKEN || !ACCOUNT;
export const transportName = USE_WRANGLER ? 'wrangler CLI (OAuth session)' : 'D1 HTTP API';

const API = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/d1/database/${DB_ID}/query`;
const RETRIES = 4;

async function viaWrangler(sql) {
  const { stdout } = await execFileAsync(
    'npx',
    ['wrangler', 'd1', 'execute', DB_NAME, '--remote', '--json', '--command', sql],
    { maxBuffer: 128 * 1024 * 1024 },
  );
  // wrangler prints a banner before the JSON payload; parse from the array.
  const start = stdout.indexOf('[');
  if (start === -1) throw new Error(`unexpected wrangler output: ${stdout.slice(0, 200)}`);
  return JSON.parse(stdout.slice(start));
}

async function viaApi(sql) {
  const res = await fetch(API, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ sql }),
  });
  const data = await res.json();
  if (!data.success) throw new Error(JSON.stringify(data.errors));
  return data.result;
}

/**
 * Execute SQL and return the raw result array.
 * @param {string} sql
 * @param {{ tolerate?: boolean }} [opts] tolerate: log and return null instead
 *   of retrying. For DDL that is only idempotent by erroring the second time —
 *   SQLite has no ALTER TABLE ... ADD COLUMN IF NOT EXISTS.
 */
export async function runSql(sql, opts = {}) {
  let lastErr;
  for (let attempt = 1; attempt <= RETRIES; attempt++) {
    try {
      return USE_WRANGLER ? await viaWrangler(sql) : await viaApi(sql);
    } catch (e) {
      lastErr = e;
    }
    if (opts.tolerate) {
      console.log(`Tolerated failure (expected for idempotent DDL): ${lastErr.message.slice(0, 200)}`);
      return null;
    }
    const wait = attempt * 15;
    console.error(`Attempt ${attempt} failed (${lastErr.message.slice(0, 200)}), retrying in ${wait}s...`);
    await new Promise((r) => setTimeout(r, wait * 1000));
  }
  throw lastErr;
}

/** Execute SQL and return just the rows of the first statement. */
export async function query(sql) {
  const result = await runSql(sql);
  return result?.[0]?.results ?? [];
}

/** SQL string literal with quotes escaped. */
export const sq = (s) => `'${String(s ?? '').replace(/'/g, "''")}'`;
