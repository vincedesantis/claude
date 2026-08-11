import Anthropic from "@anthropic-ai/sdk";
import type { FinnhubNewsItem } from "./finnhub";

let client: Anthropic | undefined;

function getAnthropic(): Anthropic {
  if (client) return client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY must be set");
  client = new Anthropic({ apiKey });
  return client;
}

export type EventLabel = "earnings" | "corporate_action" | "move_related" | "discard";

export type NewsDecision = {
  label: EventLabel;
  // 1-based index of an earlier item in the same batch covering the same
  // underlying story (different outlets reporting the identical event), or
  // null if this item isn't a duplicate of anything earlier in the batch.
  duplicateOfIndex: number | null;
};

const VALID_LABELS: EventLabel[] = ["earnings", "corporate_action", "move_related", "discard"];

// earnings and corporate_action are always surfaced regardless of price
// action; move_related is only ever kept by the caller on a day the stock
// actually moved (Section 5.2, tightened per Vince's later filter revision).
const SYSTEM_PROMPT = `You classify news items about a public company for a personal investor digest. For each item, decide two things:

1. A label:
- "earnings": an earnings release, or a guidance raise/cut/revision.
- "corporate_action": M&A activity, an executive change (CEO/CFO), or a regulatory action/investigation.
- "move_related": news that plausibly explains a notable stock price move. Only use this label if the message below says a price move occurred today — never use it otherwise.
- "discard": anything else — minor mentions, routine press releases, opinion pieces, analyst commentary, or unrelated noise.

Critically: if an item is not substantively ABOUT the given ticker/company specifically — for example it's primarily about a different company, or it's a broad market roundup that only mentions this ticker in passing — label it "discard" regardless of what it's otherwise about. Only classify items that are actually centered on this company.

2. Whether this item covers the SAME underlying event/story as an earlier item in this same list — different outlets reporting the identical news (e.g. two articles about the same earnings beat, the same lawsuit ruling, the same court decision). If so, give the 1-based index of the first item covering that story. If this item is not a duplicate of anything earlier in the list, use null.

Respond with only a JSON array of objects like {"label": "earnings", "duplicate_of": null}, one per item, in the same order as the input. No other text, no markdown fences.`;

export async function classifyNewsItems(
  ticker: string,
  items: Pick<FinnhubNewsItem, "headline" | "summary" | "source">[],
  moveContext: string,
): Promise<NewsDecision[]> {
  if (items.length === 0) return [];

  const numbered = items
    .map((item, i) => `${i + 1}. [${item.source}] ${item.headline}\n${item.summary}`)
    .join("\n\n");

  const response = await getAnthropic().messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: `Ticker: ${ticker}\n${moveContext}\n\n${numbered}` }],
  });

  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");

  return safeParseDecisions(text, items.length);
}

function safeParseDecisions(text: string, expectedLength: number): NewsDecision[] {
  try {
    const match = text.match(/\[[\s\S]*\]/);
    const raw = JSON.parse(match ? match[0] : text);
    if (!Array.isArray(raw)) throw new Error("response was not a JSON array");

    return Array.from({ length: expectedLength }, (_, i) => {
      const entry = raw[i];
      const label: EventLabel =
        entry && VALID_LABELS.includes(entry.label) ? entry.label : "discard";
      const duplicateOfIndex =
        entry && typeof entry.duplicate_of === "number" && entry.duplicate_of >= 1 && entry.duplicate_of <= expectedLength
          ? entry.duplicate_of
          : null;
      return { label, duplicateOfIndex };
    });
  } catch {
    // Fail closed — an unparseable response discards everything rather than
    // risking noise getting logged (Section 5.2: "discarded, not logged").
    return Array.from({ length: expectedLength }, () => ({ label: "discard" as const, duplicateOfIndex: null }));
  }
}
