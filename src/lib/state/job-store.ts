import { randomUUID } from "node:crypto";
import type { PlanId } from "@/lib/orchestrator/types";

/**
 * Server-authoritative job/contract state for the customer-facing x402
 * layer. This exists so /api/jobs/authorize can never be told "charge
 * whatever the browser says" — the accepted price is decided here, at
 * accept time, from the same LOCKED_QUOTE/plan pricing the quote screen
 * already showed, and every later step (the x402 price callback,
 * /api/jobs/execute's revenue) reads it back from here instead of trusting
 * a request parameter.
 *
 * Storage is swappable behind the JobStore interface below. Vercel
 * serverless functions do NOT guarantee that module-level memory survives
 * between separate invocations — different requests can land on different
 * instances/isolates, especially once a real wallet signature (tens of
 * seconds to minutes of human interaction) sits between "quote accepted"
 * and "authorize requested". A plain in-memory Map worked in every test
 * that happened to hit a still-warm instance, then failed unpredictably
 * once the delay grew — a real job disappearing between requests, not a
 * signer bug. REDIS_URL selects the durable adapter; its absence falls
 * back to memory, which remains correct for local dev and the test suite
 * (a single Node process) but is NOT safe for a real multi-instance
 * production deployment.
 */
export type JobStatus = "ACCEPTED" | "PAID" | "EXECUTING" | "CLOSED";

export interface JobRecord {
  jobId: string;
  planId: PlanId;
  acceptedPrice: number;
  status: JobStatus;
  createdAt: number;
  /** Real x402 settlement from the customer's payment, once PAID. Never fabricated — see authorize/route.ts. */
  customerTxId?: string;
}

export interface JobStore {
  create(planId: PlanId, acceptedPrice: number): Promise<JobRecord>;
  get(jobId: string): Promise<JobRecord | undefined>;
  markPaid(jobId: string, customerTxId?: string): Promise<JobRecord | undefined>;
  markExecuting(jobId: string): Promise<void>;
  markClosed(jobId: string): Promise<void>;
}

const JOB_TTL_MS = 10 * 60 * 1000;

class MemoryJobStore implements JobStore {
  private jobs = new Map<string, JobRecord>();

  private sweepExpired(): void {
    const cutoff = Date.now() - JOB_TTL_MS;
    for (const [id, job] of this.jobs) {
      if (job.status === "ACCEPTED" && job.createdAt < cutoff) this.jobs.delete(id);
    }
  }

  async create(planId: PlanId, acceptedPrice: number): Promise<JobRecord> {
    this.sweepExpired();
    const job: JobRecord = { jobId: randomUUID(), planId, acceptedPrice, status: "ACCEPTED", createdAt: Date.now() };
    this.jobs.set(job.jobId, job);
    return job;
  }

  async get(jobId: string): Promise<JobRecord | undefined> {
    return this.jobs.get(jobId);
  }

  async markPaid(jobId: string, customerTxId?: string): Promise<JobRecord | undefined> {
    const job = this.jobs.get(jobId);
    if (!job) return undefined;
    if (job.status === "ACCEPTED") job.status = "PAID";
    if (customerTxId && !job.customerTxId) job.customerTxId = customerTxId;
    return job;
  }

  async markExecuting(jobId: string): Promise<void> {
    const job = this.jobs.get(jobId);
    if (job && job.status === "PAID") job.status = "EXECUTING";
  }

  async markClosed(jobId: string): Promise<void> {
    const job = this.jobs.get(jobId);
    if (job) job.status = "CLOSED";
  }
}

/**
 * Redis-backed adapter — the durable production store. Keys expire on
 * their own (TTL only applies to unpaid ACCEPTED jobs in practice, since a
 * PAID/EXECUTING/CLOSED job is refreshed with a much longer TTL the moment
 * it stops being a bare quote). Uses the standard `redis` client against
 * REDIS_URL; every op is a single round trip, no transactions needed since
 * each field update is a full record read-modify-write keyed by jobId and
 * job records are never concurrently written by two different routes for
 * the same field (create: quote route only; markPaid: authorize route
 * only; markExecuting/markClosed: execute route only).
 */
class RedisJobStore implements JobStore {
  private clientPromise: Promise<import("redis").RedisClientType> | null = null;

  private async client() {
    if (!this.clientPromise) {
      this.clientPromise = (async () => {
        const { createClient } = await import("redis");
        const client = createClient({ url: process.env.REDIS_URL });
        client.on("error", (err) => console.error("[job-store] redis client error", err));
        await client.connect();
        return client;
      })();
    }
    return this.clientPromise;
  }

  private key(jobId: string): string {
    return `margin402:job:${jobId}`;
  }

  async create(planId: PlanId, acceptedPrice: number): Promise<JobRecord> {
    const job: JobRecord = { jobId: randomUUID(), planId, acceptedPrice, status: "ACCEPTED", createdAt: Date.now() };
    const client = await this.client();
    await client.set(this.key(job.jobId), JSON.stringify(job), { EX: JOB_TTL_MS / 1000 });
    return job;
  }

  async get(jobId: string): Promise<JobRecord | undefined> {
    const client = await this.client();
    const raw = await client.get(this.key(jobId));
    if (!raw) return undefined;
    return JSON.parse(raw) as JobRecord;
  }

  private async save(job: JobRecord, ttlSeconds: number): Promise<void> {
    const client = await this.client();
    await client.set(this.key(job.jobId), JSON.stringify(job), { EX: ttlSeconds });
  }

  async markPaid(jobId: string, customerTxId?: string): Promise<JobRecord | undefined> {
    const job = await this.get(jobId);
    if (!job) return undefined;
    if (job.status === "ACCEPTED") job.status = "PAID";
    if (customerTxId && !job.customerTxId) job.customerTxId = customerTxId;
    // Once paid this is a real receipt, not a quote — give it a long tail
    // (a day) instead of the short unpaid-quote TTL.
    await this.save(job, 24 * 60 * 60);
    return job;
  }

  async markExecuting(jobId: string): Promise<void> {
    const job = await this.get(jobId);
    if (job && job.status === "PAID") {
      job.status = "EXECUTING";
      await this.save(job, 24 * 60 * 60);
    }
  }

  async markClosed(jobId: string): Promise<void> {
    const job = await this.get(jobId);
    if (job) {
      job.status = "CLOSED";
      await this.save(job, 24 * 60 * 60);
    }
  }
}

let store: JobStore | null = null;

function getStore(): JobStore {
  if (!store) {
    store = process.env.REDIS_URL ? new RedisJobStore() : new MemoryJobStore();
  }
  return store;
}

export function createJob(planId: PlanId, acceptedPrice: number): Promise<JobRecord> {
  return getStore().create(planId, acceptedPrice);
}

export function getJob(jobId: string): Promise<JobRecord | undefined> {
  return getStore().get(jobId);
}

export function markPaid(jobId: string, customerTxId?: string): Promise<JobRecord | undefined> {
  return getStore().markPaid(jobId, customerTxId);
}

export function markExecuting(jobId: string): Promise<void> {
  return getStore().markExecuting(jobId);
}

export function markClosed(jobId: string): Promise<void> {
  return getStore().markClosed(jobId);
}
