import * as core from "@actions/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { applyLabels, buildSubject, getConfigRef, hasReportComment, removeLabels, upsertComment } from "../src/github-client.js";

const reportMarker = "<!-- maintainer-firewall:report -->";
const reportAuthor = { id: 41898282, login: "github-actions[bot]" };

vi.mock("@actions/core", () => ({
  info: vi.fn(),
  warning: vi.fn()
}));

describe("buildSubject", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("continues with pull request body checks when changed files cannot be listed", async () => {
    const octokit = {
      paginate: vi.fn().mockRejectedValue(new Error("Resource not accessible by integration")),
      rest: {
        pulls: {
          listFiles: vi.fn()
        }
      }
    };

    const subject = await buildSubject(octokit as never, pullRequestContext(), 0);

    expect(subject?.kind).toBe("pull_request");
    if (subject?.kind === "pull_request") {
      expect(subject.changedFiles).toEqual([]);
      expect(subject.changedFilesComplete).toBe(false);
    }
    expect(core.warning).toHaveBeenCalledWith(
      "Could not list files for pull request #42: Resource not accessible by integration. Continuing with title and body checks only."
    );
  });

  it("maps changed files from pull request payloads", async () => {
    const octokit = {
      paginate: vi.fn().mockResolvedValue([
        {
          filename: "src/index.ts",
          status: "modified",
          additions: 12,
          deletions: 3,
          changes: 15
        }
      ]),
      rest: {
        pulls: {
          listFiles: vi.fn()
        }
      }
    };

    const subject = await buildSubject(octokit as never, pullRequestContext(), 0);

    expect(octokit.paginate).toHaveBeenCalledWith(octokit.rest.pulls.listFiles, {
      owner: "octo",
      repo: "repo",
      pull_number: 42,
      per_page: 100
    });
    expect(subject?.kind).toBe("pull_request");
    if (subject?.kind === "pull_request") {
      expect(subject.changedFiles).toEqual([
        {
          filename: "src/index.ts",
          status: "modified",
          additions: 12,
          deletions: 3,
          changes: 15
        }
      ]);
    }
  });

  it("keeps available files and previous names when the file list is incomplete", async () => {
    const warning = vi.fn();
    const octokit = {
      paginate: vi.fn().mockResolvedValue([
        {
          filename: "new.ts",
          previous_filename: "old.ts",
          status: "renamed",
          additions: 0,
          deletions: 0,
          changes: 0
        }
      ]),
      rest: { pulls: { listFiles: vi.fn() } }
    };

    await expect(buildSubject(octokit as never, pullRequestContext({ changed_files: 2 }), 0, warning))
      .resolves.toMatchObject({
        kind: "pull_request",
        changedFiles: [{ filename: "new.ts", previousFilename: "old.ts", status: "renamed" }],
        changedFilesComplete: false
      });
    expect(warning).toHaveBeenCalledWith(expect.stringContaining("File-based checks may be incomplete"));
  });

  it("builds issue subjects and skips duplicate search for short titles", async () => {
    const octokit = {
      rest: {
        search: {
          issuesAndPullRequests: vi.fn()
        }
      }
    };

    const subject = await buildSubject(octokit as never, issueContext({
      title: "Crash"
    }), 8);

    expect(subject?.kind).toBe("issue");
    if (subject?.kind === "issue") {
      expect(subject.duplicateCandidates).toEqual([]);
      expect(subject.duplicateSearchComplete).toBe(false);
    }
    expect(octokit.rest.search.issuesAndPullRequests).not.toHaveBeenCalled();
  });

  it("returns null for unsupported events and issue events that actually reference pull requests", async () => {
    const octokit = {
      rest: {
        search: {
          issuesAndPullRequests: vi.fn()
        }
      }
    };

    await expect(buildSubject(octokit as never, {
      eventName: "push",
      repo: { owner: "octo", repo: "repo" },
      payload: {}
    } as never, 8)).resolves.toBeNull();
    await expect(buildSubject(octokit as never, issueContext({
      pull_request: {}
    }), 8)).resolves.toBeNull();
  });

  it("normalizes issue labels and missing authors from GitHub payloads", async () => {
    const octokit = {
      rest: {
        search: {
          issuesAndPullRequests: vi.fn()
        }
      }
    };

    const subject = await buildSubject(octokit as never, issueContext({
      labels: ["bug", { name: "needs-info" }, {}],
      user: null
    }), 0);

    expect(subject?.kind).toBe("issue");
    if (subject?.kind === "issue") {
      expect(subject.labels).toEqual(["bug", "needs-info"]);
      expect(subject.author).toBe("unknown");
    }
  });

  it("adds likely duplicate issue candidates for longer titles", async () => {
    const octokit = {
      rest: {
        search: {
          issuesAndPullRequests: vi.fn().mockResolvedValue({
            data: {
              items: [
                {
                  number: 4,
                  title: "Parser crash on startup",
                  html_url: "https://github.com/octo/repo/issues/4"
                }
              ]
            }
          })
        }
      }
    };

    const subject = await buildSubject(octokit as never, issueContext({
      title: "Parser crash startup"
    }), 8);

    expect(subject?.kind).toBe("issue");
    if (subject?.kind === "issue") {
      expect(subject.duplicateCandidates[0]).toMatchObject({
        number: 4,
        title: "Parser crash on startup"
      });
    }
  });

  it("keeps matches from a partial GitHub search and marks the result incomplete", async () => {
    const warning = vi.fn();
    const search = vi.fn().mockResolvedValue({
      data: {
        incomplete_results: true,
        items: [{ number: 12, title: "Parser crash startup", html_url: "https://github.com/octo/repo/issues/12" }]
      }
    });
    const octokit = { rest: { search: { issuesAndPullRequests: search } } };

    const subject = await buildSubject(octokit as never, issueContext({ title: "Parser parser crash startup" }), 15, warning);

    expect(search).toHaveBeenCalledWith({ q: "repo:octo/repo is:issue in:title parser crash startup", per_page: 16 });
    expect(subject).toMatchObject({ duplicateCandidates: [{ number: 12 }], duplicateSearchComplete: false });
    expect(warning).toHaveBeenCalledWith(expect.stringContaining("did not complete the duplicate issue search"));
  });

  it("warns and continues when duplicate issue search fails", async () => {
    const warnings: string[] = [];
    const octokit = {
      rest: {
        search: {
          issuesAndPullRequests: vi.fn().mockRejectedValue(new Error("search down"))
        }
      }
    };

    const subject = await buildSubject(octokit as never, issueContext({
      title: "Parser crash startup"
    }), 8, (warning) => warnings.push(warning));

    expect(subject?.kind).toBe("issue");
    if (subject?.kind === "issue") {
      expect(subject.duplicateCandidates).toEqual([]);
      expect(subject.duplicateSearchComplete).toBe(false);
    }
    expect(warnings).toEqual(["Duplicate issue search failed: search down"]);
  });
});

