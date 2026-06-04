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
});
