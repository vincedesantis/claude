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

export type EventClassification = "earnings" | "corporate_action" | "move_related" | "discard";

const VALID_LABELS: EventClassification[] = ["earnings", "corporate_action", "move_related", "discard"];

// earnings and corporate_action are always surfaced regardless of price
// action; move_related is only ever kept by the caller on a day the stock
// actually moved (Section 5.2, tightened per Vince's later filter revision).
const SYSTEM_PROMPT = `You classify news items about a public company for a personal investor digest. For each item, decide exactly one label:
- "earnings": an earnings release, or a guidance raise/cut/revision.
- "corporate_action": M&A activity, an executive change (CEO/CFO), or a regulatory action/investigation.
- "move_related": news that plausibly explains a notable stock price move. Only use this label if the message below says a price move occurred today — never use it otherwise.
- "discard": anything else — minor mentions, routine press releases, opinion pieces, analyst commentary, or unrelated noise.

Respond with only a JSON array of strings, one label per item, in the same order as the input. No other text, no markdown fences.`;

export async function classifyNewsItems(
  ticker: string,
  items: Pick<FinnhubNewsItem, "headline" | "summary" | "source">[],
  moveContext: string,
): Promise<EventClassification[]> {
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

  return safeParseClassifications(text, items.length);
}

function safeParseClassifications(text: string, expectedLength: number): EventClassification[] {
  try {
    const match = text.match(/\[[\s\S]*\]/);
    const raw = JSON.parse(match ? match[0] : text);
    if (!Array.isArray(raw)) throw new Error("response was not a JSON array");

    return Array.from({ length: expectedLength }, (_, i) =>
      VALID_LABELS.includes(raw[i]) ? raw[i] : "discard",
    );
  } catch {
    // Fail closed — an unparseable response discards everything rather than
    // risking noise getting logged (Section 5.2: "discarded, not logged").
    return Array.from({ length: expectedLength }, () => "discard");
  }
}
