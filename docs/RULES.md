# Rules

Maintainer Firewall findings have stable IDs. Use these IDs to discuss reports, inspect JSON output, tune configuration, and connect comments, annotations, and step summaries.

AI-assisted findings also include IDs. Model-provided IDs are normalized into stable `ai.*` policy IDs when possible, with fallback IDs such as `ai.finding.1`.

## Deterministic Rules

| ID | Applies to | Severity | Label | Trigger | Main tuning knobs |
| --- | --- | --- | --- | --- | --- |
| `issue.body.too_short` | Issues | warning | `needsInfo` | Issue body is shorter than `issue.minBodyCharacters`. | `issue.minBodyCharacters` |
| `issue.required_sections.missing` | Issues | warning | `needsInfo` | Required issue template headings are missing. | `issue.requiredSections` |
| `issue.reproduction.missing` | Issues | warning | `needsInfo` | Issue text does not include clear reproduction steps, examples, commands, or expected versus actual behavior. | `issue.requireReproduction` |
| `issue.environment.missing` | Issues | notice | `needsInfo` | Issue text does not mention version, runtime, OS, browser, or similar environment details. | `issue.requireEnvironment` |
| `issue.duplicate.possible` | Issues | notice | `possibleDuplicate` | A similar existing issue was found from duplicate candidate search. | `issue.duplicateSearchLimit` |
| `pr.draft` | Pull requests | notice | `maintainerReview` | Pull request is still marked as draft. | Mark PR ready for review |
| `pr.body.too_short` | Pull requests | warning | `needsInfo` | Pull request body is shorter than `pullRequest.minBodyCharacters`. | `pullRequest.minBodyCharacters` |
| `pr.required_sections.missing` | Pull requests | warning | `needsInfo` | Required pull request template headings are missing. | `pullRequest.requiredSections` |
| `pr.linked_issue.missing` | Pull requests | notice | `needsInfo` | Pull request body does not link or close an issue. | `pullRequest.requireLinkedIssue` |
| `pr.scope.large` | Pull requests | warning | `largeScope` | Changed line count exceeds `pullRequest.largeChangeThreshold`. | `pullRequest.largeChangeThreshold` |
| `pr.tests.missing` | Pull requests | warning | `needsTests` | Code files changed but no non-deleted test files were detected. | `pullRequest.requireTestsForCodeChanges`, `pullRequest.testPathPatterns` |
| `pr.sensitive_paths.changed` | Pull requests | notice | `securityReview` | Changed files match configured sensitive path globs. | `pullRequest.sensitivePaths` |
| `content.secret.possible` | Issues and PRs | error | `securityReview` | Title or body matches a configured secret-like pattern. AI analysis is skipped when this fires. | `security.secretPatterns` |
| `content.security_report.possible` | Issues and PRs | warning for issues, notice for PRs | `securityReview` | Text mentions security-sensitive language such as CVEs, exploits, credential leaks, or vulnerability terms. | `security.reportPatterns` |

## Labels

Labels are configured separately from rule IDs. Defaults:

| Label key | Default label |
| --- | --- |
| `needsInfo` | `needs-info` |
| `needsTests` | `needs-tests` |
| `largeScope` | `large-scope` |
| `possibleDuplicate` | `possible-duplicate` |
| `securityReview` | `security-review` |
| `maintainerReview` | `maintainer-review` |

Change label names in `.maintainer-firewall.yml`:

```yaml
labels:
  needsInfo: needs-info
  needsTests: needs-tests
  securityReview: security-review
```

Disable label writes while keeping comments and summaries:

```yaml
labeling:
  enabled: false
```

## Severity Semantics

- `notice`: useful context or routing hint.
- `warning`: likely missing information or review friction.
- `error`: security-sensitive problem that should be handled before normal review.

`fail-on-findings: true` fails the workflow when warning or error findings exist. The default is advisory.

## Rule Policy

Use `rules.disabled` to suppress exact finding IDs after deterministic and AI findings are produced. Suppressed findings are removed before comments, labels, annotations, JSON reports, summaries, and failure checks.

```yaml
rules:
  disabled:
    - issue.environment.missing
```

Use `rules.severityOverrides` to change exact finding ID severity without hiding the finding:

```yaml
rules:
  severityOverrides:
    notice:
      - pr.tests.missing
    warning:
      - pr.linked_issue.missing
    error:
      - content.security_report.possible
```

Policy rules are exact-match only. This avoids broad accidental suppression.

Precedence:

- `rules.disabled` wins over severity overrides.
- If the same ID appears in multiple severity override lists, the strongest severity wins: `error`, then `warning`, then `notice`.
- `content.secret.possible` is protected. It cannot be suppressed or downgraded, and AI analysis still skips when it fires.
- Conflicting policy settings emit workflow warnings.

## Report Surfaces

Finding IDs appear in:

- Report comments.
- Step summaries.
- Structured JSON reports.
- Optional GitHub Actions annotations.

Finding IDs do not change contributor quality scoring. They are identifiers for maintainers to tune and debug the action.

Structured JSON findings may include `references` when a deterministic finding is tied to a specific configured requirement. For example, missing required template sections reference `issue.requiredSections` or `pullRequest.requiredSections` without adding extra noise to contributor-facing comments.

## Tuning Patterns

Gentler issue intake:

```yaml
issue:
  minBodyCharacters: 80
  requireEnvironment: false
```

Suppress a noisy finding after calibration:

```yaml
rules:
  disabled:
    - issue.environment.missing
```

Downgrade a finding that should remain visible but not fail strict mode:

```yaml
rules:
  severityOverrides:
    notice:
      - pr.tests.missing
```

Strict pull request review:

```yaml
pullRequest:
  minBodyCharacters: 200
  requireLinkedIssue: true
  requireTestsForCodeChanges: true
  largeChangeThreshold: 400
  requiredSections:
    - Summary
    - Test plan
```

Disable security-sensitive language checks only if another process handles this:

```yaml
security:
  enabled: false
```

Prefer tuning `security.reportPatterns` and `security.secretPatterns` instead of disabling security checks completely.

Configured regular expressions are compiled through a shared cache. Invalid or potentially unsafe patterns are ignored and reported through configuration diagnostics, because these patterns run against untrusted issue and pull request text.
