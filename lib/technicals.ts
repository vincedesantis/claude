import { getSupabase } from "./supabase";
import { fetchBasicFinancials } from "./finnhub";

export type PriceSignal = {
  event_type: "52w_high" | "52w_low" | "ma200_cross";
  headline: string;
};

function todayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

// Finnhub tracks the 52-week high/low along with the date each was set.
// If that date is today, today's close is what just set it.
export async function checkFiftyTwoWeek(ticker: string): Promise<PriceSignal[]> {
  const { metric } = await fetchBasicFinancials(ticker);
  const today = todayDateString();
  const signals: PriceSignal[] = [];

  if (metric["52WeekHigh"] != null && metric["52WeekHighDate"] === today) {
    signals.push({
      event_type: "52w_high",
      headline: `${ticker} hit a new 52-week high of $${metric["52WeekHigh"]}`,
    });
  }
  if (metric["52WeekLow"] != null && metric["52WeekLowDate"] === today) {
    signals.push({
      event_type: "52w_low",
      headline: `${ticker} hit a new 52-week low of $${metric["52WeekLow"]}`,
    });
  }

  return signals;
}

const MA_WINDOW = 200;

// Finnhub's free tier doesn't reliably expose historical daily prices, so
// the 200-day moving average is computed from history this app records
// itself, one day at a time. Returns null (no signal, not an error) until
// at least MA_WINDOW + 1 days of history exist for this company.
export async function recordCloseAndCheckMovingAverage(
  companyId: string,
  ticker: string,
  todayClose: number,
): Promise<PriceSignal | null> {
  const supabase = getSupabase();
  const today = todayDateString();

  const { error: upsertError } = await supabase
    .from("price_history")
    .upsert(
      { company_id: companyId, trade_date: today, close: todayClose },
      { onConflict: "company_id,trade_date" },
    );
  if (upsertError) throw upsertError;

  const { data: history, error: historyError } = await supabase
    .from("price_history")
    .select("close")
    .eq("company_id", companyId)
    .order("trade_date", { ascending: false })
    .limit(MA_WINDOW + 1);
  if (historyError) throw historyError;

  if (!history || history.length < MA_WINDOW + 1) return null;

  const closes = history.map((row) => Number(row.close));
  const todayMA = average(closes.slice(0, MA_WINDOW));
  const yesterdayMA = average(closes.slice(1, MA_WINDOW + 1));
  const yesterdayClose = closes[1];

  const cross = detectMaCross(yesterdayClose, yesterdayMA, todayClose, todayMA);
  return cross ? { event_type: "ma200_cross", headline: `${ticker} crossed ${cross} its 200-day moving average` } : null;
}

function average(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

// Pure so the cross condition itself can be tested without mocking Supabase.
export function detectMaCross(
  yesterdayClose: number,
  yesterdayMA: number,
  todayClose: number,
  todayMA: number,
): "above" | "below" | null {
  if (yesterdayClose <= yesterdayMA && todayClose > todayMA) return "above";
  if (yesterdayClose >= yesterdayMA && todayClose < todayMA) return "below";
  return null;
}
