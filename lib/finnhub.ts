import { withRetry } from "./retry";

const FINNHUB_BASE = "https://finnhub.io/api/v1";

export class FinnhubError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "FinnhubError";
    this.status = status;
  }
}

// Network errors and 429/5xx are worth retrying; a 401/403 (e.g. a revoked
// key) won't fix itself on retry, so fail fast instead of burning attempts.
function isRetryableFinnhubError(error: unknown): boolean {
  if (!(error instanceof FinnhubError) || error.status === undefined) return true;
  return error.status === 429 || error.status >= 500;
}

function getApiKey(): string {
  const key = process.env.FINNHUB_API_KEY;
  if (!key) throw new Error("FINNHUB_API_KEY must be set");
  return key;
}

async function finnhubGet(url: string): Promise<unknown> {
  return withRetry(
    async () => {
      const res = await fetch(url);
      if (!res.ok) {
        throw new FinnhubError(`Finnhub request failed: ${res.status}`, res.status);
      }
      return res.json();
    },
    { isRetryable: isRetryableFinnhubError },
  );
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
  const data = await finnhubGet(url);
  return Array.isArray(data) ? (data as FinnhubNewsItem[]) : [];
}

export type FinnhubQuote = {
  c: number; // current/last price
  pc: number; // previous close
};

export async function fetchQuote(ticker: string): Promise<FinnhubQuote> {
  const url = `${FINNHUB_BASE}/quote?symbol=${encodeURIComponent(ticker)}&token=${getApiKey()}`;
  return (await finnhubGet(url)) as FinnhubQuote;
}

export type FinnhubBasicFinancials = {
  metric: {
    "52WeekHigh"?: number;
    "52WeekLow"?: number;
    "52WeekHighDate"?: string;
    "52WeekLowDate"?: string;
  };
};

export async function fetchBasicFinancials(ticker: string): Promise<FinnhubBasicFinancials> {
  const url = `${FINNHUB_BASE}/stock/metric?symbol=${encodeURIComponent(ticker)}&metric=all&token=${getApiKey()}`;
  return (await finnhubGet(url)) as FinnhubBasicFinancials;
}

export type FinnhubCompanyProfile = {
  name?: string;
};

export async function fetchCompanyProfile(ticker: string): Promise<FinnhubCompanyProfile> {
  const url = `${FINNHUB_BASE}/stock/profile2?symbol=${encodeURIComponent(ticker)}&token=${getApiKey()}`;
  return (await finnhubGet(url)) as FinnhubCompanyProfile;
}
