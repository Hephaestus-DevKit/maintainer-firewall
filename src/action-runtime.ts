import * as core from "@actions/core";
import { redactByPatterns, redactReviewSummary } from "./redaction.js";
import type { RunDiagnostics, RuntimeWarningSink } from "./run-diagnostics.js";
import { composeSetupSummary, composeStepSummary } from "./setup-summary.js";
import type { Finding, FirewallConfig, ReviewSummary, Subject } from "./types.js";

export type ActionOutputValues = Record<string, string>;

export interface RunStepSummaryOptions {
  dryRun: boolean;
  emitAnnotations: boolean;
  failOnFindings: boolean;
  openAiApiKeyProvided: boolean;
  reportJsonPath: string;
  effectiveConfigJsonPath?: string;
  subjectKind: Subject["kind"] | null;
}

export function dedupeFindings(findings: Finding[]): Finding[] {
  const seen = new Set<string>();
  const output: Finding[] = [];

  for (const finding of findings) {
    const key = `${finding.id}:${finding.title}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    output.push(finding);
  }

  return output;
}

export function parseBoolean(value: string | undefined): boolean {
  return ["1", "true", "yes", "on"].includes((value ?? "").trim().toLowerCase());
}

export function skippedOutputValues(
  skipReason: string,
  reportJsonPath: string | undefined,
  effectiveConfigJsonPath: string | undefined,
  diagnostics: RunDiagnostics,
  config: FirewallConfig
): ActionOutputValues {
  return {
    skipped: "true",
    "skip-reason": redactByPatterns(skipReason, config.security.secretPatterns),
    outcome: "skipped",
    score: "",
    "findings-count": "0",
    labels: "",
    "routing-hints": "[]",
    "report-json-path": reportJsonPath ?? "",
    "effective-config-json-path": effectiveConfigJsonPath ?? "",
    ...diagnosticOutputValues(diagnostics)
  };
}

export function completedOutputValues(
  summary: ReviewSummary,
  findings: Finding[],
  reportJsonPath: string | undefined,
  effectiveConfigJsonPath: string | undefined,
  diagnostics: RunDiagnostics,
  config: FirewallConfig
): ActionOutputValues {
  const safeSummary = redactReviewSummary(summary, config.security.secretPatterns);

  return {
    skipped: "false",
    "skip-reason": "",
    outcome: safeSummary.outcome,
    score: String(safeSummary.score),
    "findings-count": String(findings.length),
    labels: safeSummary.labels.join(","),
    "routing-hints": JSON.stringify(safeSummary.routingHints),
    "report-json-path": reportJsonPath ?? "",
    "effective-config-json-path": effectiveConfigJsonPath ?? "",
    ...diagnosticOutputValues(diagnostics)
  };
}

export function setActionOutputs(outputs: ActionOutputValues): void {
  for (const [name, value] of Object.entries(outputs)) {
    core.setOutput(name, value);
  }
}

export function setSkippedOutputs(
  skipReason: string,
  reportJsonPath: string | undefined,
  effectiveConfigJsonPath: string | undefined,
  diagnostics: RunDiagnostics,
  config: FirewallConfig
): void {
  setActionOutputs(skippedOutputValues(skipReason, reportJsonPath, effectiveConfigJsonPath, diagnostics, config));
}

export function setCompletedOutputs(
  summary: ReviewSummary,
  findings: Finding[],
  reportJsonPath: string | undefined,
  effectiveConfigJsonPath: string | undefined,
  diagnostics: RunDiagnostics,
  config: FirewallConfig
): void {
  setActionOutputs(completedOutputValues(summary, findings, reportJsonPath, effectiveConfigJsonPath, diagnostics, config));
}

export function composeRunStepSummary(
  config: FirewallConfig,
  configPath: string,
  diagnostics: RunDiagnostics,
  options: RunStepSummaryOptions,
  report: string
): string {
  return composeStepSummary(composeSetupSummary({
    config,
    configPath,
    configWarnings: diagnostics.configWarnings,
    runtimeWarnings: diagnostics.runtimeWarnings,
    dryRun: options.dryRun,
    emitAnnotations: options.emitAnnotations,
    failOnFindings: options.failOnFindings,
    openAiApiKeyProvided: options.openAiApiKeyProvided,
    reportJsonPath: options.reportJsonPath,
    effectiveConfigJsonPath: options.effectiveConfigJsonPath,
    subjectKind: options.subjectKind
  }), report);
}

export async function writeSummary(
  operation: string,
  summary: string,
  warningSink: RuntimeWarningSink
): Promise<void> {
  await tryWrite(operation, async () => {
    await core.summary.addRaw(summary, true).write();
  }, warningSink);
}

export async function tryWrite(
  operation: string,
  write: () => Promise<void>,
  warningSink: RuntimeWarningSink = (message) => core.warning(message)
): Promise<void> {
  try {
    await write();
  } catch (error) {
    warningSink(`Could not ${operation}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function diagnosticOutputValues(diagnostics: RunDiagnostics): ActionOutputValues {
  return {
    "config-warnings-count": String(diagnostics.configWarnings.length),
    "config-warnings": JSON.stringify(diagnostics.configWarnings),
    "runtime-warnings-count": String(diagnostics.runtimeWarnings.length),
    "runtime-warnings": JSON.stringify(diagnostics.runtimeWarnings)
  };
}
