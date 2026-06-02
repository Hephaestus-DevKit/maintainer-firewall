import { describe, expect, it } from "vitest";
import { defaultConfig } from "../src/config.js";
import { analyzeSubject } from "../src/rules.js";
import type { IssueSubject, PullRequestSubject } from "../src/types.js";

describe("analyzeSubject", () => {
  it("flags thin issues without reproduction or environment", () => {
    const issue: IssueSubject = {
      kind: "issue",
      number: 12,
      title: "It crashes",
      body: "This crashes for me.",
      author: "contributor",
      labels: [],
      htmlUrl: "https://github.com/example/repo/issues/12",
      duplicateCandidates: []
    };

    const findings = analyzeSubject(issue, defaultConfig);

    expect(findings.map((finding) => finding.id)).toEqual([
      "issue.body.too_short",
      "issue.reproduction.missing",
      "issue.environment.missing"
    ]);
    expect(findings.map((finding) => finding.suggestion).join(" ")).toContain("Please add");
  });

  it("flags PRs with code changes and no tests", () => {
    const pr: PullRequestSubject = {
      kind: "pull_request",
      number: 14,
      title: "Refactor auth flow",
      body: "This refactors the auth flow and closes #9. It updates token validation and request parsing for the new middleware.",
      author: "contributor",
      labels: [],
      htmlUrl: "https://github.com/example/repo/pull/14",
      draft: false,
      baseRef: "main",
      headRef: "refactor-auth",
      changedFiles: [
        {
          filename: "src/auth.ts",
          status: "modified",
          additions: 100,
          deletions: 20,
          changes: 120
        }
      ]
    };

    const findings = analyzeSubject(pr, defaultConfig);

    expect(findings.map((finding) => finding.id)).toContain("pr.tests.missing");
  });

  it("does not flag PR tests when a matching test file changes", () => {
    const pr: PullRequestSubject = {
      kind: "pull_request",
      number: 15,
      title: "Fix parser regression",
      body: "This fixes parser regression and closes #10. It adds coverage for the nested tuple case that previously failed in production.",
      author: "contributor",
      labels: [],
      htmlUrl: "https://github.com/example/repo/pull/15",
      draft: false,
      baseRef: "main",
      headRef: "fix-parser",
      changedFiles: [
        {
          filename: "src/parser.ts",
          status: "modified",
          additions: 20,
          deletions: 5,
          changes: 25
        },
        {
          filename: "src/parser.test.ts",
          status: "modified",
          additions: 12,
          deletions: 0,
          changes: 12
        }
      ]
    };

    const findings = analyzeSubject(pr, defaultConfig);

    expect(findings.map((finding) => finding.id)).not.toContain("pr.tests.missing");
  });

  it("routes possible security reports to security review", () => {
    const issue: IssueSubject = {
      kind: "issue",
      number: 18,
      title: "Possible XSS vulnerability",
      body: "I found a possible XSS vulnerability in the rendered markdown preview. Version 1.2.3 is affected. I can share reproduction details privately.",
      author: "researcher",
      labels: [],
      htmlUrl: "https://github.com/example/repo/issues/18",
      duplicateCandidates: []
    };

    const findings = analyzeSubject(issue, defaultConfig);

    expect(findings.map((finding) => finding.id)).toContain("content.security_report.possible");
    expect(findings.find((finding) => finding.id === "content.security_report.possible")?.label).toBe("securityReview");
  });

  it("does not echo possible secrets in findings", () => {
    const issue: IssueSubject = {
      kind: "issue",
      number: 19,
      title: "Token exposed",
      body: "My token is sk-123456789012345678901234567890 and the app logs it.",
      author: "reporter",
      labels: [],
      htmlUrl: "https://github.com/example/repo/issues/19",
      duplicateCandidates: []
    };

    const finding = analyzeSubject(issue, defaultConfig).find((item) => item.id === "content.secret.possible");

    expect(finding?.severity).toBe("error");
    expect(finding?.details).not.toContain("sk-123");
  });

  it("recognizes additional common token formats without echoing values", () => {
    const issue: IssueSubject = {
      kind: "issue",
      number: 22,
      title: "GitLab token exposed",
      body: "The logs include glpat-1234567890abcdefghijkl and should be redacted.",
      author: "reporter",
      labels: [],
      htmlUrl: "https://github.com/example/repo/issues/22",
      duplicateCandidates: []
    };

    const finding = analyzeSubject(issue, defaultConfig).find((item) => item.id === "content.secret.possible");

    expect(finding?.severity).toBe("error");
    expect(JSON.stringify(finding)).not.toContain("glpat-123");
  });

  it("redacts secret-like duplicate issue titles in findings", () => {
    const token = "github_pat_1234567890abcdefghijklmnopqrst";
    const issue: IssueSubject = {
      kind: "issue",
      number: 23,
      title: "Auth logs expose credentials",
      body: "Version 1.2.3 shows this after running the documented reproduction command with expected versus actual behavior.",
      author: "reporter",
      labels: [],
      htmlUrl: "https://github.com/example/repo/issues/23",
      duplicateCandidates: [
        {
          number: 7,
          title: `Leaked ${token}`,
          url: "https://github.com/example/repo/issues/7",
          similarity: 0.72
        }
      ]
    };

    const finding = analyzeSubject(issue, defaultConfig).find((item) => item.id === "issue.duplicate.possible");

    expect(finding?.details).toContain("[redacted]");
    expect(finding?.details).not.toContain(token);
  });

  it("flags missing configured required sections", () => {
    const pr: PullRequestSubject = {
      kind: "pull_request",
      number: 20,
      title: "Improve renderer",
      body: "This improves rendering and closes #12. It adds support for nested emphasis markers.",
      author: "contributor",
      labels: [],
      htmlUrl: "https://github.com/example/repo/pull/20",
      draft: false,
      baseRef: "main",
      headRef: "renderer",
      changedFiles: []
    };
    const config = {
      ...defaultConfig,
      pullRequest: {
        ...defaultConfig.pullRequest,
        requiredSections: ["Test plan"]
      }
    };

    const findings = analyzeSubject(pr, config);

    expect(findings.map((finding) => finding.id)).toContain("pr.required_sections.missing");
  });

  it("accepts configured sections as markdown headings", () => {
    const pr: PullRequestSubject = {
      kind: "pull_request",
      number: 21,
      title: "Improve renderer",
      body: "This improves rendering and closes #12.\n\n## Test plan\n\nnpm test",
      author: "contributor",
      labels: [],
      htmlUrl: "https://github.com/example/repo/pull/21",
      draft: false,
      baseRef: "main",
      headRef: "renderer",
      changedFiles: []
    };
    const config = {
      ...defaultConfig,
      pullRequest: {
        ...defaultConfig.pullRequest,
        requiredSections: ["Test plan"]
      }
    };

    const findings = analyzeSubject(pr, config);

    expect(findings.map((finding) => finding.id)).not.toContain("pr.required_sections.missing");
  });
});
