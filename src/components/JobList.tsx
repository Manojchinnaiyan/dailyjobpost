import { useState, useMemo, useEffect } from 'preact/hooks';

/* ── Types ───────────────────────────────────────────────── */
export interface Job {
  slug: string;
  title: string;
  company: string;
  location: string;
  type: 'full-time' | 'part-time' | 'contract' | 'remote' | 'internship';
  remote: boolean;
  urgent: boolean;
  salary?: string;
  tags: string[];
  posted: string;
  applyUrl?: string;
  experience?: string;
  category?: string;
}

/* ── Constants ───────────────────────────────────────────── */
const PAGE_SIZE = 9;

const TYPE_OPTS = [
  { label: '--full-time',  value: 'full-time' },
  { label: '--remote',     value: 'remote' },
  { label: '--contract',   value: 'contract' },
  { label: '--internship', value: 'internship' },
  { label: '--urgent',     value: 'urgent' },
];

const CATEGORY_OPTS = [
  { label: '--backend',    value: 'Backend' },
  { label: '--frontend',   value: 'Frontend' },
  { label: '--full-stack', value: 'Full-Stack' },
  { label: '--mobile',     value: 'Mobile' },
  { label: '--devops',     value: 'DevOps' },
  { label: '--data',       value: 'Data' },
  { label: '--ai-ml',      value: 'AI / ML' },
  { label: '--design',     value: 'Design' },
  { label: '--security',   value: 'Security' },
  { label: '--product',    value: 'Product' },
  { label: '--writing',    value: 'Writing' },
];

const EXP_OPTS = [
  { label: '--entry',  value: 'entry',  desc: '0–2 yrs' },
  { label: '--mid',    value: 'mid',    desc: '2–5 yrs' },
  { label: '--senior', value: 'senior', desc: '5+ yrs' },
];

const SALARY_OPTS = [
  { label: '--under-$100k', value: 'lt100',    desc: '< $100K' },
  { label: '--$100k-$150k', value: '100to150', desc: '$100K–$150K' },
  { label: '--$150k-plus',  value: 'gt150',    desc: '$150K+' },
];

/* ── Helpers ─────────────────────────────────────────────── */
function daysAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (diff === 0) return 'today';
  if (diff === 1) return '1d ago';
  return `${diff}d ago`;
}

