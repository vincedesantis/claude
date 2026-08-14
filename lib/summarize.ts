import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | undefined;

function getAnthropic(): Anthropic {
  if (client) return client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY must be set");
  client = new Anthropic({ apiKey });
  return client;
}

// Section 4/10: summaries must never contain advice/recommendation language.
// This is the exact test used in Section 10's guardrail check.
const FORBIDDEN_LANGUAGE = /\b(buy|sell|should|recommend|hold)\b/i;

export type SummarizableEvent = {
  event_type: "material" | "pr" | "price_trigger" | "52w_high" | "52w_low" | "ma200_cross";
  headline: string;
  price_change_pct?: number;
};

const SYSTEM_PROMPT = `You write short "why it matters" summaries for a personal investor news digest. For each event, write exactly 1-2 plain-English sentences stating only facts.

Hard rule: never use investment or trading advice/recommendation language — no "buy", "sell", "hold", "should", "recommend", and no price targets or opinions. Report what happened, not what to do about it.

Respond with only a JSON array of strings, one summary per event, in the same order as the input. No other text, no markdown fences.`;

export async function summarizeEvents(
  ticker: string,
  events: SummarizableEvent[],
): Promise<string[]> {
  if (events.length === 0) return [];

  const numbered = events
    .map((e, i) => {
      const priceNote =
        e.price_change_pct != null ? ` (price change: ${e.price_change_pct}%)` : "";
      return `${i + 1}. [${e.event_type}] ${e.headline}${priceNote}`;
    })
    .join("\n");

  const response = await getAnthropic().messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: `Ticker: ${ticker}\n\n${numbered}` }],
  });

  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");

  const parsed = safeParseSummaries(text, events.length);
  return parsed.map((summary, i) => enforceGuardrail(summary, events[i], ticker));
}

function safeParseSummaries(text: string, expectedLength: number): (string | null)[] {
  try {
    const match = text.match(/\[[\s\S]*\]/);
    const raw = JSON.parse(match ? match[0] : text);
    if (!Array.isArray(raw)) throw new Error("response was not a JSON array");
    return Array.from({ length: expectedLength }, (_, i) =>
      typeof raw[i] === "string" ? raw[i] : null,
    );
  } catch {
    return Array.from({ length: expectedLength }, () => null);
  }
}

// Deterministic, code-level enforcement of the advice-language guardrail —
// never trust the model's own compliance. Falls back to the raw headline,
// and then to a guaranteed-safe generic line, if needed.
export function enforceGuardrail(
  summary: string | null,
  event: SummarizableEvent,
  ticker: string,
): string {
  if (summary && !FORBIDDEN_LANGUAGE.test(summary)) return summary;
  if (!FORBIDDEN_LANGUAGE.test(event.headline)) return event.headline;
  return `Logged as a ${event.event_type.replace("_", " ")} update for ${ticker}.`;
}
