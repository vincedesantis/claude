import { describe, it, expect } from "vitest";
import { enforceGuardrail, type SpotlightItem } from "../spotlight";

const FORBIDDEN_LANGUAGE = /\b(buy|sell|should|recommend|hold)\b/i;

const items: SpotlightItem[] = [
  {
    headline: "Acme Corp reports Q2 earnings beat",
    summary_text: "Acme Corp beat Q2 revenue estimates by 8%.",
    source_url: "https://example.com/acme-q2",
  },
];

// PRD Section 10, Test Case 3: advice-language guardrail, applied to the
// Stock Spotlight narrative as well as the itemized summaries.
describe("spotlight enforceGuardrail", () => {
  it("passes through a clean blurb unchanged", () => {
    const clean = "Acme Corp's stock rose after [beating Q2 estimates](https://example.com/acme-q2).";
    expect(enforceGuardrail(clean, items)).toBe(clean);
  });

  it("falls back to item summaries when the blurb contains advice language", () => {
    const tainted = "Investors should consider this a buy after the beat.";
    const result = enforceGuardrail(tainted, items);
    expect(FORBIDDEN_LANGUAGE.test(result)).toBe(false);
    expect(result).toBe(items[0].summary_text);
  });

  it("falls back to a generic line when item summaries also contain advice language", () => {
    const taintedItems: SpotlightItem[] = [
      { headline: "Analysts recommend holding", summary_text: null, source_url: "https://example.com/x" },
    ];
    const result = enforceGuardrail("should buy", taintedItems);
    expect(FORBIDDEN_LANGUAGE.test(result)).toBe(false);
    expect(result).toBe("See the linked headlines below for details.");
  });

  it("treats an empty blurb as needing fallback", () => {
    const result = enforceGuardrail("", items);
    expect(result).toBe(items[0].summary_text);
  });
});
