import type { Finding, FirewallConfig, Outcome, ReviewSummary, RoutingHint, Subject } from "./types.js";
import { labelsForFindings } from "./labels.js";

const OUTCOME_LABELS: Record<Outcome, string> = {
  ready: "Ready for maintainer review",
  needs_info: "Needs contributor info",
  needs_tests: "Needs tests",
  possible_duplicate: "Possible duplicate",
  needs_maintainer_review: "Needs maintainer review",
  blocked: "Blocked"
};

export function createReviewSummary(
  subject: Subject,
  findings: Finding[],
  config: FirewallConfig,
  routingHints: RoutingHint[] = []
): ReviewSummary {
  const score = scoreFindings(findings);
  const outcome = chooseOutcome(findings);

  return {
    score,
    outcome,
    headline: headlineForOutcome(subject, outcome, findings),
    nextSteps: nextStepsForOutcome(outcome, findings),
    passedChecks: passedChecksForSubject(subject, findings, config),
    labels: labelsForFindings(findings, config),
    routingHints
  };
}

export function outcomeLabel(outcome: Outcome): string {
  return OUTCOME_LABELS[outcome];
}

function scoreFindings(findings: Finding[]): number {
  const penalty = findings.reduce((sum, finding) => {
    if (finding.severity === "error") {
      return sum + 35;
    }

    if (finding.severity === "warning") {
      return sum + 18;
    }

    return sum + 7;
  }, 0);

  return Math.max(0, 100 - penalty);
}

function chooseOutcome(findings: Finding[]): Outcome {
  if (findings.some((finding) => finding.severity === "error")) {
    return "blocked";
  }

  if (findings.some((finding) => finding.label === "securityReview")) {
    return "needs_maintainer_review";
  }

  if (findings.some((finding) => finding.label === "needsTests")) {
    return "needs_tests";
  }

  if (findings.some((finding) => finding.label === "needsInfo" && finding.severity === "warning")) {
    return "needs_info";
  }

  if (findings.some((finding) => finding.label === "possibleDuplicate")) {
    return "possible_duplicate";
  }

  if (findings.some((finding) => finding.label === "largeScope")) {
    return "needs_maintainer_review";
  }

  if (findings.some((finding) => finding.severity === "notice")) {
    return "needs_maintainer_review";
  }

  return "ready";
}

function headlineForOutcome(subject: Subject, outcome: Outcome, findings: Finding[]): string {
  const subjectName = subject.kind === "issue" ? "issue" : "pull request";

  if (outcome === "ready") {
    return `This ${subjectName} has the basic context maintainers need.`;
  }

  if (outcome === "needs_info") {
    return `This ${subjectName} needs more context before review will be efficient.`;
  }

  if (outcome === "needs_tests") {
    return "This pull request changes code but does not include detected test changes.";
  }

  if (outcome === "possible_duplicate") {
    return "This issue may overlap with an existing report.";
  }

  if (outcome === "blocked") {
    return `This ${subjectName} has blocking findings that should be handled first.`;
  }

  const notices = findings.filter((finding) => finding.severity === "notice").length;
  return notices > 0
    ? `This ${subjectName} is reviewable, with ${notices} maintenance note${notices === 1 ? "" : "s"}.`
    : `This ${subjectName} should be routed to a maintainer for review.`;
}

