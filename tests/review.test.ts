import { describe, expect, it } from "vitest";
import { defaultConfig } from "../src/config.js";
import { createReviewSummary, outcomeLabel } from "../src/review.js";
import type { Finding, IssueSubject, PullRequestSubject } from "../src/types.js";

const subject: PullRequestSubject = {
  kind: "pull_request",
  number: 42,
  title: "Improve cache handling",
  body: "Fixes #41 and updates cache invalidation behavior with tests.",
  author: "contributor",
  labels: [],
  htmlUrl: "https://github.com/example/repo/pull/42",
  draft: false,
  baseRef: "main",
  headRef: "cache",
  changedFiles: []
};

const issueSubject: IssueSubject = {
  kind: "issue",
  number: 17,
  title: "Parser crash on startup",
  body: "The parser crashes on startup with version 1.2.3 after running npm test.",
  author: "reporter",
  labels: [],
  htmlUrl: "https://github.com/example/repo/issues/17",
  duplicateCandidates: []
};

describe("createReviewSummary", () => {
  it("labels public outcomes consistently", () => {
    expect(outcomeLabel("ready")).toBe("Ready for maintainer review");
    expect(outcomeLabel("blocked")).toBe("Blocked");
  });

  it("marks clean subjects ready", () => {
    const summary = createReviewSummary(subject, [], defaultConfig);

    expect(summary.outcome).toBe("ready");
    expect(summary.score).toBe(100);
    expect(summary.nextSteps[0]).toContain("maintainer can review");
  });

  it("prioritizes missing tests", () => {
    const findings: Finding[] = [
      {
        id: "pr.tests.missing",
        severity: "warning",
        title: "Code changed without test changes",
        details: "No test changes were detected.",
        suggestion: "Ask for tests.",
        label: "needsTests",
        source: "rule"
      },
      {
        id: "pr.linked_issue.missing",
        severity: "notice",
        title: "No linked issue found",
        details: "The PR body does not appear to link an issue.",
        label: "needsInfo",
        source: "rule"
      }
    ];

    const summary = createReviewSummary(subject, findings, defaultConfig);

    expect(summary.outcome).toBe("needs_tests");
    expect(summary.score).toBe(75);
    expect(summary.labels).toContain("needs-tests");
    expect(summary.nextSteps).toContain("Please add tests, or explain why tests are not practical for this change.");
    expect(summary.nextSteps).toContain("Please link the relevant issue or explain why one is not needed.");
    expect(summary.nextSteps.join(" ")).not.toContain("Ask ");
  });

  it("uses contributor-friendly missing info steps", () => {
    const findings: Finding[] = [
      {
        id: "issue.reproduction.missing",
        severity: "warning",
        title: "No clear reproduction details found",
        details: "No steps were found.",
        suggestion: "Ask for reproduction details.",
        label: "needsInfo",
        source: "rule"
      }
    ];

    const summary = createReviewSummary(subject, findings, defaultConfig);

    expect(summary.nextSteps[0]).toBe("Please add the missing context: a minimal reproduction, relevant versions, and expected versus actual behavior.");
    expect(summary.nextSteps.join(" ")).not.toContain("Ask ");
  });

  it("blocks on errors and floors the score at zero", () => {
    const summary = createReviewSummary(subject, [
      testFinding({ id: "custom.error.1", severity: "error" }),
      testFinding({ id: "custom.error.2", severity: "error" }),
      testFinding({ id: "custom.error.3", severity: "error" }),
      testFinding({ id: "custom.error.4", severity: "error" })
    ], defaultConfig);

    expect(summary.outcome).toBe("blocked");
    expect(summary.score).toBe(0);
    expect(summary.headline).toContain("blocking findings");
  });

  it("routes possible duplicate issues with an explicit contributor step", () => {
    const summary = createReviewSummary(issueSubject, [
      testFinding({
        id: "issue.duplicate.possible",
        label: "possibleDuplicate",
        title: "Possible duplicate"
      })
    ], defaultConfig);

    expect(summary.outcome).toBe("possible_duplicate");
    expect(summary.headline).toBe("This issue may overlap with an existing report.");
    expect(summary.nextSteps[0]).toContain("linked issue");
  });

  it("uses maintenance-note copy for notice-only maintainer review", () => {
    const summary = createReviewSummary(subject, [
      testFinding({ id: "notice.one", severity: "notice" }),
      testFinding({ id: "notice.two", severity: "notice" })
    ], defaultConfig);

    expect(summary.outcome).toBe("needs_maintainer_review");
    expect(summary.headline).toContain("2 maintenance notes");
  });

  it("keeps rule-specific next steps contributor-safe", () => {
    const expectedSteps: Array<[string, string]> = [
      ["content.secret.possible", "remove the exposed value"],
      ["content.security_report.possible", "security owner"],
      ["issue.body.too_short", "enough issue context"],
      ["issue.reproduction.missing", "minimal reproduction"],
      ["issue.environment.missing", "versions, runtime"],
      ["issue.duplicate.possible", "linked issue"],
      ["issue.required_sections.missing", "missing template sections"],
      ["pr.required_sections.missing", "missing template sections"],
      ["pr.draft", "ready for review"],
      ["pr.body.too_short", "motivation, approach"],
      ["pr.linked_issue.missing", "link the relevant issue"],
      ["pr.scope.large", "smaller pull requests"],
      ["pr.tests.missing", "Please add tests"],
      ["pr.sensitive_paths.changed", "supply-chain settings"]
    ];

    for (const [id, expected] of expectedSteps) {
      const summary = createReviewSummary(subject, [testFinding({ id })], defaultConfig);
      expect(summary.nextSteps.join(" ")).toContain(expected);
    }
  });

  it("honors disabled labels", () => {
    const config = {
      ...defaultConfig,
      labeling: {
        enabled: false
      }
    };
    const findings: Finding[] = [
      {
        id: "issue.body.too_short",
        severity: "warning",
        title: "Issue body is short",
        details: "Missing context.",
        label: "needsInfo",
        source: "rule"
      }
    ];

    const summary = createReviewSummary(subject, findings, config);

    expect(summary.labels).toEqual([]);
  });

  it("prioritizes security review ahead of ordinary missing info", () => {
    const findings: Finding[] = [
      {
        id: "content.security_report.possible",
        severity: "warning",
        title: "Possible security-sensitive report",
        details: "Security signal found.",
        suggestion: "Route this to the security owner.",
        label: "securityReview",
        source: "rule"
      },
      {
        id: "issue.body.too_short",
        severity: "warning",
        title: "Issue body is short",
        details: "Missing context.",
        label: "needsInfo",
        source: "rule"
      }
    ];

    const summary = createReviewSummary(subject, findings, defaultConfig);

    expect(summary.outcome).toBe("needs_maintainer_review");
    expect(summary.nextSteps[0]).toBe("A maintainer should route this to the project's security owner before requesting public exploit details.");
  });

  it("includes required section pass checks when configured", () => {
    const summary = createReviewSummary(subject, [], {
      ...defaultConfig,
      pullRequest: {
        ...defaultConfig.pullRequest,
        requiredSections: ["Test plan"]
      }
    });

    expect(summary.passedChecks).toContain("Required PR sections are present");
  });

  it("does not claim disabled checks passed", () => {
    const summary = createReviewSummary(subject, [], {
      ...defaultConfig,
      pullRequest: {
        ...defaultConfig.pullRequest,
        minBodyCharacters: 0,
        requireLinkedIssue: false,
        requireTestsForCodeChanges: false,
        sensitivePaths: []
      }
    });

    expect(summary.passedChecks).not.toContain("PR description has enough detail");
    expect(summary.passedChecks).not.toContain("Issue link or reference found");
    expect(summary.passedChecks).not.toContain("Test signal found or no code change detected");
    expect(summary.passedChecks).not.toContain("No configured sensitive paths changed");
    expect(summary.passedChecks).toContain("Change size is within threshold");
  });

  it("reports issue passed checks only when checks are enabled and satisfied", () => {
    const summary = createReviewSummary(issueSubject, [
      testFinding({
        id: "issue.environment.missing",
        label: "needsInfo"
      })
    ], {
      ...defaultConfig,
      issue: {
        ...defaultConfig.issue,
        requiredSections: ["Reproduction"]
      }
    });

    expect(summary.passedChecks).toContain("Issue body has enough detail");
    expect(summary.passedChecks).toContain("Required issue sections are present");
    expect(summary.passedChecks).toContain("Reproduction signal found");
    expect(summary.passedChecks).toContain("No likely duplicate found");
    expect(summary.passedChecks).not.toContain("Environment signal found");
  });
});

function testFinding(overrides: Partial<Finding> & { id: string }): Finding {
  return {
    severity: "warning",
    title: overrides.id,
    details: "Details",
    source: "rule",
    ...overrides
  };
}
