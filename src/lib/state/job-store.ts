import { randomUUID } from "node:crypto";
import type { PlanId } from "@/lib/orchestrator/types";

/**
 * Server-authoritative job/contract state for the customer-facing x402
 * layer. In-memory, same durability class as the existing spend guard and
 * the execute route's active/settled sets — this only needs to survive the
 * process, not a restart.
 *
 * This exists so /api/jobs/authorize can never be told "charge whatever the
 * browser says" — the accepted price is decided here, at accept time, from
 * the same LOCKED_QUOTE/plan pricing the quote screen already showed, and
 * every later step (the x402 price callback, /api/jobs/execute's revenue)
 * reads it back from this store instead of trusting a request parameter.
 */
export type JobStatus = "ACCEPTED" | "PAID" | "EXECUTING" | "CLOSED";

export interface JobRecord {
  jobId: string;
  planId: PlanId;
  acceptedPrice: number;
  status: JobStatus;
  createdAt: number;
  /** Real x402 settlement from the customer's payment, once PAID. */
  customerTxId?: string;
}

const JOB_TTL_MS = 10 * 60 * 1000;

const jobs = new Map<string, JobRecord>();

function sweepExpired(): void {
  const cutoff = Date.now() - JOB_TTL_MS;
  for (const [id, job] of jobs) {
    if (job.status === "ACCEPTED" && job.createdAt < cutoff) jobs.delete(id);
  }
}

/** Creates a new accepted-but-unpaid job record at a server-decided price. */
export function createJob(planId: PlanId, acceptedPrice: number): JobRecord {
  sweepExpired();
  const job: JobRecord = { jobId: randomUUID(), planId, acceptedPrice, status: "ACCEPTED", createdAt: Date.now() };
  jobs.set(job.jobId, job);
  return job;
}

export function getJob(jobId: string): JobRecord | undefined {
  return jobs.get(jobId);
}

/** Marks a job PAID after its customer x402 settlement is confirmed. Idempotent. */
export function markPaid(jobId: string, customerTxId?: string): JobRecord | undefined {
  const job = jobs.get(jobId);
  if (!job) return undefined;
  if (job.status === "ACCEPTED") job.status = "PAID";
  if (customerTxId && !job.customerTxId) job.customerTxId = customerTxId;
  return job;
}

export function markExecuting(jobId: string): void {
  const job = jobs.get(jobId);
  if (job && job.status === "PAID") job.status = "EXECUTING";
}

export function markClosed(jobId: string): void {
  const job = jobs.get(jobId);
  if (job) job.status = "CLOSED";
}
