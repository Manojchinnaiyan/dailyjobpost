-- Cut D1 rows-read.
--
-- Before this, the homepage, every landing page and the sitemap each scanned
-- all ~11k jobs to build browse counts (cached only per isolate, so it rarely
-- hit), and every search ran `lower(body) LIKE '%term%'` over the whole table
-- twice (COUNT + page). Together that burned through the 5M rows/day free tier.

-- 1. Precomputed browse counts, one row. Written by the Worker the first time
--    it is missing or older than a day (src/lib/sitestats.ts); the nightly
--    import deletes it at the end so the next request rebuilds from fresh data.
CREATE TABLE IF NOT EXISTS site_stats (
  id         INTEGER PRIMARY KEY CHECK (id = 1),
  data       TEXT    NOT NULL,
  updated_at INTEGER NOT NULL
);

-- 2. Full-text index for search. External-content FTS5 over `jobs`, so the
--    text is not stored twice; triggers keep it in sync.
--    tokenchars '+#' keeps "c++" and "c#" as searchable tokens.
CREATE VIRTUAL TABLE IF NOT EXISTS jobs_fts USING fts5(
  title, tags, company, category, location, body,
  content='jobs', content_rowid='id',
  tokenize="unicode61 remove_diacritics 2 tokenchars '+#'"
);

CREATE TRIGGER IF NOT EXISTS jobs_fts_ai AFTER INSERT ON jobs BEGIN
  INSERT INTO jobs_fts(rowid, title, tags, company, category, location, body)
  VALUES (new.id, new.title, new.tags, new.company, new.category, new.location, new.body);
END;

CREATE TRIGGER IF NOT EXISTS jobs_fts_ad AFTER DELETE ON jobs BEGIN
  INSERT INTO jobs_fts(jobs_fts, rowid, title, tags, company, category, location, body)
  VALUES ('delete', old.id, old.title, old.tags, old.company, old.category, old.location, old.body);
END;

-- Only fires when searchable text changes. The nightly last_seen /
-- last_checked stamps touch ~every row and must not rewrite the index.
CREATE TRIGGER IF NOT EXISTS jobs_fts_au AFTER UPDATE OF title, tags, company, category, location, body ON jobs BEGIN
  INSERT INTO jobs_fts(jobs_fts, rowid, title, tags, company, category, location, body)
  VALUES ('delete', old.id, old.title, old.tags, old.company, old.category, old.location, old.body);
  INSERT INTO jobs_fts(rowid, title, tags, company, category, location, body)
  VALUES (new.id, new.title, new.tags, new.company, new.category, new.location, new.body);
END;

-- One-time backfill of existing rows.
INSERT INTO jobs_fts(jobs_fts) VALUES ('rebuild');

-- 3. The default listing sorts by (posted, created_at); index both so deep
--    pages stop sorting thousands of rows.
CREATE INDEX IF NOT EXISTS idx_jobs_posted_created ON jobs(posted DESC, created_at DESC);