function initials(company: string): string {
  return company.split(/[\s\-_]+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');
}

function expBucket(exp?: string): 'entry' | 'mid' | 'senior' | null {
  if (!exp) return null;
  const m = exp.match(/(\d+)/);
  if (!m) return null;
  const n = parseInt(m[1]);
  if (n < 2) return 'entry';
  if (n < 5) return 'mid';
  return 'senior';
}

function salaryBucket(sal?: string): 'lt100' | '100to150' | 'gt150' | null {
  if (!sal) return null;
  const m = sal.match(/\$(\d+)K/);
  if (!m) return null;
  const n = parseInt(m[1]);
  if (n < 100) return 'lt100';
  if (n < 150) return '100to150';
  return 'gt150';
}

/* ── Multi-select dropdown ───────────────────────────────── */
function MultiDropdown({ title, opts, selected, onChange, open, onToggle }: {
  title: string;
  opts: { label: string; value: string; desc?: string }[];
  selected: string[];
  onChange: (v: string[]) => void;
  open: boolean;
  onToggle: () => void;
}) {
  const isActive = selected.length > 0;

  function closeIfMobile() {
    if (typeof window !== 'undefined' && window.innerWidth <= 768) onToggle();
  }

  function toggle(val: string) {
    if (selected.includes(val)) {
      onChange(selected.filter(v => v !== val));
    } else {
      onChange([...selected, val]);
    }
    closeIfMobile();
  }

  return (
    <div class={`dd-wrap${isActive ? ' dd-wrap--active' : ''}`}>
      <button
        class={`dd-trigger${isActive ? ' dd-trigger--active' : ''}`}
        onClick={onToggle}
        aria-expanded={open}
      >
        <span>▶ {title}{isActive ? ` [${selected.length}]` : ''}</span>
        <span class="dd-arrow">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div class="dd-panel">
          <div
            class={`dd-option${selected.length === 0 ? ' dd-option--all' : ''}`}
            onClick={() => { onChange([]); closeIfMobile(); }}
          >
            <span class="dd-check">{selected.length === 0 ? '[✓]' : '[ ]'}</span>
            <span>--all</span>
          </div>
          {opts.map(({ label, value, desc }) => (
            <div
              key={value}
              class={`dd-option${selected.includes(value) ? ' dd-option--checked' : ''}`}
              onClick={() => toggle(value)}
            >
              <span class="dd-check">{selected.includes(value) ? '[✓]' : '[ ]'}</span>
              <span>{label}{desc ? <span class="dd-desc"> ({desc})</span> : ''}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Main component ──────────────────────────────────────── */
export default function JobList({ jobs, withSearch = false, initialTypeFilter = 'all' }: {
  jobs: Job[];
  withSearch?: boolean;
  initialTypeFilter?: string;
}) {
  const initTypes = initialTypeFilter && initialTypeFilter !== 'all' ? [initialTypeFilter] : [];

  const [query,        setQuery]        = useState('');
  const [typeFilters,  setTypeFilters]  = useState<string[]>(initTypes);
  const [catFilters,   setCatFilters]   = useState<string[]>([]);
  const [expFilters,   setExpFilters]   = useState<string[]>([]);
  const [salFilters,   setSalFilters]   = useState<string[]>([]);
  const [displayCount, setDisplayCount] = useState(PAGE_SIZE);
  const [openSec,      setOpenSec]      = useState({ type: false, cat: false, exp: false, sal: false });
  const [sheetOpen,    setSheetOpen]    = useState(false);

  const toggleSec = (k: keyof typeof openSec) => setOpenSec(p => ({ ...p, [k]: !p[k] }));

  /* ── Hero / nav search event ──────────────────────────── */
  useEffect(() => {
    const handler = (e: Event) => {
      const q = (e as CustomEvent<{ q: string }>).detail?.q ?? '';
      setDisplayCount(PAGE_SIZE);
      if (q === '') {
        setQuery(''); setTypeFilters([]); setCatFilters([]);
        setExpFilters([]); setSalFilters([]);
      } else if (['remote', 'urgent', 'full-time', 'contract', 'internship'].includes(q)) {
        setTypeFilters([q]); setQuery('');
        setOpenSec(p => ({ ...p, type: true }));
      } else {
        setQuery(q); setTypeFilters([]);
      }
    };
    window.addEventListener('hero-search', handler);
    return () => window.removeEventListener('hero-search', handler);
  }, []);

  /* ── Filter logic ─────────────────────────────────────── */
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return jobs.filter((job) => {
      // Type filter — OR logic across selected values
      if (typeFilters.length > 0) {
        const match = typeFilters.some(f => {
          if (f === 'urgent') return job.urgent;
          if (f === 'remote') return job.remote || job.type === 'remote';
          return job.type === f;
        });
        if (!match) return false;
      }

      // Category filter — OR logic
      if (catFilters.length > 0 && !catFilters.includes(job.category ?? '')) return false;

      // Experience filter — OR logic
      if (expFilters.length > 0) {
        const b = expBucket(job.experience);
        if (!b || !expFilters.includes(b)) return false;
      }

      // Salary filter — OR logic
      if (salFilters.length > 0) {
        const b = salaryBucket(job.salary);
        if (!b || !salFilters.includes(b)) return false;
      }

      if (!q) return true;
      return (
        job.title.toLowerCase().includes(q) ||
        job.company.toLowerCase().includes(q) ||
        job.location.toLowerCase().includes(q) ||
        job.tags.some((t) => t.toLowerCase().includes(q)) ||
        job.type.toLowerCase().includes(q) ||
        (job.category ?? '').toLowerCase().includes(q)
      );
    });
  }, [jobs, query, typeFilters, catFilters, expFilters, salFilters]);

  /* Reset display count when filters change */
  useEffect(() => { setDisplayCount(PAGE_SIZE); }, [filtered]);

  const displayJobs      = filtered.slice(0, displayCount);
  const hasMore          = displayCount < filtered.length;
  const hasActiveFilters = !!(query || typeFilters.length > 0 || catFilters.length > 0 || expFilters.length > 0 || salFilters.length > 0);
  const activeBadgeCount = typeFilters.length + catFilters.length + expFilters.length + salFilters.length;

  function handleReset() {
    setQuery(''); setTypeFilters([]); setCatFilters([]);
    setExpFilters([]); setSalFilters([]); setDisplayCount(PAGE_SIZE);
  }

  function toggleChip(val: string, arr: string[], set: (v: string[]) => void) {
    const next = arr.includes(val) ? arr.filter(v => v !== val) : [...arr, val];
    set(next);
    setDisplayCount(PAGE_SIZE);
  }

  /* ── Render ───────────────────────────────────────────── */
  return (
    <div class="jl-wrap jl-wrap--with-search">

      {/* ── Search bar ───────────────────────────────────── */}
      <div class="jl-search pane">
        <div class="pane-body" style={{ padding: '6px 12px' }}>
          <div class="prompt-row">
            <span class="prompt">user@dailyjobpost:~$</span>
            <input
              class="terminal-input"
              type="text"
              placeholder="search by job title, company, skill, location..."
              value={query}
              onInput={(e) => { setQuery((e.target as HTMLInputElement).value); setDisplayCount(PAGE_SIZE); }}
              aria-label="Search jobs"
            />
            {query && (
              <button
                class="search-clear-btn"
                onClick={() => { setQuery(''); setDisplayCount(PAGE_SIZE); }}
                aria-label="Clear search"
              >✕</button>
            )}
            <span class="cursor" />
          </div>
        </div>
      </div>

      {/* ── Mobile filter button ─────────────────────────── */}
      <button class="mobile-filter-btn" onClick={() => setSheetOpen(true)}>
        <span>⚙ FILTERS</span>
        {activeBadgeCount > 0 && <span class="mobile-filter-badge">{activeBadgeCount}</span>}
      </button>

      {/* ── Mobile bottom sheet ───────────────────────────── */}
      {sheetOpen && (
        <div class="sheet-overlay" onClick={() => setSheetOpen(false)}>
          <div class="sheet" onClick={(e) => e.stopPropagation()}>
            <div class="sheet-header">
              <span>▶ FILTERS</span>
              <button class="sheet-close" onClick={() => setSheetOpen(false)}>✕</button>
            </div>
            <div class="sheet-body">

              <div class="sheet-section">
                <div class="sheet-section-title">JOB_TYPE</div>
                <div class="sheet-chips">
                  <button
                    class={`sheet-chip${typeFilters.length === 0 ? ' active' : ''}`}
                    onClick={() => { setTypeFilters([]); setDisplayCount(PAGE_SIZE); }}
                  >--all</button>
                  {TYPE_OPTS.map(({ label, value }) => (
                    <button
                      key={value}
                      class={`sheet-chip${typeFilters.includes(value) ? ' active' : ''}`}
                      onClick={() => toggleChip(value, typeFilters, setTypeFilters)}
                    >{label}</button>
                  ))}
                </div>
              </div>

              <div class="sheet-section">
                <div class="sheet-section-title">CATEGORY</div>
                <div class="sheet-chips">
                  <button
                    class={`sheet-chip${catFilters.length === 0 ? ' active' : ''}`}
                    onClick={() => { setCatFilters([]); setDisplayCount(PAGE_SIZE); }}
                  >--all</button>
                  {CATEGORY_OPTS.map(({ label, value }) => (
                    <button
                      key={value}
                      class={`sheet-chip${catFilters.includes(value) ? ' active' : ''}`}
                      onClick={() => toggleChip(value, catFilters, setCatFilters)}
                    >{label}</button>
                  ))}
                </div>
              </div>

              <div class="sheet-section">
                <div class="sheet-section-title">EXPERIENCE</div>
                <div class="sheet-chips">
                  <button
                    class={`sheet-chip${expFilters.length === 0 ? ' active' : ''}`}
                    onClick={() => { setExpFilters([]); setDisplayCount(PAGE_SIZE); }}
                  >--all</button>
                  {EXP_OPTS.map(({ label, value, desc }) => (
                    <button
                      key={value}
                      class={`sheet-chip${expFilters.includes(value) ? ' active' : ''}`}
                      onClick={() => toggleChip(value, expFilters, setExpFilters)}
                    >{label} ({desc})</button>
                  ))}
                </div>
              </div>

              <div class="sheet-section">
                <div class="sheet-section-title">SALARY</div>
                <div class="sheet-chips">
                  <button
                    class={`sheet-chip${salFilters.length === 0 ? ' active' : ''}`}
                    onClick={() => { setSalFilters([]); setDisplayCount(PAGE_SIZE); }}
                  >--all</button>
                  {SALARY_OPTS.map(({ label, value, desc }) => (
                    <button
                      key={value}
                      class={`sheet-chip${salFilters.includes(value) ? ' active' : ''}`}
                      onClick={() => toggleChip(value, salFilters, setSalFilters)}
                    >{label} ({desc})</button>
                  ))}
                </div>
              </div>

            </div>
            <div class="sheet-footer">
              <button class="sheet-reset" onClick={handleReset}>[ RESET_ALL ]</button>
              <button class="btn btn-primary sheet-apply" onClick={() => setSheetOpen(false)}>
                [ APPLY · {filtered.length} result{filtered.length !== 1 ? 's' : ''} ]
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Sidebar + main grid ───────────────────────────── */}
      <div class="jl-layout">

        {/* LEFT — sticky filter sidebar */}
        <aside class="jl-sidebar">

          <MultiDropdown
            title="JOB_TYPE"
            opts={TYPE_OPTS}
            selected={typeFilters}
            onChange={(v) => { setTypeFilters(v); setDisplayCount(PAGE_SIZE); }}
            open={openSec.type}
            onToggle={() => toggleSec('type')}
          />

          <MultiDropdown
            title="CATEGORY"
            opts={CATEGORY_OPTS}
            selected={catFilters}
            onChange={(v) => { setCatFilters(v); setDisplayCount(PAGE_SIZE); }}
            open={openSec.cat}
            onToggle={() => toggleSec('cat')}
          />

          <MultiDropdown
            title="EXPERIENCE"
            opts={EXP_OPTS}
            selected={expFilters}
            onChange={(v) => { setExpFilters(v); setDisplayCount(PAGE_SIZE); }}
            open={openSec.exp}
            onToggle={() => toggleSec('exp')}
          />

          <MultiDropdown
            title="SALARY"
            opts={SALARY_OPTS}
            selected={salFilters}
            onChange={(v) => { setSalFilters(v); setDisplayCount(PAGE_SIZE); }}
            open={openSec.sal}
            onToggle={() => toggleSec('sal')}
          />

          <div class="sidebar-footer">
            <div class="sidebar-meta">
              <span class="prompt">&gt;&gt;</span>
              <span>{filtered.length} result{filtered.length !== 1 ? 's' : ''}</span>
            </div>
            <button
              class={`sidebar-reset${!hasActiveFilters ? ' sidebar-reset--dim' : ''}`}
              onClick={handleReset}
            >
              [ RESET_FILTERS ]
            </button>
          </div>

        </aside>

        {/* RIGHT — job cards + infinite scroll */}
        <div class="jl-main">

          {/* Active filter tags + clear button */}
          {hasActiveFilters && (
            <div class="jl-active-filter">
              <span class="prompt">&gt;</span>
              {typeFilters.map(f => <span key={f} class="filter-tag">{f}</span>)}
              {catFilters.map(f => <span key={f} class="filter-tag">{f}</span>)}
              {expFilters.map(f => <span key={f} class="filter-tag">exp:{f}</span>)}
              {salFilters.map(f => <span key={f} class="filter-tag">sal:{f}</span>)}
              {query && <span class="filter-tag">"{query}"</span>}
              <button class="filter-clear-btn" onClick={handleReset}>✕ CLEAR_ALL</button>
            </div>
          )}

          {/* Result count */}
          <div class="jl-result-count">
            <span class="prompt">&gt;&gt;</span>
            <span>
              {filtered.length} job{filtered.length !== 1 ? 's' : ''} found
              {query && <span> for <span class="jl-query-text">"{query}"</span></span>}
            </span>
          </div>

          {/* Empty state */}
          {displayJobs.length === 0 ? (
            <div class="jl-empty pane">
              <div class="pane-header">▶ QUERY_RESULT</div>
              <div class="pane-body" style={{ textAlign: 'center', padding: '40px 12px' }}>
                <div>&gt;&gt; no jobs matched your query</div>
                <div style={{ marginTop: '8px', color: 'var(--amber)' }}>
                  [HINT] try broader terms or reset filters
                </div>
                <button class="sidebar-reset" style={{ marginTop: '16px', display: 'inline-block' }} onClick={handleReset}>
                  [ RESET_FILTERS ]
                </button>
              </div>
            </div>
          ) : (
            <div class="job-grid">
              {displayJobs.map((job, i) => {
                const typeLabel = job.type.toUpperCase().replace('-', '_');
                const isRemote  = job.remote || job.type === 'remote';
                return (
                  <a key={job.slug} href={`/jobs/${job.slug}`}
                    class={`jcard${job.urgent ? ' jcard--urgent' : ''}`}>

                    {/* ── Terminal title bar ── */}
                    <div class="jcard-bar">
                      <div class="jcard-bar-dots">
                        <span class="jcard-dot" />
                        <span class="jcard-dot" />
                        <span class="jcard-dot jcard-dot--active" />
                      </div>
                      <span class="jcard-bar-company">
                        {job.company.toUpperCase()}
                      </span>
                      <span class="jcard-bar-age">{daysAgo(job.posted)}</span>
                    </div>

                    {/* ── Content ── */}
                    <div class="jcard-content">

                      <div class="jcard-logo-row">
                        <div class={`jcard-logo${job.urgent ? ' jcard-logo--urgent' : ''}`}>
                          {initials(job.company)}
                        </div>
                        <div class="jcard-info">
                          <div class="jcard-title">{job.title}</div>
                          <div class="jcard-badges">
                            <span class={`badge ${job.urgent ? 'badge--warn' : 'badge--ok'}`}>{typeLabel}</span>
                            {job.urgent  && <span class="badge badge--warn">URGENT</span>}
                            {isRemote    && <span class="badge badge--ok">REMOTE</span>}
                            {job.category && <span class="badge badge--dim">{job.category.toUpperCase()}</span>}
                          </div>
                        </div>
                      </div>

                      <div class="jcard-tags-row">
                        {job.tags.slice(0, 4).map((tag) => (
                          <span key={tag} class="job-tag">{tag}</span>
                        ))}
                        {job.tags.length > 4 && <span class="job-tag">+{job.tags.length - 4}</span>}
                      </div>

                      <div class="jcard-meta">
                        <span>◉ {job.location}</span>
                        {job.salary    && <span class="jcard-salary">{job.salary}</span>}
                        {job.experience && <span>exp: {job.experience}</span>}
                      </div>

                    </div>

                    {/* ── Footer bar ── */}
                    <div class="jcard-footer">
                      <span class="jcard-idx">#{String(i + 1).padStart(2, '0')}</span>
                      <span class="jcard-view-btn">[ VIEW_JOB → ]</span>
                    </div>

                  </a>
                );
              })}
            </div>
          )}

          {/* Load more */}
          {hasMore && (
            <div class="load-more-wrap">
              <button
                class="btn load-more-btn"
                onClick={() => setDisplayCount(c => c + PAGE_SIZE)}
              >
                [ LOAD MORE — {filtered.length - displayCount} more job{filtered.length - displayCount !== 1 ? 's' : ''} ]
              </button>
            </div>
          )}
          {!hasMore && filtered.length > 0 && (
            <div class="load-more-end">&gt;&gt; all {filtered.length} jobs loaded [OK]</div>
          )}

        </div>
      </div>
    </div>
  );
}
