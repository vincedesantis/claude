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

The schema lives in `supabase/migrations/0001_init.sql`. Apply it to a
Supabase project via the SQL editor or the Supabase CLI.

## Health check

`GET /api/health` runs a test query against Supabase to confirm the deployed
app can reach the database (Phase 0 acceptance check).
