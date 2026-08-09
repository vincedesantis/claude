-- Adds 52-week high/low and 200-day moving average crossing as their own
-- event types, and a price_history table to compute the moving average
-- (Finnhub's free tier doesn't expose this directly, so it's tracked
-- day-by-day going forward; the 200-day MA won't be computable for a given
-- ticker until ~200 trading days of history have accumulated for it).

alter table news_events drop constraint if exists news_events_event_type_check;
alter table news_events add constraint news_events_event_type_check
  check (event_type in ('material', 'price_trigger', 'pr', '52w_high', '52w_low', 'ma200_cross'));

create table if not exists price_history (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references watchlist_companies(id) on delete cascade,
  trade_date date not null,
  close numeric not null,
  created_at timestamptz not null default now(),
  unique (company_id, trade_date)
);

create index if not exists idx_price_history_company_id on price_history(company_id);
