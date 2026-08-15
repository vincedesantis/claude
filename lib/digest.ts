import { getSupabase } from "./supabase";
import { getResend } from "./resend";
import { withRetry } from "./retry";
import { listWatchlist } from "./watchlist";
import { isWeekend } from "./market";
import { generateSpotlight } from "./spotlight";
import type { Cadence } from "./settings";

// Section 5.1: daily cadence has no elapsed-time gate — every cron run is a
// send day. Weekly/biweekly/monthly gate on days elapsed since the last send.
const CADENCE_DAYS: Record<Exclude<Cadence, "daily">, number> = {
  weekly: 7,
  biweekly: 14,
  monthly: 30,
};

export type UnsentItem = {
  id: string;
  event_type: "material" | "pr" | "price_trigger" | "52w_high" | "52w_low" | "ma200_cross";
  headline: string;
  source_url: string;
  published_at: string;
  price_change_pct: number | null;
  summary_text: string | null;
  company_id: string;
  watchlist_companies: { ticker: string; company_name: string };
};

async function isSendDay(userId: string, cadence: Cadence): Promise<boolean> {
  if (cadence === "daily") return true;

  const supabase = getSupabase();
  const { data: lastDigest, error } = await supabase
    .from("digests")
    .select("sent_at")
    .eq("user_id", userId)
    .not("sent_at", "is", null)
    .order("sent_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!lastDigest?.sent_at) return true;

  const daysSince = (Date.now() - new Date(lastDigest.sent_at).getTime()) / 86_400_000;
  return daysSince >= CADENCE_DAYS[cadence];
}

async function fetchUnsentItems(userId: string): Promise<UnsentItem[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("news_events")
    .select(
      "id, event_type, headline, source_url, published_at, price_change_pct, summary_text, company_id, watchlist_companies!inner(ticker, company_name, user_id)",
    )
    .is("digest_id", null)
    .eq("watchlist_companies.user_id", userId)
    .order("published_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as UnsentItem[];
}

type TickerMove = { ticker: string; companyName: string; changePct: number | null };

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

// Daily close for every watchlist ticker is already recorded (for the
// 200-day MA calc), so the full watchlist can be shown with each ticker's
// day's move — including ones that also have a headline above — using data
// already on hand, no extra Finnhub calls needed.
async function fetchAllTickerMoves(userId: string): Promise<TickerMove[]> {
  const supabase = getSupabase();
  const companies = await listWatchlist(userId);
  if (companies.length === 0) return [];

  const fiveDaysAgo = new Date();
  fiveDaysAgo.setUTCDate(fiveDaysAgo.getUTCDate() - 5);

  const { data: history, error } = await supabase
    .from("price_history")
    .select("company_id, trade_date, close")
    .in(
      "company_id",
      companies.map((c) => c.id),
    )
    .gte("trade_date", formatDate(fiveDaysAgo))
    .order("trade_date", { ascending: false });
  if (error) throw error;

  const byCompany = new Map<string, { close: number }[]>();
  for (const row of history ?? []) {
    const list = byCompany.get(row.company_id) ?? [];
    list.push({ close: Number(row.close) });
    byCompany.set(row.company_id, list);
  }

  return companies.map((company) => {
    const [latest, previous] = byCompany.get(company.id) ?? [];
    const changePct =
      latest && previous && previous.close > 0
        ? Math.round(((latest.close - previous.close) / previous.close) * 10_000) / 100
        : null;
    return { ticker: company.ticker, companyName: company.company_name, changePct };
  });
}

export type CompanyGroup = { ticker: string; companyName: string; items: UnsentItem[] };

export function groupByCompany(items: UnsentItem[]): CompanyGroup[] {
  const groups = new Map<string, CompanyGroup>();
  for (const item of items) {
    let group = groups.get(item.company_id);
    if (!group) {
      group = {
        ticker: item.watchlist_companies.ticker,
        companyName: item.watchlist_companies.company_name,
        items: [],
      };
      groups.set(item.company_id, group);
    }
    group.items.push(item);
  }
  return Array.from(groups.values());
}

const PRICE_EVENT_TYPES: UnsentItem["event_type"][] = ["price_trigger", "52w_high", "52w_low", "ma200_cross"];

type SpotlightEntry = {
  ticker: string;
  companyName: string;
  headerText: string;
  isUp: boolean | null;
  blurb: string;
  sortKey: number;
  allowedUrls: Set<string>;
};

// One AI-written narrative per company that had a price-based move today,
// synthesizing that day's items into a newsletter-style blurb (Vince's
// "Stock Spotlight" request) — shown above the itemized headlines, which
// stay as-is for anyone who wants the individual sources.
async function buildSpotlights(groups: CompanyGroup[]): Promise<SpotlightEntry[]> {
  const candidates = groups.filter((group) =>
    group.items.some((item) => PRICE_EVENT_TYPES.includes(item.event_type)),
  );

  const entries = await Promise.all(
    candidates.map(async (group) => {
      const priceItem = group.items.find((item) => item.event_type === "price_trigger");
      const highItem = group.items.find((item) => item.event_type === "52w_high");
      const lowItem = group.items.find((item) => item.event_type === "52w_low");
      const maItem = group.items.find((item) => item.event_type === "ma200_cross");

      let headerText: string;
      let isUp: boolean | null;
      let sortKey: number;

      if (priceItem?.price_change_pct != null) {
        const pct = priceItem.price_change_pct;
        headerText = `${pct > 0 ? "▲" : "▼"} ${Math.abs(pct)}%`;
        isUp = pct > 0;
        sortKey = Math.abs(pct);
      } else if (highItem) {
        headerText = "52-week high";
        isUp = true;
        sortKey = 0;
      } else if (lowItem) {
        headerText = "52-week low";
        isUp = false;
        sortKey = 0;
      } else if (maItem) {
        const crossedAbove = maItem.headline.includes("above");
        headerText = crossedAbove ? "crossed above 200-day MA" : "crossed below 200-day MA";
        isUp = crossedAbove;
        sortKey = 0;
      } else {
        headerText = "";
        isUp = null;
        sortKey = 0;
      }

      // With no real news to work from — just a bare price signal — there's
      // nothing to legitimately synthesize. Calling the model here risks it
      // inventing company details from ticker pattern-matching alone (this
      // is exactly what happened with BIRK), so skip it entirely instead.
      const hasRealNews = group.items.some(
        (item) => item.event_type === "material" || item.event_type === "pr",
      );

      const blurb = hasRealNews
        ? await generateSpotlight(
            group.ticker,
            group.companyName,
            group.items.map((item) => ({
              headline: item.headline,
              summary_text: item.summary_text,
              source_url: item.source_url,
            })),
          )
        : `${group.companyName} moved today, but no specific news was found explaining the change.`;
      const allowedUrls = hasRealNews ? new Set(group.items.map((item) => item.source_url)) : new Set<string>();

      return { ticker: group.ticker, companyName: group.companyName, headerText, isUp, blurb, sortKey, allowedUrls };
    }),
  );

  return entries.sort((a, b) => b.sortKey - a.sortKey);
}

const EVENT_LABELS: Record<UnsentItem["event_type"], string> = {
  material: "Material event",
  pr: "Related news",
  price_trigger: "Price move",
  "52w_high": "52-week high",
  "52w_low": "52-week low",
  ma200_cross: "200-day MA cross",
};

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// The model is asked to embed markdown links [text](url) on specific claims,
// but its output is never trusted as-is: only URLs we actually supplied for
// this company are rendered as real links (allowedUrls), everything else —
// invented or altered URLs, or plain text — falls back to plain escaped text.
export function renderInlineLinks(text: string, allowedUrls: Set<string>): string {
  const linkPattern = /\[([^\]]+)\]\(([^)]+)\)/g;
  let result = "";
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = linkPattern.exec(text)) !== null) {
    result += escapeHtml(text.slice(lastIndex, match.index));
    const [, linkText, url] = match;
    result += allowedUrls.has(url)
      ? `<a href="${escapeHtml(url)}" style="color:inherit;text-decoration:underline;">${escapeHtml(linkText)}</a>`
      : escapeHtml(linkText);
    lastIndex = linkPattern.lastIndex;
  }
  result += escapeHtml(text.slice(lastIndex));
  return result;
}

