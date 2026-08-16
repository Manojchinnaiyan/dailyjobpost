#!/usr/bin/env node
// Generates ~/Downloads/dailyjobpost-cover.png — LinkedIn page cover.
// Rendered at 2256x382 (2x of LinkedIn's 1128x191) for retina sharpness.
// LinkedIn overlays the page logo on the bottom-left, so the left edge
// is kept free of important content.
// Run: node scripts/make-cover.mjs
import { writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';

const MONO = `'JetBrains Mono','DejaVu Sans Mono','Menlo',monospace`;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="2256" height="382" viewBox="0 0 2256 382">
  <defs>
    <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="8" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <pattern id="scan" width="8" height="8" patternUnits="userSpaceOnUse">
      <rect width="8" height="4" fill="rgba(0,0,0,0)"/>
      <rect y="4" width="8" height="4" fill="rgba(51,255,0,0.025)"/>
    </pattern>
  </defs>

  <rect width="2256" height="382" fill="#0a0a0a"/>
  <rect width="2256" height="382" fill="url(#scan)"/>
  <rect x="0" y="0" width="2256" height="10" fill="#33ff00"/>

  <g font-family="${MONO}">
    <!-- prompt line -->
    <text x="540" y="118" font-size="38" fill="#ffb000">user@dailyjobpost:~$ <tspan fill="#a1a1aa">find /jobs --worldwide</tspan></text>

    <!-- headline -->
    <text x="540" y="208" font-size="74" font-weight="700" fill="#ffffff">Fresh jobs <tspan fill="#33ff00" filter="url(#glow)">every day.</tspan></text>

    <!-- status line -->
    <text x="540" y="280" font-size="34" fill="#d4d4d8">[<tspan fill="#33ff00">OK</tspan>] 8,000+ live listings &#183; 500+ companies &#183; updated daily</text>

    <!-- url -->
    <text x="540" y="340" font-size="30" fill="#52525b">dailyjobpost.online</text>

    <!-- right-side stat blocks -->
    <g>
      <rect x="1760" y="96" width="360" height="100" fill="none" stroke="#1f521f" stroke-width="3" stroke-dasharray="10,8"/>
      <text x="1940" y="152" font-size="44" font-weight="700" fill="#33ff00" text-anchor="middle" filter="url(#glow)">8,000+</text>
      <text x="1940" y="184" font-size="20" letter-spacing="3" fill="#1f521f" text-anchor="middle">LIVE_JOBS</text>
      <rect x="1760" y="216" width="360" height="100" fill="none" stroke="#1f521f" stroke-width="3" stroke-dasharray="10,8"/>
      <text x="1940" y="272" font-size="44" font-weight="700" fill="#33ff00" text-anchor="middle" filter="url(#glow)">DAILY</text>
      <text x="1940" y="304" font-size="20" letter-spacing="3" fill="#1f521f" text-anchor="middle">UPDATES</text>
    </g>
  </g>
</svg>`;

const png = await sharp(Buffer.from(svg)).png().toBuffer();
await writeFile(join(homedir(), 'Downloads', 'dailyjobpost-cover.png'), png);
console.log('Wrote ~/Downloads/dailyjobpost-cover.png (2256x382)');
