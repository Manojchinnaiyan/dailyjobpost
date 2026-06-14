#!/usr/bin/env node
/**
 * Push new job URLs to Google's Indexing API for near-instant crawling.
 * Google supports this API specifically for JobPosting pages — ideal for a
 * daily job board (gets fresh roles into Google Jobs fast).
 *
 * Setup (one-time, by the site owner):
 *   1. Google Cloud: create a project, enable "Indexing API".
 *   2. Create a service account; download its JSON key.
 *   3. In Search Console (the dailyjobpost.online property) → Settings → Users
 *      and permissions → add the service account email as an **Owner**.
 *   4. Store the JSON key as GitHub secret GOOGLE_INDEXING_SA (paste full JSON).
 * Until the secret exists this script no-ops, so the import never fails.
 *
 * Quota: default 200 URLs/day. We prioritise /jobs/ URLs.
 * Usage: node scripts/ping-google-index.mjs index-urls.json
 */
import { readFile } from 'node:fs/promises';
import crypto from 'node:crypto';

const raw = process.env.GOOGLE_INDEXING_SA;
if (!raw) { console.log('GOOGLE_INDEXING_SA not set — skipping Google Indexing API.'); process.exit(0); }

let sa;
try { sa = JSON.parse(raw); } catch { console.error('GOOGLE_INDEXING_SA is not valid JSON — skipping.'); process.exit(0); }

const file = process.argv[2] || 'index-urls.json';
let urls;
try { urls = JSON.parse(await readFile(file, 'utf8')); } catch { console.log(`No ${file} — nothing to submit.`); process.exit(0); }
urls = [...new Set((urls || []).filter((u) => typeof u === 'string' && u.startsWith('https://')))];
// Prioritise job pages (the content Google's Indexing API is meant for), cap at quota.
urls.sort((a, b) => (b.includes('/jobs/') ? 1 : 0) - (a.includes('/jobs/') ? 1 : 0));
urls = urls.slice(0, 200);
if (!urls.length) { console.log('No URLs to submit.'); process.exit(0); }

const b64url = (buf) => Buffer.from(buf).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

function makeJwt() {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64url(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/indexing',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now, exp: now + 3600,
  }));
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(`${header}.${claim}`);
  return `${header}.${claim}.${b64url(signer.sign(sa.private_key))}`;
}

const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: makeJwt() }),
});
const token = await tokenRes.json();
if (!token.access_token) { console.error(`Google auth failed: ${JSON.stringify(token)}`); process.exit(0); }

let ok = 0, fail = 0;
for (const url of urls) {
  try {
    const r = await fetch('https://indexing.googleapis.com/v3/urlNotifications:publish', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, type: 'URL_UPDATED' }),
    });
    r.ok ? ok++ : fail++;
  } catch { fail++; }
}
console.log(`Google Indexing API: ${ok} submitted, ${fail} failed (of ${urls.length}).`);
