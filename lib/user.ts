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

  // DIGEST_TO_EMAIL is the source of truth for where digests get sent. If the
  // row predates it being set (or it changes later), keep the row in sync.
  const email = process.env.DIGEST_TO_EMAIL ?? "user@example.local";

  if (existing) {
    if (existing.email === email) return existing;

    const { data: updated, error: updateError } = await supabase
      .from("users")
      .update({ email })
      .eq("id", existing.id)
      .select("*")
      .single();

    if (updateError) throw updateError;
    return updated;
  }

  const { data: created, error: insertError } = await supabase
    .from("users")
    .insert({ email })
    .select("*")
    .single();

  if (insertError) throw insertError;
  return created;
}
