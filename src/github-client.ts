import * as core from "@actions/core";
import type * as github from "@actions/github";
import { getErrorMessage, getErrorStatus } from "./errors.js";
import type {
  ChangedFile,
  DuplicateCandidate,
  IssueSubject,
  PullRequestSubject,
  Subject
} from "./types.js";
import type { RuntimeWarningSink } from "./run-diagnostics.js";
import { jaccardSimilarity, tokenize } from "./text.js";

type Octokit = ReturnType<typeof github.getOctokit>;
type GitHubContext = typeof github.context;
const REPORT_MARKER = "<!-- maintainer-firewall:report -->";
const MAX_PULL_REQUEST_FILES = 3000;
const defaultWarningSink: RuntimeWarningSink = (message) => core.warning(message);
interface ReportAuthor {
  databaseId: number | null;
  login: string;
}
const reportAuthors = new WeakMap<Octokit, ReportAuthor>();

export async function buildSubject(
  octokit: Octokit,
  context: GitHubContext,
  duplicateSearchLimit: number,
  warningSink: RuntimeWarningSink = defaultWarningSink
): Promise<Subject | null> {
  const payload = context.payload as Record<string, unknown>;
  const { owner, repo } = context.repo;

  if (context.eventName === "issues" && isIssuePayload(payload)) {
    const issue = payload.issue;
    if (issue.pull_request) {
      return null;
    }

    const duplicates = await findDuplicateIssues(
      octokit,
      owner,
      repo,
      issue.number,
      issue.title,
      duplicateSearchLimit,
      warningSink
    );

    return {
      kind: "issue",
      number: issue.number,
      title: issue.title,
      body: issue.body ?? "",
      author: issue.user?.login ?? "unknown",
      labels: extractLabelNames(issue.labels),
      htmlUrl: issue.html_url,
      ...duplicates
    } satisfies IssueSubject;
  }

  if (
    (context.eventName === "pull_request" || context.eventName === "pull_request_target") &&
    isPullRequestPayload(payload)
  ) {
    const pullRequest = payload.pull_request;
    const files = await listPullRequestFiles(octokit, owner, repo, pullRequest, warningSink);

    return {
      kind: "pull_request",
      number: pullRequest.number,
      title: pullRequest.title,
      body: pullRequest.body ?? "",
      author: pullRequest.user?.login ?? "unknown",
      labels: extractLabelNames(pullRequest.labels),
      htmlUrl: pullRequest.html_url,
      draft: Boolean(pullRequest.draft),
      baseRef: pullRequest.base?.ref ?? "",
      headRef: pullRequest.head?.ref ?? "",
      ...files
    } satisfies PullRequestSubject;
  }

  return null;
}

async function listPullRequestFiles(
  octokit: Octokit,
  owner: string,
  repo: string,
  pullRequest: { number: number; changed_files?: number },
  warningSink: RuntimeWarningSink
): Promise<Pick<PullRequestSubject, "changedFiles" | "changedFilesComplete">> {
  const { number: pullNumber, changed_files: expectedFiles } = pullRequest;
  try {
    const response = await octokit.paginate(octokit.rest.pulls.listFiles, {
      owner,
      repo,
      pull_number: pullNumber,
      per_page: 100
    });

    const changedFiles = response.map((file) => ({
      filename: file.filename,
      ...(file.previous_filename ? { previousFilename: file.previous_filename } : {}),
      status: file.status,
      additions: file.additions,
      deletions: file.deletions,
      changes: file.changes
    } satisfies ChangedFile));
    const incomplete = expectedFiles === undefined
      ? changedFiles.length >= MAX_PULL_REQUEST_FILES
      : changedFiles.length !== expectedFiles;
    if (incomplete) {
      warningSink(`Could not confirm the complete file list for pull request #${pullNumber}. File-based checks may be incomplete.`);
      return { changedFiles, changedFilesComplete: false };
    }
    return { changedFiles };
  } catch (error) {
    warningSink(`Could not list files for pull request #${pullNumber}: ${getErrorMessage(error)}. Continuing with title and body checks only.`);
    return { changedFiles: [], changedFilesComplete: false };
  }
}

