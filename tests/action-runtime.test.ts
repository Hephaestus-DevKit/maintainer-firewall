import { beforeEach, describe, expect, it, vi } from "vitest";
import { defaultConfig } from "../src/config.js";
import {
  completedOutputValues,
  composeRunStepSummary,
  dedupeFindings,
  parseBoolean,
  setActionOutputs,
  setCompletedOutputs,
  setSkippedOutputs,
  skippedOutputValues,
  tryWrite,
  writeSummary
} from "../src/action-runtime.js";
import type { Finding, ReviewSummary } from "../src/types.js";

const coreMocks = vi.hoisted(() => ({
  setOutput: vi.fn(),
  warning: vi.fn(),
  summaryAddRaw: vi.fn(),
  summaryWrite: vi.fn()
}));

vi.mock("@actions/core", () => ({
  setOutput: coreMocks.setOutput,
  warning: coreMocks.warning,
  summary: {
    addRaw: coreMocks.summaryAddRaw
  }
}));

const secret = "sk-abc12345678901234567890";
const diagnostics = {
  configWarnings: ["config warning"],
  runtimeWarnings: ["runtime warning"]
};

function finding(id: string, title = "Finding"): Finding {
  return {
    id,
    severity: "warning",
    title,
    details: "Details",
    source: "rule"
  };
}

function summary(): ReviewSummary {
  return {
    score: 82,
    outcome: "needs_maintainer_review",
    headline: `Token ${secret} appears`,
    nextSteps: [`Rotate ${secret}`],
    passedChecks: ["No obvious issue"],
    labels: ["security-review", `leak-${secret}`],
    routingHints: [
      {
        owner: `@security-${secret}`,
        files: [`src/${secret}.ts`]
      }
    ]
  };
}

describe("action runtime helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    coreMocks.summaryWrite.mockResolvedValue(undefined);
    coreMocks.summaryAddRaw.mockReturnValue({
      write: coreMocks.summaryWrite
    });
  });

  it("parses action boolean inputs using GitHub-friendly truthy values", () => {
    for (const value of ["1", "true", "TRUE", " yes ", "on"]) {
      expect(parseBoolean(value)).toBe(true);
    }

    for (const value of [undefined, "", "0", "false", "off", "no"]) {
      expect(parseBoolean(value)).toBe(false);
    }
  });

  it("deduplicates findings by stable report identity", () => {
    const first = finding("pr.tests.missing", "Code changed without tests");
    const duplicate = {
      ...first,
      details: "Different details should not create a second report row."
    };
    const distinct = finding("pr.tests.missing", "Another missing test signal");

    expect(dedupeFindings([first, duplicate, distinct])).toEqual([first, distinct]);
  });

  it("builds redacted skipped output values with diagnostic counts", () => {
    expect(skippedOutputValues(`ignored because ${secret}`, undefined, undefined, diagnostics, defaultConfig)).toEqual({
      skipped: "true",
      "skip-reason": "ignored because [redacted]",
      outcome: "skipped",
      score: "",
      "findings-count": "0",
      labels: "",
      "routing-hints": "[]",
      "report-json-path": "",
      "effective-config-json-path": "",
      "config-warnings-count": "1",
      "config-warnings": JSON.stringify(["config warning"]),
      "runtime-warnings-count": "1",
      "runtime-warnings": JSON.stringify(["runtime warning"])
    });
  });

  it("builds redacted completed output values", () => {
    const outputs = completedOutputValues(
      summary(),
      [finding("content.security_report.possible"), finding("pr.scope.large")],
      "reports/firewall.json",
      "reports/config.json",
      diagnostics,
      defaultConfig
    );

    expect(outputs.outcome).toBe("needs_maintainer_review");
    expect(outputs.score).toBe("82");
    expect(outputs["findings-count"]).toBe("2");
    expect(outputs.labels).toBe("security-review,leak-[redacted]");
    expect(outputs["report-json-path"]).toBe("reports/firewall.json");
    expect(outputs["effective-config-json-path"]).toBe("reports/config.json");
    expect(outputs["routing-hints"]).not.toContain(secret);
    expect(outputs["routing-hints"]).toContain("[redacted]");
  });

  it("sets skipped and completed outputs through the action core API", () => {
    setSkippedOutputs(`ignored ${secret}`, "report.json", "config.json", diagnostics, defaultConfig);
    setCompletedOutputs(summary(), [finding("pr.scope.large")], "report.json", "config.json", diagnostics, defaultConfig);

    expect(coreMocks.setOutput).toHaveBeenCalledWith("skipped", "true");
    expect(coreMocks.setOutput).toHaveBeenCalledWith("skip-reason", "ignored [redacted]");
    expect(coreMocks.setOutput).toHaveBeenCalledWith("skipped", "false");
    expect(coreMocks.setOutput).toHaveBeenCalledWith("labels", "security-review,leak-[redacted]");
    expect(coreMocks.setOutput).toHaveBeenCalledWith("effective-config-json-path", "config.json");
  });

  it("sets arbitrary output values in insertion order", () => {
    setActionOutputs({
      first: "1",
      second: "2"
    });

    expect(coreMocks.setOutput).toHaveBeenNthCalledWith(1, "first", "1");
    expect(coreMocks.setOutput).toHaveBeenNthCalledWith(2, "second", "2");
  });

  it("composes the setup section with the action report", () => {
    const output = composeRunStepSummary(
      defaultConfig,
      ".maintainer-firewall.yml",
      diagnostics,
      {
        dryRun: true,
        emitAnnotations: false,
        failOnFindings: false,
        openAiApiKeyProvided: false,
        reportJsonPath: "reports/firewall.json",
        effectiveConfigJsonPath: "reports/config.json",
        subjectKind: "issue"
      },
      "## Report"
    );

    expect(output).toContain("## Maintainer Firewall setup");
    expect(output).toContain("| Subject | Issue |");
    expect(output).toContain("| Effective config | reports/config.json |");
    expect(output).toContain("## Report");
  });

  it("keeps best-effort writes from failing the action", async () => {
    const warningSink = vi.fn();

    await tryWrite("apply labels", async () => {
      throw new Error("denied");
    }, warningSink);

    expect(warningSink).toHaveBeenCalledWith("Could not apply labels: denied");
  });

  it("writes step summaries through best-effort handling", async () => {
    await writeSummary("write step summary", "summary text", vi.fn());

    expect(coreMocks.summaryAddRaw).toHaveBeenCalledWith("summary text", true);
    expect(coreMocks.summaryWrite).toHaveBeenCalled();
  });
});
