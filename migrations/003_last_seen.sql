-- Delisting / expiry tracking.
--
-- Before this, the only expiry rule was age-based:
--   DELETE FROM jobs WHERE posted < date('now','-45 days')
-- so a posting that was filled or pulled from the company's ATS three days
-- after we imported it stayed on the site (with a dead apply link) for the
-- remaining 42 days. Google's JobPosting guidelines require expired postings
-- to be removed promptly, so age alone is not enough.
--
-- Two independent signals now decide expiry (see scripts/import-jobs.mjs and
-- scripts/expire-jobs.mjs):
--
--   last_seen    date the posting was last found in its source ATS feed.
--                Free to collect (one request per company board), covers the
--                whole corpus. Stops advancing the moment a job is delisted.
--
--   last_checked date we last fetched the posting's own apply_url and got a
--                verdict. Authoritative but one request per job, so it is
--                aimed at the jobs last_seen already flags as suspect.
--
-- Either column at '' means "not tracked" — e.g. jobs created by hand in
-- /admin. Those are never stamped and are never delisting-deleted; only the
-- 45-day age prune applies to them.
ALTER TABLE jobs ADD COLUMN last_seen TEXT NOT NULL DEFAULT '';
ALTER TABLE jobs ADD COLUMN last_checked TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_jobs_last_seen    ON jobs(last_seen);
CREATE INDEX IF NOT EXISTS idx_jobs_last_checked ON jobs(last_checked);

-- Backfill: seed ATS-sourced rows with their posted date so the existing
-- backlog of dead postings becomes eligible for checking immediately instead
-- of being grandfathered in. Safe because the nightly job stamps every live
-- posting BEFORE the prune runs, so anything still in a feed is refreshed to
-- today's date first. Hand-made admin jobs are left at '' (untracked).
-- Greenhouse's absolute_url is often the company's OWN careers domain carrying
-- a ?gh_jid= parameter (careers.sweetgreen.com/jobs/123?gh_jid=123), so the
-- host alone does not identify an ATS-sourced row — match gh_jid too.
UPDATE jobs SET last_seen = posted
WHERE last_seen = ''
  AND (apply_url LIKE '%gh_jid%'
    OR apply_url LIKE '%greenhouse.io%'
    OR apply_url LIKE '%lever.co%'
    OR apply_url LIKE '%ashbyhq.com%');