describe("applyLabels", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("continues when another run creates a missing label first", async () => {
    const octokit = {
      rest: {
        issues: {
          getLabel: vi.fn().mockRejectedValueOnce({ status: 404 }).mockResolvedValueOnce({}),
          createLabel: vi.fn().mockRejectedValue({ status: 422 }),
          addLabels: vi.fn().mockResolvedValue({})
        }
      }
    };

    await applyLabels(octokit as never, "octo", "repo", 42, ["needs-info"], true);

    expect(octokit.rest.issues.createLabel).toHaveBeenCalledWith({
      owner: "octo",
      repo: "repo",
      name: "needs-info",
      color: "ededed",
      description: "Managed by Maintainer Firewall"
    });
    expect(octokit.rest.issues.getLabel).toHaveBeenCalledTimes(2);
    expect(octokit.rest.issues.addLabels).toHaveBeenCalledWith({
      owner: "octo",
      repo: "repo",
      issue_number: 42,
      labels: ["needs-info"]
    });
  });

  it("skips empty label writes", async () => {
    const octokit = {
      rest: {
        issues: {
          getLabel: vi.fn(),
          createLabel: vi.fn(),
          addLabels: vi.fn()
        }
      }
    };

    await applyLabels(octokit as never, "octo", "repo", 42, ["", ""], true);

    expect(octokit.rest.issues.addLabels).not.toHaveBeenCalled();
    expect(octokit.rest.issues.getLabel).not.toHaveBeenCalled();
  });

  it("preserves a failed label validation when GitHub did not create the label", async () => {
    const validationError = { status: 422, message: "Validation Failed" };
    const octokit = {
      rest: {
        issues: {
          getLabel: vi.fn().mockRejectedValue({ status: 404 }),
          createLabel: vi.fn().mockRejectedValue(validationError),
          addLabels: vi.fn()
        }
      }
    };

    await expect(applyLabels(octokit as never, "octo", "repo", 42, ["needs-info"], true)).rejects.toEqual(validationError);
    expect(octokit.rest.issues.addLabels).not.toHaveBeenCalled();
  });

  it("creates missing managed labels with deterministic colors", async () => {
    const octokit = {
      rest: {
        issues: {
          getLabel: vi.fn().mockRejectedValue({ status: 404 }),
          createLabel: vi.fn().mockResolvedValue({}),
          addLabels: vi.fn().mockResolvedValue({})
        }
      }
    };

    await applyLabels(octokit as never, "octo", "repo", 42, [
      "security-review",
      "needs-tests",
      "possible-duplicate",
      "large-scope"
    ], true);

    expect(octokit.rest.issues.createLabel).toHaveBeenCalledWith(expect.objectContaining({
      name: "security-review",
      color: "b60205"
    }));
    expect(octokit.rest.issues.createLabel).toHaveBeenCalledWith(expect.objectContaining({
      name: "needs-tests",
      color: "d4c5f9"
    }));
    expect(octokit.rest.issues.createLabel).toHaveBeenCalledWith(expect.objectContaining({
      name: "possible-duplicate",
      color: "cfd3d7"
    }));
    expect(octokit.rest.issues.createLabel).toHaveBeenCalledWith(expect.objectContaining({
      name: "large-scope",
      color: "fbca04"
    }));
  });
});