export function getConfigRef(context: GitHubContext): string | undefined {
  const payload = context.payload as Record<string, unknown>;

  if (isPullRequestPayload(payload)) {
    return payload.pull_request.base?.sha || payload.pull_request.base?.ref;
  }

  return context.ref?.replace(/^refs\/(?:heads|tags)\//, "");
}

export async function applyLabels(
  octokit: Octokit,
  owner: string,
  repo: string,
  issueNumber: number,
  labels: string[],
  createMissing: boolean
): Promise<void> {
  const uniqueLabels = [...new Set(labels)].filter(Boolean);
  if (uniqueLabels.length === 0) {
    return;
  }

  if (createMissing) {
    await ensureLabels(octokit, owner, repo, uniqueLabels);
  }

  await octokit.rest.issues.addLabels({
    owner,
    repo,
    issue_number: issueNumber,
    labels: uniqueLabels
  });
}

export async function removeLabels(
  octokit: Octokit,
  owner: string,
  repo: string,
  issueNumber: number,
  labels: string[]
): Promise<void> {
  const uniqueLabels = [...new Set(labels)].filter(Boolean);
  for (const label of uniqueLabels) {
    try {
      await octokit.rest.issues.removeLabel({
        owner,
        repo,
        issue_number: issueNumber,
        name: label
      });
    } catch (error) {
      const status = getErrorStatus(error);
      if (status !== 404) {
        throw error;
      }
    }
  }
}

export async function upsertComment(
  octokit: Octokit,
  owner: string,
  repo: string,
  issueNumber: number,
  body: string,
  updateExisting: boolean
): Promise<void> {
  if (!updateExisting) {
    await octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: issueNumber,
      body
    });
    return;
  }

  const previous = await findReportComment(octokit, owner, repo, issueNumber);

  if (previous) {
    if (previous.body === body) {
      return;
    }
    await octokit.rest.issues.updateComment({
      owner,
      repo,
      comment_id: previous.id,
      body
    });
    return;
  }

  await octokit.rest.issues.createComment({
    owner,
    repo,
    issue_number: issueNumber,
    body
  });
}

export async function hasReportComment(
  octokit: Octokit,
  owner: string,
  repo: string,
  issueNumber: number,
  warningSink: RuntimeWarningSink = defaultWarningSink
): Promise<boolean> {
  try {
    return Boolean(await findReportComment(octokit, owner, repo, issueNumber));
  } catch (error) {
    warningSink(`Could not check for an existing Maintainer Firewall report on #${issueNumber}: ${getErrorMessage(error)}.`);
    return false;
  }
}

async function findReportComment(
  octokit: Octokit,
  owner: string,
  repo: string,
  issueNumber: number
): Promise<{ id: number; body?: string | null } | undefined> {
  for (let page = 1; ; page += 1) {
    const response = await octokit.rest.issues.listComments({
      owner,
      repo,
      issue_number: issueNumber,
      per_page: 100,
      page
    });
    const comments = response.data;
    const candidates = comments.filter((comment) =>
      comment.user && comment.body?.split(/\r?\n/, 1)[0] === REPORT_MARKER
    );
    if (candidates.length > 0) {
      const author = await getReportAuthor(octokit);
      const reportComment = candidates.find((comment) =>
        author.databaseId === null
          ? comment.user?.login.toLowerCase() === author.login.toLowerCase()
          : comment.user?.id === author.databaseId
      );
      if (reportComment) {
        return reportComment;
      }
    }

    if (comments.length < 100) {
      return undefined;
    }
  }
}

async function getReportAuthor(octokit: Octokit): Promise<ReportAuthor> {
  const cached = reportAuthors.get(octokit);
  if (cached) {
    return cached;
  }

  // The GraphQL viewer also resolves GitHub App installation tokens used by Actions.
  const { viewer } = await octokit.graphql<{ viewer: ReportAuthor | null }>(
    "query MaintainerFirewallReportAuthor { viewer { databaseId login } }"
  );
  if (!viewer?.login) {
    throw new Error("GitHub did not identify the account posting Maintainer Firewall reports.");
  }
  reportAuthors.set(octokit, viewer);
  return viewer;
}

