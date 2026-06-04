import type { FirewallConfig, Subject } from "./types.js";
import { compileConfigRegex } from "./regex.js";

export function getSkipReason(subject: Subject, config: FirewallConfig): string | null {
  if (matchesCaseInsensitive(config.ignore.authors, subject.author)) {
    return `author ${subject.author} is ignored`;
  }

  const ignoredLabel = subject.labels.find((label) => matchesCaseInsensitive(config.ignore.labels, label));
  if (ignoredLabel) {
    return `label ${ignoredLabel} is ignored`;
  }

  const titlePattern = config.ignore.titlePatterns.find((pattern) => {
    return compileConfigRegex(pattern, "i")?.test(subject.title) ?? false;
  });

  if (titlePattern) {
    return `title matches ignored pattern ${titlePattern}`;
  }

  return null;
}

function matchesCaseInsensitive(values: string[], candidate: string): boolean {
  const normalized = candidate.toLowerCase();
  return values.some((value) => value.toLowerCase() === normalized);
}
