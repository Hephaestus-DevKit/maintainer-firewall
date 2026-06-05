import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { analyzeSubject } from "../lib/src/rules.js";
import { mergeConfig } from "../lib/src/config.js";
import { applyFindingPolicy } from "../lib/src/finding-policy.js";
import { createReviewSummary } from "../lib/src/review.js";

const fixturesDir = "fixtures/evaluation";
const files = readdirSync(fixturesDir)
  .filter((file) => file.endsWith(".json"))
  .sort();

if (files.length === 0) {
  throw new Error(`No evaluation fixtures found in ${fixturesDir}.`);
}

const failures = [];
const results = [];

for (const file of files) {
  const fixture = JSON.parse(readFileSync(join(fixturesDir, file), "utf8"));
  const config = mergeConfig(fixture.config ?? {});
  const findings = applyFindingPolicy(analyzeSubject(fixture.subject, config), config);
  const summary = createReviewSummary(fixture.subject, findings, config);
  const findingIds = findings.map((finding) => finding.id);
  const aiEligible = Boolean(config.ai.enabled) && !findingIds.includes("content.secret.possible");

  checkFixtureArray(file, "expectedFindings", fixture.expectedFindings, (id) => findingIds.includes(id), failures);
  checkFixtureArray(file, "unexpectedFindings", fixture.unexpectedFindings, (id) => !findingIds.includes(id), failures);

  if (fixture.expectedOutcome && summary.outcome !== fixture.expectedOutcome) {
    failures.push(`${file}: expected outcome ${fixture.expectedOutcome}, got ${summary.outcome}`);
  }

  if (typeof fixture.expectedAiEligible === "boolean" && aiEligible !== fixture.expectedAiEligible) {
    failures.push(`${file}: expected aiEligible ${String(fixture.expectedAiEligible)}, got ${String(aiEligible)}`);
  }

  results.push({
    file,
    name: fixture.name,
    outcome: summary.outcome,
    findings: findingIds,
    aiEligible
  });
}

for (const result of results) {
  console.log(`${result.file}: ${result.outcome}; findings=${result.findings.join(",") || "none"}; aiEligible=${String(result.aiEligible)}`);
}

if (failures.length > 0) {
  console.error("");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  throw new Error(`${failures.length} evaluation check${failures.length === 1 ? "" : "s"} failed.`);
}

console.log(`Evaluation fixtures passed (${files.length}).`);

function checkFixtureArray(file, field, values, predicate, failures) {
  if (!Array.isArray(values)) {
    return;
  }

  for (const value of values) {
    if (!predicate(value)) {
      failures.push(`${file}: ${field} failed for ${value}`);
    }
  }
}
