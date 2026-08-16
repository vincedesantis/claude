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

The schema lives in `supabase/migrations/`. Apply all four files, in order, to a
Supabase project via the SQL editor or the Supabase CLI:
- `0001_init.sql` — core tables (`users`, `watchlist_companies`, `news_events`, `digests`)
- `0002_price_alerts.sql` — adds `price_history` and the `52w_high` / `52w_low` /
  `ma200_cross` event types
- `0003_auth.sql` — adds `users.auth_user_id`, linking a profile row to a real
  Supabase Auth account
- `0004_remove_cadence.sql` — drops `users.digest_cadence` and `digests.cadence_at_send`;
  every account now gets one fixed daily digest, no per-account cadence choice

## Authentication setup (one-time, in the Supabase dashboard)

Signup/login is Supabase Auth (email/password) — a few things have to be
configured in the Supabase dashboard itself; none of this is in code:

1. **Get the anon/public API key** (Settings → API) and set it as
   `SUPABASE_ANON_KEY` — this is a different key from `SUPABASE_SERVICE_ROLE_KEY`,
   which the app already uses for all data access. The anon key is only ever
   read server-side (Server Actions / Route Handlers / middleware) — it's
   never sent to the browser.
2. **Confirm Email auth is enabled** (Authentication → Providers) — on by
   default.
3. **Set the Site URL** (Authentication → URL Configuration) to your deployed
   app's URL, and add `<that URL>/auth/confirm` to the **Redirect URLs** allow
   list on the same page — Supabase rejects a redirect target that isn't
   allow-listed, which is the most likely cause if a confirmation link 404s
   or lands somewhere unexpected. **(Not yet done as of the last check-in —
   revisit this before testing signup again.)**
4. **Email confirmation** (Authentication → Settings → "Confirm email"): if
   enabled (the default), a new signup can't log in until they click the link
   in their confirmation email. The app handles this either way — if
   confirmation is required, `signupAction` redirects to `/login` with a
   "check your email" message instead of assuming an active session.
5. *(Optional, smoother UX)* By default the confirmation email links to a
   Supabase-hosted verify page, which then redirects to the Site URL — the
   user still has to log in manually afterward, which is already handled.
   For one-click auto-login on confirmation instead, edit the "Confirm
   signup" email template (Authentication → Email Templates) to link to
   `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email`,
   which `app/auth/confirm/route.ts` exchanges for a session.

**Migrating existing data:** if you already had a single-user row from before
signup existed (its email set via `DIGEST_TO_EMAIL`), just sign up with that
same email address — `lib/user.ts`'s `getOrCreateProfile()` auto-claims that
row on first login instead of creating a new, empty one. No manual SQL
needed.

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
