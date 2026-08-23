import { describe, it, expect } from "vitest";
import { verify } from "../index";
import type { TestCase } from "../types";

const ADD_TESTS: TestCase[] = [
  { name: "adds positives", args: [2, 3], expected: 5 },
  { name: "adds negatives", args: [-2, -3], expected: -5 },
];

describe("sandbox verify()", () => {
  it("passes correct code", async () => {
    const result = await verify("function add(a, b) { return a + b; }", "add", ADD_TESTS);
    expect(result).toEqual({ passed: 2, total: 2, failures: [], timedOut: false, crashed: false });
  });

  it("reports a clear per-test failure reason for wrong output", async () => {
    const result = await verify("function add(a, b) { return a - b; }", "add", ADD_TESTS);
    expect(result.passed).toBe(0);
    expect(result.total).toBe(2);
    expect(result.failures).toHaveLength(2);
    expect(result.failures[0].reason).toContain("expected");
  });

  it("survives an infinite loop without hanging or crashing the caller", async () => {
    const start = Date.now();
    const result = await verify("function add() { while (true) {} }", "add", ADD_TESTS);
    const elapsed = Date.now() - start;

    expect(result.crashed).toBe(false);
    expect(result.passed).toBe(0);
    expect(elapsed).toBeLessThan(4000); // budget is 2s + 1s hard-kill backstop
  }, 6000);

  it("has no access to process — process.exit() cannot take the app down", async () => {
    const result = await verify("function add() { process.exit(1); return 0; }", "add", ADD_TESTS);
    expect(result.crashed).toBe(false);
    expect(result.passed).toBe(0);
    expect(result.failures[0].reason.toLowerCase()).toContain("process");
  });

  it("has no require — no filesystem or child_process access", async () => {
    const result = await verify(
      "function add() { const fs = require('node:fs'); return fs.readFileSync('/etc/passwd', 'utf8').length; }",
      "add",
      ADD_TESTS,
    );
    expect(result.crashed).toBe(false);
    expect(result.passed).toBe(0);
    expect(result.failures[0].reason.toLowerCase()).toContain("require");
  });

  it("handles a thrown non-Error value without crashing", async () => {
    const result = await verify("function add() { throw { code: 'boom' }; }", "add", ADD_TESTS);
    expect(result.crashed).toBe(false);
    expect(result.passed).toBe(0);
    expect(result.failures[0].reason).toContain("boom");
  });

  it("supports expectThrow tests", async () => {
    const result = await verify("function add() { throw new Error('nope'); }", "add", [
      { name: "must throw", args: [], expectThrow: true },
    ]);
    expect(result).toEqual({ passed: 1, total: 1, failures: [], timedOut: false, crashed: false });
  });

  it("reports a clean failure when the candidate code itself fails to parse/load", async () => {
    const result = await verify("this is not valid javascript {{{", "add", ADD_TESTS);
    expect(result.crashed).toBe(false);
    expect(result.passed).toBe(0);
    expect(result.failures[0].reason).toContain("failed to load");
  });
});
