# Adoption Playbook

Use this playbook to test Maintainer Firewall with real maintainers before broad launch.

Use [Pilot Runbook](PILOT_RUNBOOK.md) when you are ready to run the two-week audit-mode pilot step by step.

## Design Partner Profile

Good early repositories have:

- Active issue or pull request volume.
- Maintainers who already ask for reproduction steps, linked issues, test plans, or scope reductions.
- A willingness to start in audit mode.
- Existing contribution docs or templates.
- A maintainer who can label findings as useful, noisy, or wrong.

Avoid early installs in repositories where strict automation would create social risk before calibration.

## Two-Week Pilot

### Day 0

- Install audit workflow with read permissions.
- Set `report-json-path` and `effective-config-json-path` for calibration artifacts when the repository permits artifact upload.
- Add `.maintainer-firewall.yml` only if defaults are obviously mismatched.
- Confirm the first step summary has no config or runtime warnings.

### Days 1-7

- Collect reports without posting comments or labels.
- Track findings by ID.
- Track outcome distribution and warning counts from JSON reports.
- Mark each finding as useful, noisy, or wrong.
- Note install friction and unclear docs.

### Days 8-14

- Tune thresholds and disabled IDs.
- Enable comments on findings for one or two low-risk repositories.
- Keep labels disabled unless maintainers explicitly want queue labeling.
- Record whether contributor next steps were clear.

## Pilot Metrics

| Metric | Target before v1 |
| --- | --- |
| Install time | Under 10 minutes for audit mode |
| Runtime warnings | 0 on clean public repositories |
| Useful finding rate | 70% or higher during pilot |
| Severe false positives | 0 before comments are enabled |
| Maintainer retention | 5 or more repositories keep audit mode after week 2 |

## Feedback Form

Ask maintainers:

- Which finding IDs were useful?
- Which finding IDs were noisy?
- Which next steps felt unclear or too strict?
- Did the action miss any issue or pull request that needed triage?
- Did permissions or workflow setup cause friction?
- Would you enable comments, labels, annotations, or JSON output?

## Case Study Template

Use facts only:

- Repository type and approximate volume.
- Rollout mode used.
- Configuration changes made.
- Most useful finding IDs.
- False positives fixed.
- Maintainer decision after pilot.

Do not claim time savings without evidence.
