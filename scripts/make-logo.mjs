#!/usr/bin/env node
// Generates brand assets:
//   public/logo.png                          400x400 square logo
//   ~/Downloads/dailyjobpost-logo.png        copy for easy upload (LinkedIn etc.)
//   ~/Downloads/dailyjobpost-cover.png       1128x191 LinkedIn page cover
// Run: node scripts/make-logo.mjs
import { writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';

const MONO = `'JetBrains Mono','DejaVu Sans Mono','Menlo',monospace`;

const logoSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400">
  <defs>
    <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="7" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  <rect width="400" height="400" fill="#0a0a0a"/>
  <rect x="14" y="14" width="372" height="372" fill="none" stroke="#1f521f" stroke-width="3"/>
  <rect x="14" y="14" width="372" height="44" fill="#1f521f"/>
  <text x="34" y="44" font-family="${MONO}" font-size="20" font-weight="700" letter-spacing="4" fill="#0a0a0a">&#9654; DJP</text>
  <g font-family="${MONO}" filter="url(#glow)">
    <text x="200" y="258" font-size="150" font-weight="700" fill="#33ff00" text-anchor="middle">$_</text>
  </g>
  <text x="200" y="348" font-family="${MONO}" font-size="26" font-weight="700" letter-spacing="3" fill="#33ff00" text-anchor="middle">DAILYJOBPOST</text>
</svg>`;

const coverSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="1128" height="191" viewBox="0 0 1128 191">
  <defs>
    <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="4" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  <rect width="1128" height="191" fill="#0a0a0a"/>
  <rect x="0" y="0" width="1128" height="5" fill="#33ff00"/>
  <g font-family="${MONO}">
    <text x="64" y="78" font-size="22" fill="#ffb000">user@dailyjobpost:~$ <tspan fill="#a1a1aa">find /jobs --worldwide --updated daily</tspan></text>
    <text x="64" y="130" font-size="34" font-weight="700" fill="#33ff00" filter="url(#glow)">Fresh jobs every day, worldwide.</text>
    <text x="64" y="164" font-size="18" fill="#52525b">dailyjobpost.online &#183; thousands of roles &#183; every industry &#183; always free</text>
  </g>
</svg>`;

const logo = await sharp(Buffer.from(logoSvg)).png().toBuffer();
const cover = await sharp(Buffer.from(coverSvg)).png().toBuffer();

await writeFile(new URL('../public/logo.png', import.meta.url), logo);
await writeFile(join(homedir(), 'Downloads', 'dailyjobpost-logo.png'), logo);
await writeFile(join(homedir(), 'Downloads', 'dailyjobpost-cover.png'), cover);
console.log('Wrote public/logo.png, ~/Downloads/dailyjobpost-logo.png, ~/Downloads/dailyjobpost-cover.png');
