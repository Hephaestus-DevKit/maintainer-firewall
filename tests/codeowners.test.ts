import { describe, expect, it, vi } from "vitest";
import { loadCodeOwnerHints, ownersForPath, parseCodeOwners } from "../src/codeowners.js";
import { defaultConfig } from "../src/config.js";
import type { PullRequestSubject } from "../src/types.js";

vi.mock("@actions/core", () => ({
  info: vi.fn(),
  warning: vi.fn()
}));

describe("CODEOWNERS helpers", () => {
  it("parses owner rules and uses last match wins", () => {
    const rules = parseCodeOwners(`
# comment
*.ts @org/typescript
src/security/** @org/security
src/security/keys.ts @org/key-owners @alice
`);

    expect(ownersForPath("src/index.ts", rules)).toEqual(["@org/typescript"]);
    expect(ownersForPath("src/security/audit.ts", rules)).toEqual(["@org/security"]);
    expect(ownersForPath("src/security/keys.ts", rules)).toEqual(["@org/key-owners", "@alice"]);
  });

  it("supports root-anchored directory patterns", () => {
    const rules = parseCodeOwners(`
/docs/ @docs
/README.md @root
`);

    expect(ownersForPath("docs/README.md", rules)).toEqual(["@docs"]);
    expect(ownersForPath("src/docs/README.md", rules)).toEqual([]);
    expect(ownersForPath("README.md", rules)).toEqual(["@root"]);
    expect(ownersForPath("src/README.md", rules)).toEqual([]);
  });

  it("matches basename patterns at the repository root and nested paths", () => {
    const rules = parseCodeOwners(`
*.md @docs
`);

    expect(ownersForPath("README.md", rules)).toEqual(["@docs"]);
    expect(ownersForPath("docs/README.md", rules)).toEqual(["@docs"]);
  });

  it("ignores malformed lines", () => {
    const rules = parseCodeOwners(`
!docs/** @owner
README.md user-without-at
*.md @docs
`);

    expect(rules).toHaveLength(1);
    expect(ownersForPath("README.md", rules)).toEqual(["@docs"]);
  });

  it("applies unanchored directory rules and keeps a trailing wildcard within its directory", () => {
    const rules = parseCodeOwners(`
* @default
apps/ @apps
docs/* @docs
**/logs @logs
src/[id]/page.tsx @routes
`);

    expect(ownersForPath("packages/apps/client.ts", rules)).toEqual(["@apps"]);
    expect(ownersForPath("docs/start.md", rules)).toEqual(["@docs"]);
    expect(ownersForPath("docs/tutorials/start.md", rules)).toEqual(["@default"]);
    expect(ownersForPath("packages/logs/output.txt", rules)).toEqual(["@logs"]);
    expect(ownersForPath("src/[id]/page.tsx", rules)).toEqual(["@routes"]);
    expect(ownersForPath("src/i/page.tsx", rules)).toEqual(["@default"]);
  });

  it("honors ownerless overrides and excludes emails and inline comments from routing hints", () => {
    const rules = parseCodeOwners(`
/apps/ @apps # @ignored
/apps/github
/apps/cli docs@example.com @cli
/apps/private private@example.com
`);

    expect(ownersForPath("apps/web/app.ts", rules)).toEqual(["@apps"]);
    expect(ownersForPath("apps/github/client.ts", rules)).toEqual([]);
    expect(ownersForPath("apps/cli/main.ts", rules)).toEqual(["@cli"]);
    expect(ownersForPath("apps/private/config.ts", rules)).toEqual([]);
  });
});

