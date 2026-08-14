# Investor News Digest

See `PRD.md` for the full product spec and `CLAUDE.md` for the fast-reference
build guardrails. Built with Next.js (App Router), Supabase, Finnhub, the
Claude API, and Resend — see `CLAUDE.md` for the locked-in stack.

## Local development

```bash
npm install
npm run dev
```

Copy `.env.example` to `.env.local` and fill in the values before running
anything that touches Supabase, Finnhub, Anthropic, or Resend.

## Database schema

The schema lives in `supabase/migrations/`. Apply both files, in order, to a
Supabase project via the SQL editor or the Supabase CLI:
- `0001_init.sql` — core tables (`users`, `watchlist_companies`, `news_events`, `digests`)
- `0002_price_alerts.sql` — adds `price_history` and the `52w_high` / `52w_low` /
  `ma200_cross` event types

## Health check

`GET /api/health` runs a test query against Supabase to confirm the deployed
app can reach the database (Phase 0 acceptance check).

## Tests

```bash
npm test        # vitest — unit tests, including PRD Section 10's test cases
npm run lint
npx tsc --noEmit
```

All three run in CI on every push/PR (`.github/workflows/ci.yml`).
