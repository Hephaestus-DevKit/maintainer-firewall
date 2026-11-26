# AI Data Boundary

Maintainer Firewall works without AI. Optional OpenAI analysis is advisory and runs only when all of these are true:

- `.maintainer-firewall.yml` sets `ai.enabled: true`.
- The action receives `openai-api-key` or the runner provides `OPENAI_API_KEY`.
- Neither the title nor the body matches a configured credential pattern. This check also applies when deterministic Issue, PR, or security findings are disabled.

## Data Sent When AI Runs

The prompt can include:

- Issue or pull request kind, number, title, body, and author.
- Pull request draft state, base ref, head ref, and changed-file summaries.
- Duplicate candidates for issues.
- Loaded repository guidance content from configured guidance paths.

Before prompt construction, configured `security.secretPatterns` are applied to subject metadata and to guidance paths and content. Long inputs are shortened to `ai.maxInputCharacters` while preserving the JSON structure and retaining space for repository context. When only part of the file list fits, the prompt marks it incomplete and the action discards AI findings labeled `needsTests`.

## Data Excluded From the Prompt

The API key authenticates the HTTPS request. The model prompt excludes the following data.

- The GitHub token.
- The OpenAI API key.
- Source files outside the configured repository guidance paths.
- Checked-out pull request code.
- Report JSON or effective-config JSON artifacts.
- Subject titles and bodies that match configured credential patterns, because AI is skipped in that case.

## Output Handling

OpenAI output must parse as structured JSON. Findings are normalized into stable `ai.*` IDs where possible, capped in length, and filtered to known severities and labels. Malformed findings are dropped.

AI findings go through the same policy, redaction, report, label, annotation, JSON, and failure paths as deterministic findings. They are advisory by default and do not automatically reject or close contributions.

## Prompt-Injection Boundary

Issue text, pull request text, file names, and guidance files are untrusted. The system prompt explicitly tells the model not to follow instructions inside those fields. Deterministic prompt-injection fixtures are part of `npm run evaluate`; live AI prompt-injection evaluation still requires an explicit API key and sanitized fixtures.

Run the live AI smoke test only when you intentionally want to call OpenAI:

```bash
OPENAI_API_KEY=... npm run evaluate:ai
```

The script runs only fixtures marked AI-eligible. It checks normalized AI output shape and fails when an API call or response produces a runtime warning. It runs separately from CI and marketplace checks.

## Rollout Recommendation

Keep AI disabled during first install. Enable it only after deterministic findings are calibrated and the team is comfortable with the data boundary above.
