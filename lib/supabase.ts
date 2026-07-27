import { createClient, SupabaseClient } from "@supabase/supabase-js";

// Server-only client using the service role key — v1 has no auth/RLS-facing
// client because there is no login (Section 4), so every request is trusted
// server-side code, not the end user's browser.
//
// Lazily instantiated so that importing this module (e.g. during `next build`'s
// route data collection) doesn't require env vars to be present at build time —
// they only need to exist when a request actually runs.
let client: SupabaseClient | undefined;

export function getSupabase(): SupabaseClient {
  if (client) return client;

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
  }

  client = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { persistSession: false },
  });
  return client;
}
