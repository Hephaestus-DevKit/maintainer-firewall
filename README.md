# Maintainer Firewall

[![GitHub Release](https://img.shields.io/github/v/release/Hephaestus-DevKit/maintainer-firewall?color=blue&logo=github)](https://github.com/Hephaestus-DevKit/maintainer-firewall/releases)
[![Build Status](https://img.shields.io/github/actions/workflow/status/Hephaestus-DevKit/maintainer-firewall/test.yml?branch=main&logo=github)](https://github.com/Hephaestus-DevKit/maintainer-firewall/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Maintainer Firewall triages GitHub issues and pull requests. It checks reproduction steps, environment details, linked issues, test changes, and repository-specific rules. Each report gives maintainers a score, the evidence behind it, and suggested next steps.

## Quick start

### Install the workflow

Save this workflow as `.github/workflows/maintainer-firewall.yml`. Open or edit an issue or pull request, then open the job summary in Actions to see the findings and score. This first run needs only read permissions. The default rules run without an OpenAI key.

```yaml
name: Maintainer Firewall

on:
  issues:
    types: [opened, edited, reopened]
  pull_request:
    types: [opened, edited, synchronize, reopened, ready_for_review]

permissions:
  contents: read
  issues: read
  pull-requests: read

concurrency:
  group: maintainer-firewall-${{ github.event.issue.number || github.event.pull_request.number || github.run_id }}
  cancel-in-progress: true

jobs:
  firewall:
    runs-on: ubuntu-latest
    steps:
      - name: Run Maintainer Firewall
        uses: Hephaestus-DevKit/maintainer-firewall@v0.7.2
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          dry-run: true
```

### Configure the rules

Add a `.maintainer-firewall.yml` to the root of your repository to tune rule severity, comments, and labels.

```yaml
# yaml-language-server: $schema=https://raw.githubusercontent.com/Hephaestus-DevKit/maintainer-firewall/main/schema/maintainer-firewall.schema.json
version: 1

rules:
  severityOverrides:
    notice:
      - pr.tests.missing
    warning:
      - issue.environment.missing

comment:
  enabled: true
  postWhen: findings  # Only comment when improvements are needed

labeling:
  enabled: false      # Enable when ready to auto-label issues/PRs
```

## Rollout modes

These permissions apply to the pull request event in each example. For fork pull requests, the write-enabled examples read the base configuration and run without checking out contributor code.

| Mode | Pull request event | Permissions | Action Description |
| :--- | :--- | :--- | :--- |
| **Audit** | `pull_request` | `contents: read`, `issues: read`, `pull-requests: read` | Writes an Actions step summary and optional JSON reports. |
| **Advisory** | `pull_request_target` | `contents: read`, `issues: write`, `pull-requests: write` | Low noise. Comments only when actionable improvements are found. |
| **Collaborative** | `pull_request_target` | `contents: read`, `issues: write`, `pull-requests: write` | Full engagement. Automatically applies triage labels and writes feedback comments. |
| **Strict** | `pull_request_target` | `contents: read`, `issues: write`, `pull-requests: write` | Fails on warning or error findings. |

## Inputs and outputs

### Inputs

| Input | Required | Default | Description |
| :--- | :--- | :--- | :--- |
| `github-token` | **Yes** | | GitHub token used to read repository context and write comments/labels. |
| `openai-api-key` | No | | API key for optional AI review. The runner can also supply `OPENAI_API_KEY`. |
| `config-path` | No | `.maintainer-firewall.yml` | Repository-relative path to your firewall configuration. |
| `dry-run` | No | `false` | When `true`, prevents writing comments, applying labels, or removing stale labels. |
| `fail-on-findings` | No | `false` | Fail the action when a warning or error finding remains after rule policy is applied. |
| `emit-annotations` | No | `false` | Emit findings as GitHub Actions notices, warnings, or errors. |
| `write-step-summary` | No | `true` | Write the summary report to the GitHub Actions job run summary. |
| `report-json-path` | No | | Path in the workspace to output a structured JSON report. |
| `effective-config-json-path` | No | | Path in the workspace to output the redacted, active config snapshot. |

### Outputs

| Output | Type | Description |
| :--- | :--- | :--- |
| `outcome` | string | One of `ready`, `needs_info`, `needs_tests`, `needs_maintainer_review`, `possible_duplicate`, `blocked`, or `skipped`. |
| `score` | integer string | Review-readiness score from `0` to `100`, or an empty string when skipped. |
| `findings-count` | integer string | Total number of findings. |
| `labels` | string | Comma-separated list of suggested labels. |
| `routing-hints` | string | JSON array of CODEOWNERS-derived routing targets. |
| `skipped` | boolean string | `true` when the subject was skipped and `false` when triage completed. |
| `skip-reason` | string | Reason the subject was skipped, when applicable. |
| `report-json-path` | string | Path to the structured JSON report when configured. |
| `effective-config-json-path` | string | Path to the redacted effective configuration report when configured. |
| `config-warnings-count` | integer string | Count of configuration validation warnings. |
| `config-warnings` | string | JSON array of configuration diagnostics emitted. |
| `runtime-warnings-count` | integer string | Count of runtime warnings. |
| `runtime-warnings` | string | JSON array of runtime diagnostics emitted. |

## Guides

| Task | Guides |
| --- | --- |
| Install and choose permissions | [Installation](docs/INSTALLATION.md) · [Rollout modes](docs/ROLLOUT_PLAYBOOK.md) |
| Tune findings and understand reports | [Rules](docs/RULES.md) · [AI data boundary](docs/AI_DATA_BOUNDARY.md) · [Report contract](docs/V1_CONTRACT.md) |
| Evaluate on a repository | [Pilot runbook](docs/PILOT_RUNBOOK.md) · [中文试点手册](docs/PILOT.zh-CN.md) · [Adoption](docs/ADOPTION_PLAYBOOK.md) · [Metrics](docs/METRICS.md) |
| Diagnose a run or change the Action | [Troubleshooting](docs/TROUBLESHOOTING.md) · [Architecture](docs/ARCHITECTURE.md) · [Evaluation](docs/EVALUATION.md) |
| Maintain and publish | [Release checklist](docs/MAINTENANCE.md) · [Marketplace readiness](docs/MARKETPLACE_READINESS.md) · [Roadmap](docs/ROADMAP.md) |

## Development

For development, use Node.js 20.x (20.19+), 22.x (22.12+), or 24 and later. GitHub runs the committed bundle specified in `action.yml`.

```bash
npm ci
npm run ci
```

Edit Action logic in `src/` and regression tests in `tests/`. Deterministic evaluation cases live in `fixtures/evaluation/`. Run `npm run bundle` after runtime changes and include the resulting `dist/` files in the commit. Run `npm run market:check` to verify a release candidate.

## License

[MIT](LICENSE)
