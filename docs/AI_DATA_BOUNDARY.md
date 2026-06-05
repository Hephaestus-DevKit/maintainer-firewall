# AI Data Boundary

Maintainer Firewall works without AI. Optional OpenAI analysis is advisory and runs only when all of these are true:

- `.maintainer-firewall.yml` sets `ai.enabled: true`.
- The action receives `openai-api-key`.
- Deterministic checks did not produce `content.secret.possible`.

## Data Sent When AI Runs

The prompt can include:

- Issue or pull request kind, number, title, body, and author.
- Pull request draft state, base ref, head ref, and changed-file summaries.
- Duplicate candidates for issues.
- Loaded repository guidance content from configured guidance paths.

Before prompt construction, configured `security.secretPatterns` are applied to subject text and loaded guidance content. The prompt is then truncated to `ai.maxInputCharacters`.

## Data Not Sent

Maintainer Firewall does not send:

- The GitHub token.
- The OpenAI API key.
- Full repository source code.
- Checked-out pull request code.
- Report JSON or effective-config JSON artifacts.
- Raw possible credential values when `content.secret.possible` fires, because AI is skipped in that case.

## Output Handling

OpenAI output must parse as structured JSON. Findings are normalized into stable `ai.*` IDs where possible, capped in length, and filtered to known severities and labels. Malformed findings are dropped.

AI findings go through the same policy, redaction, report, label, annotation, JSON, and failure paths as deterministic findings. They are advisory by default and do not automatically reject or close contributions.

## Prompt-Injection Boundary

Issue text, pull request text, file names, and guidance files are untrusted. The system prompt explicitly tells the model not to follow instructions inside those fields. Deterministic prompt-injection fixtures are part of `npm run evaluate`; live AI prompt-injection evaluation still requires an explicit API key and sanitized fixtures.

Run the live AI smoke test only when you intentionally want to call OpenAI:

```bash
OPENAI_API_KEY=... npm run evaluate:ai
```

The script runs only fixtures marked AI-eligible and checks normalized AI output shape. It is not part of CI or marketplace checks.

## Rollout Recommendation

Keep AI disabled during first install. Enable it only after deterministic findings are calibrated and the team is comfortable with the data boundary above.
