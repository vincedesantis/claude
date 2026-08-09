import { getSupabase } from "./supabase";
import { getResend } from "./resend";
import { withRetry } from "./retry";
import type { Cadence } from "./settings";

// Section 5.1: daily cadence has no elapsed-time gate — every cron run is a
// send day. Weekly/biweekly/monthly gate on days elapsed since the last send.
const CADENCE_DAYS: Record<Exclude<Cadence, "daily">, number> = {
  weekly: 7,
  biweekly: 14,
  monthly: 30,
};

type UnsentItem = {
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

type CompanyGroup = { ticker: string; companyName: string; items: UnsentItem[] };

function groupByCompany(items: UnsentItem[]): CompanyGroup[] {
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

const EVENT_LABELS: Record<UnsentItem["event_type"], string> = {
  material: "Material event",
  pr: "Related news",
  price_trigger: "Price move",
  "52w_high": "52-week high",
  "52w_low": "52-week low",
  ma200_cross: "200-day MA cross",
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderDigestHtml(groups: CompanyGroup[]): string {
  const sections = groups
    .map((group) => {
      const rows = group.items
        .map((item) => {
          const priceNote =
            item.price_change_pct != null
              ? ` (${item.price_change_pct > 0 ? "+" : ""}${item.price_change_pct}%)`
              : "";
          return `
            <div style="margin-bottom:16px;">
              <div style="font-size:12px;text-transform:uppercase;letter-spacing:0.04em;color:#71717a;">${escapeHtml(EVENT_LABELS[item.event_type])}${priceNote}</div>
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
      ${sections}
    </div>`;
}

function renderQuietPeriodHtml(): string {
  return `
    <div style="font-family:-apple-system,Helvetica,Arial,sans-serif;max-width:600px;margin:0 auto;color:#111827;">
      <h1 style="font-size:20px;">Investor News Digest</h1>
      <p>Quiet period — nothing material this cycle.</p>
    </div>`;
}

export async function sendDigest(user: {
  id: string;
  email: string;
  digest_cadence: Cadence;
}): Promise<{ sent: boolean; reason?: string; itemCount?: number }> {
  if (!(await isSendDay(user.id, user.digest_cadence))) {
    return { sent: false, reason: "not a scheduled send day" };
  }

  const supabase = getSupabase();
  const items = await fetchUnsentItems(user.id);

  const fromEmail = process.env.RESEND_FROM_EMAIL;
  if (!fromEmail) throw new Error("RESEND_FROM_EMAIL must be set");

  const html = items.length > 0 ? renderDigestHtml(groupByCompany(items)) : renderQuietPeriodHtml();
  const subject =
    items.length > 0
      ? `Investor News Digest — ${items.length} item${items.length === 1 ? "" : "s"}`
      : "Investor News Digest — quiet period";

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
