import type { TestCase } from "../sandbox/types";

export const PARSE_DURATION_PROBLEM = {
  functionName: "parseDuration",
  signature: "function parseDuration(input: string): number",
  description:
    "Parse a duration string like \"1h30m\" or \"45s\" into total seconds. " +
    "A leading '-' negates the whole duration. Whitespace around the string " +
    "is ignored. Malformed input or a result outside Number.MAX_SAFE_INTEGER " +
    "must throw.",
};

export const PARSE_DURATION_TESTS: TestCase[] = [
  { name: "hours and minutes", args: ["1h30m"], expected: 5400 },
  { name: "seconds only", args: ["45s"], expected: 45 },
  { name: "zero", args: ["0s"], expected: 0 },
  { name: "negative", args: ["-10s"], expected: -10 },
  { name: "surrounding whitespace", args: ["  5m  "], expected: 300 },
  { name: "hours only", args: ["2h"], expected: 7200 },
  { name: "integer overflow (nasty)", args: ["999999999999999h"], expectThrow: true },
  { name: "malformed input (nasty)", args: ["abc"], expectThrow: true },
];

/**
 * The two genuinely-nasty edge cases are held back from the customer-visible
 * suite — a naive draft can look like it passes while missing exactly these.
 * This is a display-layer distinction only: every test runs identically for
 * real in the sandbox regardless of this list, and names never reach the
 * client — only counts do (see deriveVisibleHiddenCounts in the orchestrator).
 */
export const HIDDEN_TEST_NAMES: ReadonlySet<string> = new Set([
  "integer overflow (nasty)",
  "malformed input (nasty)",
]);

export const VISIBLE_TEST_COUNT = PARSE_DURATION_TESTS.length - HIDDEN_TEST_NAMES.size;
export const HIDDEN_TEST_COUNT = HIDDEN_TEST_NAMES.size;
