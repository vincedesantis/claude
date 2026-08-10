import { getSupabase } from "./supabase";
import { fetchCompanyNews, fetchQuote } from "./finnhub";
import { classifyNewsItems } from "./classify";
import { summarizeEvents } from "./summarize";
import { checkFiftyTwoWeek, recordCloseAndCheckMovingAverage } from "./technicals";

const PRICE_TRIGGER_THRESHOLD_PCT = 3; // daily close vs. previous close, not intraday.

type WatchlistCompany = {
  id: string;
  ticker: string;
  added_at: string;
};

type NewsEventRow = {
  company_id: string;
  event_type: "material" | "pr" | "price_trigger" | "52w_high" | "52w_low" | "ma200_cross";
  headline: string;
  source_url: string;
  published_at: string;
  price_change_pct?: number;
  summary_text?: string;
};

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function yahooFinanceUrl(ticker: string): string {
  return `https://finance.yahoo.com/quote/${encodeURIComponent(ticker)}`;
}

// Monitors one company: pulls news + price since the last logged event,
// checks the price-based triggers (daily move, 52-week high/low, 200-day MA
// cross), classifies news, and logs qualifying items. General news only
// gets surfaced on a day one of the price triggers fired — earnings and
// corporate actions (M&A, exec changes, regulatory) are always surfaced
// regardless of price action. Returns the number of news_events rows
// inserted.
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

  const rows: NewsEventRow[] = [];

  // Price-based signals are recomputed from scratch on every run (unlike
  // real news, which is naturally deduped by article URL), so a repeat run
  // on the same calendar day — a second manual trigger, a retried cron —
  // would otherwise log the same signal twice. Track what's already been
  // logged today per event type and skip re-inserting it.
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const { data: todaysPriceEvents, error: todaysPriceEventsError } = await supabase
    .from("news_events")
    .select("event_type")
    .eq("company_id", company.id)
    .in("event_type", ["price_trigger", "52w_high", "52w_low", "ma200_cross"])
    .gte("published_at", todayStart.toISOString());
  if (todaysPriceEventsError) throw todaysPriceEventsError;
  const alreadyLoggedToday = new Set((todaysPriceEvents ?? []).map((e) => e.event_type));

  const priceChangePct = quote.pc > 0 ? ((quote.c - quote.pc) / quote.pc) * 100 : null;
  const priceTriggered =
    priceChangePct !== null && Math.abs(priceChangePct) > PRICE_TRIGGER_THRESHOLD_PCT;

  if (priceTriggered && priceChangePct !== null && !alreadyLoggedToday.has("price_trigger")) {
    const rounded = Math.round(priceChangePct * 100) / 100;
    rows.push({
      company_id: company.id,
      event_type: "price_trigger",
      headline: `${company.ticker} closed ${rounded > 0 ? "+" : ""}${rounded}% versus previous close`,
      source_url: yahooFinanceUrl(company.ticker),
      published_at: new Date().toISOString(),
      price_change_pct: rounded,
    });
  }

  // Best-effort: missing/unavailable data here shouldn't fail the whole
  // ticker's check, just skip that particular signal.
  let fiftyTwoWeekFired = false;
  try {
    for (const signal of await checkFiftyTwoWeek(company.ticker)) {
      fiftyTwoWeekFired = true;
      if (alreadyLoggedToday.has(signal.event_type)) continue;
      rows.push({
        company_id: company.id,
        event_type: signal.event_type,
        headline: signal.headline,
        source_url: yahooFinanceUrl(company.ticker),
        published_at: new Date().toISOString(),
      });
    }
  } catch (error) {
    console.error(`52-week high/low check failed for ${company.ticker}`, error);
  }

  let maSignalFired = false;
  try {
    const maSignal = await recordCloseAndCheckMovingAverage(company.id, company.ticker, quote.c);
    if (maSignal) {
      maSignalFired = true;
      if (!alreadyLoggedToday.has(maSignal.event_type)) {
        rows.push({
          company_id: company.id,
          event_type: maSignal.event_type,
          headline: maSignal.headline,
          source_url: yahooFinanceUrl(company.ticker),
          published_at: new Date().toISOString(),
        });
      }
    }
  } catch (error) {
    console.error(`200-day moving average check failed for ${company.ticker}`, error);
  }

  // Based on the underlying condition, not just what got newly inserted —
  // a repeat run on a real move day should still gate news the same way.
  const isMoveDay = priceTriggered || fiftyTwoWeekFired || maSignalFired;

  const { data: existing, error: existingError } = await supabase
    .from("news_events")
    .select("source_url")
    .eq("company_id", company.id);
  if (existingError) throw existingError;
  const existingUrls = new Set((existing ?? []).map((e) => e.source_url));

  const candidates = newsItems.filter((item) => item.url && !existingUrls.has(item.url));

  const moveContext = isMoveDay
    ? `A price move occurred today (${priceChangePct !== null ? `${priceChangePct.toFixed(1)}% vs. previous close` : "52-week high/low or moving-average cross"}).`
    : "No qualifying price move occurred today.";

  const classifications = await classifyNewsItems(company.ticker, candidates, moveContext);

  candidates.forEach((item, i) => {
    const label = classifications[i];
    if (label === "discard") return;
    if (label === "move_related" && !isMoveDay) return; // only on days the stock actually moved

    rows.push({
      company_id: company.id,
      event_type: label === "move_related" ? "pr" : "material",
      headline: item.headline,
      source_url: item.url,
      published_at: new Date(item.datetime * 1000).toISOString(),
    });
  });

  if (rows.length === 0) return 0;

  const summaries = await summarizeEvents(
    company.ticker,
    rows.map((row) => ({
      event_type: row.event_type,
      headline: row.headline,
      price_change_pct: row.price_change_pct,
    })),
  );
  rows.forEach((row, i) => {
    row.summary_text = summaries[i];
  });

  const { error: insertError } = await supabase.from("news_events").insert(rows);
  if (insertError) throw insertError;

  return rows.length;
}
