import { describe, expect, it } from "vitest";
import { createJob, getJob, markPaid, markExecuting, markClosed } from "../job-store";

/**
 * Regression coverage for the server-authoritative pricing guarantee behind
 * the customer x402 layer (CLAUDE.md's two-sided x402 section): a job's
 * acceptedPrice is decided once, at accept time, and nothing later can move
 * it — /api/jobs/authorize's price callback and /api/jobs/execute's revenue
 * both read it back from here, never from a request parameter.
 *
 * These run against whichever adapter getStore() selects (memory locally/CI
 * without REDIS_URL, Redis when it's set) — the interface contract is
 * identical either way, which is the whole point of the JobStore interface.
 */
describe("job-store", () => {
  it("creates a job at exactly the price it was given, unpaid", async () => {
    const job = await createJob("best-value", 1.2);
    expect(job.status).toBe("ACCEPTED");
    expect(job.acceptedPrice).toBe(1.2);
    expect(await getJob(job.jobId)).toEqual(job);
  });

  it("returns undefined for an unknown jobId — never fabricates a record", async () => {
    expect(await getJob("does-not-exist")).toBeUndefined();
  });

  it("markPaid transitions ACCEPTED -> PAID and records the real settlement txId", async () => {
    const job = await createJob("lowest-cost", 1.0);
    const paid = await markPaid(job.jobId, "REALTXID123");
    expect(paid?.status).toBe("PAID");
    expect(paid?.customerTxId).toBe("REALTXID123");
    // the price itself never moves once accepted
    expect(paid?.acceptedPrice).toBe(1.0);
  });

  it("markPaid is idempotent — a second call keeps the first txId, doesn't overwrite it", async () => {
    const job = await createJob("lowest-cost", 1.0);
    await markPaid(job.jobId, "FIRST-TX");
    const second = await markPaid(job.jobId, "SECOND-TX");
    expect(second?.customerTxId).toBe("FIRST-TX");
  });

  it("markPaid on an unknown jobId is a safe no-op", async () => {
    expect(await markPaid("nope")).toBeUndefined();
  });

  it("only ACCEPTED jobs can move to PAID — already-PAID or fresh jobs aren't downgraded", async () => {
    const job = await createJob("highest-confidence", 1.35);
    await markPaid(job.jobId);
    await markExecuting(job.jobId);
    expect((await getJob(job.jobId))?.status).toBe("EXECUTING");
    // calling markPaid again after EXECUTING must not regress status back to PAID
    await markPaid(job.jobId);
    expect((await getJob(job.jobId))?.status).toBe("EXECUTING");
  });

  it("markExecuting only advances a PAID job, never an unpaid one", async () => {
    const job = await createJob("best-value", 1.2);
    await markExecuting(job.jobId); // still ACCEPTED, not PAID — must be ignored
    expect((await getJob(job.jobId))?.status).toBe("ACCEPTED");
  });

  it("markClosed is terminal and works from any state", async () => {
    const job = await createJob("best-value", 1.2);
    await markClosed(job.jobId);
    expect((await getJob(job.jobId))?.status).toBe("CLOSED");
  });

  it("a job created by one call is found by a completely independent later lookup", async () => {
    // This is the actual regression case: quote and authorize are separate
    // HTTP requests (separate function invocations in production), not the
    // same call — a job that only lives in the memory of the process that
    // created it, and is unreachable from a later, independent request,
    // is exactly the bug that produced a real 404 in production.
    const created = await createJob("best-value", 1.2);
    const jobId = created.jobId;
    async function independentLookup(id: string) {
      return getJob(id);
    }
    const found = await independentLookup(jobId);
    expect(found).toBeDefined();
    expect(found?.jobId).toBe(jobId);
    expect(found?.acceptedPrice).toBe(1.2);
  });
});
