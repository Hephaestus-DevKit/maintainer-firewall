import { execFileSync } from "node:child_process";
import { lstatSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const repository = fileURLToPath(new URL("..", import.meta.url));
const dist = join(repository, "dist");
const require = createRequire(import.meta.url);

try {
  const args = process.argv.slice(2);
  if (args[0] === "--verify") {
    if (args.length > 1) {
      throw new Error("Run npm run verify:dist without additional arguments.");
    }
    verifyBundle();
  } else {
    buildBundle(dist, args);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

function buildBundle(destination, flags) {
  const manifest = require.resolve("@vercel/ncc/package.json");
  const ncc = join(dirname(manifest), require(manifest).bin.ncc);
  execFileSync(process.execPath, [
    ncc,
    "build", "src/index.ts",
    "--out", destination,
    "--source-map",
    "--license", "licenses.txt",
    ...flags
  ], { cwd: repository, stdio: "inherit" });
}

function verifyBundle() {
  const workspace = mkdtempSync(join(tmpdir(), "maintainer-firewall-bundle-"));
  try {
    const generated = join(workspace, "dist");
    buildBundle(generated, ["--no-cache", "--quiet"]);

    const currentFiles = listFiles(dist);
    const generatedFiles = listFiles(generated);
    const differences = [];

    for (const [name, expected] of generatedFiles) {
      const actual = currentFiles.get(name);
      if (!actual) {
        differences.push(`Missing dist/${name}`);
      } else if (!actual.isFile || !expected.isFile) {
        differences.push(`Expected a regular file at dist/${name}`);
      } else if (!readFileSync(actual.path).equals(readFileSync(expected.path))) {
        differences.push(`Changed dist/${name}`);
      }
    }

    for (const name of currentFiles.keys()) {
      if (!generatedFiles.has(name)) {
        differences.push(`Unexpected dist/${name}`);
      }
    }

    if (differences.length > 0) {
      throw new Error([
        "Bundle drift detected.",
        ...differences.sort(),
        "Run npm run bundle to refresh generated files and remove any obsolete files listed above."
      ].join("\n"));
    }

    console.log(`Verified ${generatedFiles.size} files in dist/.`);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
}

function listFiles(directory) {
  const files = new Map();
  const root = lstatSync(directory, { throwIfNoEntry: false });
  if (!root) {
    return files;
  }
  if (!root.isDirectory()) {
    throw new Error(`Expected a directory at ${directory}.`);
  }

  for (const entry of readdirSync(directory, { recursive: true, withFileTypes: true })) {
    if (!entry.isDirectory()) {
      const path = join(entry.parentPath, entry.name);
      files.set(relative(directory, path), { path, isFile: entry.isFile() });
    }
  }

  return files;
}
