# PRD: Investor News Digest
**Author:** Vince
**Status:** Execution-ready v2 — build spec for Claude Code
**Last updated:** July 26, 2026
---
## How to Use This PRD
1. Put this file at the root of a new project folder as `PRD.md`. Also save the companion `CLAUDE.md` (provided alongside this file) in the same folder — it carries the tech stack and guardrails forward into every session so Claude Code doesn't re-derive or drift from them.
2. Open Claude Code in that folder and start with the prompt in **Section 12**.
3. Build in the phase order in **Section 9** — each phase has its own acceptance check. Don't let Claude Code jump ahead to Phase 3 with Phase 1 unverified; that's how scope creep and silent bugs compound.
4. The two decisions in **Section 5.1** were previously open questions — they're now locked in so the build has no ambiguity to guess at. Both are one-line changes if you want them different later.
---
## 1. Problem Statement
Vince holds positions in multiple public companies and can't reliably keep up with news that actually moves those stocks. Checking 5+ sites/apps per company doesn't scale. Existing tools either flood with noise (every headline mention) or are built for professional traders. The gap: a lightweight, personal system that watches a defined list of tickers, filters for what actually matters, and delivers it as a scannable digest on a schedule the user controls.
## 2. Who This Is For
**v1: single user (Vince only). No login, no multi-tenancy.** Data model carries `user_id` so a future multi-user version isn't a rewrite, but no auth/billing/multi-user UI work happens in v1. This possibility does not expand v1 scope.
## 3. Goals & Success Criteria
**Primary success metric:** Vince reads the digest in under 5 minutes and feels fully caught up on everything material across his watchlist.
- Every item: headline + 1-2 sentence "why it matters" + source link. Not full articles.
- Material items never get buried or dropped.
- No noise — if it doesn't clear the filter bar in Section 6, it's discarded, not logged.
**Definition of done for v1:** Vince adds a ticker, the system silently monitors it, and on his chosen cadence he gets one email that fully replaces checking any other source for that period.
## 4. Non-Goals — Hard Guardrails
Claude Code should treat these as boundaries to actively check work against, not areas to improvise:
- **No investment or trading advice/recommendations.** Report facts only. No "buy/sell/hold," no price targets, no opinions. Enforce via prompt constraints on the summarization step (Section 7.3) and validate with the test in Section 10.
- **No trade execution or brokerage connection.** Read-only, always.
- **No real-time push notifications.** Digest only, on the user's chosen cadence — this is the product's core value prop, not a missing feature.
- **No storing or reselling personal data.** Watchlist + one email address is the entire personal data surface. No third-party sharing, no analytics resale.
- **No login/auth system in v1.**
- **No digest archive or in-app reading in v1.** Dashboard is watchlist management only.
- **No per-company cadence in v1.** One account-level cadence setting.
## 5. Core Mechanism
**Watch → Detect → Filter → Summarize → Batch → Send.**
Monitoring runs **daily regardless of digest cadence** — a monthly digest still needs daily checks feeding a running log, or it would miss most of what happened in the gap.
### 5.1 Decisions Locked In (previously open questions)
- **Price trigger measurement:** daily close vs. previous close, >3% either direction (changed from >5%). Not intraday. Change this in `lib/monitor.ts` if intraday matters later — it's a data-source upgrade (Finnhub free tier doesn't give reliable intraday ticks anyway).
- **52-week high/low:** its own trigger, sourced from Finnhub's basic-financials data (`52WeekHigh`/`52WeekLow` + the date each was set) — fires when today is the date Finnhub recorded as setting a new one.
- **200-day moving average cross:** its own trigger. Finnhub's free tier doesn't reliably expose historical daily prices, so this is computed from price history the app records itself, one day at a time (`price_history` table). Not available for a given ticker until ~200 trading days of history have accumulated for it.
- **Empty digest behavior:** if nothing qualified since the last send, **send anyway** with a short "quiet period — nothing material this cycle" note. This confirms the system is alive rather than leaving Vince wondering if it silently broke. Cheap to flip to "skip send" later if it turns out to be annoying.
### 5.2 What Counts as "Moves the Company"
- **Earnings and guidance revisions:** earnings releases, or a guidance raise/cut. Always surfaced regardless of price action.
- **Corporate actions:** M&A activity, executive changes (CEO/CFO), regulatory actions/investigations. Always surfaced regardless of price action.
- **Price-based triggers:** daily close moves >3% vs. previous close, a new 52-week high/low, or a 200-day moving-average cross (Section 5.1). Each fires its own line item.
- **Other news:** everything else — including company press releases — is only surfaced on a day one of the price-based triggers fired above, and only if it's judged as actually explaining that move, not just any news published that day. This is the fuzziest category; implement as an LLM relevance classification, not a keyword filter.
- Anything outside these three buckets is discarded, not logged.
## 6. Functional Requirements
### 6.1 Watchlist Management (Dashboard)
- Add company by ticker or name search.
- Remove a company.
- View current watchlist (ticker, company name only — no archive, per Section 4).
- Set digest cadence: daily / weekly / biweekly / monthly (single account-wide setting).
- No login.
### 6.2 Monitoring & Detection (daily cron job)
- For each watchlist ticker: pull news since last check, pull latest close price.
- Apply Section 5.2 filter logic.
- Log qualifying items: ticker, headline, source URL, event type, timestamp, price_change_pct if applicable.
### 6.3 Summarization
- Each newly logged item → 1-2 sentence "why it matters" via LLM.
- Hard constraint: no recommendation/advice language (Section 4). Validate against Section 10 test case.
### 6.4 Digest Compilation & Delivery
- On scheduled send day: pull all unsent items, group by company, render as HTML email, send, mark items sent.
- If zero qualifying items: send the "quiet period" note (Section 5.1).
## 7. API Contracts
All routes under `/app/api`. Cron routes are internal — secured with a `CRON_SECRET` header, not user-facing.
```
POST   /api/watchlist
  body: { "ticker": "AAPL" }
  200:  { "id": "uuid", "ticker": "AAPL", "company_name": "Apple Inc.", "added_at": "iso8601" }
  400:  { "error": "invalid ticker" }
GET    /api/watchlist
  200:  [{ "id": "uuid", "ticker": "AAPL", "company_name": "Apple Inc.", "added_at": "iso8601" }, ...]
DELETE /api/watchlist/:id
  204
PUT    /api/settings
  body: { "cadence": "weekly" }   // daily | weekly | biweekly | monthly
  200:  { "cadence": "weekly" }
POST   /api/cron/monitor          // triggered by Vercel Cron, daily
  headers: { "x-cron-secret": "..." }
  200:  { "tickers_checked": 8, "items_logged": 2 }
POST   /api/cron/digest           // triggered by Vercel Cron, daily (checks internally if today matches cadence)
  headers: { "x-cron-secret": "..." }
  200:  { "sent": true, "item_count": 5 }
  200:  { "sent": false, "reason": "not a scheduled send day" }
```
## 8. Data Model
```
users
  id, email, digest_cadence, created_at
  -- v1: exactly one row, modeled for future multi-user
watchlist_companies
  id, user_id, ticker, company_name, added_at
news_events
  id, company_id, event_type [material | price_trigger | pr | 52w_high | 52w_low | ma200_cross],
  headline, source_url, published_at,
  price_change_pct (nullable), summary_text,
  digest_id (nullable — set once included in a sent digest)
digests
  id, user_id, sent_at, cadence_at_send, item_count
price_history
  id, company_id, trade_date, close
  -- one row per company per trading day, recorded by the monitoring cron;
  -- feeds the 200-day moving average calculation (Section 5.1)
```
## 9. Build Order & Phases
Each phase should be verified working before the next starts. This is the sequence Claude Code should follow.
| Phase | Priority | Scope | Acceptance Check |
|---|---|---|---|
| 0 | P0 | Scaffold Next.js app, Supabase project + schema from Section 8, env vars wired, empty app deployed to Vercel | Deployed URL loads; DB reachable from a test query |
| 1 | P0 | Watchlist CRUD + dashboard UI + cadence setting | Add/remove tickers from the live URL; data persists in Supabase on reload |
| 2 | P0 | Monitoring cron: pull news + price from Finnhub, apply Section 5.2 filters, log to `news_events` | Manually trigger `/api/cron/monitor`; qualifying items appear in DB with correct `event_type`; non-qualifying items are absent |
| 3 | P0 | Summarization step (Claude API) on logged items | Spot-check 10 generated summaries against the advice-language guardrail (Section 10 test) |
| 4 | P0 | Digest compilation + Resend email delivery + mark-as-sent | Manually trigger `/api/cron/digest`; real email arrives, grouped by company, readable in under 5 minutes |
| 5 | P1 | Empty-period "quiet period" handling | Trigger digest with zero unsent items; confirm fallback email sends |
| 6 | P1 | Error handling + retry on API failures + basic logging so a silent failure day is visible | Kill the Finnhub key temporarily; confirm the failure is logged, not swallowed |
| 7 | P2 (explicitly deferred) | Multi-user auth, digest archive, per-company cadence, intraday price data | Not built in v1 — flag if a session drifts toward this |
## 10. Test Cases
| # | Behavior | Input | Expected | Assertion |
|---|---|---|---|---|
| 1 | Price trigger detection | Prev close $100, today $94 (-6%) | Logged as `price_trigger`, `price_change_pct: -6.0` | Event exists with correct type + value |
| 2 | Non-qualifying move | Prev close $100, today $102 (+2%), no material news/PR | Nothing logged | `news_events` count unchanged |
| 3 | Advice-language guardrail | Any generated summary | No recommendation language | Summary text does not match `/\b(buy|sell|should|recommend|hold)\b/i` |
| 4 | Digest grouping | 3 unsent items across 2 companies | Digest groups by company | Rendered HTML contains 2 distinct company headers |
| 5 | Empty period | 0 unsent items on a scheduled send day | "Quiet period" email sent | Email sent with fallback copy, not skipped |
## 11. Design / UX
- **Direction:** clean, minimal — restrained fintech-newsletter feel, not a trading terminal.
- **Dashboard:** one page. Ticker input, plain list, one cadence dropdown. No widgets, no charts.
- **Email digest:** grouped by company, headline-first, source link per item. Test directly against the 5-minute-read success metric — if a full watchlist digest doesn't scan in under 5 minutes, tighten the summaries before adding UI polish.
## 12. First Prompt for Claude Code
```
Read PRD.md and CLAUDE.md in this folder.
Start with Phase 0 from the Build Order section (Section 9): scaffold the
Next.js project, set up the Supabase schema from Section 8, wire up env
vars, and deploy a skeleton to Vercel.
Ask me for API keys as you reach each integration point rather than
requesting all of them up front. Confirm Phase 0's acceptance check passes
before moving to Phase 1, and do the same at every phase boundary.
Follow the guardrails in Section 4 throughout the build — if any
implementation choice would violate one of them, stop and flag it to me
instead of proceeding.
```
## 13. Explicitly Deferred (v2+)
Per-company cadence · in-app digest archive · multi-user accounts + auth · intraday price monitoring · public launch/billing.
