import { describe, expect, it } from "vitest";
import { defaultConfig } from "../src/config.js";
import { createReviewSummary } from "../src/review.js";
import type { Finding, PullRequestSubject } from "../src/types.js";

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

describe("createReviewSummary", () => {
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
});
