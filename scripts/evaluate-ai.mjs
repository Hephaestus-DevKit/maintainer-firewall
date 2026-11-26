import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { analyzeWithAi, isAiEligible } from "../lib/src/ai.js";
import { mergeConfig } from "../lib/src/config.js";

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  console.error("OPENAI_API_KEY is required for live AI evaluation. Deterministic evaluation is available with npm run evaluate.");
  process.exit(2);
}

const fixturesDir = "fixtures/evaluation";
const files = readdirSync(fixturesDir)
  .filter((file) => file.endsWith(".json"))
  .sort();
const eligibleFixtures = files
  .map((file) => ({
    file,
    fixture: JSON.parse(readFileSync(join(fixturesDir, file), "utf8"))
  }))
  .filter(({ fixture }) => fixture.expectedAiEligible === true);

if (eligibleFixtures.length === 0) {
  throw new Error("No AI-eligible fixtures found.");
}

const failures = [];

for (const { file, fixture } of eligibleFixtures) {
  const config = mergeConfig({
    ...(fixture.config ?? {}),
    ai: {
      ...(fixture.config?.ai ?? {}),
      enabled: true
    }
  });
  if (!isAiEligible(fixture.subject, config)) {
    failures.push(`${file}: fixture is marked AI-eligible but the runtime data boundary rejected it`);
    continue;
  }

  const warnings = [];
  const findings = await analyzeWithAi(
    fixture.subject,
    config,
    apiKey,
    fixture.guidanceDocs ?? [],
    (warning) => warnings.push(warning)
  );

  const invalidId = findings.find((finding) => !finding.id.startsWith("ai."));
  if (invalidId) {
    failures.push(`${file}: AI finding ID should start with ai., got ${invalidId.id}`);
  }

  const invalidSource = findings.find((finding) => finding.source !== "ai");
  if (invalidSource) {
    failures.push(`${file}: AI finding source should be ai.`);
  }

  console.log(`${file}: aiFindings=${findings.length}; warnings=${warnings.length}`);
  for (const warning of warnings) {
    failures.push(`${file}: ${warning}`);
  }
}

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  throw new Error(`${failures.length} live AI evaluation check${failures.length === 1 ? "" : "s"} failed.`);
}

console.log(`Live AI evaluation completed (${eligibleFixtures.length} fixture${eligibleFixtures.length === 1 ? "" : "s"}).`);
