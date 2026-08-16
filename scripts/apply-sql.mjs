#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { runSql, transportName } from './d1.mjs';
/**
 * Apply SQL statements to the remote D1 database.
 *
 * Transport and retry behaviour live in scripts/d1.mjs — with CI's API token
 * it uses the D1 HTTP /query API, and locally it falls back to the wrangler
 * CLI's OAuth session. Either way statements run as ordinary queries, unlike
 * `wrangler d1 execute --file`, which uses the bulk-import endpoint and makes
 * the database UNAVAILABLE while it runs, taking the live site down.
 *
 * Usage:
 *   node scripts/apply-sql.mjs jobs-statements.json     # JSON array of statements
 *   node scripts/apply-sql.mjs --command "DELETE ..."   # single statement
 *   node scripts/apply-sql.mjs --command "ALTER ..." --tolerate
 *
 * --tolerate: log the failure and exit 0 instead of retrying. For DDL that is
 * only idempotent by way of erroring the second time — SQLite has no
 * ALTER TABLE ... ADD COLUMN IF NOT EXISTS, so a nightly job that ensures a
 * column exists would otherwise burn ~2.5 min of retries on every run.
 *
 * Env: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, optional D1_DATABASE_ID.
 */

const TOLERATE = process.argv.includes('--tolerate');
const CHUNK_STMTS = 25;        // statements per request
const CHUNK_CHARS = 200_000;   // stay well under the API body limit

/**
 * Flags may appear in any order. Reading argv[2] positionally meant
 * `--tolerate --command "ALTER ..."` tried to open a file named "--tolerate",
 * which failed the nightly import for six days.
 */
export function parseArgs(argv) {
  const rest = argv.filter((a) => a !== '--tolerate');
  const i = rest.indexOf('--command');
  if (i !== -1) {
    const sql = rest[i + 1];
    if (!sql) throw new Error('--command needs a SQL string');
    return { command: sql };
  }
  if (!rest.length) throw new Error('Usage: apply-sql.mjs <statements.json> | --command "SQL"');
  return { file: rest[0] };
}

async function main() {
  let parsed;
  try { parsed = parseArgs(process.argv.slice(2)); }
  catch (e) { console.error(e.message); process.exit(1); }

  const stmts = parsed.command
    ? [parsed.command]
    : JSON.parse(await readFile(parsed.file, 'utf8'));
  if (!stmts.length) { console.log('No statements to apply.'); return; }
  console.log(`Applying ${stmts.length} statement(s) via ${transportName}`);

  let applied = 0, tolerated = 0, chunk = [], chars = 0;
  const flush = async () => {
    if (!chunk.length) return;
    const result = await runSql(chunk.join('\n'), { tolerate: TOLERATE });
    // runSql returns null when a tolerated statement failed — do not report
    // those as applied, or an ALTER that silently no-ops looks like it ran.
    if (result === null) tolerated += chunk.length;
    else applied += chunk.length;
    console.log(`Applied ${applied}/${stmts.length}${tolerated ? ` (${tolerated} tolerated)` : ''}`);
    chunk = []; chars = 0;
  };
  for (const s of stmts) {
    if (chunk.length >= CHUNK_STMTS || chars + s.length > CHUNK_CHARS) await flush();
    chunk.push(s); chars += s.length;
  }
  await flush();
  console.log(`Done: ${applied} statement(s) applied${tolerated ? `, ${tolerated} tolerated` : ""}.`);
}

// Only run when executed directly, so parseArgs can be imported by tests.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
