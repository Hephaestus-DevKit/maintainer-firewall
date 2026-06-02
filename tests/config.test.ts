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
      },
      rules: {
        disabled: ["issue.environment.missing"],
        severityOverrides: {
          notice: ["pr.tests.missing"]
        }
      }
    });

    expect(config.issue.minBodyCharacters).toBe(200);
    expect(config.comment.postWhen).toBe("always");
    expect(config.rules.disabled).toEqual(["issue.environment.missing"]);
    expect(config.rules.severityOverrides.notice).toEqual(["pr.tests.missing"]);
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
      rules: {
        disabled: [42],
        severityOverrides: {
          critical: ["issue.body.too_short"]
        }
      },
      ignoredUnknownKey: {
        enabled: false
      }
    });

    expect(config.issue).toEqual(defaultConfig.issue);
    expect(config.security.secretPatterns).toEqual(defaultConfig.security.secretPatterns);
    expect(config.security.reportPatterns).toEqual(defaultConfig.security.reportPatterns);
    expect(config.labels.needsInfo).toBe(defaultConfig.labels.needsInfo);
    expect(config.rules).toEqual(defaultConfig.rules);
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
      rules: {
        disabled: ["issue.environment.missing", 42],
        severityOverrides: {
          critical: ["issue.body.too_short"],
          notice: ["pr.tests.missing"]
        }
      },
      ignoredUnknownKey: true
    });

    expect(warnings).toContain("config.issue should be an object; using the default value.");
    expect(warnings).toContain("config.ai.timeoutMs should be a finite number; using the default value.");
    expect(warnings).toContain("config.security.secretPatterns[1] should be a string; using the default value for config.security.secretPatterns.");
    expect(warnings).toContain("config.rules.disabled[1] should be a string; using the default value for config.rules.disabled.");
    expect(warnings).toContain("config.rules.severityOverrides.critical is not a supported config key and will be ignored.");
    expect(warnings).toContain("config.ignoredUnknownKey is not a supported config key and will be ignored.");
  });

  it("reports invalid enum values and below-minimum numbers", () => {
    const warnings = configShapeWarnings({
      comment: {
        postWhen: "sometimes",
        maxFindings: 0
      },
      ai: {
        timeoutMs: 250
      },
      pullRequest: {
        largeChangeThreshold: 0
      }
    });

    expect(warnings).toContain("config.comment.postWhen should be one of: always, findings, never; using the default value.");
    expect(warnings).toContain("config.comment.maxFindings should be at least 1; using 1 during normalization.");
    expect(warnings).toContain("config.ai.timeoutMs should be at least 1000; using 1000 during normalization.");
    expect(warnings).toContain("config.pullRequest.largeChangeThreshold should be at least 1; using 1 during normalization.");
  });
});
