import { Worker } from "node:worker_threads";
import { WORKER_SOURCE } from "./worker-source";
import type { TestCase, VerifyResult } from "./types";

export type { TestCase, TestFailure, VerifyResult } from "./types";

const PER_TEST_TIMEOUT_MS = 500;
const TOTAL_BUDGET_MS = 2000;
/** Hard backstop above the in-worker budget, in case vm's own timeout ever fails to fire. */
const HARD_KILL_MS = TOTAL_BUDGET_MS + 1000;

/**
 * Runs `candidateCode` (must define a top-level function named
 * `functionName`) against `tests`, in a worker_thread with a bare vm
 * context: no require/process/fs/network/Buffer, a 2s total time budget, and
 * a memory cap. Whatever the candidate does — infinite loop, throws a
 * non-Error, tries to reference `process` — this resolves with a
 * VerifyResult and never throws or crashes the caller.
 */
export function verify(candidateCode: string, functionName: string, tests: TestCase[]): Promise<VerifyResult> {
  return new Promise((resolve) => {
    let settled = false;
    const settle = (result: VerifyResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(killTimer);
      void worker.terminate();
      resolve(result);
    };

    const worker = new Worker(WORKER_SOURCE, {
      eval: true,
      workerData: {
        candidateCode,
        functionName,
        tests,
        perTestTimeoutMs: PER_TEST_TIMEOUT_MS,
        totalBudgetMs: TOTAL_BUDGET_MS,
      },
      resourceLimits: {
        maxOldGenerationSizeMb: 64,
        maxYoungGenerationSizeMb: 16,
        codeRangeSizeMb: 16,
        stackSizeMb: 4,
      },
    });

    const killTimer = setTimeout(() => {
      settle({
        passed: 0,
        total: tests.length,
        failures: tests.map((t) => ({ name: t.name, reason: "sandbox hard timeout — worker terminated" })),
        timedOut: true,
        crashed: false,
      });
    }, HARD_KILL_MS);

    worker.on("message", (result: VerifyResult) => settle(result));

    worker.on("error", (err) => {
      settle({
        passed: 0,
        total: tests.length,
        failures: tests.map((t) => ({ name: t.name, reason: `worker crashed: ${err.message}` })),
        timedOut: false,
        crashed: true,
      });
    });

    worker.on("exit", (code) => {
      if (code !== 0) {
        settle({
          passed: 0,
          total: tests.length,
          failures: tests.map((t) => ({ name: t.name, reason: `worker exited with code ${code}` })),
          timedOut: false,
          crashed: true,
        });
      }
    });
  });
}
