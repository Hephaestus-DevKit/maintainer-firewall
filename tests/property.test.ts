import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { compileConfigRegex, replaceByConfiguredRegexes } from "../src/regex.js";
import { redactByPatterns } from "../src/redaction.js";
import { jaccardSimilarity, truncate } from "../src/text.js";

describe("property-based safety checks", () => {
  it("redacts secret-shaped tokens without echoing the original value", () => {
    fc.assert(
      fc.property(
        fc.string(),
        fc.stringMatching(/^[A-Za-z0-9_-]{19,47}[A-Za-z0-9]$/),
        fc.string(),
        (prefix, suffix, postfix) => {
          const secret = `sk-${suffix}`;
          const output = redactByPatterns(
            `${prefix} ${secret} ${postfix}`,
            ["\\bsk-[A-Za-z0-9_-]{20,}\\b"]
          );

          expect(output).not.toContain(secret);
          expect(output).toContain("[redacted]");
        }
      ),
      { numRuns: 100 }
    );
  });

  it("ignores generated nested-quantifier patterns instead of compiling them", () => {
    fc.assert(
      fc.property(fc.stringMatching(/^[a-z]{1,8}$/), fc.string(), (chunk, value) => {
        const unsafePattern = `(${chunk}+)+`;

        expect(compileConfigRegex(unsafePattern)).toBeNull();
        expect(replaceByConfiguredRegexes(value, [unsafePattern], "[redacted]")).toBe(value);
      }),
      { numRuns: 100 }
    );
  });

  it("keeps truncation bounded and explicit for long text", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 161, maxLength: 400 }),
        fc.integer({ min: 20, max: 160 }),
        (value, maxCharacters) => {
          const output = truncate(value, maxCharacters);

          expect(output.length).toBeLessThanOrEqual(maxCharacters);
          expect(output).toContain("...[truncated]");
        }
      ),
      { numRuns: 100 }
    );
  });

  it("keeps duplicate-title similarity symmetric and bounded", () => {
    fc.assert(
      fc.property(fc.string(), fc.string(), (left, right) => {
        const leftToRight = jaccardSimilarity(left, right);
        const rightToLeft = jaccardSimilarity(right, left);

        expect(leftToRight).toBeGreaterThanOrEqual(0);
        expect(leftToRight).toBeLessThanOrEqual(1);
        expect(leftToRight).toBe(rightToLeft);
      }),
      { numRuns: 100 }
    );
  });
});
