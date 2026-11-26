import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

const yamlFiles = [
  "action.yml",
  ".maintainer-firewall.yml",
  ...[".github", ".github/ISSUE_TEMPLATE", ".github/workflows", "examples"].flatMap((dir) =>
    readdirSync(dir).filter((name) => /\.ya?ml$/.test(name)).map((name) => `${dir}/${name}`)
  )
];

describe("YAML files", () => {
  it.each(yamlFiles)("parses %s", (file) => {
    expect(() => parse(readFileSync(file, "utf8"))).not.toThrow();
  });
});