function nextStepsForOutcome(outcome: Outcome, findings: Finding[]): string[] {
  if (findings.length === 0) {
    return ["A maintainer can review this without waiting for more automated triage context."];
  }

  const steps: string[] = [];
  const coveredLabels = new Set<string>();

  if (outcome === "needs_info") {
    addStep(steps, "Please add the missing context: a minimal reproduction, relevant versions, and expected versus actual behavior.");
    coveredLabels.add("needsInfo");
  }

  if (outcome === "needs_tests") {
    addStep(steps, "Please add tests, or explain why tests are not practical for this change.");
    coveredLabels.add("needsTests");
  }

  if (outcome === "possible_duplicate") {
    addStep(steps, "Please compare this with the linked issue before a maintainer starts a separate investigation.");
    coveredLabels.add("possibleDuplicate");
  }

  if (outcome === "needs_maintainer_review") {
    const securityFinding = findings.find((finding) => finding.label === "securityReview");
    addStep(
      steps,
      securityFinding
        ? friendlyStepForFinding(securityFinding)
        : "A maintainer should route this to the owner of the touched area before merging."
    );
    if (securityFinding) {
      coveredLabels.add("securityReview");
    }
    coveredLabels.add("largeScope");
  }

  for (const finding of findings) {
    if (finding.label && coveredLabels.has(finding.label)) {
      continue;
    }

    addStep(steps, friendlyStepForFinding(finding) ?? finding.suggestion);
  }

  return steps.slice(0, 5);
}

function addStep(steps: string[], step: string | undefined): void {
  if (step && !steps.includes(step)) {
    steps.push(step);
  }
}

function friendlyStepForFinding(finding: Finding): string | undefined {
  switch (finding.id) {
    case "content.secret.possible":
      return "Please remove the exposed value from public text, rotate the credential, and move follow-up to a private security channel.";
    case "content.security_report.possible":
      return "A maintainer should route this to the project's security owner before requesting public exploit details.";
    case "issue.body.too_short":
      return "Please add enough issue context for a maintainer to reproduce and assess the problem.";
    case "issue.reproduction.missing":
      return "Please add a minimal reproduction, exact steps, commands, or expected versus actual behavior.";
    case "issue.environment.missing":
      return "Please add relevant versions, runtime, operating system, browser, or environment details.";
    case "issue.duplicate.possible":
      return "Please compare this with the linked issue before a maintainer starts a separate investigation.";
    case "issue.required_sections.missing":
    case "pr.required_sections.missing":
      return "Please fill out the missing template sections before review continues.";
    case "pr.draft":
      return "Please mark this pull request ready for review when it is no longer a draft.";
    case "pr.body.too_short":
      return "Please add the motivation, approach, test plan, and any review notes.";
    case "pr.linked_issue.missing":
      return "Please link the relevant issue or explain why one is not needed.";
    case "pr.scope.large":
      return "Please consider splitting unrelated changes into smaller pull requests.";
    case "pr.tests.missing":
      return "Please add tests, or explain why tests are not practical for this change.";
    case "pr.sensitive_paths.changed":
      return "A maintainer should route this through the owner of release, CI, or supply-chain settings.";
    default:
      return undefined;
  }
}

function passedChecksForSubject(subject: Subject, findings: Finding[], config: FirewallConfig): string[] {
  const ids = new Set(findings.map((finding) => finding.id));

  if (subject.kind === "issue") {
    return [
      !ids.has("issue.body.too_short") ? "Issue body has enough detail" : undefined,
      config.issue.requiredSections.length > 0 && !ids.has("issue.required_sections.missing")
        ? "Required issue sections are present"
        : undefined,
      !ids.has("issue.reproduction.missing") ? "Reproduction signal found" : undefined,
      !ids.has("issue.environment.missing") ? "Environment signal found" : undefined,
      !ids.has("issue.duplicate.possible") ? "No likely duplicate found" : undefined
    ].filter((value): value is string => Boolean(value));
  }

  return [
    !ids.has("pr.body.too_short") ? "PR description has enough detail" : undefined,
    config.pullRequest.requiredSections.length > 0 && !ids.has("pr.required_sections.missing")
      ? "Required PR sections are present"
      : undefined,
    !ids.has("pr.linked_issue.missing") ? "Issue link or reference found" : undefined,
    !ids.has("pr.tests.missing") ? "Test signal found or no code change detected" : undefined,
    !ids.has("pr.scope.large") ? "Change size is within threshold" : undefined,
    !ids.has("pr.sensitive_paths.changed") ? "No configured sensitive paths changed" : undefined
  ].filter((value): value is string => Boolean(value));
}
