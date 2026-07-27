-- Investor News Digest — initial schema (PRD Section 8)
-- v1 is single-user, but user_id is modeled throughout for a future multi-user version.

create extension if not exists "pgcrypto";

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  digest_cadence text not null default 'weekly'
    check (digest_cadence in ('daily', 'weekly', 'biweekly', 'monthly')),
  created_at timestamptz not null default now()
);

create table if not exists watchlist_companies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  ticker text not null,
  company_name text not null,
  added_at timestamptz not null default now(),
  unique (user_id, ticker)
);

create table if not exists digests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  sent_at timestamptz,
  cadence_at_send text
    check (cadence_at_send in ('daily', 'weekly', 'biweekly', 'monthly')),
  item_count integer not null default 0
);

create table if not exists news_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references watchlist_companies(id) on delete cascade,
  event_type text not null check (event_type in ('material', 'price_trigger', 'pr')),
  headline text not null,
  source_url text not null,
  published_at timestamptz not null,
  price_change_pct numeric,
  summary_text text,
  digest_id uuid references digests(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_watchlist_companies_user_id on watchlist_companies(user_id);
create index if not exists idx_news_events_company_id on news_events(company_id);
create index if not exists idx_news_events_digest_id on news_events(digest_id);

-- v1: single user row, seeded once real email is known via app setup, not hardcoded here.
