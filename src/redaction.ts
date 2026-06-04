import type { Finding, ReviewSummary } from "./types.js";
import { replaceByConfiguredRegexes } from "./regex.js";

export function redactByPatterns(value: string, patterns: string[], replacement = "[redacted]"): string {
  return replaceByConfiguredRegexes(value, patterns, replacement);
}

export function redactFinding(finding: Finding, patterns: string[]): Finding {
  return {
    ...finding,
    id: redactByPatterns(finding.id, patterns),
    title: redactByPatterns(finding.title, patterns),
    details: redactByPatterns(finding.details, patterns),
    suggestion: finding.suggestion ? redactByPatterns(finding.suggestion, patterns) : undefined,
    references: finding.references?.map((reference) => ({
      ...reference,
      path: redactByPatterns(reference.path, patterns),
      label: reference.label ? redactByPatterns(reference.label, patterns) : undefined,
      url: reference.url ? redactByPatterns(reference.url, patterns) : undefined
    }))
  };
}

export function redactReviewSummary(summary: ReviewSummary, patterns: string[]): ReviewSummary {
  return {
    ...summary,
    headline: redactByPatterns(summary.headline, patterns),
    nextSteps: summary.nextSteps.map((step) => redactByPatterns(step, patterns)),
    passedChecks: summary.passedChecks.map((check) => redactByPatterns(check, patterns)),
    labels: summary.labels.map((label) => redactByPatterns(label, patterns)),
    routingHints: summary.routingHints.map((hint) => ({
      ...hint,
      owner: redactByPatterns(hint.owner, patterns),
      files: hint.files.map((file) => redactByPatterns(file, patterns))
    }))
  };
}
