import { describe, it, expect } from "vitest";
import { validateSignupInput } from "../auth-validation";

describe("validateSignupInput", () => {
  it("accepts a valid email, matching passwords of sufficient length", () => {
    expect(validateSignupInput("vince@example.com", "correcthorse", "correcthorse")).toBeNull();
  });

  it.each(["not-an-email", "missing-at.com", "no-domain@", "@nodomain.com", "spaces are bad@example.com"])(
    "rejects an invalid email: %s",
    (email) => {
      expect(validateSignupInput(email, "correcthorse", "correcthorse")).toMatch(/valid email/i);
    },
  );

  it("rejects a password under 8 characters", () => {
    expect(validateSignupInput("vince@example.com", "short1", "short1")).toMatch(/at least 8/i);
  });

  it("accepts a password of exactly 8 characters", () => {
    expect(validateSignupInput("vince@example.com", "exactly8", "exactly8")).toBeNull();
  });

  it("rejects mismatched passwords", () => {
    expect(validateSignupInput("vince@example.com", "correcthorse", "different")).toMatch(/don't match/i);
  });

  it("checks email format before password length", () => {
    // Both are invalid — email should be reported first since it's checked first.
    expect(validateSignupInput("bad-email", "short", "short")).toMatch(/valid email/i);
  });
});
