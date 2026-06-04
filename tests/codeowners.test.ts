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
`);

    expect(ownersForPath("docs/README.md", rules)).toEqual(["@docs"]);
    expect(ownersForPath("src/docs/README.md", rules)).toEqual([]);
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
docs/**
README.md user-without-at
*.md @docs
`);

    expect(rules).toHaveLength(1);
    expect(ownersForPath("README.md", rules)).toEqual(["@docs"]);
  });
});

describe("loadCodeOwnerHints", () => {
  it("loads the first available CODEOWNERS file and groups changed files by owner", async () => {
    const octokit = {
      rest: {
        repos: {
          getContent: async ({ path }: { path: string }) => {
            if (path === "CODEOWNERS") {
              throw { status: 404 };
            }

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
    expect(warnings[0]).toBe("Failed to load CODEOWNERS from CODEOWNERS: rate limited");
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
