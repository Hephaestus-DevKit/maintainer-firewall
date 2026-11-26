import { describe, expect, it } from "vitest";
import { jaccardSimilarity, normalizeText, tokenize, truncate } from "../src/text.js";

describe("text helpers", () => {
  it("normalizes and tokenizes text for duplicate matching", () => {
    expect(normalizeText("Fix: Parser_crash!")).toBe("fix  parser crash ");
    expect(tokenize("How to fix parser crash in Node")).toEqual(["fix", "parser", "crash", "node"]);
  });

  it("avoids high duplicate confidence from one-token titles", () => {
    expect(jaccardSimilarity("Crash", "Crash")).toBe(0);
    expect(jaccardSimilarity("Parser crash", "Parser crash on startup")).toBeCloseTo(2 / 3);
  });

  it("truncates long text with an explicit marker", () => {
    const output = truncate("x".repeat(80), 40);

    expect(output.length).toBeLessThanOrEqual(40);
    expect(output).toContain("...[truncated]");
  });

  it("uses the available length without splitting emoji or overflowing a small budget", () => {
    expect(truncate("🦉ABC", 1)).toBe("");
    expect(truncate("🦉ABC", 3)).toBe("🦉A");
    expect(truncate(`🦉${"x".repeat(30)}`, 16)).toBe("\n...[truncated]");
    expect(truncate(`🦉${"x".repeat(30)}`, 17)).toBe("🦉\n...[truncated]");
    expect(truncate("abc", 0)).toBe("");
  });
});
