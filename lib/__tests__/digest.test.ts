import { describe, it, expect } from "vitest";
import { groupByCompany, renderDigestHtml, renderQuietPeriodHtml, renderInlineLinks, type UnsentItem } from "../digest";

function item(overrides: Partial<UnsentItem>): UnsentItem {
  return {
    id: crypto.randomUUID(),
    event_type: "material",
    headline: "Some headline",
    source_url: "https://example.com/a",
    published_at: new Date().toISOString(),
    price_change_pct: null,
    summary_text: "Some summary.",
    company_id: "company-1",
    watchlist_companies: { ticker: "ACME", company_name: "Acme Corp" },
    ...overrides,
  };
}

// PRD Section 10, Test Case 4: digest grouping.
describe("groupByCompany", () => {
  it("groups 3 unsent items across 2 companies into 2 groups", () => {
    const items: UnsentItem[] = [
      item({ company_id: "company-1", watchlist_companies: { ticker: "ACME", company_name: "Acme Corp" } }),
      item({ company_id: "company-1", watchlist_companies: { ticker: "ACME", company_name: "Acme Corp" } }),
      item({ company_id: "company-2", watchlist_companies: { ticker: "GLOB", company_name: "Globex Inc" } }),
    ];

    const groups = groupByCompany(items);

    expect(groups).toHaveLength(2);
    expect(groups.map((g) => g.ticker).sort()).toEqual(["ACME", "GLOB"]);
    expect(groups.find((g) => g.ticker === "ACME")?.items).toHaveLength(2);
    expect(groups.find((g) => g.ticker === "GLOB")?.items).toHaveLength(1);
  });

  it("renders a distinct company header per group", () => {
    const items: UnsentItem[] = [
      item({ company_id: "company-1", watchlist_companies: { ticker: "ACME", company_name: "Acme Corp" } }),
      item({ company_id: "company-2", watchlist_companies: { ticker: "GLOB", company_name: "Globex Inc" } }),
    ];
    const groups = groupByCompany(items);
    const html = renderDigestHtml(groups, "", "");

    expect(html).toContain("Acme Corp (ACME)");
    expect(html).toContain("Globex Inc (GLOB)");
  });
});

// PRD Section 10, Test Case 5: empty period sends a "quiet period" email
// instead of being skipped.
describe("renderQuietPeriodHtml", () => {
  it("renders quiet-period copy, not a skip", () => {
    const html = renderQuietPeriodHtml("");
    expect(html).toContain("Quiet period");
    expect(html).toContain("nothing material this cycle");
  });

  it("still includes the watchlist summary section when provided", () => {
    const html = renderQuietPeriodHtml("<div>Your Watchlist</div>");
    expect(html).toContain("Your Watchlist");
  });
});

// Section 4: the disclaimer footer is a non-negotiable guardrail, not
// content that depends on what qualified — every send carries it.
describe("disclaimer footer", () => {
  const DISCLAIMER =
    "This letter is for informational purposes only and is not investment advice or a recommendation to buy, hold or sell any security ever.";

  it("appears on a normal digest with items", () => {
    const items: UnsentItem[] = [item({})];
    const groups = groupByCompany(items);
    const html = renderDigestHtml(groups, "", "");
    expect(html).toContain(DISCLAIMER);
  });

  it("appears on a digest with zero groups", () => {
    const html = renderDigestHtml([], "", "");
    expect(html).toContain(DISCLAIMER);
  });

  it("appears on the quiet-period email", () => {
    const html = renderQuietPeriodHtml("");
    expect(html).toContain(DISCLAIMER);
  });
});

describe("renderInlineLinks", () => {
  it("renders only allow-listed URLs as real links", () => {
    const allowed = new Set(["https://example.com/real"]);
    const text = "Acme rose after [a real event](https://example.com/real) and [an invented one](https://evil.example/fake).";
    const html = renderInlineLinks(text, allowed);

    expect(html).toContain('<a href="https://example.com/real"');
    expect(html).not.toContain("evil.example");
    expect(html).toContain("an invented one");
  });

  it("escapes HTML in plain text to prevent injection", () => {
    const html = renderInlineLinks("<script>alert(1)</script>", new Set());
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
