# PRD: Investor News Digest
**Author:** Vince
**Status:** Multi-user, no billing yet (Phases 0-7 complete) — this doc is kept in sync with the shipped app, not just the original plan
**Last updated:** August 16, 2026
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
**Multi-user, no billing yet.** v1 was single-user with no login (data model carried `user_id` throughout specifically so this wouldn't be a rewrite when it changed). Real signup now exists — Supabase Auth, email/password (Section 6.6) — so multiple people can each run their own isolated watchlist/cadence/digest. Billing/trial enforcement (Section 13's pricing decision) is still not built; anyone who signs up currently gets full access for free.
## 3. Goals & Success Criteria
**Primary success metric:** Vince reads the digest in under 5 minutes and feels fully caught up on everything material across his watchlist.
- Every item: headline + 1-2 sentence "why it matters" + source link. Not full articles.
- Material items never get buried or dropped.
- No noise — if it doesn't clear the filter bar in Section 6, it's discarded, not logged.
**Definition of done for v1:** Vince adds a ticker, the system silently monitors it, and on his chosen cadence he gets one email that fully replaces checking any other source for that period.
## 4. Non-Goals — Hard Guardrails
Claude Code should treat these as boundaries to actively check work against, not areas to improvise:
- **No investment or trading advice/recommendations.** Report facts only. No "buy/sell/hold," no price targets, no opinions. Enforce via prompt constraints on the summarization step (Section 6.3) and validate with the test in Section 10. Every digest send — real or quiet-period — also carries a fixed disclaimer footer, regardless of what the LLM-generated content above it says: *"This letter is for informational purposes only and is not investment advice or a recommendation to buy, hold or sell any security ever."* (`lib/digest.ts`, `DISCLAIMER_HTML`).
- **No trade execution or brokerage connection.** Read-only, always.
- **No real-time push notifications.** Digest only, on the user's chosen cadence — this is the product's core value prop, not a missing feature.
- **No storing or reselling personal data.** Watchlist + one email address per account is the entire personal data surface. No third-party sharing, no analytics resale.
- **No billing/paywall yet.** Signup is open and free (Section 2) — the pricing decision in Section 13 isn't enforced in code.
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
- Add company by ticker or name search — name search backed by Finnhub's symbol search (`GET /api/watchlist/search?q=`), filtered to Common Stock results, debounced autocomplete in the dashboard, capped at 8 matches.
- Remove a company.
- View current watchlist (ticker, company name only — no archive, per Section 4).
- Set digest cadence: daily / weekly / biweekly / monthly (single account-wide setting).
- Requires login (Section 6.6) — the dashboard and every mutating route only ever act on the signed-in account's own data.
### 6.2 Monitoring & Detection (daily cron job)
- For each watchlist ticker: pull news since last check, pull latest close price.
- Apply Section 5.2 filter logic, including the 52-week high/low and 200-day MA cross triggers (Section 5.1) and LLM relevance/duplicate classification for general news.
- Log qualifying items: ticker, headline, source URL, event type, timestamp, price_change_pct if applicable.
- Records a daily close per company to `price_history` regardless of whether anything fired — feeds the 200-day MA calc and the watchlist summary in 6.4.
- Skips entirely on weekends (Saturday/Sunday, UTC-based) — markets are closed, nothing to check.
- Self-heals `company_name` on watchlist rows still stuck on the ticker placeholder (e.g. added before name resolution existed, or a lookup failed at add-time).
- Partial per-ticker failures (a bad Finnhub response, a classification error) don't abort the whole run — the failing ticker is skipped and reported, other tickers still get checked.
### 6.3 Summarization
- Each newly logged item → 1-2 sentence "why it matters" via LLM.
- Hard constraint: no recommendation/advice language (Section 4). Enforced twice: prompted for, then checked in code against the regex in Section 10 Test 3 — the model's own compliance is never trusted alone. On a guardrail trip or a parse failure, falls back to the raw headline, then to a guaranteed-safe generic line.
### 6.4 Digest Compilation & Delivery
- On scheduled send day: pull all unsent items, group by company, render as HTML email, send, mark items sent.
- If zero qualifying items: send the "quiet period" note (Section 5.1).
- Skips entirely on weekends, same as monitoring.
- **Stock Spotlight:** for each company with a price-based trigger that cycle, an AI-written 2-4 sentence narrative synthesizing that day's items (Claude Haiku), shown above the itemized headlines. Sourced inline via markdown links restricted to URLs actually supplied for that company — a model-invented or altered URL is rendered as plain text, never as a link. If the only signal is a bare price move with no real news behind it, the spotlight says so rather than letting the model guess at why (an earlier failure mode: an LLM inventing company/industry details from ticker pattern-matching alone).
- **Your Watchlist:** a summary table at the bottom of every digest — including quiet-period sends — showing every watchlist ticker's move since the prior recorded close, using `price_history` already on hand (no extra Finnhub calls).
- Itemized headline entries only cover actual news (`material`/`pr`); price-based signals (`price_trigger`/`52w_high`/`52w_low`/`ma200_cross`) are represented by the Spotlight header, not repeated as their own line item.
### 6.5 Operational Visibility
- **Digest preview:** `GET /api/preview-digest` renders exactly what the signed-in user's next real send would contain, without sending anything or marking items as sent. Bypasses the weekend/cadence gates, since the point is to preview regardless of whether today is actually a scheduled send day.
- **Failure alerts:** any cron failure (whole-run, or per-user/per-ticker) sends a short plain-text alert email to the operator address (`DIGEST_TO_EMAIL` — Vince, not an individual user) so a bad day is visible without checking Vercel's logs, instead of only a `console.error` nobody reads.
### 6.6 Authentication
- **Provider:** Supabase Auth, email/password. No other stack component added — Supabase was already the DB.
- **Signup/login/logout** are plain HTML forms submitted via Next.js Server Actions (`app/auth/actions.ts`) — no Supabase client code ever runs in the browser, so the Supabase anon key is never shipped to the client (`SUPABASE_ANON_KEY`, read server-only). All existing data access continues through the service-role client (`lib/supabase.ts`) exactly as in v1, just scoped by the session's user ID instead of the old getOrCreateUser() singleton — no RLS dependency was introduced, since the anon key never reaches a context that could query Supabase directly.
- **Session handling:** `proxy.ts` (Next.js 16's middleware convention) refreshes the session cookie on every request and redirects signed-out visits to `/login` (except `/login`, `/signup`, `/auth/confirm`, and everything under `/api/` — API routes 401 with JSON instead of redirecting, since a redirect would silently divert a `fetch()` call into an HTML page).
- **Migrating the pre-auth single-user row:** the one `users` row that existed before signup did is left with `auth_user_id = NULL` (`supabase/migrations/0003_auth.sql`). `lib/user.ts`'s `getOrCreateProfile()` auto-claims it — by matching email, case-insensitively — the first time its owner logs in with a real account, carrying the existing watchlist/cadence/history over with no manual migration step.
- **Email confirmation** is whatever the Supabase project has configured (Authentication → Settings) — the app handles both: if `signUp()` returns an active session immediately, the account is live; if not, the user is told to check their email and log in afterward. Confirmation link handling (`app/auth/confirm/route.ts`) requires an optional Supabase email-template change to activate — the default Supabase-hosted confirmation flow works without it, just without auto-login on confirm. See README's "Authentication setup" section for the dashboard-side steps.
- **Cron routes loop over every account** (`listAllUsers()`) instead of the single implicit user — each account's watchlist is monitored, and each gets their own digest sent to their own account email, independently of every other account's cadence/failures.
## 7. API Contracts
All routes under `/app/api`. Cron routes are internal — accept either the `x-cron-secret` header (manual/API testing) or the `Authorization: Bearer $CRON_SECRET` header Vercel attaches automatically to scheduled runs. Every other route requires a signed-in session (Section 6.6) and returns `401 { "error": "unauthorized" }` without one; each acts only on the signed-in account's own data.

Signup/login/logout aren't JSON APIs — they're Server Actions backing plain HTML forms (`app/auth/actions.ts`, submitted from `app/login/page.tsx` / `app/signup/page.tsx` / the dashboard's logout button), so there's no request/response contract to document beyond: success redirects to `/`, failure redirects back to the form with `?error=`. `GET /auth/confirm` (Route Handler, not a Server Action) is the target of the optional email-confirmation link — see Section 6.6.
```
POST   /api/watchlist
  body: { "ticker": "AAPL", "companyName"?: "Apple Inc." }  // companyName optional — set when
                                                              // the client already resolved it via
                                                              // /api/watchlist/search, skipping a
                                                              // redundant Finnhub lookup
  200:  { "id": "uuid", "ticker": "AAPL", "company_name": "Apple Inc.", "added_at": "iso8601" }
  400:  { "error": "invalid ticker" } | { "error": "ticker already on watchlist" }
GET    /api/watchlist
  200:  [{ "id": "uuid", "ticker": "AAPL", "company_name": "Apple Inc.", "added_at": "iso8601" }, ...]
DELETE /api/watchlist/:id
  204
GET    /api/watchlist/search?q=apple
  200:  [{ "ticker": "AAPL", "companyName": "Apple Inc" }, ...]   // up to 8 matches, Common Stock only
GET    /api/settings
  200:  { "cadence": "weekly" }
PUT    /api/settings
  body: { "cadence": "weekly" }   // daily | weekly | biweekly | monthly
  200:  { "cadence": "weekly" }
  400:  { "error": "invalid cadence" }
GET    /api/health                // Phase 0 acceptance check: confirms the deployed app can reach Supabase
  200:  { "db": "ok", "users_count": 1 }
  500:  { "db": "unreachable", "error": "..." }
GET    /api/preview-digest        // renders the next digest without sending it or marking anything sent
  200:  text/html
GET|POST /api/cron/monitor        // triggered by Vercel Cron, daily (Vercel sends GET; POST also supported)
  headers: { "x-cron-secret": "..." }  // or Authorization: Bearer <CRON_SECRET>
  200:  { "tickers_checked": 8, "items_logged": 2 }
  200:  { "tickers_checked": 0, "items_logged": 0, "skipped": "market closed (weekend)" }
  200:  { "tickers_checked": 8, "items_logged": 2, "failures": [{ "ticker": "AAPL", "message": "..." }] }
  401:  { "error": "unauthorized" }
  500:  { "error": "monitor run failed" }   // also triggers a failure alert email (Section 6.5)
GET|POST /api/cron/digest         // triggered by Vercel Cron, daily (checks internally if today matches cadence)
  headers: { "x-cron-secret": "..." }  // or Authorization: Bearer <CRON_SECRET>
  200:  { "sent": true, "item_count": 5 }
  200:  { "sent": false, "reason": "not a scheduled send day" | "market closed (weekend)" }
  500:  { "error": "digest run failed" }   // also triggers a failure alert email (Section 6.5)
```
## 8. Data Model
```
users
  id, email, digest_cadence, created_at, auth_user_id (nullable, unique, references auth.users)
  -- auth_user_id links a profile row to a real Supabase Auth account (Section
  -- 6.6). NULL only ever occurs on the one pre-auth row that predates signup
  -- existing, until its owner logs in and it gets auto-claimed.
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
| 7 | P1 | Multi-user signup (Supabase Auth, email/password), per-account data isolation, cron looping over every account (Section 6.6) | Sign up with a new account; confirm its watchlist/digest are isolated from other accounts; confirm the pre-auth row auto-claims on first login with its original email |
| 8 | P2 (explicitly deferred) | Billing/trial paywall, digest archive, per-company cadence, intraday price data | Not built — flag if a session drifts toward this |
**Status: Phases 0-7 complete**, plus scope explicitly within the P0-P1 functional requirements that shipped after the initial pass: name search (6.1), 52-week high/low and 200-day MA triggers (5.1/5.2), Stock Spotlight and the watchlist summary section (6.4), digest preview and failure alerts (6.5), multi-user auth (6.6, Phase 7), and an automated test suite for Section 10 (`npm test`, `lib/__tests__/`) replacing the manual spot-checks the acceptance checks above originally called for.
## 10. Test Cases
| # | Behavior | Input | Expected | Assertion |
|---|---|---|---|---|
| 1 | Price trigger detection | Prev close $100, today $94 (-6%) | Logged as `price_trigger`, `price_change_pct: -6.0` | Event exists with correct type + value |
| 2 | Non-qualifying move | Prev close $100, today $102 (+2%), no material news/PR | Nothing logged | `news_events` count unchanged |
| 3 | Advice-language guardrail | Any generated summary | No recommendation language | Summary text does not match `/\b(buy|sell|should|recommend|hold)\b/i` |
| 4 | Digest grouping | 3 unsent items across 2 companies | Digest groups by company | Rendered HTML contains 2 distinct company headers |
| 5 | Empty period | 0 unsent items on a scheduled send day | "Quiet period" email sent | Email sent with fallback copy, not skipped |
Automated in `lib/__tests__/` (`npm test`) against the real production logic — not a reimplementation of it. Test 1/2 run against `computePriceMove` (`lib/monitor.ts`); Test 3 against `enforceGuardrail` in both `lib/summarize.ts` and `lib/spotlight.ts` (the Stock Spotlight narrative carries the same guardrail); Test 4/5 against `groupByCompany` / `renderDigestHtml` / `renderQuietPeriodHtml` (`lib/digest.ts`).
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
Per-company cadence · in-app digest archive · intraday price monitoring · billing/paywall enforcement.

Multi-user accounts + auth were on this list but are now built (Section 6.6, Phase 7) — signup is open and free; only the billing/trial *enforcement* below remains deferred.

**Pricing model (pre-decided for whenever billing gets built):** paid-from-start with a free trial, not a permanent free tier. Rationale: a free tier means carrying Resend/Supabase/Vercel costs indefinitely for non-converting users plus permanent ticker-cap enforcement work; a trial just needs an expiration date and everyone either pays or drops off. Higher signup friction is an acceptable tradeoff for this product — someone who wants a personal portfolio digest is already motivated, so filtering for real intent early is the right shape here. Not actionable until billing (this section) is actually built — Stripe (or similar) isn't in the stack yet.
