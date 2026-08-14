import { describe, it, expect } from "vitest";
import { computePriceMove } from "../monitor";

// PRD Section 10, Test Case 1: price trigger detection.
describe("computePriceMove", () => {
  it("triggers on a >3% close move (Test Case 1: -6% move)", () => {
    const { priceChangePct, priceTriggered } = computePriceMove({ c: 94, pc: 100 });
    expect(priceChangePct).toBeCloseTo(-6.0, 5);
    expect(priceTriggered).toBe(true);
  });

  it("does not trigger on a move at or under the 3% threshold (Test Case 2: +2% move)", () => {
    const { priceChangePct, priceTriggered } = computePriceMove({ c: 102, pc: 100 });
    expect(priceChangePct).toBeCloseTo(2.0, 5);
    expect(priceTriggered).toBe(false);
  });

  it("does not trigger exactly at the threshold (boundary is exclusive)", () => {
    const { priceTriggered } = computePriceMove({ c: 103, pc: 100 });
    expect(priceTriggered).toBe(false);
  });

  it("triggers just above the threshold", () => {
    const { priceTriggered } = computePriceMove({ c: 103.01, pc: 100 });
    expect(priceTriggered).toBe(true);
  });

  it("triggers on a large upward move", () => {
    const { priceChangePct, priceTriggered } = computePriceMove({ c: 110, pc: 100 });
    expect(priceChangePct).toBeCloseTo(10.0, 5);
    expect(priceTriggered).toBe(true);
  });

  it("returns null and does not trigger when previous close is missing/zero", () => {
    const { priceChangePct, priceTriggered } = computePriceMove({ c: 50, pc: 0 });
    expect(priceChangePct).toBeNull();
    expect(priceTriggered).toBe(false);
  });
});
