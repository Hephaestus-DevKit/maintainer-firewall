export type Severity = "notice" | "warning" | "error";

export type LabelKey =
  | "needsInfo"
  | "needsTests"
  | "largeScope"
  | "possibleDuplicate"
  | "securityReview"
  | "maintainerReview";

export interface Finding {
  id: string;
  severity: Severity;
  title: string;
  details: string;
  suggestion?: string;
  label?: LabelKey;
  source: "rule" | "ai";
}

export type Outcome =
  | "ready"
  | "needs_info"
  | "needs_tests"
  | "possible_duplicate"
  | "needs_maintainer_review"
  | "blocked";

export type CommentPostWhen = "always" | "findings" | "never";

export interface RepositoryGuidanceDoc {
  path: string;
  content: string;
}

export interface RoutingHint {
  owner: string;
  files: string[];
}

export interface ReviewSummary {
  score: number;
  outcome: Outcome;
  headline: string;
  nextSteps: string[];
  passedChecks: string[];
  labels: string[];
  routingHints: RoutingHint[];
}

export interface DuplicateCandidate {
  number: number;
  title: string;
  url: string;
  similarity: number;
}

export interface ChangedFile {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  changes: number;
}

export interface IssueSubject {
  kind: "issue";
  number: number;
  title: string;
  body: string;
  author: string;
  labels: string[];
  htmlUrl: string;
  duplicateCandidates: DuplicateCandidate[];
}

export interface PullRequestSubject {
  kind: "pull_request";
  number: number;
  title: string;
  body: string;
  author: string;
  labels: string[];
  htmlUrl: string;
  draft: boolean;
  baseRef: string;
  headRef: string;
  changedFiles: ChangedFile[];
}

export type Subject = IssueSubject | PullRequestSubject;

export interface FirewallConfig {
  version: number;
  issue: {
    enabled: boolean;
    minBodyCharacters: number;
    requireReproduction: boolean;
    requireEnvironment: boolean;
    duplicateSearchLimit: number;
    requiredSections: string[];
  };
  pullRequest: {
    enabled: boolean;
    minBodyCharacters: number;
    requireLinkedIssue: boolean;
    requireTestsForCodeChanges: boolean;
    largeChangeThreshold: number;
    sensitivePaths: string[];
    testPathPatterns: string[];
    requiredSections: string[];
  };
  repository: {
    guidancePaths: string[];
    codeOwnersPaths: string[];
    maxGuidanceCharacters: number;
  };
  security: {
    enabled: boolean;
    reportPatterns: string[];
    secretPatterns: string[];
  };
  labeling: {
    enabled: boolean;
    createMissing: boolean;
    removeStale: boolean;
  };
  labels: Record<LabelKey, string>;
  comment: {
    enabled: boolean;
    updateExisting: boolean;
    header: string;
    postWhen: CommentPostWhen;
    maxFindings: number;
    includePassingChecks: boolean;
  };
  rules: {
    disabled: string[];
    severityOverrides: Record<Severity, string[]>;
  };
  ignore: {
    authors: string[];
    labels: string[];
    titlePatterns: string[];
  };
  ai: {
    enabled: boolean;
    model: string;
    maxInputCharacters: number;
    maxOutputTokens: number;
    timeoutMs: number;
  };
}
