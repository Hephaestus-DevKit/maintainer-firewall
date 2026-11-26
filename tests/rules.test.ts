import { describe, expect, it } from "vitest";
import { defaultConfig } from "../src/config.js";
import { analyzeSubject } from "../src/rules.js";
import type { IssueSubject, PullRequestSubject } from "../src/types.js";

const pullRequest: PullRequestSubject = {
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

const sectionConfig = {
  ...defaultConfig,
  pullRequest: { ...defaultConfig.pullRequest, requiredSections: ["Test plan"] }
};

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

  it("requires visible issue evidence beyond empty template headings and instructions", () => {
    const issue: IssueSubject = {
      kind: "issue",
      number: 12,
      title: "It crashes",
      body: "## Reproduction\n<!-- Paste exact steps here. -->\n\n## Environment\n<!-- Include the browser version. -->",
      author: "contributor",
      labels: [],
      htmlUrl: "https://github.com/example/repo/issues/12",
      duplicateCandidates: []
    };

    expect(analyzeSubject(issue, defaultConfig).map(({ id }) => id)).toEqual([
      "issue.body.too_short", "issue.reproduction.missing", "issue.environment.missing"
    ]);

    const completed = {
      ...issue,
      body: "## Reproduction\n```sh\n./start.sh\n```\n\n## Environment\nUbuntu 24.04"
    };
    expect(analyzeSubject(completed, defaultConfig).map(({ id }) => id)).toEqual(["issue.body.too_short"]);
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

  it.each([
    ["parser.go", "parser_test.go"],
    ["parser.py", "test_parser.py"],
    ["parser.py", "parser_test.py"]
  ])("recognizes colocated tests for %s in %s", (source, test) => {
    const pr = {
      ...pullRequest,
      changedFiles: [source, test].map((filename) => ({
        filename: `src/${filename}`, status: "modified", additions: 3, deletions: 1, changes: 4
      }))
    };

    expect(analyzeSubject(pr, defaultConfig).map(({ id }) => id)).not.toContain("pr.tests.missing");
  });

  it("does not count deleted test files as test coverage for code changes", () => {
    const pr: PullRequestSubject = {
      kind: "pull_request",
      number: 16,
      title: "Update parser",
      body: "This updates parser behavior and closes #10. It changes validation for nested tuples in production.",
      author: "contributor",
      labels: [],
      htmlUrl: "https://github.com/example/repo/pull/16",
      draft: false,
      baseRef: "main",
      headRef: "parser",
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
          status: "removed",
          additions: 0,
          deletions: 12,
          changes: 12
        }
      ]
    };

    const findings = analyzeSubject(pr, defaultConfig);

    expect(findings.map((finding) => finding.id)).toContain("pr.tests.missing");
  });

  it("treats modern JavaScript and TypeScript module files as code changes", () => {
    const pr: PullRequestSubject = {
      kind: "pull_request",
      number: 17,
      title: "Update runtime modules",
      body: "This updates runtime module behavior and closes #10. It changes loader validation in production.",
      author: "contributor",
      labels: [],
      htmlUrl: "https://github.com/example/repo/pull/17",
      draft: false,
      baseRef: "main",
      headRef: "runtime-modules",
      changedFiles: [
        {
          filename: "src/loader.cts",
          status: "modified",
          additions: 10,
          deletions: 1,
          changes: 11
        }
      ]
    };

    const findings = analyzeSubject(pr, defaultConfig);

    expect(findings.map((finding) => finding.id)).toContain("pr.tests.missing");
  });

  it("checks both names of renamed sensitive paths and avoids a missing test warning on a partial file list", () => {
    const pr: PullRequestSubject = {
      ...pullRequest,
      changedFiles: [{ filename: "src/check.cjs", status: "renamed", previousFilename: ".github/workflows/check.yml", additions: 1, deletions: 1, changes: 2 }]
    };

    const complete = analyzeSubject(pr, defaultConfig);
    expect(complete.map(({ id }) => id)).toContain("pr.tests.missing");
    expect(complete.find(({ id }) => id === "pr.sensitive_paths.changed")?.details).toContain(".github/workflows/check.yml");

    const partial = analyzeSubject({ ...pr, changedFilesComplete: false }, defaultConfig);
    expect(partial.map(({ id }) => id)).not.toContain("pr.tests.missing");
    expect(partial.map(({ id }) => id)).toContain("pr.sensitive_paths.changed");
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
    expect(findings.find((finding) => finding.id === "pr.required_sections.missing")?.references).toEqual([
      {
        source: "config",
        path: "pullRequest.requiredSections",
        label: "Test plan"
      }
    ]);
  });

  it("does not accept required sections that only appear inside fenced code", () => {
    const pr: PullRequestSubject = {
      kind: "pull_request",
      number: 24,
      title: "Improve renderer",
      body: "This improves rendering and closes #12.\n\n```md\n## Test plan\nnpm test\n```",
      author: "contributor",
      labels: [],
      htmlUrl: "https://github.com/example/repo/pull/24",
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

  it.each([
    "<!-- Insert enough detail to explain the scope and coverage.\n## Test plan\nFixes #12\n-->",
    "<!-- hidden\u2028Fixes #12 -->\n<!-- a -->text<!--\r\n## Test plan\n-->",
    "````md\n```\n## Test plan\nFixes #12\n````",
    "~~~~md\n~~~~ trailing prose\n## Test plan\nFixes #12\n~~~~"
  ])("ignores template matches inside comments and fences: %s", (body) => {
    const findings = analyzeSubject({ ...pullRequest, body }, sectionConfig);

    expect(findings.map(({ id }) => id)).toEqual([
      "pr.body.too_short", "pr.required_sections.missing", "pr.linked_issue.missing"
    ]);
  });

  it.each(["owner/repo#12", "https://github.com/owner/repo/issues/12", "[tracked elsewhere](https://github.com/owner/repo/issues/12)"])(
    "accepts an issue reference without a closing keyword: %s",
    (reference) => {
      const body = `See ${reference}\n\n## Test plan ###\n\nRan npm test.`;
      const findings = analyzeSubject({ ...pullRequest, body }, sectionConfig);

      expect(findings.map(({ id }) => id)).not.toContain("pr.linked_issue.missing");
      expect(findings.map(({ id }) => id)).not.toContain("pr.required_sections.missing");
    }
  );

  it("accepts a configured field label that contains a colon", () => {
    const pr = { ...pullRequest, body: "Test plan: Parser: ran npm test." };
    const config = {
      ...sectionConfig,
      pullRequest: { ...sectionConfig.pullRequest, requiredSections: ["Test plan: Parser"] }
    };

    expect(analyzeSubject(pr, config).map(({ id }) => id)).not.toContain("pr.required_sections.missing");
  });

  it("does not treat markdown issue-number headings as linked issues", () => {
    const pr: PullRequestSubject = {
      kind: "pull_request",
      number: 25,
      title: "Improve renderer",
      body: "This improves rendering and documents migration behavior.\n\n#123\n\nNo related issue yet.",
      author: "contributor",
      labels: [],
      htmlUrl: "https://github.com/example/repo/pull/25",
      draft: false,
      baseRef: "main",
      headRef: "renderer",
      changedFiles: []
    };

    const findings = analyzeSubject(pr, defaultConfig);

    expect(findings.map((finding) => finding.id)).toContain("pr.linked_issue.missing");
  });

  it("flags missing configured issue sections", () => {
    const issue: IssueSubject = {
      kind: "issue",
      number: 26,
      title: "Parser crash",
      body: "Version 1.2.3 crashes after running the documented reproduction command with expected versus actual behavior.",
      author: "reporter",
      labels: [],
      htmlUrl: "https://github.com/example/repo/issues/26",
      duplicateCandidates: []
    };
    const config = {
      ...defaultConfig,
      issue: {
        ...defaultConfig.issue,
        requiredSections: ["Environment"]
      }
    };

    const findings = analyzeSubject(issue, config);

    expect(findings.map((finding) => finding.id)).toContain("issue.required_sections.missing");
  });

  it("honors disabled issue and pull request rule groups", () => {
    expect(analyzeSubject({
      kind: "issue",
      number: 27,
      title: "Crash",
      body: "",
      author: "reporter",
      labels: [],
      htmlUrl: "https://github.com/example/repo/issues/27",
      duplicateCandidates: []
    }, {
      ...defaultConfig,
      issue: {
        ...defaultConfig.issue,
        enabled: false
      }
    })).toEqual([]);

    expect(analyzeSubject({
      kind: "pull_request",
      number: 28,
      title: "Change code",
      body: "",
      author: "contributor",
      labels: [],
      htmlUrl: "https://github.com/example/repo/pull/28",
      draft: false,
      baseRef: "main",
      headRef: "change",
      changedFiles: []
    }, {
      ...defaultConfig,
      pullRequest: {
        ...defaultConfig.pullRequest,
        enabled: false
      }
    })).toEqual([]);
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
