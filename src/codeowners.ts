import * as core from "@actions/core";
import { Minimatch } from "minimatch";
import type * as github from "@actions/github";
import { getErrorMessage, getErrorStatus } from "./errors.js";
import type { FirewallConfig, PullRequestSubject, RoutingHint } from "./types.js";
import type { RuntimeWarningSink } from "./run-diagnostics.js";

type Octokit = ReturnType<typeof github.getOctokit>;

interface CodeOwnerRule {
  matchers: Minimatch[];
  owners: string[];
}

const HANDLE = /^@[a-z0-9_-]+(?:\/[a-z0-9_-]+)?$/i;
const OWNER_EMAIL = /^[^\s@]+@[^\s@]+$/;

export async function loadCodeOwnerHints(
  octokit: Octokit,
  owner: string,
  repo: string,
  ref: string | undefined,
  config: FirewallConfig,
  subject: PullRequestSubject,
  warningSink: RuntimeWarningSink = (message) => core.warning(message)
): Promise<RoutingHint[]> {
  if (subject.changedFiles.length === 0) {
    return [];
  }

  const content = await loadFirstCodeOwnersFile(octokit, owner, repo, ref, config.repository.codeOwnersPaths, warningSink);
  if (!content) {
    return [];
  }

  const rules = parseCodeOwners(content);
  if (rules.length === 0) {
    return [];
  }

  const ownerToFiles = new Map<string, Set<string>>();
  for (const file of subject.changedFiles) {
    const paths = file.previousFilename ? [file.filename, file.previousFilename] : [file.filename];
    for (const path of paths) {
      for (const ownerName of ownersForPath(path, rules)) {
        const files = ownerToFiles.get(ownerName) ?? new Set<string>();
        files.add(path);
        ownerToFiles.set(ownerName, files);
      }
    }
  }

  return [...ownerToFiles.entries()]
    .sort(([, left], [, right]) => right.size - left.size)
    .slice(0, 5)
    .map(([ownerName, files]) => ({
      owner: ownerName,
      files: [...files].slice(0, 5)
    }));
}

export function parseCodeOwners(content: string): CodeOwnerRule[] {
  const rules: CodeOwnerRule[] = [];
  for (const line of content.split(/\r?\n/)) {
    const [pattern, ...owners] = line.split(/(?:^|\s)#/, 1)[0]?.trim().split(/\s+/) ?? [];
    if (!pattern || pattern.startsWith("!") || pattern.startsWith("\\#") ||
        owners.some((owner) => !HANDLE.test(owner) && !OWNER_EMAIL.test(owner))) {
      continue;
    }
    const matchers = compileCodeOwnerPattern(pattern);
    if (matchers.length > 0) {
      // An empty owner list clears a previous match. Email owners stay out of hints.
      rules.push({ matchers, owners: [...new Set(owners.filter((owner) => HANDLE.test(owner)))] });
    }
  }
  return rules;
}

export function ownersForPath(path: string, rules: CodeOwnerRule[]): string[] {
  for (let index = rules.length - 1; index >= 0; index -= 1) {
    const rule = rules[index];
    if (rule?.matchers.some((matcher) => matcher.match(path))) {
      return rule.owners;
    }
  }

  return [];
}

async function loadFirstCodeOwnersFile(
  octokit: Octokit,
  owner: string,
  repo: string,
  ref: string | undefined,
  paths: string[],
  warningSink: RuntimeWarningSink
): Promise<string | null> {
  for (const path of paths) {
    try {
      const response = await octokit.rest.repos.getContent({
        owner,
        repo,
        path,
        ref
      });

      if (!Array.isArray(response.data) && response.data.type === "file") {
        if (response.data.encoding === "none") {
          warningSink(`GitHub did not return the contents of CODEOWNERS at ${path}.`);
          return null;
        }
        core.info(`Loaded CODEOWNERS routing hints from ${response.data.path}.`);
        return Buffer.from(response.data.content, "base64").toString("utf8");
      }
    } catch (error) {
      const status = getErrorStatus(error);
      if (status !== 404) {
        warningSink(`Failed to load CODEOWNERS from ${path}: ${getErrorMessage(error)}`);
      }
    }
  }

  return null;
}

function compileCodeOwnerPattern(pattern: string): Minimatch[] {
  const directoryOnly = pattern.endsWith("/");
  const path = pattern.replace(/^\/+|\/+$/g, "");
  if (!path) {
    return [];
  }

  const rooted = pattern.startsWith("/") || path.includes("/");
  const glob = `${rooted ? "" : "**/"}${path.replace(/[\[\]]/g, "\\$&")}`;
  const globs = directoryOnly ? [] : [glob];
  const basename = path.split("/").at(-1) ?? "";
  if (directoryOnly || !/[*?]/.test(basename)) {
    globs.push(`${glob}/**`);
  }
  return globs.map((value) => new Minimatch(value, {
    dot: true,
    nobrace: true,
    nocomment: true,
    noext: true,
    nonegate: true,
    platform: "linux"
  }));
}


