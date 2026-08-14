import { getSupabase } from "./supabase";
import { fetchCompanyProfile } from "./finnhub";

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

export async function addToWatchlist(userId: string, ticker: string, knownCompanyName?: string) {
  // If the caller already resolved a name (e.g. the user picked this exact
  // result from the name-search dropdown), trust it and skip the lookup.
  // Otherwise best-effort look it up — fall back to the ticker if Finnhub
  // doesn't have it or the request fails, rather than blocking the add.
  // monitorCompany() self-heals this later if it's still just the ticker by
  // the next monitoring run.
  let companyName = knownCompanyName?.trim() || ticker;
  if (!knownCompanyName) {
    try {
      const profile = await fetchCompanyProfile(ticker);
      if (profile.name) companyName = profile.name;
    } catch (error) {
      console.error(`company profile lookup failed for ${ticker}`, error);
    }
  }

  const { data, error } = await getSupabase()
    .from("watchlist_companies")
    .insert({ user_id: userId, ticker, company_name: companyName })
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
