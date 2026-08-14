import { describe, it, expect } from "vitest";
import { enforceGuardrail, type SummarizableEvent } from "../summarize";

const FORBIDDEN_LANGUAGE = /\b(buy|sell|should|recommend|hold)\b/i;

const event: SummarizableEvent = {
  event_type: "material",
  headline: "Acme Corp reports Q2 earnings beat",
};

// PRD Section 10, Test Case 3: advice-language guardrail.
describe("summarize enforceGuardrail", () => {
  it("passes through a clean summary unchanged", () => {
    const clean = "Acme Corp reported Q2 revenue of $1.2B, beating estimates.";
    expect(enforceGuardrail(clean, event, "ACME")).toBe(clean);
    expect(FORBIDDEN_LANGUAGE.test(enforceGuardrail(clean, event, "ACME"))).toBe(false);
  });

  it("rejects a model summary containing advice language and falls back", () => {
    const tainted = "Investors should buy the dip after this earnings beat.";
    const result = enforceGuardrail(tainted, event, "ACME");
    expect(FORBIDDEN_LANGUAGE.test(result)).toBe(false);
    expect(result).toBe(event.headline);
  });

  it("falls back to a generic line when even the headline contains advice language", () => {
    const taintedEvent: SummarizableEvent = {
      event_type: "material",
      headline: "Analysts recommend investors hold the stock",
    };
    const result = enforceGuardrail("should sell now", taintedEvent, "ACME");
    expect(FORBIDDEN_LANGUAGE.test(result)).toBe(false);
    expect(result).toBe("Logged as a material update for ACME.");
  });

  it("falls back to the headline when the model returns null (parse failure)", () => {
    expect(enforceGuardrail(null, event, "ACME")).toBe(event.headline);
  });

  it.each(["buy", "sell", "should", "recommend", "hold", "BUY", "Sold sell-off"])(
    "catches forbidden word variant: %s",
    (word) => {
      const result = enforceGuardrail(`This is a ${word} example.`, event, "ACME");
      expect(FORBIDDEN_LANGUAGE.test(result)).toBe(false);
    },
  );
});
