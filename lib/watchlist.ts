import { getSupabase } from "./supabase";

const TICKER_PATTERN = /^[A-Z0-9.\-]{1,10}$/;

export function normalizeTicker(raw: string): string | null {
  const ticker = raw.trim().toUpperCase();
  return TICKER_PATTERN.test(ticker) ? ticker : null;
}

export async function listWatchlist(userId: string) {
  const { data, error } = await getSupabase()
    .from("watchlist_companies")
    .select("id, ticker, company_name, added_at")
    .eq("user_id", userId)
    .order("added_at", { ascending: true });

  if (error) throw error;
  return data;
}

export async function addToWatchlist(userId: string, ticker: string) {
  // company_name is set to the ticker for now; Phase 2's Finnhub integration
  // resolves the real company name at monitoring time.
  const { data, error } = await getSupabase()
    .from("watchlist_companies")
    .insert({ user_id: userId, ticker, company_name: ticker })
    .select("id, ticker, company_name, added_at")
    .single();

  if (error) throw error;
  return data;
}

export async function removeFromWatchlist(userId: string, id: string) {
  const { error } = await getSupabase()
    .from("watchlist_companies")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);

  if (error) throw error;
}

export function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "23505"
  );
}