describe("hasReportComment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns true when a managed report comment already exists", async () => {
    const octokit = {
      graphql: vi.fn().mockResolvedValue({ viewer: { databaseId: reportAuthor.id, login: reportAuthor.login } }),
      rest: {
        issues: {
          listComments: vi.fn().mockResolvedValue({
            data: [
              {
                id: 10,
                body: `${reportMarker}\n## Maintainer Firewall report`,
                user: reportAuthor
              }
            ]
          })
        }
      }
    };

    await expect(hasReportComment(octokit as never, "octo", "repo", 42)).resolves.toBe(true);
    expect(octokit.rest.issues.listComments).toHaveBeenCalledWith({
      owner: "octo",
      repo: "repo",
      issue_number: 42,
      per_page: 100,
      page: 1
    });
  });

  it("stops scanning comments as soon as a managed report is found", async () => {
    const firstPage = Array.from({ length: 100 }, (_, index) => ({
      id: index + 1,
      body: index === 9 ? reportMarker : "ordinary comment",
      user: reportAuthor
    }));
    const octokit = {
      graphql: vi.fn().mockResolvedValue({ viewer: { databaseId: reportAuthor.id, login: reportAuthor.login } }),
      rest: {
        issues: {
          listComments: vi.fn().mockResolvedValue({
            data: firstPage
          })
        }
      }
    };

    await expect(hasReportComment(octokit as never, "octo", "repo", 42)).resolves.toBe(true);
    expect(octokit.rest.issues.listComments).toHaveBeenCalledTimes(1);
  });

  it("continues when existing report comments cannot be listed", async () => {
    const octokit = {
      rest: {
        issues: {
          listComments: vi.fn().mockRejectedValue(new Error("Resource not accessible by integration"))
        }
      }
    };

    await expect(hasReportComment(octokit as never, "octo", "repo", 42)).resolves.toBe(false);
    expect(core.warning).toHaveBeenCalledWith(
      "Could not check for an existing Maintainer Firewall report on #42: Resource not accessible by integration."
    );
  });

  it("scans additional comment pages only when needed", async () => {
    const octokit = {
      graphql: vi.fn().mockResolvedValue({ viewer: { databaseId: reportAuthor.id, login: reportAuthor.login } }),
      rest: {
        issues: {
          listComments: vi.fn()
            .mockResolvedValueOnce({
              data: Array.from({ length: 100 }, (_, index) => ({
                id: index + 1,
                body: reportMarker,
                user: { id: index + 1, login: "contributor" }
              }))
            })
            .mockResolvedValueOnce({
              data: [
                {
                  id: 101,
                  body: reportMarker,
                  user: reportAuthor
                }
              ]
            })
        }
      }
    };

    await expect(hasReportComment(octokit as never, "octo", "repo", 42)).resolves.toBe(true);
    expect(octokit.rest.issues.listComments).toHaveBeenNthCalledWith(2, {
      owner: "octo",
      repo: "repo",
      issue_number: 42,
      per_page: 100,
      page: 2
    });
    expect(octokit.graphql).toHaveBeenCalledTimes(1);
  });
});

