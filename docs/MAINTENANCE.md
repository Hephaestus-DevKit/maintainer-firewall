# Maintenance

This guide is for maintainers reviewing pull requests, publishing releases, and keeping the action predictable over time.

## Operating Loop

Use these checks by default:

| Situation | Required check |
| --- | --- |
| Normal pull request | `npm run ci` |
| Report text, scoring, labels, or summaries changed | `npm run ci` and `npm run demo` |
| Runtime source changed | `npm run bundle`, then `npm run ci` |
| Release candidate | `npm run release:check` |

`npm run ci` runs the TypeScript build, test suite, and bundled `dist/` verification.
`npm run release:check` adds the demo run and moderate-severity dependency audit.
`npm run bundle` updates the committed action bundle after runtime source changes.

## Pull Request Review

Check these before merging:

- The change matches Maintainer Firewall's maintainer-first product principles.
- New or changed behavior has focused tests.
- Runtime source changes include the bundled `dist/index.js` and `dist/index.js.map`.
- Public inputs, outputs, finding IDs, report JSON shape, examples, README tables, and docs are updated together.
- Best-effort failures are recorded through runtime diagnostics instead of only appearing in logs.
- Secret-like values remain redacted in comments, summaries, annotations, outputs, and JSON reports.

Use the PR template to keep these checks visible during review.

## Release Checklist

Before tagging:

1. Confirm `main` is clean and the latest Test, Release, and CodeQL runs are green.
2. Update `package.json`, `package-lock.json`, `CHANGELOG.md`, README release commands, examples, and docs that mention the release tag.
3. Run `npm run release:check`.
4. Create the tag, for example `git tag v0.6.0`.
5. Push `main` and the tag together.
6. Confirm the GitHub release exists and is not a draft.
7. Confirm the tag-triggered Release workflow and the push-triggered Test and CodeQL workflows all complete successfully.

If release automation fails, fix the underlying issue and rerun from the same tag only when the release artifact is still correct. Prefer a new patch tag when the published release content changed.

## Dependency Maintenance

Dependabot groups npm tooling and GitHub Actions updates weekly.

For dependency PRs:

- Run `npm run ci`.
- Run `npm run release:check` when the update touches build, bundle, test, release, or GitHub Actions tooling.
- Run `npm run bundle` and inspect bundled `dist/` changes when runtime dependencies change.
- Keep action version bumps and generated lockfile changes in the same PR.

## Diagnostic Maintenance

Configuration diagnostics cover invalid or surprising config values.
Runtime diagnostics cover best-effort operations that can fail while deterministic triage still completes.

When adding a new best-effort warning path:

- Route the message through the runtime warning sink when the action entry point can observe it.
- Redact configured secret patterns before exposing the message.
- Surface the warning in outputs, step summaries, and JSON reports.
- Add or update tests that prove the warning is captured and redacted.

When adding a protected finding ID, update the central finding ID list so policy, diagnostics, and setup summaries stay aligned.

## Documentation Drift

Documentation is part of the product surface. Update docs in the same PR when changing:

- Action inputs or outputs.
- Finding IDs, severities, labels, or rule policy behavior.
- JSON report shape.
- Step summary content.
- Release commands or workflow examples.
- Rollout, troubleshooting, or maintenance guidance.

The docs tests intentionally check key links and current release tags. Add similar tests when a new doc becomes part of the maintenance workflow.
