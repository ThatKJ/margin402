"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { JobEvent, JobOutcome, PlanId } from "@/lib/orchestrator/types";

interface JobState {
  revenue: number | null;
  /**
   * Generated once, at accept, not per SSE connection attempt — so if the
   * browser (React Strict Mode in dev, or a real reconnect) opens the
   * EventSource twice for what is logically the same job, both attempts
   * carry the same id and the server's idempotency check on
   * /api/jobs/execute rejects the second as a duplicate instead of running
   * a second real payment.
   */
  jobId: string | null;
  events: JobEvent[];
  outcome: JobOutcome | null;
  /**
   * The selected execution plan — controls the orchestration policy.
   */
  planId: PlanId | null;
  /**
   * Wall-clock timestamps captured client-side as events arrive — the
   * backend doesn't stamp events with time, so duration/timestamp shown on
   * the statement come from when the browser actually saw them, not from
   * any invented backend field.
   */
  startedAt: number | null;
  endedAt: number | null;
}

interface JobContextValue extends JobState {
  /**
   * jobId is optional: the legacy path (no wallet, quote accepted at full
   * price with no customer x402 authorization) still generates its own id
   * client-side, same as before. The wallet-authorized path always has a
   * real server-issued jobId by the time this is called (from
   * /api/quote's {accept:true} or accepted-offer response) and must pass
   * it through unchanged — /api/jobs/execute resolves revenue from that
   * exact id's PAID job record, so a mismatched id would 402 instead of
   * running.
   */
  acceptQuote: (revenue: number, planId: PlanId, jobId?: string) => void;
  pushEvent: (event: JobEvent) => void;
  reset: () => void;
}

const EMPTY_STATE: JobState = { revenue: null, jobId: null, events: [], outcome: null, planId: null, startedAt: null, endedAt: null };

const JobContext = createContext<JobContextValue | null>(null);

/**
 * The only place job state lives. Three real routes (/quote, /execution,
 * /statement) share this via a client-side context at the root layout —
 * Next's client-side route transitions don't remount the layout, so this
 * survives navigation between them without a database. Nothing here is
 * persisted across a hard reload — matches "no history yet."
 */
export function JobProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<JobState>(EMPTY_STATE);

  const acceptQuote = useCallback((revenue: number, planId: PlanId, jobId?: string) => {
    setState({ revenue, jobId: jobId ?? crypto.randomUUID(), events: [], outcome: null, planId, startedAt: null, endedAt: null });
  }, []);

  const pushEvent = useCallback((event: JobEvent) => {
    setState((prev) => ({
      ...prev,
      events: [...prev.events, event],
      outcome: event.type === "closed" ? event.outcome : prev.outcome,
      startedAt: prev.startedAt ?? Date.now(),
      endedAt: event.type === "closed" ? Date.now() : prev.endedAt,
    }));
  }, []);

  const reset = useCallback(() => setState(EMPTY_STATE), []);

  const value = useMemo(() => ({ ...state, acceptQuote, pushEvent, reset }), [state, acceptQuote, pushEvent, reset]);

  return <JobContext.Provider value={value}>{children}</JobContext.Provider>;
}

export function useJob(): JobContextValue {
  const ctx = useContext(JobContext);
  if (!ctx) throw new Error("useJob must be used within JobProvider");
  return ctx;
}
