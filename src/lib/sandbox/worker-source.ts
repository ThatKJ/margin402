/**
 * Source for the sandbox worker_thread, kept as a plain JS string run via
 * `new Worker(WORKER_SOURCE, { eval: true })` instead of a file path.
 *
 * Deliberate: a file-path worker needs to survive Next.js's server bundler
 * (webpack/turbopack) resolving it at runtime, which is fragile for
 * arbitrary worker scripts. An eval'd string sidesteps that entirely — no
 * path resolution, so it works identically under `next dev`, `next build`,
 * tsx, and vitest.
 *
 * This code is trusted infrastructure, not sandboxed itself — it's the
 * thing SETTING UP the sandbox. It runs with full worker_threads/node:vm
 * access; only the candidate code it evaluates is confined to a bare
 * vm.createContext(), which has no require/process/fs/network by default.
 */
export const WORKER_SOURCE = `
const { parentPort, workerData } = require("node:worker_threads");
const vm = require("node:vm");

function safeStringify(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function describeError(err) {
  // err thrown from INSIDE the vm context is an Error from that context's
  // own realm — "instanceof Error" (this realm's Error) is false for it, so
  // this checks structurally instead of by instanceof.
  if (err && typeof err === "object" && typeof err.message === "string") {
    const name = typeof err.name === "string" ? err.name : "Error";
    return name + ": " + err.message;
  }
  return safeStringify(err);
}

function run() {
  const { candidateCode, functionName, tests, perTestTimeoutMs, totalBudgetMs } = workerData;

  // A fresh, bare context: no require, process, fs, Buffer, or global —
  // only the standard built-ins V8 gives every context (Math, JSON, Array,
  // Object, String, Number, RegExp, Error, ...).
  const context = vm.createContext({});

  try {
    new vm.Script(candidateCode, { filename: "candidate.js" }).runInContext(context, {
      timeout: perTestTimeoutMs,
    });
  } catch (err) {
    parentPort.postMessage({
      passed: 0,
      total: tests.length,
      failures: tests.map((t) => ({ name: t.name, reason: "candidate code failed to load: " + describeError(err) })),
      timedOut: false,
      crashed: false,
    });
    return;
  }

  const failures = [];
  let passed = 0;
  let timedOut = false;
  const deadline = Date.now() + totalBudgetMs;

  for (const test of tests) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      timedOut = true;
      failures.push({ name: test.name, reason: "overall verification time budget exhausted" });
      continue;
    }
    const perCallTimeout = Math.max(1, Math.min(perTestTimeoutMs, remaining));

    context.__args__ = test.args;

    try {
      const result = new vm.Script(functionName + "(...__args__)", { filename: "test-" + test.name + ".js" }).runInContext(
        context,
        { timeout: perCallTimeout },
      );

      if (test.expectThrow) {
        failures.push({ name: test.name, reason: "expected a throw, got " + safeStringify(result) });
        continue;
      }
      if (safeStringify(result) === safeStringify(test.expected)) {
        passed += 1;
      } else {
        failures.push({ name: test.name, reason: "expected " + safeStringify(test.expected) + ", got " + safeStringify(result) });
      }
    } catch (err) {
      if (test.expectThrow) {
        passed += 1;
      } else {
        const msg = describeError(err);
        if (/timed out/i.test(msg)) timedOut = true;
        failures.push({ name: test.name, reason: "threw: " + msg });
      }
    }
  }

  parentPort.postMessage({ passed, total: tests.length, failures, timedOut, crashed: false });
}

try {
  run();
} catch (err) {
  parentPort.postMessage({
    passed: 0,
    total: (workerData && workerData.tests && workerData.tests.length) || 0,
    failures: [{ name: "*", reason: "sandbox worker crashed: " + describeError(err) }],
    timedOut: false,
    crashed: true,
  });
}
`;