describe("loadCodeOwnerHints", () => {
  it("loads the first available CODEOWNERS file and groups changed files by owner", async () => {
    const octokit = {
      rest: {
        repos: {
          getContent: vi.fn(async ({ path }: { path: string }) => {
            if (path === ".github/CODEOWNERS") {
              return {
                data: {
                  type: "file",
                  path,
                  content: Buffer.from(`
*.ts @org/typescript
src/security/** @org/security
`, "utf8").toString("base64")
                }
              };
            }

            throw { status: 404 };
          })
        }
      }
    };

    const hints = await loadCodeOwnerHints(
      octokit as never,
      "octo",
      "repo",
      "main",
      defaultConfig,
      pullRequestSubject()
    );

    expect(hints).toEqual([
      {
        owner: "@org/typescript",
        files: ["src/index.ts"]
      },
      {
        owner: "@org/security",
        files: ["src/security/audit.ts"]
      }
    ]);
    expect(octokit.rest.repos.getContent).toHaveBeenCalledExactlyOnceWith({
      owner: "octo",
      repo: "repo",
      ref: "main",
      path: ".github/CODEOWNERS"
    });
  });

  it("keeps an empty higher-priority file authoritative", async () => {
    const getContent = vi.fn().mockResolvedValue({
      data: { type: "file", path: ".github/CODEOWNERS", encoding: "base64", content: "" }
    });
    const octokit = { rest: { repos: { getContent } } };

    await expect(loadCodeOwnerHints(octokit as never, "octo", "repo", "main", defaultConfig, pullRequestSubject()))
      .resolves.toEqual([]);
    expect(getContent).toHaveBeenCalledTimes(1);
  });

  it("routes both sides of a rename and ranks owners before capping displayed files", async () => {
    const octokit = {
      rest: {
        repos: {
          getContent: vi.fn().mockResolvedValue({
            data: {
              type: "file",
              path: ".github/CODEOWNERS",
              content: Buffer.from("/before/ @before\n/after/ @after", "utf8").toString("base64")
            }
          })
        }
      }
    };
    const files = [
      ...Array.from({ length: 5 }, (_, index) => (`before/file-${index}.ts`)),
      ...Array.from({ length: 6 }, (_, index) => (`after/file-${index}.ts`))
    ].map((filename) => ({ filename, status: "modified", additions: 1, deletions: 1, changes: 2 }));
    const subject = pullRequestSubject();
    subject.changedFiles = [
      ...files,
      { filename: "after/renamed.ts", previousFilename: "before/renamed.ts", status: "renamed", additions: 0, deletions: 0, changes: 0 }
    ];

    const hints = await loadCodeOwnerHints(octokit as never, "octo", "repo", "main", defaultConfig, subject);
    expect(hints.map((hint) => hint.owner)).toEqual(["@after", "@before"]);
    expect(hints.every((hint) => hint.files.length === 5)).toBe(true);
    subject.changedFiles = subject.changedFiles.slice(-1);
    await expect(loadCodeOwnerHints(octokit as never, "octo", "repo", "main", defaultConfig, subject))
      .resolves.toEqual([
        { owner: "@after", files: ["after/renamed.ts"] },
        { owner: "@before", files: ["before/renamed.ts"] }
      ]);
  });

  it("warns and falls back when CODEOWNERS loading fails", async () => {
    const warnings: string[] = [];
    const octokit = {
      rest: {
        repos: {
          getContent: async () => {
            throw new Error("rate limited");
          }
        }
      }
    };

    const hints = await loadCodeOwnerHints(
      octokit as never,
      "octo",
      "repo",
      "main",
      defaultConfig,
      pullRequestSubject(),
      (warning) => warnings.push(warning)
    );

    expect(hints).toEqual([]);
    expect(warnings[0]).toBe("Failed to load CODEOWNERS from .github/CODEOWNERS: rate limited");
  });
});

function pullRequestSubject(): PullRequestSubject {
  return {
    kind: "pull_request",
    number: 42,
    title: "Improve security audit",
    body: "Fixes #1",
    author: "contributor",
    labels: [],
    htmlUrl: "https://github.com/octo/repo/pull/42",
    draft: false,
    baseRef: "main",
    headRef: "security-audit",
    changedFiles: [
      {
        filename: "src/index.ts",
        status: "modified",
        additions: 10,
        deletions: 2,
        changes: 12
      },
      {
        filename: "src/security/audit.ts",
        status: "modified",
        additions: 8,
        deletions: 1,
        changes: 9
      }
    ]
  };
}
