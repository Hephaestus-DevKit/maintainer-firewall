import { readFileSync } from "node:fs";
import { parse } from "yaml";

const requiredFiles = [
  "action.yml",
  "README.md",
  "LICENSE",
  "SECURITY.md",
  "SUPPORT.md",
  "CHANGELOG.md",
  "docs/V1_CONTRACT.md",
  "docs/MARKETPLACE_READINESS.md",
  "docs/ADOPTION_PLAYBOOK.md",
  "docs/PILOT_RUNBOOK.md",
  "docs/EVALUATION.md",
  "docs/AI_DATA_BOUNDARY.md",
  "docs/METRICS.md",
  "schema/maintainer-firewall.schema.json",
  "dist/index.js"
];

const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
const readme = readFileSync("README.md", "utf8");
const metricsWorkflow = parse(readFileSync("examples/workflow.metrics.yml", "utf8"));
const maintenanceGuide = readFileSync("docs/MAINTENANCE.md", "utf8");
const marketplaceReadiness = readFileSync("docs/MARKETPLACE_READINESS.md", "utf8");
const releaseWorkflow = parse(readFileSync(".github/workflows/release.yml", "utf8"));
const vitestConfig = readFileSync("vitest.config.ts", "utf8");

for (const file of requiredFiles) {
  readFileSync(file, "utf8");
}

for (const file of [
  "examples/config.quiet.yml",
  "examples/config.strict.yml",
  "examples/config.library.yml",
  "examples/config.monorepo.yml",
  "examples/config.security-sensitive.yml"
]) {
  parse(readFileSync(file, "utf8"));
}

for (const doc of [
  "docs/V1_CONTRACT.md",
  "docs/MARKETPLACE_READINESS.md",
  "docs/ADOPTION_PLAYBOOK.md",
  "docs/PILOT_RUNBOOK.md",
  "docs/EVALUATION.md",
  "docs/AI_DATA_BOUNDARY.md",
  "docs/METRICS.md"
]) {
  if (!readme.includes(doc)) {
    throw new Error(`README.md should link ${doc}`);
  }
}

if (!packageJson.scripts?.evaluate?.includes("scripts/evaluate.mjs")) {
  throw new Error("package.json should expose npm run evaluate.");
}

if (!packageJson.scripts?.["evaluate:ai"]?.includes("scripts/evaluate-ai.mjs")) {
  throw new Error("package.json should expose npm run evaluate:ai.");
}

if (!packageJson.scripts?.["metrics:summary"]?.includes("scripts/summarize-metrics.mjs")) {
  throw new Error("package.json should expose npm run metrics:summary.");
}

if (!packageJson.devDependencies?.["fast-check"]) {
  throw new Error("package.json should include fast-check for property-based fuzz coverage.");
}

if (!marketplaceReadiness.includes("GitHub Marketplace has repository-level listing requirements")) {
  throw new Error("docs/MARKETPLACE_READINESS.md should document the direct Marketplace listing caveat.");
}

const metricsUpload = metricsWorkflow.jobs?.firewall?.steps?.find((step) =>
  /^actions\/upload-artifact@(?:v[1-9]\d*|[a-f0-9]{40})$/.test(step.uses ?? ""));
if (!metricsUpload || metricsUpload.with?.path !== "reports/") {
  throw new Error("examples/workflow.metrics.yml should upload reports with a versioned actions/upload-artifact step.");
}

const release = releaseWorkflow.jobs?.release;
const releaseSteps = release?.steps ?? [];
const pack = releaseSteps.find((step) => step.id === "pack");
const attest = releaseSteps.find((step) => step.id === "attest");
if (release?.permissions?.attestations !== "write" ||
    release.permissions["id-token"] !== "write" ||
    !/^actions\/attest@[a-f0-9]{40}$/.test(attest?.uses ?? "")) {
  throw new Error(".github/workflows/release.yml should use a commit-pinned actions/attest step with attestation permissions.");
}

const assetPath = "${{ steps.pack.outputs.asset-path }}";
const stagedBundle = releaseSteps.find((step) =>
  step.env?.ATTESTATION_BUNDLE === "${{ steps.attest.outputs.bundle-path }}" &&
  step.env?.RELEASE_ASSET === assetPath);
const publish = releaseSteps.find((step) => /^softprops\/action-gh-release@/.test(step.uses ?? ""));
const publishedFiles = publish?.with?.files?.trim().split(/\s*\n\s*/) ?? [];
if (!pack || attest.with?.["subject-path"] !== assetPath || !stagedBundle?.run?.includes(".sigstore.json") ||
    !publishedFiles.includes(assetPath) || !publishedFiles.includes(`${assetPath}.sigstore.json`)) {
  throw new Error(".github/workflows/release.yml should attest and publish the packed asset and its Sigstore bundle.");
}

if (!maintenanceGuide.includes("gh attestation verify")) {
  throw new Error("docs/MAINTENANCE.md should document release asset attestation verification.");
}

if (!marketplaceReadiness.includes("GitHub artifact attestations")) {
  throw new Error("docs/MARKETPLACE_READINESS.md should include release attestation readiness.");
}

if (!marketplaceReadiness.includes("Property-based tests cover redaction")) {
  throw new Error("docs/MARKETPLACE_READINESS.md should document property-based fuzz coverage.");
}

for (const fixture of [
  "fixtures/evaluation/clean-issue.json",
  "fixtures/evaluation/missing-tests-pr.json",
  "fixtures/evaluation/prompt-injection-ai-eligible.json",
  "fixtures/evaluation/possible-secret-skips-ai.json"
]) {
  JSON.parse(readFileSync(fixture, "utf8"));
}

const files = new Set(packageJson.files ?? []);
for (const entry of ["action.yml", "dist", "README.md", "LICENSE", "docs", "examples", "schema"]) {
  if (!files.has(entry)) {
    throw new Error(`package.json files should include ${entry}`);
  }
}

if (!vitestConfig.includes('"src/**/*.ts"')) {
  throw new Error("vitest.config.ts should include all source files in coverage.");
}

for (const excludedSource of ['"src/index.ts"', '"src/types.ts"']) {
  if (!vitestConfig.includes(excludedSource)) {
    throw new Error(`vitest.config.ts should explicitly document the ${excludedSource} coverage exclusion.`);
  }
}

console.log("Documentation, examples, and release workflow checks passed.");
