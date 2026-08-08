const FINNHUB_BASE = "https://finnhub.io/api/v1";

function getApiKey(): string {
  const key = process.env.FINNHUB_API_KEY;
  if (!key) throw new Error("FINNHUB_API_KEY must be set");
  return key;
}

export type FinnhubNewsItem = {
  headline: string;
  summary: string;
  source: string;
  url: string;
  datetime: number; // unix seconds
};

export async function fetchCompanyNews(
  ticker: string,
  from: string,
  to: string,
): Promise<FinnhubNewsItem[]> {
  const url = `${FINNHUB_BASE}/company-news?symbol=${encodeURIComponent(ticker)}&from=${from}&to=${to}&token=${getApiKey()}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Finnhub news request failed for ${ticker}: ${res.status}`);
  }
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

export type FinnhubQuote = {
  c: number; // current/last price
  pc: number; // previous close
};

export async function fetchQuote(ticker: string): Promise<FinnhubQuote> {
  const url = `${FINNHUB_BASE}/quote?symbol=${encodeURIComponent(ticker)}&token=${getApiKey()}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Finnhub quote request failed for ${ticker}: ${res.status}`);
  }
  return res.json();
}
