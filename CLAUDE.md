# CLAUDE.md — jobsworld.in

## Project Overview

Static job listing site built with Astro SSG + Preact + Decap CMS.
No backend. No database. No SSR. No API calls at runtime.
All job data lives as Markdown in `src/content/jobs/`.
Filtering, search, and pagination are client-side only via a Preact island.
Deployed on Cloudflare Pages. Auto-rebuilds on GitHub push.

---

## Tech Stack

| Layer | Choice |
|---|---|
| Framework | Astro (SSG) |
| UI Island | Preact |
| Content | Markdown + Astro Content Collections |
| CMS | Decap CMS |
| Styling | Vanilla CSS (CSS variables only, no Tailwind) |
| Hosting | Cloudflare Pages |

---

## Project Structure

```
jobsworld/
├── src/
│   ├── content/
│   │   ├── config.ts
│   │   └── jobs/*.md
│   ├── components/
│   │   └── JobList.tsx        ← Preact island
│   ├── layouts/
│   │   └── Base.astro
│   └── pages/
│       └── index.astro
├── public/
│   └── admin/
│       ├── index.html         ← Decap CMS
│       └── config.yml
├── astro.config.mjs
└── package.json
```

---

## Design System — Terminal CLI

The entire UI must look and feel like a terminal/shell environment.
Monospace everything. High contrast green on black. No rounded corners. No shadows.

### Fonts

```css
@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&display=swap');
--font: 'JetBrains Mono', 'Fira Code', monospace;
```

Every element — headings, body, inputs, buttons, labels — uses this font. No exceptions.

### CSS Variables (paste into global.css)

```css
:root {
  --bg:     #0a0a0a;
  --green:  #33ff00;
  --amber:  #ffb000;
  --muted:  #1f521f;
  --dim:    #2a6b2a;
  --red:    #ff3333;
  --glow:   0 0 6px rgba(51, 255, 0, 0.45);
  --font:   'JetBrains Mono', monospace;
}

body {
  background: var(--bg);
  color: var(--green);
  font-family: var(--font);
  font-size: 13px;
}
```

### CRT Scanline Overlay

Add to `Base.astro` — fixed, pointer-events none, z-index 9999:

```css
body::before {
  content: '';
  position: fixed;
  inset: 0;
  background: repeating-linear-gradient(
    0deg,
    transparent, transparent 2px,
    rgba(0,0,0,0.08) 2px, rgba(0,0,0,0.08) 4px
  );
  pointer-events: none;
  z-index: 9999;
}
```

### Text Glow

Primary green text always has phosphor glow. Apply to headings, job titles, stat numbers, active states:

```css
text-shadow: var(--glow); /* 0 0 6px rgba(51,255,0,0.45) */
```

---

## Component Patterns

### Pane / Window

Every section is a terminal pane with an inverted title bar:

```html
<div class="pane">
  <div class="pane-header">▶ SECTION_NAME</div>
  <div class="pane-body">...</div>
</div>
```

```css
.pane        { border: 1px solid var(--muted); background: #0d0d0d; }
.pane-header { background: var(--muted); color: var(--bg); padding: 3px 10px; font-size: 11px; letter-spacing: 2px; font-weight: 700; }
.pane-body   { padding: 10px 12px; }
```

### Buttons

Hover = inverted video (green bg, black text). Label style: `[ SUBMIT ]` or `--flag`:

```css
.btn { background: transparent; border: 1px solid var(--muted); color: var(--muted); font-family: var(--font); font-size: 11px; padding: 3px 10px; cursor: pointer; letter-spacing: 1px; }
.btn:hover, .btn.active { background: var(--green); color: var(--bg); border-color: var(--green); text-shadow: none; }
```

### Search Input

No border box. Shell prompt prefix only:

```html
<div class="prompt-row">
  <span class="prompt">user@jobsworld:~$</span>
  <input class="terminal-input" placeholder="search jobs..." />
  <span class="cursor"></span>
</div>
```

```css
.prompt         { color: var(--amber); font-size: 12px; white-space: nowrap; }
.terminal-input { background: transparent; border: none; outline: none; color: var(--green); font-family: var(--font); font-size: 13px; flex: 1; caret-color: var(--green); text-shadow: var(--glow); }
```

### Blinking Cursor

```html
<span class="cursor"></span>
```

```css
.cursor { display: inline-block; width: 8px; height: 13px; background: var(--green); animation: blink 1s step-end infinite; box-shadow: var(--glow); }
@keyframes blink { 50% { opacity: 0; } }
```

### Dividers

Never use `<hr>`. Use ASCII strings:

