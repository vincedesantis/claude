-- Links the app's `users` profile table to Supabase Auth. v1 had exactly one
-- user, created via lib/user.ts's getOrCreateUser() singleton keyed off the
-- DIGEST_TO_EMAIL env var, with no real login. This migration adds the
-- column real signups get linked through; it's left NULL on the existing
-- row on purpose — lib/user.ts's getOrCreateProfile() auto-claims that row
-- (by matching email) the first time its owner actually logs in, so no
-- manual data migration step is needed.

alter table users add column if not exists auth_user_id uuid unique references auth.users(id) on delete cascade;
