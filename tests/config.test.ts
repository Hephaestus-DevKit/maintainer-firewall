import { describe, expect, it, vi } from "vitest";
import { configShapeWarnings, defaultConfig, loadConfigWithDiagnostics, mergeConfig } from "../src/config.js";

vi.mock("@actions/core", () => ({
  info: vi.fn(),
  warning: vi.fn()
}));

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

  it("diagnoses unsupported versions, unsafe numbers, and inherited property names", () => {
    const override = JSON.parse(`{
      "version": 2,
      "comment": { "maxFindings": 1.5, "constructor": "unsupported" },
      "ai": { "timeoutMs": 2147483648, "maxOutputTokens": 9007199254740992 },
      "__proto__": { "unknown": true }
    }`);
    const config = mergeConfig(override);

    expect(config.version).toBe(1);
    expect(config.comment).toEqual(defaultConfig.comment);
    expect(config.ai.maxOutputTokens).toBe(defaultConfig.ai.maxOutputTokens);
    expect(config.ai.timeoutMs).toBe(2_147_483_647);
    expect(configShapeWarnings(override)).toEqual(expect.arrayContaining([
      "config.version should be 1; using the supported config version.",
      "config.comment.maxFindings should be a safe integer; using the default value.",
      "config.comment.constructor is not a supported config key and will be ignored.",
      "config.ai.timeoutMs should be at most 2147483647; using 2147483647 during normalization.",
      "config.ai.maxOutputTokens should be a safe integer; using the default value.",
      "config.__proto__ is not a supported config key and will be ignored."
    ]));
  });
});

describe("loadConfigWithDiagnostics", () => {
  it("loads and merges repository config files", async () => {
    const octokit = octokitWithContent("version: 1\ncomment:\n  postWhen: always\n");

    const result = await loadConfigWithDiagnostics(octokit as never, "octo", "repo", ".maintainer-firewall.yml", "main");

    expect(result.config.comment.postWhen).toBe("always");
    expect(result.warnings).toEqual([]);
    expect(octokit.rest.repos.getContent).toHaveBeenCalledWith({
      owner: "octo",
      repo: "repo",
      path: ".maintainer-firewall.yml",
      ref: "main"
    });
  });

  it("falls back to defaults when config is missing", async () => {
    const octokit = {
      rest: {
        repos: {
          getContent: async () => {
            throw { status: 404 };
          }
        }
      }
    };

    const result = await loadConfigWithDiagnostics(octokit as never, "octo", "repo", ".maintainer-firewall.yml");

    expect(result.config).toEqual(defaultConfig);
    expect(result.warnings).toEqual([]);
  });

  it("warns and falls back when config path is not a file", async () => {
    const octokit = {
      rest: {
        repos: {
          getContent: async () => ({
            data: [
              {
                type: "file",
                name: "config.yml"
              }
            ]
          })
        }
      }
    };

    const result = await loadConfigWithDiagnostics(octokit as never, "octo", "repo", ".maintainer-firewall.yml");

    expect(result.config).toEqual(defaultConfig);
    expect(result.warnings).toEqual([".maintainer-firewall.yml is not a file. Falling back to defaults."]);
  });

  it("warns and falls back on non-404 load errors", async () => {
    const octokit = {
      rest: {
        repos: {
          getContent: async () => {
            throw new Error("rate limited");
          }
        }
      }
    };

    const result = await loadConfigWithDiagnostics(octokit as never, "octo", "repo", ".maintainer-firewall.yml");

    expect(result.config).toEqual(defaultConfig);
    expect(result.warnings).toEqual(["Failed to load .maintainer-firewall.yml: rate limited. Using defaults."]);
  });
});

function octokitWithContent(content: string) {
  return {
    rest: {
      repos: {
        getContent: vi.fn().mockResolvedValue({
          data: {
            type: "file",
            content: Buffer.from(content, "utf8").toString("base64")
          }
        })
      }
    }
  };
}
