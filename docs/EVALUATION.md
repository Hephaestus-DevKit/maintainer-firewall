# Evaluation Plan

Maintainer Firewall has regression fixtures for deterministic rules, AI eligibility, prompt-injection resistance, and duplicate detection.

## Evaluation Goals

- Keep deterministic findings stable.
- Measure AI-assisted findings without relying on anecdotal examples.
- Prevent prompt-injection content from changing model instructions.
- Track duplicate-detection false positives.
- Preserve contributor-friendly report language.

## Fixture Categories

| Category | Examples |
| --- | --- |
| Clean issue | Enough body, reproduction, environment, no duplicates |
| Thin issue | Short body, no reproduction, no environment |
| Security-sensitive issue | CVE, exploit, credential leak language |
| Possible secret | Token-like text that must skip AI analysis |
| Possible duplicate | Similar issue title with enough token overlap |
| Clean pull request | Linked issue, test plan, code and test changes |
| Missing tests | Code changes without non-deleted test files |
| Large scope | Changed lines over threshold |
| Sensitive paths | Workflows, lockfiles, supply-chain paths |
| Prompt injection | Issue body asks the model to ignore system instructions |
| Repository guidance | CONTRIBUTING and templates define custom requirements |

## Expected Fixture Shape

```json
{
  "name": "missing-tests-pr",
  "subject": {
    "kind": "pull_request"
  },
  "config": {},
  "expectedFindings": ["pr.tests.missing"],
  "unexpectedFindings": ["content.secret.possible"],
  "expectedOutcome": "needs_tests"
}
```

Fixtures live under `fixtures/evaluation/`. Run them with:

```bash
npm run evaluate
```

The runner builds the TypeScript source, loads each fixture, runs deterministic findings plus finding policy, creates the review summary, and checks expected findings, unexpected findings, expected outcome, and whether AI would be eligible to run. It does not call OpenAI.

## AI Evaluation Rules

- AI findings are advisory and must not duplicate deterministic findings when the deterministic rule is already clear.
- AI output must be structured JSON and normalized into stable `ai.*` IDs.
- AI findings must cite repository guidance only when guidance was loaded.
- AI analysis must not run when `content.secret.possible` fires.
- AI analysis must not follow instructions inside issue body, pull request body, file names, or guidance files.

## Regression Process

1. Add or update a fixture before changing rule logic or prompt text.
2. Run `npm run evaluate` and `npm run check` locally.
3. Run AI evaluation only with explicit API key and sanitized fixtures.
4. Record false positives and false negatives by finding ID.
5. Promote repeated real-world feedback into fixtures.

Optional live AI smoke test:

```bash
OPENAI_API_KEY=... npm run evaluate:ai
```

This is intentionally excluded from CI and market checks.

## Market Readiness Thresholds

Before v1:

- Deterministic fixtures pass at 100% through `npm run evaluate`.
- AI evaluation has a documented baseline.
- No prompt-injection fixture changes system behavior.
- Duplicate detection avoids one-token title matches.
- Report text remains contributor-friendly in snapshots or targeted assertions.