async function findDuplicateIssues(
  octokit: Octokit,
  owner: string,
  repo: string,
  currentNumber: number,
  title: string,
  limit: number,
  warningSink: RuntimeWarningSink
): Promise<Pick<IssueSubject, "duplicateCandidates" | "duplicateSearchComplete">> {
  if (limit <= 0) {
    return { duplicateCandidates: [] };
  }

  const tokens = [...new Set(tokenize(title))]
    .filter((token) => token.length <= 30 && /^[\p{L}\p{N}]+$/u.test(token))
    .slice(0, 6);
  if (tokens.length < 2) {
    return { duplicateCandidates: [], duplicateSearchComplete: false };
  }
  const terms = tokens.join(" ");

  try {
    const response = await octokit.rest.search.issuesAndPullRequests({
      q: `repo:${owner}/${repo} is:issue in:title ${terms}`,
      per_page: Math.min(Math.floor(limit) + 1, 100)
    });

    const duplicateCandidates: DuplicateCandidate[] = response.data.items
      .filter((item) => item.number !== currentNumber)
      .map((item) => ({
        number: item.number,
        title: item.title,
        url: item.html_url,
        similarity: jaccardSimilarity(title, item.title)
      }))
      .filter((candidate) => candidate.similarity >= 0.35)
      .sort((left, right) => right.similarity - left.similarity)
      .slice(0, limit);
    if (response.data.incomplete_results) {
      warningSink("GitHub did not complete the duplicate issue search. Additional matches may exist.");
      return { duplicateCandidates, duplicateSearchComplete: false };
    }
    return { duplicateCandidates };
  } catch (error) {
    warningSink(`Duplicate issue search failed: ${error instanceof Error ? error.message : String(error)}`);
    return { duplicateCandidates: [], duplicateSearchComplete: false };
  }
}

async function ensureLabels(
  octokit: Octokit,
  owner: string,
  repo: string,
  labels: string[]
): Promise<void> {
  for (const label of labels) {
    try {
      await octokit.rest.issues.getLabel({ owner, repo, name: label });
    } catch (error) {
      const status = getErrorStatus(error);
      if (status !== 404) {
        throw error;
      }

      try {
        await octokit.rest.issues.createLabel({
          owner,
          repo,
          name: label,
          color: labelColor(label),
          description: "Managed by Maintainer Firewall"
        });
      } catch (createError) {
        const createStatus = getErrorStatus(createError);
        if (createStatus !== 422) {
          throw createError;
        }

        try {
          await octokit.rest.issues.getLabel({ owner, repo, name: label });
        } catch {
          throw createError;
        }
      }
    }
  }
}

function labelColor(label: string): string {
  if (label.includes("security")) {
    return "b60205";
  }

  if (label.includes("test")) {
    return "d4c5f9";
  }

  if (label.includes("duplicate")) {
    return "cfd3d7";
  }

  if (label.includes("scope")) {
    return "fbca04";
  }

  return "ededed";
}

function extractLabelNames(labels: unknown): string[] {
  if (!Array.isArray(labels)) {
    return [];
  }

  return labels
    .map((label) => {
      if (typeof label === "string") {
        return label;
      }

      if (label && typeof label === "object" && "name" in label) {
        return String((label as { name?: unknown }).name ?? "");
      }

      return "";
    })
    .filter(Boolean);
}

function isIssuePayload(payload: Record<string, unknown>): payload is {
  issue: {
    number: number;
    title: string;
    body: string | null;
    html_url: string;
    pull_request?: unknown;
    labels: unknown[];
    user?: { login?: string };
  };
} {
  return Boolean(payload.issue && typeof payload.issue === "object");
}

function isPullRequestPayload(payload: Record<string, unknown>): payload is {
  pull_request: {
    number: number;
    title: string;
    body: string | null;
    html_url: string;
    draft?: boolean;
    changed_files?: number;
    labels: unknown[];
    user?: { login?: string };
    base?: { ref?: string; sha?: string };
    head?: { ref?: string };
  };
} {
  return Boolean(payload.pull_request && typeof payload.pull_request === "object");
}