describe("issue comment and label operations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("updates an existing managed report comment", async () => {
    const octokit = {
      graphql: vi.fn().mockResolvedValue({ viewer: { databaseId: reportAuthor.id, login: reportAuthor.login } }),
      rest: {
        issues: {
          listComments: vi.fn().mockResolvedValue({
            data: [
              {
                id: 99,
                body: reportMarker,
                user: reportAuthor
              }
            ]
          }),
          updateComment: vi.fn().mockResolvedValue({}),
          createComment: vi.fn()
        }
      }
    };

    await upsertComment(octokit as never, "octo", "repo", 42, "new body", true);

    expect(octokit.rest.issues.updateComment).toHaveBeenCalledWith({
      owner: "octo",
      repo: "repo",
      comment_id: 99,
      body: "new body"
    });
    expect(octokit.rest.issues.createComment).not.toHaveBeenCalled();
  });

  it("creates a new report comment when no managed report exists", async () => {
    const octokit = {
      graphql: vi.fn().mockResolvedValue({ viewer: { databaseId: reportAuthor.id, login: reportAuthor.login } }),
      rest: {
        issues: {
          listComments: vi.fn().mockResolvedValue({
            data: [
              { id: 12, body: reportMarker, user: { id: 2, login: "contributor" } },
              { id: 13, body: `Other report\n${reportMarker}`, user: reportAuthor }
            ]
          }),
          updateComment: vi.fn(),
          createComment: vi.fn().mockResolvedValue({})
        }
      }
    };

    await upsertComment(octokit as never, "octo", "repo", 42, "new body", true);

    expect(octokit.rest.issues.createComment).toHaveBeenCalledWith({
      owner: "octo",
      repo: "repo",
      issue_number: 42,
      body: "new body"
    });
    expect(octokit.rest.issues.updateComment).not.toHaveBeenCalled();
  });

  it("keeps an unchanged report written with a personal access token", async () => {
    const body = `${reportMarker}\n## My report`;
    const octokit = {
      graphql: vi.fn().mockResolvedValue({ viewer: { databaseId: null, login: "Maintainer" } }),
      rest: {
        issues: {
          listComments: vi.fn().mockResolvedValue({ data: [{ id: 99, body, user: { id: 10, login: "maintainer" } }] }),
          updateComment: vi.fn(),
          createComment: vi.fn()
        }
      }
    };

    await expect(hasReportComment(octokit as never, "octo", "repo", 42)).resolves.toBe(true);
    await upsertComment(octokit as never, "octo", "repo", 42, body, true);

    expect(octokit.graphql).toHaveBeenCalledTimes(1);
    expect(octokit.rest.issues.updateComment).not.toHaveBeenCalled();
    expect(octokit.rest.issues.createComment).not.toHaveBeenCalled();
  });

  it("keeps existing comments untouched when GitHub cannot verify ownership", async () => {
    const octokit = {
      graphql: vi.fn().mockResolvedValue({ viewer: null }),
      rest: {
        issues: {
          listComments: vi.fn().mockResolvedValue({ data: [{ id: 99, body: reportMarker, user: reportAuthor }] }),
          updateComment: vi.fn(),
          createComment: vi.fn()
        }
      }
    };

    await expect(upsertComment(octokit as never, "octo", "repo", 42, "new body", true))
      .rejects.toThrow("GitHub did not identify the account");
    expect(octokit.rest.issues.updateComment).not.toHaveBeenCalled();
    expect(octokit.rest.issues.createComment).not.toHaveBeenCalled();
  });

  it("creates comments directly when existing report updates are disabled", async () => {
    const octokit = {
      rest: {
        issues: {
          listComments: vi.fn(),
          createComment: vi.fn().mockResolvedValue({})
        }
      }
    };

    await upsertComment(octokit as never, "octo", "repo", 42, "new body", false);

    expect(octokit.rest.issues.createComment).toHaveBeenCalledWith({
      owner: "octo",
      repo: "repo",
      issue_number: 42,
      body: "new body"
    });
    expect(octokit.rest.issues.listComments).not.toHaveBeenCalled();
  });

  it("ignores missing labels when removing stale managed labels", async () => {
    const octokit = {
      rest: {
        issues: {
          removeLabel: vi.fn().mockRejectedValue({ status: 404 })
        }
      }
    };

    await expect(removeLabels(octokit as never, "octo", "repo", 42, ["needs-info"])).resolves.toBeUndefined();
  });

  it("throws non-404 label removal errors", async () => {
    const octokit = {
      rest: {
        issues: {
          removeLabel: vi.fn().mockRejectedValue({ status: 403 })
        }
      }
    };

    await expect(removeLabels(octokit as never, "octo", "repo", 42, ["needs-info"])).rejects.toEqual({ status: 403 });
  });
});

