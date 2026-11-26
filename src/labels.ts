import type { Finding, FirewallConfig, Subject } from "./types.js";

export function labelsForFindings(findings: Finding[], config: FirewallConfig): string[] {
  if (!config.labeling.enabled) {
    return [];
  }

  return [
    ...new Set(
      findings
        .map((finding) => finding.label ? config.labels[finding.label] : undefined)
        .filter((label): label is string => Boolean(label))
    )
  ];
}

export function managedLabels(config: FirewallConfig): string[] {
  return [...new Set(Object.values(config.labels).filter(Boolean))];
}

export function staleManagedLabels(
  existingLabels: string[],
  desiredLabels: string[],
  config: FirewallConfig,
  subject?: Subject
): string[] {
  if (!config.labeling.enabled || !config.labeling.removeStale) {
    return [];
  }

  let retainedLabels = desiredLabels;
  if (subject?.kind === "pull_request" && subject.changedFilesComplete === false) {
    retainedLabels = [...desiredLabels, config.labels.needsTests, config.labels.largeScope, config.labels.securityReview];
  } else if (subject?.kind === "issue" && subject.duplicateSearchComplete === false) {
    retainedLabels = [...desiredLabels, config.labels.possibleDuplicate];
  }
  return managedLabels(config)
    .filter((label) => existingLabels.includes(label) && !retainedLabels.includes(label));
}
