import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

// Auth-flow client only (signup/login/logout/session checks) — separate from
// lib/supabase.ts's service-role client, which is what every data query
// still goes through. Deliberately uses non-NEXT_PUBLIC_ env var names: this
// client is only ever imported from Server Actions, Route Handlers, and
// Server Components, never from a "use client" file, so the anon key must
// never end up in the browser bundle. If that import boundary is ever
// crossed by mistake, an unprefixed env var reads as undefined client-side
// instead of silently shipping the key.
function getEnv() {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error("SUPABASE_URL and SUPABASE_ANON_KEY must be set");
  return { url, anonKey };
}

// For Route Handlers and Server Actions, where cookies() supports writes.
export async function createAuthClient() {
  const { url, anonKey } = getEnv();
  const cookieStore = await cookies();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
      },
    },
  });
}

// For Server Components, where cookies() is read-only — middleware.ts is
// what actually persists refreshed session cookies for these requests.
export async function createReadOnlyAuthClient() {
  const { url, anonKey } = getEnv();
  const cookieStore = await cookies();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll() {
        // No-op — see comment above.
      },
    },
  });
}
