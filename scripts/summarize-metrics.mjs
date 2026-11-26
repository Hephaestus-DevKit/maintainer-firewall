import { readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

function run(inputs) {
  if (inputs.length === 0) {
    console.error("Usage: node scripts/summarize-metrics.mjs <report-json-file-or-directory> [...]");
    process.exitCode = 2;
    return;
  }
  const visited = new Set();
  const files = inputs.flatMap((input) => collectJsonFiles(input, visited));
  if (files.length === 0) {
    console.error("No JSON report files found.");
    process.exitCode = 2;
  } else {
    const summary = summarizeReports(files);
    console.log(JSON.stringify(summary, null, 2));
    if (summary.reports === 0) {
      console.error("No valid Maintainer Firewall report JSON files found.");
      process.exitCode = 1;
    }
  }
}

if (process.argv[1] && pathToFileURL(realpathSync(process.argv[1])).href === import.meta.url) {
  run(process.argv.slice(2));
}

export function summarizeReports(files) {
  const summary = {
    reports: 0,
    skipped: 0,
    outcomes: Object.create(null),
    findingsById: Object.create(null),
    findingsBySeverity: Object.create(null),
    labels: Object.create(null),
    configWarnings: 0,
    runtimeWarnings: 0,
    ignoredFiles: []
  };

  for (const file of files) {
    const payload = readJson(file);
    if (!isReportPayload(payload)) {
      summary.ignoredFiles.push(file);
      continue;
    }

    summary.reports += 1;
    if (payload.skipped) {
      summary.skipped += 1;
    }

    const outcome = typeof payload.summary?.outcome === "string" ? payload.summary.outcome : undefined;
    increment(summary.outcomes, outcome ?? (payload.skipped ? "skipped" : "unknown"));
    for (const finding of payload.findings) {
      increment(summary.findingsById, finding.id);
      increment(summary.findingsBySeverity, finding.severity);
      if (finding.label) {
        increment(summary.labels, finding.label);
      }
    }

    summary.configWarnings += warningCount(payload.diagnostics?.configWarnings);
    summary.runtimeWarnings += warningCount(payload.diagnostics?.runtimeWarnings);
  }

  return summary;
}

function collectJsonFiles(input, visited) {
  const status = statSync(input, { throwIfNoEntry: false });
  if (!status) {
    return [];
  }

  if (status.isFile()) {
    if (!input.endsWith(".json") || !visit(input, visited)) {
      return [];
    }
    return [input];
  }

  if (!status.isDirectory() || !visit(input, visited)) {
    return [];
  }

  return readdirSync(input).sort().flatMap((entry) => collectJsonFiles(join(input, entry), visited));
}

function visit(input, visited) {
  const canonical = realpathSync(input);
  if (visited.has(canonical)) {
    return false;
  }
  visited.add(canonical);
  return true;
}

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
  } catch {
    return undefined;
  }
}

function isReportPayload(payload) {
  return Boolean(
    payload &&
    payload.version === 1 &&
    typeof payload.skipped === "boolean" &&
    Array.isArray(payload.findings) &&
    payload.findings.every((finding) => (
      typeof finding?.id === "string" &&
      typeof finding.severity === "string" &&
      (finding.label === undefined || typeof finding.label === "string")
    ))
  );
}

function warningCount(warnings) {
  return Array.isArray(warnings) ? warnings.filter((warning) => typeof warning === "string").length : 0;
}

function increment(record, key) {
  record[key] = (record[key] ?? 0) + 1;
}
