import { describe, expect, it } from "vitest";
import { createJob, getJob, markPaid, markExecuting, markClosed } from "../job-store";

/**
 * Regression coverage for the server-authoritative pricing guarantee behind
 * the customer x402 layer (CLAUDE.md's two-sided x402 section): a job's
 * acceptedPrice is decided once, at accept time, and nothing later can move
 * it — /api/jobs/authorize's price callback and /api/jobs/execute's revenue
 * both read it back from here, never from a request parameter.
 */
describe("job-store", () => {
  it("creates a job at exactly the price it was given, unpaid", () => {
    const job = createJob("best-value", 1.2);
    expect(job.status).toBe("ACCEPTED");
    expect(job.acceptedPrice).toBe(1.2);
    expect(getJob(job.jobId)).toEqual(job);
  });

  it("returns undefined for an unknown jobId — never fabricates a record", () => {
    expect(getJob("does-not-exist")).toBeUndefined();
  });

  it("markPaid transitions ACCEPTED -> PAID and records the real settlement txId", () => {
    const job = createJob("lowest-cost", 1.0);
    const paid = markPaid(job.jobId, "REALTXID123");
    expect(paid?.status).toBe("PAID");
    expect(paid?.customerTxId).toBe("REALTXID123");
    // the price itself never moves once accepted
    expect(paid?.acceptedPrice).toBe(1.0);
  });

  it("markPaid is idempotent — a second call keeps the first txId, doesn't overwrite it", () => {
    const job = createJob("lowest-cost", 1.0);
    markPaid(job.jobId, "FIRST-TX");
    const second = markPaid(job.jobId, "SECOND-TX");
    expect(second?.customerTxId).toBe("FIRST-TX");
  });

  it("markPaid on an unknown jobId is a safe no-op", () => {
    expect(markPaid("nope")).toBeUndefined();
  });

  it("only ACCEPTED jobs can move to PAID — already-PAID or fresh jobs aren't downgraded", () => {
    const job = createJob("highest-confidence", 1.35);
    markPaid(job.jobId);
    markExecuting(job.jobId);
    expect(getJob(job.jobId)?.status).toBe("EXECUTING");
    // calling markPaid again after EXECUTING must not regress status back to PAID
    markPaid(job.jobId);
    expect(getJob(job.jobId)?.status).toBe("EXECUTING");
  });

  it("markExecuting only advances a PAID job, never an unpaid one", () => {
    const job = createJob("best-value", 1.2);
    markExecuting(job.jobId); // still ACCEPTED, not PAID — must be ignored
    expect(getJob(job.jobId)?.status).toBe("ACCEPTED");
  });

  it("markClosed is terminal and works from any state", () => {
    const job = createJob("best-value", 1.2);
    markClosed(job.jobId);
    expect(getJob(job.jobId)?.status).toBe("CLOSED");
  });
});