function renderSpotlightHtml(entries: SpotlightEntry[]): string {
  if (entries.length === 0) return "";

  const rows = entries
    .map((entry) => {
      const color = entry.isUp === null ? "#111827" : entry.isUp ? "#15803d" : "#b91c1c";
      return `
        <div style="margin-bottom:20px;">
          <div style="font-size:15px;">
            <span style="font-weight:700;">${escapeHtml(entry.companyName)}</span>
            <span style="color:#71717a;"> $${escapeHtml(entry.ticker)}</span>
            <span style="color:${color};font-weight:600;"> (${escapeHtml(entry.headerText)})</span>
          </div>
          <div style="font-size:14px;color:#3f3f46;margin-top:4px;">${renderInlineLinks(entry.blurb, entry.allowedUrls)}</div>
        </div>`;
    })
    .join("");

  return `
    <div style="margin-bottom:28px;">
      <h2 style="font-size:13px;text-transform:uppercase;letter-spacing:0.04em;color:#71717a;margin-bottom:12px;">Stock Spotlight</h2>
      ${rows}
    </div>`;
}

export function renderDigestHtml(groups: CompanyGroup[], spotlightHtml: string, otherTickersHtml: string): string {
  const sections = groups
    .map((group) => {
      // Price-based signals (price move, 52-week high/low, MA cross) are
      // already covered by this company's Stock Spotlight header above —
      // repeating them here as their own bullet is redundant. Only the
      // actual news items (material/pr) get an itemized entry.
      const detailItems = group.items.filter(
        (item) => !PRICE_EVENT_TYPES.includes(item.event_type),
      );
      if (detailItems.length === 0) return "";

      const rows = detailItems
        .map((item) => {
          return `
            <div style="margin-bottom:16px;">
              <div style="font-size:12px;text-transform:uppercase;letter-spacing:0.04em;color:#71717a;">${escapeHtml(EVENT_LABELS[item.event_type])}</div>
              <div style="font-weight:600;font-size:15px;margin:2px 0;">
                <a href="${escapeHtml(item.source_url)}" style="color:#111827;text-decoration:none;">${escapeHtml(item.headline)}</a>
              </div>
              ${item.summary_text ? `<div style="font-size:14px;color:#3f3f46;">${escapeHtml(item.summary_text)}</div>` : ""}
            </div>`;
        })
        .join("");

      return `
        <div style="margin-bottom:28px;">
          <h2 style="font-size:16px;border-bottom:1px solid #e4e4e7;padding-bottom:6px;">${escapeHtml(group.companyName)} (${escapeHtml(group.ticker)})</h2>
          ${rows}
        </div>`;
    })
    .join("");

  return `
    <div style="font-family:-apple-system,Helvetica,Arial,sans-serif;max-width:600px;margin:0 auto;color:#111827;">
      <h1 style="font-size:20px;">Investor News Digest</h1>
      ${spotlightHtml}
      ${sections}
      ${otherTickersHtml}
      ${DISCLAIMER_HTML}
    </div>`;
}

