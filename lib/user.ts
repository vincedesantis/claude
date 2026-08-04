import { getSupabase } from "./supabase";

// v1 is single-user (Section 2 of the PRD) — this lazily creates the one
// `users` row on first use instead of requiring a signup flow.
export async function getOrCreateUser() {
  const supabase = getSupabase();

  const { data: existing, error: selectError } = await supabase
    .from("users")
    .select("*")
    .limit(1)
    .maybeSingle();

  if (selectError) throw selectError;
  if (existing) return existing;

  // Placeholder until DIGEST_TO_EMAIL is configured (wired in the digest-email phase).
  const email = process.env.DIGEST_TO_EMAIL ?? "user@example.local";

  const { data: created, error: insertError } = await supabase
    .from("users")
    .insert({ email })
    .select("*")
    .single();

  if (insertError) throw insertError;
  return created;
}