```html
<div class="divider">// ═══════════════════════════════════════════ //</div>
<div class="divider">// RESULTS ──────────────────────────────────</div>
```

```css
.divider { color: var(--muted); font-size: 12px; letter-spacing: 1px; margin: 10px 0; }
```

### Stat Blocks

```html
<div class="stat-block">
  <div class="stat-num">2,847</div>
  <div class="stat-lbl">TOTAL_JOBS</div>
</div>
```

```css
.stat-block { border: 1px dashed var(--muted); padding: 8px; text-align: center; }
.stat-num   { font-size: 20px; font-weight: 700; color: var(--green); text-shadow: var(--glow); }
.stat-lbl   { font-size: 10px; color: var(--muted); letter-spacing: 1px; margin-top: 2px; }
```

### Progress Bars

No charts ever. ASCII-style progress bars only:

```html
<div class="progress-label"><span>GO</span><span>64%</span></div>
<div class="progress-track"><div class="progress-fill" style="width:64%"></div></div>
```

```css
.progress-label { font-size: 11px; color: var(--muted); display: flex; justify-content: space-between; margin-bottom: 2px; }
.progress-track { height: 10px; background: var(--muted); }
.progress-fill  { height: 100%; background: var(--green); box-shadow: var(--glow); transition: width 0.4s; }
```

### Job Cards

```css
.job-row          { border-bottom: 1px dashed var(--muted); padding: 8px 0; cursor: pointer; }
.job-row:hover    { background: rgba(51, 255, 0, 0.05); }
.job-title        { font-size: 13px; font-weight: 700; color: var(--green); text-shadow: var(--glow); }
.job-meta         { font-size: 11px; color: var(--muted); display: flex; gap: 12px; flex-wrap: wrap; }
.job-status.ok    { color: var(--green); font-size: 10px; letter-spacing: 1px; }
.job-status.warn  { color: var(--amber); }
.job-tag          { border: 1px solid var(--muted); color: var(--muted); font-size: 10px; padding: 1px 5px; letter-spacing: 1px; }
```

Status labels always uppercase and bracketed: `[ACTIVE]` `[REMOTE]` `[URGENT]`

### Pagination

```css
.page-btn               { background: transparent; border: 1px solid var(--muted); color: var(--muted); font-family: var(--font); font-size: 11px; padding: 2px 8px; cursor: pointer; }
.page-btn:hover,
.page-btn.active        { background: var(--green); color: var(--bg); border-color: var(--green); }
```

### Bottom Status Bar

```html
<div class="bottom-bar">
  <span>JOBSWORLD.IN v2.1 // ASTRO SSG</span>
  <span>[OK] ALL SYSTEMS OPERATIONAL</span>
</div>
```

```css
.bottom-bar { border: 1px solid var(--muted); padding: 5px 12px; display: flex; justify-content: space-between; font-size: 11px; color: var(--muted); margin-top: 12px; }
```

---

## Typography Rules

- Section headings and labels: UPPERCASE always
- Job titles: Title Case with glow
- Body / meta text: lowercase is fine
- Prompt prefix color: `var(--amber)`
- Status codes: `[OK]` green · `[WARN]` amber · `[ERR]` red
- Filter buttons: `--full-time` `--remote` `--contract` flag style
- Letter spacing on labels: `1px` to `2px`
- No rounded corners (`border-radius: 0` everywhere)
- No box shadows — text-shadow glow only

---

## Layout

Feels like tmux pane splits. Sections separated by ASCII dividers, not whitespace.

```css
.grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
@media (max-width: 600px) { .grid-2 { grid-template-columns: 1fr; } }
```

---

## Color Usage

| Element | Value |
|---|---|
| Primary text, titles, active states | `var(--green)` + glow |
| Prompt prefix, warnings, accents | `var(--amber)` |
| Borders, inactive, muted labels | `var(--muted)` |
| Errors, failed states | `var(--red)` |
| Page background | `var(--bg)` `#0a0a0a` |
| Pane background | `#0d0d0d` |
| Hover/active inverted text | `var(--bg)` on `var(--green)` |

---

## Hard Rules — Never Break These

- ❌ No rounded corners (`border-radius: 0` everywhere)
- ❌ No box shadows
- ❌ No non-monospace fonts
- ❌ No light backgrounds or white surfaces
- ❌ No charts or graphs — progress bars only
- ❌ No Tailwind — vanilla CSS + CSS variables only
- ❌ No API calls at runtime — data passed as props from Astro at build time
- ❌ No React — Preact only for islands
- ❌ No SSR — Astro output must be fully static