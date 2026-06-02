import { describe, expect, it } from "vitest";
import { defaultConfig } from "../src/config.js";
import { applyFindingPolicy } from "../src/finding-policy.js";
import type { Finding, FirewallConfig } from "../src/types.js";

const findings: Finding[] = [
  finding("issue.environment.missing", "notice"),
  finding("pr.tests.missing", "warning"),
  finding("content.security_report.possible", "warning")
];

describe("applyFindingPolicy", () => {
  it("suppresses exact disabled finding IDs", () => {
    const filtered = applyFindingPolicy(findings, config({
      disabled: ["issue.environment.missing"]
    }));

    expect(filtered.map((item) => item.id)).toEqual([
      "pr.tests.missing",
      "content.security_report.possible"
    ]);
  });

  it("overrides finding severity before downstream review", () => {
    const adjusted = applyFindingPolicy(findings, config({
      severityOverrides: {
        notice: ["pr.tests.missing"],
        warning: [],
        error: ["issue.environment.missing"]
      }
    }));

    expect(adjusted.find((item) => item.id === "pr.tests.missing")?.severity).toBe("notice");
    expect(adjusted.find((item) => item.id === "issue.environment.missing")?.severity).toBe("error");
  });

  it("lets disabled findings win over severity overrides", () => {
    const adjusted = applyFindingPolicy(findings, config({
      disabled: ["pr.tests.missing"],
      severityOverrides: {
        notice: ["pr.tests.missing"],
        warning: [],
        error: []
      }
    }));

    expect(adjusted.some((item) => item.id === "pr.tests.missing")).toBe(false);
  });

  it("does not suppress or downgrade protected secret findings", () => {
    const adjusted = applyFindingPolicy([
      finding("content.secret.possible", "error")
    ], config({
      disabled: ["content.secret.possible"],
      severityOverrides: {
        notice: ["content.secret.possible"],
        warning: [],
        error: []
      }
    }));

    expect(adjusted).toHaveLength(1);
    expect(adjusted[0]?.severity).toBe("error");
  });
});

function finding(id: string, severity: Finding["severity"]): Finding {
  return {
    id,
    severity,
    title: id,
    details: "Details.",
    source: "rule"
  };
}

function config(rules: Partial<FirewallConfig["rules"]>): FirewallConfig {
  return {
    ...defaultConfig,
    rules: {
      disabled: rules.disabled ?? [],
      severityOverrides: {
        notice: rules.severityOverrides?.notice ?? [],
        warning: rules.severityOverrides?.warning ?? [],
        error: rules.severityOverrides?.error ?? []
      }
    }
  };
}
