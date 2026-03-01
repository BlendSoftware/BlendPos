-- 000009 down: schema normalization patches are irreversible one-time fixes.
-- Renaming constraints back to the old *_key names would re-introduce the GORM
-- compatibility issue.  The down migration is intentionally a no-op.
SELECT 1;
