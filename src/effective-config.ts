import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { RunDiagnostics } from "./run-diagnostics.js";
import { redactByPatterns } from "./redaction.js";
import type { FirewallConfig, Subject } from "./types.js";

export interface EffectiveConfigPayload {
  version: 1;
  configPath: string;
  subjectKind: Subject["kind"] | null;
  surfaces: {
    dryRun: boolean;
    comments: string;
    labels: string;
    annotations: boolean;
    stepSummary: boolean;
    reportJsonPath: string | null;
    effectiveConfigJsonPath: string | null;
    failOnFindings: boolean;
    ai: {
      enabled: boolean;
      apiKeyProvided: boolean;
      model: string;
      timeoutMs: number;
      maxInputCharacters: number;
      maxOutputTokens: number;
    };
  };
  enabledChecks: {
    issue: {
      enabled: boolean;
      minBodyCharacters: number;
      requireReproduction: boolean;
      requireEnvironment: boolean;
      duplicateSearchLimit: number;
      requiredSections: string[];
    };
    pullRequest: {
      enabled: boolean;
      minBodyCharacters: number;
      requireLinkedIssue: boolean;
      requireTestsForCodeChanges: boolean;
      largeChangeThreshold: number;
      requiredSections: string[];
      sensitivePathPatterns: number;
      testPathPatterns: number;
    };
    security: {
      enabled: boolean;
      reportPatterns: number;
      secretPatterns: number;
    };
  };
  labels: FirewallConfig["labels"];
  rules: FirewallConfig["rules"];
  ignore: FirewallConfig["ignore"];
  repository: {
    guidancePaths: string[];
    codeOwnersPaths: string[];
    maxGuidanceCharacters: number;
  };
  diagnostics?: {
    configWarnings?: string[];
    runtimeWarnings?: string[];
  };
}

export interface EffectiveConfigOptions {
  dryRun: boolean;
  emitAnnotations: boolean;
  failOnFindings: boolean;
  writeStepSummary: boolean;
  openAiApiKeyProvided: boolean;
  reportJsonPath: string;
  effectiveConfigJsonPath: string;
  subjectKind: Subject["kind"] | null;
}

export function createEffectiveConfigPayload(
  config: FirewallConfig,
  configPath: string,
  options: EffectiveConfigOptions,
  diagnostics: RunDiagnostics
): EffectiveConfigPayload {
  const secretPatterns = config.security.secretPatterns;

  return {
    version: 1,
    configPath: redactByPatterns(configPath, secretPatterns),
    subjectKind: options.subjectKind,
    surfaces: {
      dryRun: options.dryRun,
      comments: commentSurface(config),
      labels: labelSurface(config, options.dryRun),
      annotations: options.emitAnnotations,
      stepSummary: options.writeStepSummary,
      reportJsonPath: options.reportJsonPath || null,
      effectiveConfigJsonPath: options.effectiveConfigJsonPath || null,
      failOnFindings: options.failOnFindings,
      ai: {
        enabled: config.ai.enabled,
        apiKeyProvided: options.openAiApiKeyProvided,
        model: redactByPatterns(config.ai.model, secretPatterns),
        timeoutMs: config.ai.timeoutMs,
        maxInputCharacters: config.ai.maxInputCharacters,
        maxOutputTokens: config.ai.maxOutputTokens
      }
    },
    enabledChecks: {
      issue: {
        enabled: config.issue.enabled,
        minBodyCharacters: config.issue.minBodyCharacters,
        requireReproduction: config.issue.requireReproduction,
        requireEnvironment: config.issue.requireEnvironment,
        duplicateSearchLimit: config.issue.duplicateSearchLimit,
        requiredSections: redactStringArray(config.issue.requiredSections, secretPatterns)
      },
      pullRequest: {
        enabled: config.pullRequest.enabled,
        minBodyCharacters: config.pullRequest.minBodyCharacters,
        requireLinkedIssue: config.pullRequest.requireLinkedIssue,
        requireTestsForCodeChanges: config.pullRequest.requireTestsForCodeChanges,
        largeChangeThreshold: config.pullRequest.largeChangeThreshold,
        requiredSections: redactStringArray(config.pullRequest.requiredSections, secretPatterns),
        sensitivePathPatterns: config.pullRequest.sensitivePaths.length,
        testPathPatterns: config.pullRequest.testPathPatterns.length
      },
      security: {
        enabled: config.security.enabled,
        reportPatterns: config.security.reportPatterns.length,
        secretPatterns: config.security.secretPatterns.length
      }
    },
    labels: redactRecord(config.labels, secretPatterns) as FirewallConfig["labels"],
    rules: {
      disabled: redactStringArray(config.rules.disabled, secretPatterns),
      severityOverrides: {
        notice: redactStringArray(config.rules.severityOverrides.notice, secretPatterns),
        warning: redactStringArray(config.rules.severityOverrides.warning, secretPatterns),
        error: redactStringArray(config.rules.severityOverrides.error, secretPatterns)
      }
    },
    ignore: {
      authors: redactStringArray(config.ignore.authors, secretPatterns),
      labels: redactStringArray(config.ignore.labels, secretPatterns),
      titlePatterns: redactStringArray(config.ignore.titlePatterns, secretPatterns)
    },
    repository: {
      guidancePaths: redactStringArray(config.repository.guidancePaths, secretPatterns),
      codeOwnersPaths: redactStringArray(config.repository.codeOwnersPaths, secretPatterns),
      maxGuidanceCharacters: config.repository.maxGuidanceCharacters
    },
    diagnostics: diagnosticsPayload(diagnostics, secretPatterns)
  };
}

export async function writeEffectiveConfigJson(path: string, payload: EffectiveConfigPayload): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function commentSurface(config: FirewallConfig): string {
  if (!config.comment.enabled || config.comment.postWhen === "never") {
    return "disabled";
  }

  return `enabled:${config.comment.postWhen}:updateExisting=${String(config.comment.updateExisting)}`;
}

function labelSurface(config: FirewallConfig, dryRun: boolean): string {
  if (!config.labeling.enabled) {
    return "disabled";
  }

  return dryRun
    ? "enabled:dry-run"
    : `enabled:createMissing=${String(config.labeling.createMissing)}:removeStale=${String(config.labeling.removeStale)}`;
}

function diagnosticsPayload(
  diagnostics: RunDiagnostics,
  secretPatterns: string[]
): EffectiveConfigPayload["diagnostics"] {
  const configWarnings = redactStringArray(diagnostics.configWarnings, secretPatterns);
  const runtimeWarnings = redactStringArray(diagnostics.runtimeWarnings, secretPatterns);

  if (configWarnings.length === 0 && runtimeWarnings.length === 0) {
    return undefined;
  }

  return {
    ...(configWarnings.length > 0 ? { configWarnings } : {}),
    ...(runtimeWarnings.length > 0 ? { runtimeWarnings } : {})
  };
}

function redactStringArray(values: string[], secretPatterns: string[]): string[] {
  return values.map((value) => redactByPatterns(value, secretPatterns));
}

function redactRecord(record: Record<string, string>, secretPatterns: string[]): Record<string, string> {
  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => [key, redactByPatterns(value, secretPatterns)])
  );
}
