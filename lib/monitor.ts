import { getSupabase } from "./supabase";
import { fetchCompanyNews, fetchQuote } from "./finnhub";
import { classifyNewsItems } from "./classify";

const PRICE_TRIGGER_THRESHOLD_PCT = 5; // Section 5.1 — daily close vs. previous close, not intraday.

type WatchlistCompany = {
  id: string;
  ticker: string;
  added_at: string;
};

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

// Monitors one company: pulls news + price since the last logged event,
// classifies news via Section 5.2's rules, and logs qualifying items.
// Returns the number of news_events rows inserted.
export async function monitorCompany(company: WatchlistCompany): Promise<number> {
  const supabase = getSupabase();

  const { data: latestEvent, error: latestError } = await supabase
    .from("news_events")
    .select("published_at")
    .eq("company_id", company.id)
    .order("published_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latestError) throw latestError;

  const sinceDate = latestEvent?.published_at
    ? new Date(latestEvent.published_at)
    : new Date(company.added_at);
  // Always look back at least 2 days so a missed cron run doesn't create a gap.
  const twoDaysAgo = new Date();
  twoDaysAgo.setUTCDate(twoDaysAgo.getUTCDate() - 2);
  const from = formatDate(sinceDate < twoDaysAgo ? sinceDate : twoDaysAgo);
  const to = formatDate(new Date());

  const [newsItems, quote] = await Promise.all([
    fetchCompanyNews(company.ticker, from, to),
    fetchQuote(company.ticker),
  ]);

  const { data: existing, error: existingError } = await supabase
    .from("news_events")
    .select("source_url")
    .eq("company_id", company.id);
  if (existingError) throw existingError;
  const existingUrls = new Set((existing ?? []).map((e) => e.source_url));

  const candidates = newsItems.filter((item) => item.url && !existingUrls.has(item.url));
  const classifications = await classifyNewsItems(company.ticker, candidates);

  type NewsEventRow = {
    company_id: string;
    event_type: "material" | "pr" | "price_trigger";
    headline: string;
    source_url: string;
    published_at: string;
    price_change_pct?: number;
  };
  const rows: NewsEventRow[] = [];

  candidates.forEach((item, i) => {
    const label = classifications[i];
    if (label !== "material" && label !== "pr") return;
    rows.push({
      company_id: company.id,
      event_type: label,
      headline: item.headline,
      source_url: item.url,
      published_at: new Date(item.datetime * 1000).toISOString(),
    });
  });

  const priceChangePct =
    quote.pc > 0 ? ((quote.c - quote.pc) / quote.pc) * 100 : null;

  if (priceChangePct !== null && Math.abs(priceChangePct) > PRICE_TRIGGER_THRESHOLD_PCT) {
    const rounded = Math.round(priceChangePct * 100) / 100;
    rows.push({
      company_id: company.id,
      event_type: "price_trigger",
      headline: `${company.ticker} closed ${rounded > 0 ? "+" : ""}${rounded}% versus previous close`,
      source_url: `https://finance.yahoo.com/quote/${encodeURIComponent(company.ticker)}`,
      published_at: new Date().toISOString(),
      price_change_pct: rounded,
    });
  }

  if (rows.length === 0) return 0;

  const { error: insertError } = await supabase.from("news_events").insert(rows);
  if (insertError) throw insertError;

  return rows.length;
}
