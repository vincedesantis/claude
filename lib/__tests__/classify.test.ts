import { describe, it, expect } from "vitest";
import { safeParseDecisions } from "../classify";

// Section 3: "No noise — if it doesn't clear the filter bar in Section 6,
// it's discarded, not logged." safeParseDecisions is the fail-closed backstop
// for that guarantee when the model's response can't be trusted as-is.
describe("safeParseDecisions", () => {
  it("parses a well-formed response", () => {
    const text = '[{"label":"earnings","duplicate_of":null},{"label":"discard","duplicate_of":1}]';
    expect(safeParseDecisions(text, 2)).toEqual([
      { label: "earnings", duplicateOfIndex: null },
      { label: "discard", duplicateOfIndex: 1 },
    ]);
  });

  it("strips surrounding prose/markdown fences before parsing", () => {
    const text = 'Here you go:\n```json\n[{"label":"corporate_action","duplicate_of":null}]\n```';
    expect(safeParseDecisions(text, 1)).toEqual([{ label: "corporate_action", duplicateOfIndex: null }]);
  });

  it("fails closed to all-discard on unparseable JSON", () => {
    expect(safeParseDecisions("not json at all", 3)).toEqual([
      { label: "discard", duplicateOfIndex: null },
      { label: "discard", duplicateOfIndex: null },
      { label: "discard", duplicateOfIndex: null },
    ]);
  });

  it("fails closed to all-discard when the top-level value isn't an array", () => {
    expect(safeParseDecisions('{"label":"earnings"}', 1)).toEqual([
      { label: "discard", duplicateOfIndex: null },
    ]);
  });

  it("falls back to discard for an invalid/unrecognized label", () => {
    const text = '[{"label":"buy_recommendation","duplicate_of":null}]';
    expect(safeParseDecisions(text, 1)).toEqual([{ label: "discard", duplicateOfIndex: null }]);
  });

  it("falls back to discard when an entry is missing entirely (short array)", () => {
    const text = '[{"label":"earnings","duplicate_of":null}]';
    expect(safeParseDecisions(text, 3)).toEqual([
      { label: "earnings", duplicateOfIndex: null },
      { label: "discard", duplicateOfIndex: null },
      { label: "discard", duplicateOfIndex: null },
    ]);
  });

  it.each([0, -1, 2, 1.5, "1", null])(
    "treats an out-of-range or non-integer duplicate_of (%s) as null",
    (dup) => {
      const text = JSON.stringify([{ label: "move_related", duplicate_of: dup }]);
      expect(safeParseDecisions(text, 1)).toEqual([{ label: "move_related", duplicateOfIndex: null }]);
    },
  );

  it("accepts a duplicate_of at the bounds (1 and expectedLength)", () => {
    const text = '[{"label":"discard","duplicate_of":1},{"label":"discard","duplicate_of":2}]';
    expect(safeParseDecisions(text, 2)).toEqual([
      { label: "discard", duplicateOfIndex: 1 },
      { label: "discard", duplicateOfIndex: 2 },
    ]);
  });

  it("returns an empty array when expectedLength is 0", () => {
    expect(safeParseDecisions("[]", 0)).toEqual([]);
  });
});
