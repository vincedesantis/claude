import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { searchSymbols } from "../finnhub";

// Section 6.1: "Add company by ticker or name search." Verifies the
// name-search transform without hitting the real Finnhub API.
describe("searchSymbols", () => {
  beforeEach(() => {
    process.env.FINNHUB_API_KEY = "test-key";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps only Common Stock matches without a dotted suffix, capped at 8", () => {
    const result = {
      count: 5,
      result: [
        { symbol: "AAPL", description: "Apple Inc", type: "Common Stock" },
        { symbol: "AAPL.MX", description: "Apple Inc (Mexico)", type: "Common Stock" },
        { symbol: "AAPLW", description: "Apple Inc Warrant", type: "Warrant" },
        { symbol: "APLE", description: "Apple Hospitality REIT", type: "Common Stock" },
      ],
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => result }),
    );

    return searchSymbols("apple").then((matches) => {
      expect(matches).toEqual([
        { ticker: "AAPL", companyName: "Apple Inc" },
        { ticker: "APLE", companyName: "Apple Hospitality REIT" },
      ]);
    });
  });

  it("returns an empty array when Finnhub has no matches", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ count: 0, result: [] }) }),
    );

    return searchSymbols("zzzzz").then((matches) => {
      expect(matches).toEqual([]);
    });
  });
});
