import { afterEach, describe, expect, it, vi } from "vitest";
import { analyzeWithAi } from "../src/ai.js";
import { defaultConfig } from "../src/config.js";
import type { IssueSubject } from "../src/types.js";

const subject: IssueSubject = {
  kind: "issue",
  number: 17,
  title: "Crash on startup",
  body: "The app crashes on startup with version 1.2.3.",
  author: "reporter",
  labels: [],
  htmlUrl: "https://github.com/example/repo/issues/17",
  duplicateCandidates: []
};

describe("analyzeWithAi", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("normalizes long multiline AI findings before returning them", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        output_text: JSON.stringify({
          findings: [
            {
              id: `ai.custom.${"x".repeat(120)}`,
              severity: "warning",
              title: `Missing context\n${"title ".repeat(40)}`,
              details: `Line one\n${"details ".repeat(120)}`,
              suggestion: `Please add context\n${"suggestion ".repeat(60)}`,
              label: "needsInfo"
            }
          ]
        })
      })
    }));

    const findings = await analyzeWithAi(subject, {
      ...defaultConfig,
      ai: {
        ...defaultConfig.ai,
        enabled: true
      }
    }, "test-key");

    expect(findings).toHaveLength(1);
    const [finding] = findings;
    expect(finding?.id.length).toBeLessThanOrEqual(80);
    expect(finding?.title.length).toBeLessThanOrEqual(120);
    expect(finding?.details.length).toBeLessThanOrEqual(600);
    expect(finding?.suggestion?.length).toBeLessThanOrEqual(240);
    expect(finding?.title).not.toContain("\n");
    expect(finding?.details).not.toContain("\n");
    expect(finding?.suggestion).not.toContain("\n");
    expect(finding).toMatchObject({
      severity: "warning",
      label: "needsInfo",
      source: "ai"
    });
  });

  it("drops malformed AI findings", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        output_text: JSON.stringify({
          findings: [
            {
              severity: "critical",
              title: "Invalid severity",
              details: "Should be ignored.",
              suggestion: "Ignore.",
              label: "needsInfo"
            },
            {
              severity: "notice",
              title: "Invalid label",
              details: "Should be ignored.",
              suggestion: "Ignore.",
              label: "unknown"
            }
          ]
        })
      })
    }));

    await expect(analyzeWithAi(subject, {
      ...defaultConfig,
      ai: {
        ...defaultConfig.ai,
        enabled: true
      }
    }, "test-key")).resolves.toEqual([]);
  });
});
