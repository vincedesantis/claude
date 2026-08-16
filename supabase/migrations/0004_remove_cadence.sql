-- Removes the per-account digest cadence setting. Every account now gets a
-- daily digest at a single fixed time for everyone (2:30pm Pacific,
-- vercel.json) rather than a user-chosen daily/weekly/biweekly/monthly
-- schedule — simpler, and there was no real demand for the granularity.

alter table users drop column if exists digest_cadence;
alter table digests drop column if exists cadence_at_send;
