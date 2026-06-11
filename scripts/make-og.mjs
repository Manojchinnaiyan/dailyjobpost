#!/usr/bin/env node
// Generates public/og.png (1200x630) — branded social share image.
// Run: node scripts/make-og.mjs   (requires sharp as a dev dependency)
import { writeFile } from 'node:fs/promises';
import sharp from 'sharp';

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#09090b"/>
  <rect x="0" y="0" width="1200" height="8" fill="#33ff00"/>
  <g font-family="'JetBrains Mono','DejaVu Sans Mono',monospace">
    <!-- logo -->
    <rect x="80" y="86" width="64" height="64" rx="0" fill="#33ff00"/>
    <text x="112" y="130" font-size="34" font-weight="700" fill="#09090b" text-anchor="middle">$_</text>
    <text x="164" y="132" font-size="40" font-weight="700" fill="#33ff00" letter-spacing="3">DAILYJOBPOST</text>

    <!-- terminal prompt -->
    <text x="80" y="250" font-size="24" fill="#ffb000">user@dailyjobpost:~$ <tspan fill="#a1a1aa">find /jobs --worldwide</tspan></text>

    <!-- headline -->
    <text x="80" y="350" font-size="72" font-weight="700" fill="#ffffff">Find your next job,</text>
    <text x="80" y="436" font-size="72" font-weight="700" fill="#33ff00">worldwide.</text>

    <!-- subline -->
    <text x="80" y="510" font-size="28" fill="#d4d4d8">Thousands of jobs across every industry &amp; country.</text>
    <text x="80" y="552" font-size="28" fill="#d4d4d8">Updated daily.</text>

    <!-- url -->
    <text x="80" y="600" font-size="22" fill="#52525b">dailyjobpost.online</text>
  </g>
</svg>`;

const png = await sharp(Buffer.from(svg)).png().toBuffer();
await writeFile(new URL('../public/og.png', import.meta.url), png);
console.log('Wrote public/og.png', png.length, 'bytes');
