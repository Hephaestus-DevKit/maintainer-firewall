import type { FirewallConfig, Subject } from "./types.js";

const PROTECTED_FINDING_IDS = new Set(["content.secret.possible"]);

export interface SetupSummaryOptions {
  config: FirewallConfig;
  configPath: string;
  dryRun: boolean;
  emitAnnotations: boolean;
  failOnFindings: boolean;
  openAiApiKeyProvided: boolean;
  reportJsonPath: string;
  subjectKind: Subject["kind"] | null;
}

export function composeSetupSummary(options: SetupSummaryOptions): string {
  const rows: Array<[string, string]> = [
    ["Subject", options.subjectKind ? subjectLabel(options.subjectKind) : "No handled issue or pull request"],
    ["Config", options.configPath],
    ["Run mode", options.dryRun ? "Dry run; no labels, comments, or stale-label removals are written" : "Live writes allowed"],
    ["Comments", commentState(options.config)],
    ["Labels", labelState(options.config, options.dryRun)],
    ["Annotations", options.emitAnnotations ? "Enabled" : "Disabled"],
    ["JSON report", options.reportJsonPath || "Disabled"],
    ["Rule policy", rulePolicyState(options.config)],
    ["AI analysis", aiState(options.config, options.openAiApiKeyProvided)],
    ["Failure policy", options.failOnFindings ? "Fail on warning or error findings" : "Advisory; workflow does not fail on findings"]
  ];

  return [
    "## Maintainer Firewall setup",
    "",
    "| Setting | Active state |",
    "| --- | --- |",
    ...rows.map(([setting, state]) => `| ${escapeTable(setting)} | ${escapeTable(state)} |`)
  ].join("\n");
}

export function composeStepSummary(setupSummary: string, report: string): string {
  return `${setupSummary}\n\n${report}`;
}

function subjectLabel(kind: Subject["kind"]): string {
  return kind === "issue" ? "Issue" : "Pull request";
}

function commentState(config: FirewallConfig): string {
  if (!config.comment.enabled || config.comment.postWhen === "never") {
    return "Disabled";
  }

  return `Enabled; postWhen=${config.comment.postWhen}; updateExisting=${String(config.comment.updateExisting)}`;
}

function labelState(config: FirewallConfig, dryRun: boolean): string {
  if (!config.labeling.enabled) {
    return "Disabled";
  }

  const state = `Enabled; createMissing=${String(config.labeling.createMissing)}; removeStale=${String(config.labeling.removeStale)}`;
  return dryRun ? `${state}; writes suppressed by dry-run` : state;
}

function aiState(config: FirewallConfig, openAiApiKeyProvided: boolean): string {
  if (!config.ai.enabled) {
    return "Disabled";
  }

  return openAiApiKeyProvided
    ? `Enabled; model=${config.ai.model}; timeoutMs=${config.ai.timeoutMs}`
    : "Configured, but no API key was provided";
}

function rulePolicyState(config: FirewallConfig): string {
  const disabledCount = config.rules.disabled.filter((id) => !PROTECTED_FINDING_IDS.has(id)).length;
  const overrideCount = Object.entries(config.rules.severityOverrides).reduce(
    (sum, [severity, ids]) => sum + ids.filter((id) => !PROTECTED_FINDING_IDS.has(id) || severity === "error").length,
    0
  );
  if (disabledCount === 0 && overrideCount === 0) {
    return "Default";
  }

  return `${disabledCount} disabled; ${overrideCount} severity override${overrideCount === 1 ? "" : "s"}`;
}

function escapeTable(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\n/g, " ");
}
