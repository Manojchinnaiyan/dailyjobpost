#!/usr/bin/env node
/**
 * Notify IndexNow (Bing, Yandex, Seznam, Naver, …) of new/updated URLs so they
 * crawl them within hours instead of days. Free, no auth — just a key hosted at
 * https://<host>/<key>.txt.
 *
 * Usage: node scripts/ping-indexnow.mjs index-urls.json
 * The JSON is a flat array of absolute URLs (produced by import-jobs.mjs).
 */
import { readFile } from 'node:fs/promises';

const HOST = 'dailyjobpost.online';
const KEY = 'e460136125b18e1d301851ca9497ed96';
const KEY_LOCATION = `https://${HOST}/${KEY}.txt`;
const ENDPOINT = 'https://api.indexnow.org/indexnow';
const MAX_PER_REQUEST = 10000; // IndexNow allows up to 10k URLs per submission

const file = process.argv[2] || 'index-urls.json';
let urls;
try {
  urls = JSON.parse(await readFile(file, 'utf8'));
} catch {
  console.log(`No ${file} — nothing to submit to IndexNow.`);
  process.exit(0);
}
urls = [...new Set((urls || []).filter((u) => typeof u === 'string' && u.startsWith('https://')))];
if (!urls.length) { console.log('No URLs to submit.'); process.exit(0); }

for (let i = 0; i < urls.length; i += MAX_PER_REQUEST) {
  const urlList = urls.slice(i, i + MAX_PER_REQUEST);
  const body = { host: HOST, key: KEY, keyLocation: KEY_LOCATION, urlList };
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(body),
    });
    console.log(`IndexNow: submitted ${urlList.length} URLs → HTTP ${res.status}`);
  } catch (e) {
    console.error(`IndexNow submit failed: ${e.message}`);
  }
}
