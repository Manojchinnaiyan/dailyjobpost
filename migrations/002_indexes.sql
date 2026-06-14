-- Indexes to stop full-table scans on filtered/listing queries.
-- Without these, every category/type/date filter and ORDER BY posted scans all
-- ~51k rows; these turn them into indexed lookups, cutting D1 rows-read sharply.
CREATE INDEX IF NOT EXISTS idx_jobs_category        ON jobs(category);
CREATE INDEX IF NOT EXISTS idx_jobs_type            ON jobs(type);
CREATE INDEX IF NOT EXISTS idx_jobs_remote          ON jobs(remote);
CREATE INDEX IF NOT EXISTS idx_jobs_posted          ON jobs(posted);
CREATE INDEX IF NOT EXISTS idx_jobs_category_posted ON jobs(category, posted);
