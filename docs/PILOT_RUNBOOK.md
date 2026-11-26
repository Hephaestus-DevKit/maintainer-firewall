# Pilot Runbook

This runbook turns the adoption playbook into an executable two-week pilot.

## Entry Criteria

Start a pilot only when the target repository has:

- Active issue or pull request volume.
- Maintainers willing to review audit-mode reports.
- No plan to use Maintainer Firewall for automatic rejection or closing.
- A safe workflow path that does not check out untrusted pull request code with write permissions.

## Day 0 Setup

Copy [the metrics workflow](../examples/workflow.metrics.yml) into `.github/workflows/`. On an issue or pull request event it runs in read-only audit mode and uploads the review report and effective configuration as the `maintainer-firewall-reports` artifact.

Confirm on the first run:

- No config warnings.
- No runtime warnings.
- Effective config matches intended surfaces.
- Comments and labels are not written.

## Days 1-7 Collection

For each report, record:

- Finding IDs.
- Outcome.
- Runtime warning count.
- Whether the finding was useful, noisy, or wrong.
- Whether the suggested next step was clear.
- Any install or permission friction.

Download report artifacts and aggregate them locally:

```bash
npm run metrics:summary -- reports/
```

## Days 8-14 Calibration

Tune only repeated issues:

- Lower or raise thresholds for repeated false positives.
- Disable exact finding IDs only after maintainers agree the finding is noisy for this repository.
- Keep labels disabled unless maintainers explicitly want queue labeling.
- Enable comments only on low-risk repositories after severe false positives are zero.

## Exit Criteria

Before recommending broader rollout:

- Install time is under 10 minutes.
- Runtime warnings are zero on clean runs.
- Useful finding rate is at least 70%.
- Severe false positives are zero before comments are enabled.
- Maintainers can explain which findings were useful and which were noisy.

## Stop Conditions

Pause the pilot when:

- Reports expose sensitive content.
- A fork PR workflow checks out untrusted code with write permissions.
- Maintainers cannot review reports within the pilot window.
- Findings create social friction before calibration.

Do not convert pilot results into time-savings claims unless the repository collected explicit before/after evidence.
