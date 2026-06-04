import { minimatch } from "minimatch";
import { redactByPatterns } from "./redaction.js";
import { matchesAnyConfiguredRegex } from "./regex.js";
import type {
  ChangedFile,
  Finding,
  FirewallConfig,
  IssueSubject,
  PullRequestSubject,
  Subject
} from "./types.js";

const REPRODUCTION_PATTERN =
  /\b(repro|reproduction|steps?|minimal|example|sandbox|codesandbox|stackblitz|repo|repository|command|actual|expected)\b/i;
const ENVIRONMENT_PATTERN =
  /\b(version|node|npm|pnpm|yarn|bun|browser|chrome|firefox|safari|edge|os|platform|environment|python|rust|cargo|go version|java)\b/i;
const LINKED_ISSUE_PATTERN =
  /\b(close[sd]?|fix(?:e[sd])?|resolve[sd]?|references?|refs?|related)\s*:?\s*(#\d+|https:\/\/github\.com\/[^/\s]+\/[^/\s]+\/issues\/\d+)|(^|[^\w#])#\d+\b/i;

export function analyzeSubject(subject: Subject, config: FirewallConfig): Finding[] {
  if (subject.kind === "issue") {
    return config.issue.enabled ? analyzeIssue(subject, config) : [];
  }

  return config.pullRequest.enabled ? analyzePullRequest(subject, config) : [];
}

function analyzeIssue(issue: IssueSubject, config: FirewallConfig): Finding[] {
  const findings: Finding[] = analyzeSharedContent(`${issue.title}\n${issue.body}`, "issue", config);
  const body = issue.body.trim();

  if (body.length < config.issue.minBodyCharacters) {
    findings.push({
      id: "issue.body.too_short",
      severity: "warning",
      title: "Issue body is short",
      details: `The issue body has ${body.length} characters. This project expects at least ${config.issue.minBodyCharacters}.`,
      suggestion: "Please add the missing context before a maintainer spends time investigating.",
      label: "needsInfo",
      source: "rule"
    });
  }

  addRequiredSectionFindings(findings, body, "issue", config.issue.requiredSections);

  if (config.issue.requireReproduction && !REPRODUCTION_PATTERN.test(body)) {
    findings.push({
      id: "issue.reproduction.missing",
      severity: "warning",
      title: "No clear reproduction details found",
      details: "The issue does not appear to include steps, a minimal example, commands, or expected versus actual behavior.",
      suggestion: "Please add a minimal reproduction or exact steps before triage.",
      label: "needsInfo",
      source: "rule"
    });
  }

  if (config.issue.requireEnvironment && !ENVIRONMENT_PATTERN.test(body)) {
    findings.push({
      id: "issue.environment.missing",
      severity: "notice",
      title: "Environment details may be missing",
      details: "The issue does not mention version, runtime, operating system, browser, or similar environment details.",
      suggestion: "Please add versions and environment details if they affect debugging.",
      label: "needsInfo",
      source: "rule"
    });
  }

  if (issue.duplicateCandidates.length > 0) {
    const topCandidate = issue.duplicateCandidates[0];
    if (topCandidate) {
      findings.push({
        id: "issue.duplicate.possible",
        severity: "notice",
        title: "Possible duplicate issue",
        details: `A similar issue exists: #${topCandidate.number} "${redactByPatterns(topCandidate.title, config.security.secretPatterns)}" (${Math.round(topCandidate.similarity * 100)}% title overlap).`,
        suggestion: `Please compare with ${topCandidate.url} before starting a new investigation.`,
        label: "possibleDuplicate",
        source: "rule"
      });
    }
  }

  return findings;
}

function analyzePullRequest(pr: PullRequestSubject, config: FirewallConfig): Finding[] {
  const findings: Finding[] = analyzeSharedContent(`${pr.title}\n${pr.body}`, "pr", config);
  const body = pr.body.trim();
  const stats = summarizeChanges(pr.changedFiles);

  if (pr.draft) {
    findings.push({
      id: "pr.draft",
      severity: "notice",
      title: "Pull request is still a draft",
      details: "Draft pull requests are useful for early feedback, but they should stay out of the maintainer review queue.",
      suggestion: "Please mark the pull request ready for review when it is ready for maintainer review.",
      label: "maintainerReview",
      source: "rule"
    });
  }

  if (body.length < config.pullRequest.minBodyCharacters) {
    findings.push({
      id: "pr.body.too_short",
      severity: "warning",
      title: "Pull request description is short",
      details: `The PR body has ${body.length} characters. This project expects at least ${config.pullRequest.minBodyCharacters}.`,
      suggestion: "Please add the motivation, approach, test plan, and review notes.",
      label: "needsInfo",
      source: "rule"
    });
  }

  addRequiredSectionFindings(findings, body, "pr", config.pullRequest.requiredSections);

  if (config.pullRequest.requireLinkedIssue && !hasLinkedIssue(body)) {
    findings.push({
      id: "pr.linked_issue.missing",
      severity: "notice",
      title: "No linked issue found",
      details: "The PR body does not appear to link or close an issue.",
      suggestion: "Please link the relevant issue or explain why one is not needed.",
      label: "needsInfo",
      source: "rule"
    });
  }

  if (stats.totalChanges > config.pullRequest.largeChangeThreshold) {
    findings.push({
      id: "pr.scope.large",
      severity: "warning",
      title: "Pull request has a large change set",
      details: `The PR changes ${stats.fileCount} files with ${stats.totalChanges} total additions/deletions.`,
      suggestion: "Please consider splitting unrelated changes into smaller pull requests.",
      label: "largeScope",
      source: "rule"
    });
  }

  if (
    config.pullRequest.requireTestsForCodeChanges &&
    hasCodeChanges(pr.changedFiles) &&
    !hasTestChanges(pr.changedFiles, config.pullRequest.testPathPatterns)
  ) {
    findings.push({
      id: "pr.tests.missing",
      severity: "warning",
      title: "Code changed without test changes",
      details: "The PR changes source files, but no matching test file changes were detected.",
      suggestion: "Please add tests or a clear explanation of why tests are not needed.",
      label: "needsTests",
      source: "rule"
    });
  }

  const sensitiveFiles = pr.changedFiles
    .map((file) => file.filename)
    .filter((filename) => matchesAny(filename, config.pullRequest.sensitivePaths));

  if (sensitiveFiles.length > 0) {
    findings.push({
      id: "pr.sensitive_paths.changed",
      severity: "notice",
      title: "Sensitive files changed",
      details: `Sensitive paths changed: ${sensitiveFiles.slice(0, 5).join(", ")}${sensitiveFiles.length > 5 ? ", ..." : ""}.`,
      suggestion: "A maintainer should route this PR through the owner of release, CI, or supply-chain settings.",
      label: "securityReview",
      source: "rule"
    });
  }

  return findings;
}

function analyzeSharedContent(content: string, subjectKind: "issue" | "pr", config: FirewallConfig): Finding[] {
  if (!config.security.enabled) {
    return [];
  }

  const findings: Finding[] = [];

  if (matchesAnyRegex(content, config.security.secretPatterns)) {
    findings.push({
      id: "content.secret.possible",
      severity: "error",
      title: "Possible exposed secret or credential",
      details: "The title or body appears to include a credential-like pattern. The value is intentionally not repeated here.",
      suggestion: "Please redact the value, rotate the credential, and move any investigation to a private security channel.",
      label: "securityReview",
      source: "rule"
    });
  }

  if (matchesAnyRegex(content, config.security.reportPatterns)) {
    findings.push({
      id: "content.security_report.possible",
      severity: subjectKind === "issue" ? "warning" : "notice",
      title: "Possible security-sensitive report",
      details: `This ${subjectKind === "issue" ? "issue" : "pull request"} mentions security-sensitive language such as a vulnerability, exploit, CVE, or credential leak.`,
      suggestion: "A maintainer should route this to the project's security owner before requesting public exploit details.",
      label: "securityReview",
      source: "rule"
    });
  }

  return findings;
}

function summarizeChanges(files: ChangedFile[]): {
  fileCount: number;
  totalChanges: number;
} {
  return {
    fileCount: files.length,
    totalChanges: files.reduce((sum, file) => sum + file.additions + file.deletions, 0)
  };
}

function addRequiredSectionFindings(
  findings: Finding[],
  body: string,
  subjectKind: "issue" | "pr",
  requiredSections: string[]
): void {
  const missing = requiredSections.filter((section) => !hasSection(body, section));
  if (missing.length === 0) {
    return;
  }

  findings.push({
    id: `${subjectKind}.required_sections.missing`,
    severity: "warning",
    title: "Required template sections are missing",
    details: `Missing section${missing.length === 1 ? "" : "s"}: ${missing.join(", ")}.`,
    suggestion: "Please fill out the missing template sections before review.",
    label: "needsInfo",
    references: missing.map((section) => ({
      source: "config",
      path: subjectKind === "issue" ? "issue.requiredSections" : "pullRequest.requiredSections",
      label: section
    })),
    source: "rule"
  });
}

function hasSection(body: string, section: string): boolean {
  const searchableBody = stripFencedCodeBlocks(body);
  const escaped = section.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|\\n)\\s{0,3}#{1,6}\\s*${escaped}\\s*$|(^|\\n)\\s*${escaped}\\s*:`, "im").test(searchableBody);
}

