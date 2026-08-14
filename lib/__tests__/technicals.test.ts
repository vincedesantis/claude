import { describe, it, expect } from "vitest";
import { detectMaCross } from "../technicals";

// Section 5.1: 200-day moving-average cross trigger.
describe("detectMaCross", () => {
  it("detects a cross above (yesterday at/under MA, today over MA)", () => {
    expect(detectMaCross(99, 100, 101, 100)).toBe("above");
  });

  it("detects a cross below (yesterday at/over MA, today under MA)", () => {
    expect(detectMaCross(101, 100, 99, 100)).toBe("below");
  });

  it("does not fire when staying above the MA both days", () => {
    expect(detectMaCross(105, 100, 106, 100)).toBeNull();
  });

  it("does not fire when staying below the MA both days", () => {
    expect(detectMaCross(95, 100, 94, 100)).toBeNull();
  });

  it("treats sitting exactly on the MA as not-above (boundary case)", () => {
    expect(detectMaCross(100, 100, 100, 100)).toBeNull();
  });
});