function renderWatchlistSummaryHtml(moves: TickerMove[]): string {
  if (moves.length === 0) return "";

  const rows = moves
    .map((m) => {
      const display = m.changePct == null ? "—" : `${m.changePct > 0 ? "+" : ""}${m.changePct}%`;
      const color =
        m.changePct == null ? "#71717a" : m.changePct > 0 ? "#15803d" : m.changePct < 0 ? "#b91c1c" : "#71717a";
      return `
        <tr>
          <td style="padding:4px 12px 4px 0;color:#111827;font-size:14px;">${escapeHtml(m.companyName)} (${escapeHtml(m.ticker)})</td>
          <td style="padding:4px 0;color:${color};font-size:14px;text-align:right;">${display}</td>
        </tr>`;
    })
    .join("");

  return `
    <div style="margin-top:32px;padding-top:16px;border-top:1px solid #e4e4e7;">
      <h2 style="font-size:13px;text-transform:uppercase;letter-spacing:0.04em;color:#71717a;margin-bottom:8px;">Your Watchlist</h2>
      <table style="width:100%;border-collapse:collapse;">${rows}</table>
    </div>`;
}

export function renderQuietPeriodHtml(otherTickersHtml: string): string {
  return `
    <div style="font-family:-apple-system,Helvetica,Arial,sans-serif;max-width:600px;margin:0 auto;color:#111827;">
      <h1 style="font-size:20px;">Investor News Digest</h1>
      <p>Quiet period — nothing material this cycle.</p>
      ${otherTickersHtml}
      ${DISCLAIMER_HTML}
    </div>`;
}

