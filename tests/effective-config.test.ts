import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { defaultConfig } from "../src/config.js";
import { createEffectiveConfigPayload, writeEffectiveConfigJson } from "../src/effective-config.js";

describe("effective config report", () => {
  it("summarizes active rollout surfaces without exposing secret patterns", () => {
    const payload = createEffectiveConfigPayload({
      ...defaultConfig,
      security: {
        ...defaultConfig.security,
        secretPatterns: [
          "\\bsk-[A-Za-z0-9_-]{20,}\\b"
        ]
      },
      ai: {
        ...defaultConfig.ai,
        enabled: true
      }
    }, ".maintainer-firewall.yml", {
      dryRun: true,
      emitAnnotations: true,
      failOnFindings: false,
      writeStepSummary: true,
      openAiApiKeyProvided: false,
      reportJsonPath: "reports/firewall.json",
      effectiveConfigJsonPath: "reports/effective-config.json",
      subjectKind: "pull_request"
    }, {
      configWarnings: ["config warning"],
      runtimeWarnings: ["runtime warning"]
    });

    expect(payload).toMatchObject({
      version: 1,
      configPath: ".maintainer-firewall.yml",
      subjectKind: "pull_request",
      surfaces: {
        dryRun: true,
        labels: "enabled:dry-run",
        annotations: true,
        reportJsonPath: "reports/firewall.json",
        effectiveConfigJsonPath: "reports/effective-config.json",
        ai: {
          enabled: true,
          apiKeyProvided: false
        }
      },
      enabledChecks: {
        security: {
          enabled: true,
          reportPatterns: defaultConfig.security.reportPatterns.length,
          secretPatterns: 1
        }
      }
    });
    expect(JSON.stringify(payload)).not.toContain("A-Za-z0-9");
  });

  it("redacts effective config fields and writes JSON reports", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "maintainer-firewall-"));
    const secret = "sk-abc12345678901234567890";
    const path = join(tempDir, "effective", "config.json");

    try {
      const payload = createEffectiveConfigPayload({
        ...defaultConfig,
        labels: {
          ...defaultConfig.labels,
          needsInfo: `needs-${secret}`
        },
        security: {
          ...defaultConfig.security,
          secretPatterns: ["\\bsk-[A-Za-z0-9_-]{20,}\\b"]
        }
      }, `configs/${secret}.yml`, {
        dryRun: false,
        emitAnnotations: false,
        failOnFindings: false,
        writeStepSummary: false,
        openAiApiKeyProvided: true,
        reportJsonPath: "",
        effectiveConfigJsonPath: path,
        subjectKind: null
      }, {
        configWarnings: [`bad ${secret}`],
        runtimeWarnings: []
      });

      await writeEffectiveConfigJson(path, payload);
      const content = await readFile(path, "utf8");

      expect(content).not.toContain(secret);
      expect(content).toContain("[redacted]");
      expect(JSON.parse(content).labels.needsInfo).toBe("needs-[redacted]");
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});
