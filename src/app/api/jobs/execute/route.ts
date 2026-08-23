import { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { runJob } from "@/lib/orchestrator/run-job";
import { createX402ProviderClient, createInProcessProviderClient } from "@/lib/orchestrator/provider-client";
import type { JobEvent } from "@/lib/orchestrator/types";

/**
 * Streams one job's real events (from the real orchestrator + real
 * economics engine + real sandbox verifier) to the client as Server-Sent
 * Events, as they happen — this is the UI's only connection to job state,
 * there is no separate UI-side simulation of what the backend is doing.
 *
 * Provider client defaults to real x402 (real testnet payment) — this
 * matches the product: payments stay real even when the model output is
 * cached. PROVIDER_CLIENT_MODE=inprocess is a local-only escape hatch for
 * verifying this route without spending real funds; it is never the
 * production default and carries no customer-facing indicator.
 *
 * Payment safety, in-memory (no database — this only needs to survive the
 * process, same as the spend guard it shares an id with):
 *  - `active`: a jobId currently mid-run. A second request for the same id
 *    while it's active is rejected (409) rather than running concurrently.
 *  - `settled`: a jobId that made at least one real payment attempt (win or
 *    lose) before finishing. Rejected (409) forever after — this is the
 *    actual duplicate-payment guard.
 *  - A jobId that finished having made zero payment attempts is untracked
 *    once done, so retrying it is allowed. This is deliberate: it's what
 *    lets React Strict Mode's dev-only mount -> cleanup -> remount cycle
 *    keep working — the first (cleanup-aborted) attempt is caught by the
 *    abort check before round 1's payment even starts, so it never reaches
 *    `settled`, and the real, lasting remount can still run.
 *
 * Separately, the run is aborted between rounds (never mid-payment) if the
 * client disconnects, so an abandoned tab can't keep a job spending real
 * funds unattended — see run-job.ts.
 */
const active = new Set<string>();
const settled = new Set<string>();

export async function GET(request: NextRequest) {
  const revenue = Number(request.nextUrl.searchParams.get("revenue"));
  if (!Number.isFinite(revenue) || revenue <= 0) {
    return new Response("invalid revenue", { status: 400 });
  }

  const planId = request.nextUrl.searchParams.get("planId") as "lowest-cost" | "best-value" | "highest-confidence" | null;
  if (planId && !["lowest-cost", "best-value", "highest-confidence"].includes(planId)) {
    return new Response("invalid planId", { status: 400 });
  }

  const jobId = request.nextUrl.searchParams.get("jobId") ?? randomUUID();
  if (settled.has(jobId)) {
    return new Response("job already made real payments — this is a retry, not a new job", { status: 409 });
  }
  if (active.has(jobId)) {
    return new Response("job already running", { status: 409 });
  }
  active.add(jobId);

  const providerClient =
    process.env.PROVIDER_CLIENT_MODE === "inprocess"
      ? createInProcessProviderClient()
      : createX402ProviderClient(request.nextUrl.origin, jobId);

  // Two independent signals for "the client is gone" — request.signal fires
  // on a clean abort in most runtimes, the stream's own cancel() is the
  // backstop if that doesn't fire for a long-lived GET. Either one stops
  // the next round from starting.
  const abortController = new AbortController();
  // request.signal may already be aborted by the time we get here (an
  // extremely fast client cancel) — addEventListener alone would miss that,
  // since 'abort' only fires once, at the moment it happens, not retroactively.
  if (request.signal.aborted) {
    abortController.abort();
  } else {
    request.signal.addEventListener("abort", () => abortController.abort());
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const send = (event: JobEvent) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          // Controller already closed underneath us (client gone) — nothing to do.
        }
      };
      try {
        const result = await runJob({ revenue, planId: planId ?? undefined, providerClient, onEvent: send, signal: abortController.signal });
        if (result.ledger.attempts.length > 0) settled.add(jobId);
        if (result.error) console.error("[jobs/execute] job ended with error", jobId, result.error);
      } catch (err) {
        // A real attempt was already made if any payment event fired before
        // the throw — onEvent already streamed it, so err on the side of
        // blocking a retry rather than risk a second real payment.
        settled.add(jobId);
        send({
          type: "closed",
          outcome: "FAILED",
          revenue,
          executionCost: 0,
          margin: -revenue,
          // runJob throwing at all means this is outside its own normal
          // FAILED/REFUNDED paths (which always carry a real settlements
          // list) — there's no ledger here to read a real one from.
          settlements: [],
        });
        console.error("[jobs/execute] unhandled error", err);
      } finally {
        active.delete(jobId);
        closed = true;
        try {
          controller.close();
        } catch {
          // Already closed via cancel() — fine.
        }
      }
    },
    cancel() {
      abortController.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