// Section 4: non-negotiable guardrail. Every digest send — real or quiet-period
// — carries this disclaimer, regardless of what the LLM-generated content above
// it says.
const DISCLAIMER_HTML = `
    <p style="margin-top:32px;padding-top:16px;border-top:1px solid #e4e4e7;font-size:12px;color:#a1a1aa;">
      This letter is for informational purposes only and is not investment advice or a recommendation to buy, hold or sell any security ever.
    </p>`;

async function buildDigestContent(
  userId: string,
): Promise<{ html: string; subject: string; items: UnsentItem[] }> {
  const items = await fetchUnsentItems(userId);

  const allTickerMoves = await fetchAllTickerMoves(userId);
  const watchlistSummaryHtml = renderWatchlistSummaryHtml(allTickerMoves);

  const groups = groupByCompany(items);
  const spotlights = items.length > 0 ? await buildSpotlights(groups) : [];
  const spotlightHtml = renderSpotlightHtml(spotlights);

  const html =
    items.length > 0
      ? renderDigestHtml(groups, spotlightHtml, watchlistSummaryHtml)
      : renderQuietPeriodHtml(watchlistSummaryHtml);
  const subject =
    items.length > 0
      ? `Investor News Digest — ${items.length} item${items.length === 1 ? "" : "s"}`
      : "Investor News Digest — quiet period";

  return { html, subject, items };
}

// Renders exactly what sendDigest() would send, without sending it and
// without marking anything as sent — for previewing what the next real send
// would look like (also bypasses the weekend/cadence gates, since the point
// is to preview regardless of whether today is actually a send day).
export async function previewDigest(
  userId: string,
): Promise<{ html: string; subject: string; itemCount: number }> {
  const { html, subject, items } = await buildDigestContent(userId);
  return { html, subject, itemCount: items.length };
}

export async function sendDigest(user: {
  id: string;
  email: string;
  digest_cadence: Cadence;
}): Promise<{ sent: boolean; reason?: string; itemCount?: number }> {
  if (isWeekend()) {
    return { sent: false, reason: "market closed (weekend)" };
  }
  if (!(await isSendDay(user.id, user.digest_cadence))) {
    return { sent: false, reason: "not a scheduled send day" };
  }

  const supabase = getSupabase();

  const fromEmail = process.env.RESEND_FROM_EMAIL;
  if (!fromEmail) throw new Error("RESEND_FROM_EMAIL must be set");

  const { html, subject, items } = await buildDigestContent(user.id);

  await withRetry(async () => {
    const { error: sendError } = await getResend().emails.send({
      from: fromEmail,
      to: user.email,
      subject,
      html,
    });
    if (sendError) throw new Error(sendError.message);
  });

  const { data: digest, error: digestError } = await supabase
    .from("digests")
    .insert({
      user_id: user.id,
      sent_at: new Date().toISOString(),
      cadence_at_send: user.digest_cadence,
      item_count: items.length,
    })
    .select("id")
    .single();
  if (digestError) throw digestError;

  if (items.length > 0) {
    const { error: updateError } = await supabase
      .from("news_events")
      .update({ digest_id: digest.id })
      .in(
        "id",
        items.map((item) => item.id),
      );
    if (updateError) throw updateError;
  }

  return { sent: true, itemCount: items.length };
}