describe("getConfigRef", () => {
  it("uses the pull request base sha when available", () => {
    expect(getConfigRef(pullRequestContext())).toBe("base-sha");
  });

  it("uses the base branch when a pull request event omits the base sha", () => {
    expect(getConfigRef(pullRequestContext({ base: { ref: "release" } }))).toBe("release");
  });

  it("normalizes branch and tag refs", () => {
    expect(getConfigRef({
      eventName: "push",
      ref: "refs/heads/main",
      repo: { owner: "octo", repo: "repo" },
      payload: {}
    } as never)).toBe("main");
    expect(getConfigRef({
      eventName: "push",
      ref: "refs/tags/v0.7.0",
      repo: { owner: "octo", repo: "repo" },
      payload: {}
    } as never)).toBe("v0.7.0");
  });

  it("returns undefined when no ref is available", () => {
    expect(getConfigRef({
      eventName: "workflow_dispatch",
      repo: { owner: "octo", repo: "repo" },
      payload: {}
    } as never)).toBeUndefined();
  });
});

function pullRequestContext(overrides: { changed_files?: number; base?: { ref: string; sha?: string } } = {}) {
  return {
    eventName: "pull_request_target",
    repo: {
      owner: "octo",
      repo: "repo"
    },
    ref: "refs/heads/main",
    payload: {
      pull_request: {
        number: 42,
        title: "Improve docs",
        body: "This change improves documentation.",
        html_url: "https://github.com/octo/repo/pull/42",
        draft: false,
        labels: [
          { name: "documentation" }
        ],
        user: {
          login: "contributor"
        },
        base: {
          ref: "main",
          sha: "base-sha"
        },
        head: {
          ref: "feature"
        },
        ...overrides
      }
    }
  } as never;
}

function issueContext(overrides: Partial<{
  title: string;
  body: string;
  labels: unknown[];
  pull_request: unknown;
  user: { login?: string } | null;
}> = {}) {
  return {
    eventName: "issues",
    repo: {
      owner: "octo",
      repo: "repo"
    },
    ref: "refs/heads/main",
    payload: {
      issue: {
        number: 7,
        title: overrides.title ?? "Parser crash startup",
        body: overrides.body ?? "Version 1.2.3 crashes after running the reproduction command.",
        html_url: "https://github.com/octo/repo/issues/7",
        labels: overrides.labels ?? [],
        ...(overrides.pull_request === undefined ? {} : { pull_request: overrides.pull_request }),
        ...(overrides.user === null ? {} : { user: overrides.user ?? { login: "reporter" } })
      }
    }
  } as never;
}
