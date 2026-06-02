import type { Finding, FirewallConfig, Severity } from "./types.js";

const SEVERITY_OVERRIDE_PRECEDENCE: Severity[] = ["error", "warning", "notice"];
const PROTECTED_FINDING_IDS = new Set(["content.secret.possible"]);

export function applyFindingPolicy(findings: Finding[], config: FirewallConfig): Finding[] {
  const disabled = new Set(config.rules.disabled);

  return findings
    .filter((finding) => !disabled.has(finding.id) || PROTECTED_FINDING_IDS.has(finding.id))
    .map((finding) => ({
      ...finding,
      severity: severityForFinding(finding, config) ?? finding.severity
    }));
}

function severityForFinding(finding: Finding, config: FirewallConfig): Severity | null {
  if (PROTECTED_FINDING_IDS.has(finding.id)) {
    return null;
  }

  for (const severity of SEVERITY_OVERRIDE_PRECEDENCE) {
    if (config.rules.severityOverrides[severity].includes(finding.id)) {
      return severity;
    }
  }

  return null;
}
