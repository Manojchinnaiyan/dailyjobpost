#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
/**
 * Apply SQL statements to the remote D1 database via the HTTP /query API.
 *
 * Unlike `wrangler d1 execute --file` (which uses the bulk-import endpoint
 * and makes the database UNAVAILABLE while it runs, taking the live site
 * down), /query executes statements as ordinary queries with no lock.
 *
 * Usage:
 *   node scripts/apply-sql.mjs jobs-statements.json     # JSON array of statements
 *   node scripts/apply-sql.mjs --command "DELETE ..."   # single statement
 *
 * Env: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, optional D1_DATABASE_ID.
 */

const TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const ACCOUNT = process.env.CLOUDFLARE_ACCOUNT_ID;
const DB_ID = process.env.D1_DATABASE_ID || 'bb3bfa4b-e01a-4698-a21f-a89d4a5881a5';
if (!TOKEN || !ACCOUNT) {
  console.error('CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID are required');
  process.exit(1);
}

const URL_API = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/d1/database/${DB_ID}/query`;
const CHUNK_STMTS = 25;        // statements per request
const CHUNK_CHARS = 200_000;   // stay well under the API body limit
const RETRIES = 4;

async function runSql(sql) {
  let lastErr;
  for (let attempt = 1; attempt <= RETRIES; attempt++) {
    try {
      const res = await fetch(URL_API, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ sql }),
      });
      const data = await res.json();
      if (data.success) return data;
      lastErr = new Error(JSON.stringify(data.errors));
    } catch (e) {
      lastErr = e;
    }
    const wait = attempt * 15;
    console.error(`Attempt ${attempt} failed (${lastErr.message}), retrying in ${wait}s...`);
    await new Promise(r => setTimeout(r, wait * 1000));
  }
  throw lastErr;
}

async function main() {
  const arg = process.argv[2];
  if (!arg) { console.error('Usage: apply-sql.mjs <statements.json> | --command "SQL"'); process.exit(1); }

  let stmts;
  if (arg === '--command') {
    stmts = [process.argv[3]];
  } else {
    stmts = JSON.parse(await readFile(arg, 'utf8'));
  }
  if (!stmts.length) { console.log('No statements to apply.'); return; }

  let applied = 0, chunk = [], chars = 0;
  const flush = async () => {
    if (!chunk.length) return;
    await runSql(chunk.join('\n'));
    applied += chunk.length;
    console.log(`Applied ${applied}/${stmts.length}`);
    chunk = []; chars = 0;
  };
  for (const s of stmts) {
    if (chunk.length >= CHUNK_STMTS || chars + s.length > CHUNK_CHARS) await flush();
    chunk.push(s); chars += s.length;
  }
  await flush();
  console.log(`Done: ${applied} statements applied.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
