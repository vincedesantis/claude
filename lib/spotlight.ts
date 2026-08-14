import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | undefined;

function getAnthropic(): Anthropic {
  if (client) return client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY must be set");
  client = new Anthropic({ apiKey });
  return client;
}

// Same guardrail as lib/summarize.ts — see that file for why this is
// enforced in code, not just prompted for.
const FORBIDDEN_LANGUAGE = /\b(buy|sell|should|recommend|hold)\b/i;

export type SpotlightItem = { headline: string; summary_text: string | null; source_url: string };

const SYSTEM_PROMPT = `You write a short "Stock Spotlight" blurb for a personal investor newsletter — a tight, factual 2-4 sentence narrative synthesizing what happened and why the stock moved. Use concrete numbers (revenue, EPS, guidance) when given. Report facts only, in a natural newsletter voice, not a bullet list.

Link specific phrases inline using markdown syntax, e.g. "after [the company's founder](https://example.com/article) built a stake". Use ONLY the exact URLs given to you below, one per source item — never invent or alter a URL. Link the specific claim that came from that source, not the whole sentence. Not every clause needs a link — only the ones tied to a specific source below.

Hard rule: use ONLY facts stated in the items given to you below. Never state or imply anything about the company — its industry, sector, business description, or full legal name — that isn't explicitly present in that context, even if you think you recognize the ticker. If the given items don't say what industry or business the company is in, don't guess or mention one.

Hard rule: never use investment or trading advice/recommendation language — no "buy", "sell", "hold", "should", "recommend", and no price targets or opinions.

Respond with only the blurb text (with inline markdown links where appropriate). No headline, no ticker, no surrounding quotes — just the paragraph.`;

export async function generateSpotlight(
  ticker: string,
  companyName: string,
  items: SpotlightItem[],
): Promise<string> {
  const context = items
    .map((item) => `- ${item.headline}${item.summary_text ? `: ${item.summary_text}` : ""} (source: ${item.source_url})`)
    .join("\n");

  const response = await getAnthropic().messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 400,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: `${companyName} (${ticker})\n\n${context}` }],
  });

  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("")
    .trim();

  return enforceGuardrail(text, items);
}

export function enforceGuardrail(text: string, items: SpotlightItem[]): string {
  if (text && !FORBIDDEN_LANGUAGE.test(text)) return text;
  const fallback = items.map((item) => item.summary_text ?? item.headline).join(" ");
  if (fallback && !FORBIDDEN_LANGUAGE.test(fallback)) return fallback;
  return "See the linked headlines below for details.";
}
