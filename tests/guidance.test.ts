import { describe, expect, it, vi } from "vitest";
import { defaultConfig } from "../src/config.js";
import { loadRepositoryGuidance, summarizeGuidanceForPrompt } from "../src/guidance.js";

vi.mock("@actions/core", () => ({
  info: vi.fn(),
  warning: vi.fn()
}));

describe("summarizeGuidanceForPrompt", () => {
  it("formats loaded guidance docs for the AI prompt", () => {
    const prompt = summarizeGuidanceForPrompt([
      {
        path: "CONTRIBUTING.md",
        content: "Please include tests."
      },
      {
        path: ".github/pull_request_template.md",
        content: "## Test plan"
      }
    ]);

    expect(prompt).toContain("# CONTRIBUTING.md");
    expect(prompt).toContain("Please include tests.");
    expect(prompt).toContain("# .github/pull_request_template.md");
  });

  it("uses a clear fallback when no guidance docs are loaded", () => {
    expect(summarizeGuidanceForPrompt([])).toBe("No repository guidance files were loaded.");
  });
});

describe("loadRepositoryGuidance", () => {
  it("does not call GitHub when the guidance character budget is disabled", async () => {
    const octokit = {
      rest: {
        repos: {
          getContent: vi.fn()
        }
      }
    };

    const docs = await loadRepositoryGuidance(octokit as never, "octo", "repo", "main", {
      ...defaultConfig,
      repository: {
        ...defaultConfig.repository,
        guidancePaths: ["CONTRIBUTING.md"],
        maxGuidanceCharacters: 0
      }
    });

    expect(docs).toEqual([]);
    expect(octokit.rest.repos.getContent).not.toHaveBeenCalled();
  });

  it("loads configured guidance files and markdown files inside configured directories", async () => {
    const octokit = {
      rest: {
        repos: {
          getContent: async ({ path }: { path: string }) => {
            if (path === "CONTRIBUTING.md") {
              return fileResponse(path, "Please include tests.");
            }

            if (path === ".github/ISSUE_TEMPLATE") {
              return {
                data: [
                  {
                    type: "file",
                    name: "bug_report.yml",
                    path: ".github/ISSUE_TEMPLATE/bug_report.yml"
                  },
                  {
                    type: "file",
                    name: "ignored.png",
                    path: ".github/ISSUE_TEMPLATE/ignored.png"
                  }
                ]
              };
            }

            if (path === ".github/ISSUE_TEMPLATE/bug_report.yml") {
              return fileResponse(path, "name: Bug report");
            }

            throw { status: 404 };
          }
        }
      }
    };

    const docs = await loadRepositoryGuidance(octokit as never, "octo", "repo", "main", {
      ...defaultConfig,
      repository: {
        ...defaultConfig.repository,
        guidancePaths: ["CONTRIBUTING.md", ".github/ISSUE_TEMPLATE"],
        maxGuidanceCharacters: 1000
      }
    });

    expect(docs).toEqual([
      {
        path: "CONTRIBUTING.md",
        content: "Please include tests."
      },
      {
        path: ".github/ISSUE_TEMPLATE/bug_report.yml",
        content: "name: Bug report"
      }
    ]);
  });

  it("respects the combined guidance character budget and warns on non-404 failures", async () => {
    const warnings: string[] = [];
    const octokit = {
      rest: {
        repos: {
          getContent: async ({ path }: { path: string }) => {
            if (path === "CONTRIBUTING.md") {
              return fileResponse(path, "x".repeat(100));
            }

            throw new Error("rate limited");
          }
        }
      }
    };

    const docs = await loadRepositoryGuidance(octokit as never, "octo", "repo", "main", {
      ...defaultConfig,
      repository: {
        ...defaultConfig.repository,
        guidancePaths: ["CONTRIBUTING.md", "docs/CONTRIBUTING.md"],
        maxGuidanceCharacters: 40
      }
    }, (warning) => warnings.push(warning));

    expect(docs).toHaveLength(1);
    expect(docs[0]?.content.length).toBeLessThanOrEqual(40);
    expect(docs[0]?.content).toContain("...[truncated]");
    expect(warnings).toEqual([
      "Failed to load repository guidance docs/CONTRIBUTING.md: rate limited"
    ]);
  });

  it("skips unsupported, empty, and missing guidance entries quietly", async () => {
    const warnings: string[] = [];
    const octokit = {
      rest: {
        repos: {
          getContent: async ({ path }: { path: string }) => {
            if (path === "image.png") {
              return fileResponse(path, "binary-ish");
            }

            if (path === "empty.md") {
              return fileResponse(path, "   \n\t");
            }

            if (path === "docs/submodule") {
              return {
                data: {
                  type: "submodule",
                  name: "submodule",
                  path
                }
              };
            }

            throw { status: 404 };
          }
        }
      }
    };

    const docs = await loadRepositoryGuidance(octokit as never, "octo", "repo", "main", {
      ...defaultConfig,
      repository: {
        ...defaultConfig.repository,
        guidancePaths: ["image.png", "empty.md", "docs/submodule", "missing.md"],
        maxGuidanceCharacters: 1000
      }
    }, (warning) => warnings.push(warning));

    expect(docs).toEqual([]);
    expect(warnings).toEqual([]);
  });
});

function fileResponse(path: string, content: string) {
  return {
    data: {
      type: "file",
      name: path.split("/").at(-1) ?? path,
      path,
      content: Buffer.from(content, "utf8").toString("base64")
    }
  };
}