function hasLinkedIssue(body: string): boolean {
  return stripFencedCodeBlocks(body)
    .split(/\r?\n/)
    .some((line) => {
      if (/^\s{0,3}#{1,6}\s*#?\d+\b/.test(line)) {
        return false;
      }

      return LINKED_ISSUE_PATTERN.test(line);
    });
}

function stripFencedCodeBlocks(value: string): string {
  const output: string[] = [];
  let fenceMarker: "`" | "~" | null = null;

  for (const line of value.split(/\r?\n/)) {
    const fence = line.match(/^\s{0,3}(`{3,}|~{3,})/);
    if (fence) {
      const marker = fence[1]?.startsWith("`") ? "`" : "~";
      if (!fenceMarker) {
        fenceMarker = marker;
        continue;
      }

      if (fenceMarker === marker) {
        fenceMarker = null;
        continue;
      }
    }

    if (!fenceMarker) {
      output.push(line);
    }
  }

  return output.join("\n");
}

function hasCodeChanges(files: ChangedFile[]): boolean {
  return files.some((file) => {
    if (file.status === "removed") {
      return false;
    }

    return /\.(c|cc|cpp|cs|cts|go|java|js|jsx|kt|mjs|mts|php|py|rb|rs|swift|ts|tsx|vue|svelte)$/i.test(file.filename) &&
      !isTestPath(file.filename);
  });
}

function hasTestChanges(files: ChangedFile[], testPathPatterns: string[]): boolean {
  return files.some((file) =>
    file.status !== "removed" && (isTestPath(file.filename) || matchesAny(file.filename, testPathPatterns))
  );
}

function isTestPath(filename: string): boolean {
  return /(^|\/)(__tests__|tests?|spec)(\/|$)|\.(test|spec)\.[cm]?[jt]sx?$/i.test(filename);
}

function matchesAny(filename: string, patterns: string[]): boolean {
  return patterns.some((pattern) => minimatch(filename, pattern, { dot: true }));
}

function matchesAnyRegex(value: string, patterns: string[]): boolean {
  return matchesAnyConfiguredRegex(value, patterns);
}
