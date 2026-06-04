const REGEX_CACHE_LIMIT = 256;

const regexCache = new Map<string, RegExp | null>();

export function compileConfigRegex(pattern: string, flags = "i"): RegExp | null {
  const key = `${flags}:${pattern}`;
  if (regexCache.has(key)) {
    return regexCache.get(key) ?? null;
  }

  const compiled = compileConfigRegexUncached(pattern, flags);
  if (regexCache.size >= REGEX_CACHE_LIMIT) {
    regexCache.clear();
  }

  regexCache.set(key, compiled);
  return compiled;
}

export function matchesAnyConfiguredRegex(value: string, patterns: string[]): boolean {
  return patterns.some((pattern) => compileConfigRegex(pattern, "i")?.test(value) ?? false);
}

export function replaceByConfiguredRegexes(
  value: string,
  patterns: string[],
  replacement: string
): string {
  return patterns.reduce((output, pattern) => {
    const regex = compileConfigRegex(pattern, "gi");
    return regex ? output.replace(regex, replacement) : output;
  }, value);
}

export function configuredRegexWarnings(path: string, patterns: string[]): string[] {
  return patterns
    .flatMap((pattern, index) => {
      try {
        new RegExp(pattern);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return [`${path}[${index}] contains an invalid regular expression: ${message}`];
      }

      if (isPotentiallyUnsafeRegex(pattern)) {
        return [`${path}[${index}] contains a potentially unsafe regular expression and will be ignored.`];
      }

      return [];
    });
}

function compileConfigRegexUncached(pattern: string, flags: string): RegExp | null {
  if (isPotentiallyUnsafeRegex(pattern)) {
    return null;
  }

  try {
    return new RegExp(pattern, flags);
  } catch {
    return null;
  }
}

function isPotentiallyUnsafeRegex(pattern: string): boolean {
  const source = pattern.replace(/\\./g, "");
  return hasBackreference(pattern) ||
    hasNestedQuantifiedGroup(source) ||
    hasQuantifiedAmbiguousAlternation(source) ||
    hasRepeatedWildcard(source);
}

function hasBackreference(pattern: string): boolean {
  return /\\[1-9]/.test(pattern);
}

function hasNestedQuantifiedGroup(source: string): boolean {
  return /\([^)]*(?:[+*]|\{\d+(?:,\d*)?})[^)]*\)\s*(?:[+*]|\{\d+(?:,\d*)?})/.test(source);
}

function hasQuantifiedAmbiguousAlternation(source: string): boolean {
  return /\([^)]*\|[^)]*\)\s*(?:[+*]|\{\d+(?:,\d*)?})/.test(source);
}

function hasRepeatedWildcard(source: string): boolean {
  return /(?:\.\*){2,}/.test(source);
}
