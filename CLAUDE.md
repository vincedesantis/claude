CLAUDE.md — Investor News Digest
Read PRD.md first for full context. This file is the fast-reference version so you don't have to re-derive decisions each session.
Stack (locked in — don't propose alternatives without flagging why)

* Frontend/dashboard: Next.js (App Router) + Tailwind, deployed on Vercel free tier
* Database: Supabase (Postgres), free tier
* News + price data: Finnhub, free tier — one provider covers both, avoid adding a second data source
* Summarization: Claude API, Haiku model (cost-sensitive at this volume)
* Email: Resend, free tier
* Scheduling: Vercel Cron

Env vars needed

```
FINNHUB_API_KEY=
ANTHROPIC_API_KEY=
RESEND_API_KEY=
RESEND_FROM_EMAIL=
DIGEST_TO_EMAIL=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
CRON_SECRET=

```

Non-negotiable guardrails

* No investment/trading advice or recommendation language anywhere in generated summaries
* No trade execution or brokerage integration
* No real-time push notifications — digest only
* No login/auth in v1 (single user, no multi-tenant UI)
* No digest archive/in-app reading in v1 — dashboard is watchlist management only
* No per-company cadence in v1 — one account-level setting

Locked decisions (don't re-ask)

* Price trigger = daily close vs. previous close, >3% (changed from >5%), not intraday
* 52-week high/low and a 200-day moving average cross are their own price-based triggers, alongside the daily % move (Finnhub's basic-financials data covers 52-week high/low immediately; the 200-day MA is computed from price history this app records itself day-by-day, so it isn't available for a given ticker until ~200 trading days of history accumulate)
* Headline/news inclusion: earnings releases and guidance revisions, and corporate actions (M&A, CEO/CFO changes, regulatory actions/investigations), are always surfaced regardless of price action. All other news is only surfaced on a day one of the price-based triggers fired, and only if it's judged as actually related to that move — not just any news published that day.
* Empty digest period = send anyway with a "quiet period" note, don't skip
* Cron skips weekends entirely (both monitor and digest) — markets are closed, nothing to check
* Schedule target: monitor runs at market close (1pm Pacific), digest at 3pm Pacific. Vercel Cron uses fixed UTC times with no DST awareness, so vercel.json's UTC times need a manual one-hour adjustment twice a year (currently set for PDT — recheck after DST changes)

Build order
Follow Section 9 of PRD.md in phase order. Verify each phase's acceptance check before starting the next. Don't jump ahead.
When in doubt
Flag scope questions rather than guessing — especially anything that would edge toward v2 features (Section 13 of PRD.md) or violate a guardrail above.
