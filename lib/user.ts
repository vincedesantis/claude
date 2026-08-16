import { getSupabase } from "./supabase";
import { createAuthClient, createReadOnlyAuthClient } from "./supabase-auth";

export type AppUser = {
  id: string;
  email: string;
  created_at: string;
  auth_user_id: string | null;
};

// Resolves (or creates) the public.users profile row for a signed-in
// Supabase Auth account. Three cases, in order:
// 1. Already linked to this auth account — the common case after the first
//    login.
// 2. A legacy profile with no auth link yet (auth_user_id IS NULL) whose
//    email matches — this is the one-time migration path for the row that
//    existed before signup did (Section 2 of the PRD, pre-auth v1). Claims
//    it by linking, carrying its watchlist/history over intact.
// 3. Neither — a genuinely new account, create a fresh profile.
export async function getOrCreateProfile(authUserId: string, email: string): Promise<AppUser> {
  const supabase = getSupabase();

  const { data: linked, error: linkedError } = await supabase
    .from("users")
    .select("*")
    .eq("auth_user_id", authUserId)
    .maybeSingle();
  if (linkedError) throw linkedError;
  if (linked) return linked;

  // Case-insensitive: Supabase Auth normalizes account emails to lowercase,
  // but the legacy row's email came from an env var typed by hand — an
  // exact match would silently fail to claim it over a casing mismatch.
  const { data: legacy, error: legacyError } = await supabase
    .from("users")
    .select("*")
    .is("auth_user_id", null)
    .ilike("email", email)
    .maybeSingle();
  if (legacyError) throw legacyError;

  if (legacy) {
    const { data: claimed, error: claimError } = await supabase
      .from("users")
      .update({ auth_user_id: authUserId })
      .eq("id", legacy.id)
      .select("*")
      .single();
    if (claimError) throw claimError;
    return claimed;
  }

  const { data: created, error: createError } = await supabase
    .from("users")
    .insert({ auth_user_id: authUserId, email })
    .select("*")
    .single();
  if (createError) throw createError;
  return created;
}

async function resolveCurrentUser(
  supabase: Awaited<ReturnType<typeof createAuthClient>>,
): Promise<AppUser | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return null;
  return getOrCreateProfile(user.id, user.email);
}

// For Server Components (e.g. app/page.tsx) — read-only cookie access;
// middleware.ts is what actually persists a refreshed session for these.
export async function getCurrentUser(): Promise<AppUser | null> {
  return resolveCurrentUser(await createReadOnlyAuthClient());
}

// For Route Handlers and Server Actions, where cookies() supports writes.
export async function getCurrentUserForRouteHandler(): Promise<AppUser | null> {
  return resolveCurrentUser(await createAuthClient());
}

// Cron routes have no session — they act on every account with a profile
// row (i.e. everyone who has signed up and loaded the dashboard at least
// once).
export async function listAllUsers(): Promise<AppUser[]> {
  const { data, error } = await getSupabase().from("users").select("*");
  if (error) throw error;
  return data ?? [];
}
