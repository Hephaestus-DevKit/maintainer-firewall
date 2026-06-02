import { describe, expect, it } from "vitest";
import { configShapeWarnings, defaultConfig, mergeConfig } from "../src/config.js";

describe("mergeConfig", () => {
  it("merges valid partial config values", () => {
    const config = mergeConfig({
      issue: {
        minBodyCharacters: 200
      },
      comment: {
        postWhen: "always"
      }
    });

    expect(config.issue.minBodyCharacters).toBe(200);
    expect(config.comment.postWhen).toBe("always");
  });

  it("falls back to defaults for invalid shapes", () => {
    const config = mergeConfig({
      issue: false,
      security: {
        secretPatterns: "not-an-array",
        reportPatterns: ["\\bCVE-\\d{4}-\\d+\\b", 42]
      },
      labels: {
        needsInfo: 42
      },
      ignoredUnknownKey: {
        enabled: false
      }
    });

    expect(config.issue).toEqual(defaultConfig.issue);
    expect(config.security.secretPatterns).toEqual(defaultConfig.security.secretPatterns);
    expect(config.security.reportPatterns).toEqual(defaultConfig.security.reportPatterns);
    expect(config.labels.needsInfo).toBe(defaultConfig.labels.needsInfo);
    expect("ignoredUnknownKey" in config).toBe(false);
  });

  it("reports unsupported keys and invalid value shapes", () => {
    const warnings = configShapeWarnings({
      issue: false,
      ai: {
        timeoutMs: "soon"
      },
      security: {
        secretPatterns: ["\\btoken\\b", 42]
      },
      ignoredUnknownKey: true
    });

    expect(warnings).toContain("config.issue should be an object; using the default value.");
    expect(warnings).toContain("config.ai.timeoutMs should be a finite number; using the default value.");
    expect(warnings).toContain("config.security.secretPatterns[1] should be a string; using the default value for config.security.secretPatterns.");
    expect(warnings).toContain("config.ignoredUnknownKey is not a supported config key and will be ignored.");
  });
});
