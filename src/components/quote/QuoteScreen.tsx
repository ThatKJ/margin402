"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { submitCounteroffer, acceptPlan } from "@/lib/actions/quote-actions";
import { getDefaultJobType } from "@/lib/workloads/job-types";
import { formatUsd } from "@/lib/ui/format";
import { useCountUp } from "@/lib/ui/motion";
import { useJob } from "@/lib/state/job-context";
import { useWallet } from "@/lib/wallet/WalletContext";
import { buyPaidResourceAsCustomer } from "@/lib/x402/browser-buyer";
import { isPeraCancellation } from "@/lib/wallet/pera-signer";
import { Badge } from "@/components/primitives/Badge";
import { Button } from "@/components/primitives/Button";
import { Spinner } from "@/components/primitives/Indicators";
import { PlanCard } from "./PlanCard";
import type { CustomerPlan } from "@/lib/economics/plans";
import type { PlanId } from "@/lib/orchestrator/types";
import type { CustomerOfferResult } from "@/lib/actions/quote-actions";

const QUOTE_VALIDITY_SECONDS = 60;

type Phase =
  | "plans"
  | "counter-open"
  | "counter-result"
  | "authorizing"
  | "authorization-cancelled"
  | "authorization-failed"
  | "payment-limit-blocked"
  | "contract-expired"
  | "backend-unavailable"
  | "confirming"
  | "expired";

export function QuoteScreen({ quotePrice, plans }: { quotePrice: number; plans: CustomerPlan[] }) {
  const router = useRouter();
  const { acceptQuote, reset, customerAgentId } = useJob();
  const wallet = useWallet();
  const jobType = getDefaultJobType();

  const [phase, setPhase] = useState<Phase>("plans");
  const [selectedId, setSelectedId] = useState<PlanId | null>(null);
  const [expandedId, setExpandedId] = useState<PlanId | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(QUOTE_VALIDITY_SECONDS);
  const [counterInput, setCounterInput] = useState("");
  const [result, setResult] = useState<CustomerOfferResult | null>(null);
  const [counterSpent, setCounterSpent] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [authError, setAuthError] = useState<string | null>(null);
  const startedRef = useRef(false);
  const counterInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    reset();
  }, [reset]);

  useEffect(() => {
    if (phase !== "plans" && phase !== "counter-open") return;
    if (secondsLeft <= 0) {
      setPhase("expired");
      return;
    }
    const t = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [phase, secondsLeft]);

  useEffect(() => {
    if (phase === "counter-open") counterInputRef.current?.focus();
  }, [phase]);

  const selected = plans.find((p) => p.id === selectedId) ?? null;
  const recommended = plans.find((p) => p.recommended) ?? null;

  function choosePlan(plan: CustomerPlan) {
    setSelectedId(plan.id);
    document.getElementById("plan-confirm")?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  /**
   * The real Layer 1 x402 flow (CLAUDE.md's two-sided x402 section):
   * jobId is either already on `result` (a counteroffer that was accepted
   * server-side already created the job) or gets created now for a
   * full-price accept, then GET /api/jobs/authorize?jobId=X is the actual
   * paid request — 402, Pera signs, retry, settle, all real. Only after
   * that genuinely resolves does execution get authorized to start; a
   * declined wallet signature never reaches "confirming"/"Job failed", it's
   * its own cancelled state, because no autonomous run ever began.
   *
   * Failure classification matters: a 404/410 here means the contract
   * itself is missing or expired — nothing about payment or settlement
   * failed, because no payment was ever requested for it (see
   * api/jobs/authorize's outer GET gate, which returns 404 before withX402
   * ever runs for an unknown job). That's a completely different situation
   * from a wallet rejection or a real facilitator settlement failure, and
   * collapsing all three into one generic "payment not settled" message is
   * exactly the bug this distinguishes.
   */
  async function handleAccept(amount: number, existingJobId?: string) {
    if (startedRef.current || !selected) return;
    if (wallet.status !== "connected" || !wallet.signer) {
      await wallet.connect();
      return;
    }
    startedRef.current = true;
    setAuthError(null);
    setPhase("authorizing");
    try {
      const jobId = existingJobId ?? (await acceptPlan(selected.id)).jobId;
      const buy = await buyPaidResourceAsCustomer(`/api/jobs/authorize?jobId=${jobId}`, wallet.signer);
      if (!buy.ok || !buy.txId) {
        // A 409 here doesn't necessarily mean payment failed — it's also
        // what a job that's already PAID/EXECUTING/CLOSED returns (see
        // api/jobs/authorize's outer GET gate), which happens when this
        // exact call is retried after a connection drop that hid a real,
        // already-settled response from the first attempt. That job is
        // fine — proceed to execution instead of reporting a failure for a
        // payment that actually succeeded.
        const status = (buy.body as { status?: string } | undefined)?.status;
        if (buy.status === 409 && (status === "PAID" || status === "EXECUTING" || status === "CLOSED")) {
          setPhase("confirming");
          acceptQuote(amount, selected.id, jobId);
          router.push("/execution");
          return;
        }
        startedRef.current = false;
        if (buy.status === 404 || buy.status === 410) {
          setPhase("contract-expired");
        } else {
          setPhase("authorization-failed");
          setAuthError(`HTTP ${buy.status}`);
        }
        return;
      }
      // Report the real, SDK-decoded settlement txId back as receipt
      // metadata — best-effort only. This can never mark anything paid on
      // its own (api/jobs/authorize's POST handler requires the job to
      // already be PAID via the real x402 flow above), so a failure here
      // doesn't change whether authorization succeeded.
      void fetch(`/api/jobs/authorize?jobId=${jobId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ txId: buy.txId }),
      }).catch(() => {});
      setPhase("confirming");
      acceptQuote(amount, selected.id, jobId);
      router.push("/execution");
    } catch (err) {
      startedRef.current = false;
      if (isPeraCancellation(err)) {
        setPhase("authorization-cancelled");
      } else if (err instanceof TypeError) {
        // fetch() itself throwing (not an HTTP error response) means the
        // request never reached the backend at all — a network/availability
        // problem, not a payment or contract problem.
        setPhase("backend-unavailable");
      } else if (err instanceof Error && err.message.includes("rejected by spendControls")) {
        // The x402 client's own spend guard (browser-buyer.ts) refused to
        // build a payment payload at all — Pera was never asked to sign
        // anything, so this is neither a settlement failure nor a wallet
        // rejection. Distinct message: settlement never started.
        setPhase("payment-limit-blocked");
        setAuthError(err.message);
      } else {
        setPhase("authorization-failed");
        setAuthError(err instanceof Error ? err.message : String(err));
      }
    }
  }

  function handleSubmitCounter() {
    if (counterSpent || isPending || !selected) return;
    const value = Number(counterInput);
    setCounterSpent(true);
    startTransition(async () => {
      const evaluation = await submitCounteroffer(value, selected.id);
      setResult(evaluation);
      setPhase("counter-result");
    });
  }

  function restartValidity() {
    setSecondsLeft(QUOTE_VALIDITY_SECONDS);
    setResult(null);
    setCounterInput("");
    setPhase("plans");
  }

  const acceptedOffer = result?.decision === "ACCEPT" ? result.offer : null;
  const displayPrice = useCountUp(acceptedOffer ?? selected?.price ?? quotePrice, acceptedOffer !== null ? 800 : 0);
  const urgent = secondsLeft <= 10;
  const validityPct = Math.max(0, Math.min(100, (secondsLeft / QUOTE_VALIDITY_SECONDS) * 100));

  return (
    <section className="mx-auto w-full max-w-[1200px] px-margin-mobile pt-28 pb-section md:px-margin-desktop md:pt-32">
      <div className="mb-md flex items-center justify-between">
        <p className="flex items-center gap-sm text-label uppercase text-faint">
          <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" />
          Reference agent console
        </p>
        {(phase === "plans" || phase === "counter-open") && (
          <p
            className={`tabular text-meta ${urgent ? "font-semibold text-fail" : "text-mute"}`}
            role="timer"
            aria-label={`Quote valid for ${secondsLeft} seconds`}
          >
            Valid for {secondsLeft}s
          </p>
        )}
      </div>

      <header className="mb-xl flex flex-col gap-md">
        <h1 className="max-w-2xl text-headline">Three ways to get the outcome.</h1>
        <p className="max-w-[36rem] text-meta text-faint">
          You&apos;re configuring a reference Customer Agent for this demo. Production agents submit the same request
          directly through the Margin402 API — no human required.
        </p>
        <div className="flex flex-wrap items-center gap-md rounded-lg border border-line bg-panel px-md py-sm shadow-card">
          <span className="text-label uppercase text-faint">Job type</span>
          <Badge tone="neutral">{jobType.jobTypeLabel}</Badge>
          <span className="text-body-sm font-medium">{jobType.title}</span>
          <code className="tabular hidden text-meta text-mute lg:block">{jobType.functionSignature}</code>
          <span className="hidden h-3 w-px bg-line-strong sm:block" aria-hidden="true" />
          <Badge tone="pass">{jobType.testCount}-test verified outcome</Badge>
        </div>
        <div className="flex flex-wrap items-center gap-x-md gap-y-1 rounded-lg border border-line bg-well px-md py-xs">
          <span className="text-label uppercase text-faint">Customer agent</span>
          <code className="tabular text-meta text-ink">{customerAgentId}</code>
          <span className="flex items-center gap-1.5 text-meta text-mute">
            <span className="h-1.5 w-1.5 rounded-full bg-pass" aria-hidden="true" />
            Active
          </span>
          <span className="text-meta text-faint">Policy: outcome-required · payment: x402</span>
        </div>
        <p className="max-w-[36rem] text-body-sm text-mute">
          Each plan is a real execution policy the engine will follow — a different tradeoff between cost, confidence,
          and speed. The outcome is identical in all three: all tests pass, or you are refunded.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-md md:grid-cols-3 md:pt-xs">
        {plans.map((plan, i) => (
          <div key={plan.id} className="animate-fade-up" style={{ animationDelay: `${i * 90}ms` }}>
            <PlanCard
              plan={plan}
              selected={selectedId === plan.id}
              expanded={expandedId === plan.id}
              onChoose={() => choosePlan(plan)}
              onToggleExpand={() => setExpandedId((cur) => (cur === plan.id ? null : plan.id))}
            />
          </div>
        ))}
      </div>

      <div id="plan-confirm" className="mt-xl scroll-mt-28">
        {phase === "expired" ? (
          <div className="flex flex-col items-start justify-between gap-md rounded-xl border border-fail-line bg-fail-dim p-lg md:flex-row md:items-center">
            <div>
              <p className="text-label uppercase text-fail">Quote expired</p>
              <p className="mt-xs text-body-sm text-mute">This validity window closed without acceptance.</p>
            </div>
            <Button variant="secondary" onClick={restartValidity}>
              Request fresh quote
            </Button>
          </div>
        ) : phase === "confirming" ? (
          <div className="flex items-center gap-sm rounded-xl border border-accent-line bg-accent-dim p-lg" role="status">
            <Spinner className="text-accent" />
            <span className="text-body-sm text-mute">
              Opening execution under the {selected?.name} policy…
            </span>
          </div>
        ) : !selected ? (
          recommended && (
            <div className="flex flex-col items-start justify-between gap-md rounded-xl border border-line bg-panel p-lg shadow-card md:flex-row md:items-center">
              <p className="max-w-[36rem] text-body-sm text-mute">
                Not sure? The engine recommends <span className="font-semibold text-ink">{recommended.name}</span> —{" "}
                {recommended.recommendationReason?.toLowerCase()}
              </p>
              <Button variant="secondary" onClick={() => choosePlan(recommended)}>
                Choose recommended
              </Button>
            </div>
          )
        ) : (
          <div className="animate-scale-in overflow-hidden rounded-xl border border-accent-line bg-panel shadow-lift" aria-live="polite">
            <div className="h-0.5 w-full bg-panel-3">
              <div
                className={`h-full transition-[width] duration-1000 ease-linear ${urgent ? "bg-fail" : "bg-accent"}`}
                style={{ width: `${validityPct}%` }}
                aria-hidden="true"
              />
            </div>
            <div className="grid grid-cols-1 gap-xl p-lg lg:grid-cols-12 lg:p-xl">
              <div className="lg:col-span-7">
                <span className="text-label uppercase text-faint">Selected plan</span>
                <h2 className="mt-xs text-title">
                  {selected.name} · <span className="text-mute">{selected.objective}</span>
                </h2>
                <div className="tabular mt-md text-price leading-none">{formatUsd(displayPrice)}</div>
                <p className="mt-sm max-w-[28rem] text-body-sm text-mute">
                  Fixed price for a verified outcome. Margin402 pays every provider bill along the{" "}
                  {selected.name} path; if it cannot verify the result, the contract is refunded.
                </p>
              </div>

              <div className="flex flex-col justify-between gap-md lg:col-span-5" aria-live="polite">
                {phase === "plans" && (
                  <>
                    <ul className="flex flex-col gap-xs border-l border-line pl-md text-body-sm text-mute">
                      <li>Fixed price — no meters, no overruns.</li>
                      <li>Settlement receipts published on completion.</li>
                      <li>One sealed counteroffer permitted per contract.</li>
                    </ul>
                    <div className="flex flex-col items-stretch gap-sm sm:flex-row sm:items-center">
                      <Button size="lg" onClick={() => handleAccept(selected.price)}>
                        {wallet.status === "connected" ? "Authorize agent run" : "Connect Pera to authorize"}
                      </Button>
                      <Button size="lg" variant="ghost" onClick={() => setPhase("counter-open")}>
                        Make one counteroffer
                      </Button>
                    </div>
                    <p className="text-meta text-faint">
                      {wallet.status === "connected"
                        ? "Pera Wallet provides the signing authority for this demo customer agent."
                        : "A Testnet signer is required to authorize a live run — no private keys are shared with Margin402."}
                    </p>
                  </>
                )}

                {phase === "authorizing" && (
                  <div className="animate-scale-in rounded-lg border border-accent-line bg-accent-dim p-md" role="status">
                    <div className="flex items-center gap-sm">
                      <Spinner className="text-accent" />
                      <p className="text-body-sm font-medium text-accent-deep">Authorizing contract with Pera…</p>
                    </div>
                    <ul className="mt-sm flex flex-col gap-1 text-body-sm text-mute">
                      <li>✓ Job created · {formatUsd(selected.price)}</li>
                      <li>● Requesting Margin402 — 402 Payment Required expected</li>
                      <li className="text-faint">○ Approve the signature request in Pera Wallet</li>
                      <li className="text-faint">○ Facilitator verifies and settles on Algorand Testnet</li>
                    </ul>
                  </div>
                )}

                {phase === "authorization-cancelled" && (
                  <div className="animate-scale-in rounded-lg border border-hold/30 bg-hold-dim p-md">
                    <p className="text-label uppercase text-hold">Authorization cancelled</p>
                    <p className="mt-xs text-body-sm text-mute">
                      The wallet declined the contract payment. No autonomous execution started.
                    </p>
                    <Button className="mt-md" variant="secondary" onClick={() => setPhase("plans")}>
                      Try again
                    </Button>
                  </div>
                )}

                {phase === "authorization-failed" && (
                  <div className="animate-scale-in rounded-lg border border-fail-line bg-fail-dim p-md">
                    <p className="text-label uppercase text-fail">Payment not settled</p>
                    <p className="mt-xs text-body-sm text-mute">
                      The x402 settlement could not be confirmed. No provider execution has started.
                    </p>
                    {authError && (
                      <details className="mt-xs text-meta text-faint">
                        <summary className="cursor-pointer select-none">Technical details</summary>
                        <p className="mt-xs">{authError}</p>
                      </details>
                    )}
                    <Button className="mt-md" variant="secondary" onClick={() => setPhase("plans")}>
                      Try again
                    </Button>
                  </div>
                )}

                {phase === "payment-limit-blocked" && (
                  <div className="animate-scale-in rounded-lg border border-fail-line bg-fail-dim p-md">
                    <p className="text-label uppercase text-fail">Payment authorization blocked</p>
                    <p className="mt-xs text-body-sm text-mute">
                      This contract exceeds the Customer Agent&rsquo;s configured payment limit. No wallet signature
                      was requested.
                    </p>
                    {authError && (
                      <details className="mt-xs text-meta text-faint">
                        <summary className="cursor-pointer select-none">Technical details</summary>
                        <p className="mt-xs">{authError}</p>
                      </details>
                    )}
                    <Button className="mt-md" variant="secondary" onClick={() => setPhase("plans")}>
                      Try again
                    </Button>
                  </div>
                )}

                {phase === "contract-expired" && (
                  <div className="animate-scale-in rounded-lg border border-line-strong bg-panel-2 p-md">
                    <p className="text-label uppercase text-mute">Contract expired</p>
                    <p className="mt-xs text-body-sm text-mute">
                      This job authorization is no longer available. Request a fresh outcome quote to continue.
                    </p>
                    <Button className="mt-md" variant="secondary" onClick={restartValidity}>
                      Generate new quote
                    </Button>
                  </div>
                )}

                {phase === "backend-unavailable" && (
                  <div className="animate-scale-in rounded-lg border border-fail-line bg-fail-dim p-md">
                    <p className="text-label uppercase text-fail">Execution service unavailable</p>
                    <p className="mt-xs text-body-sm text-mute">
                      Margin402 could not be reached. No payment was requested.
                    </p>
                    <Button className="mt-md" variant="secondary" onClick={() => setPhase("plans")}>
                      Retry
                    </Button>
                  </div>
                )}

                {phase === "counter-open" && (
                  <div className="animate-scale-in rounded-lg border border-line bg-panel p-md shadow-card">
                    <div className="flex items-baseline justify-between">
                      <label htmlFor="counter-input" className="text-label uppercase text-faint">
                        Your offer
                      </label>
                      <span className="tabular text-meta text-faint line-through">{formatUsd(selected.price)}</span>
                    </div>
                    <div className="relative mt-sm">
                      <span className="tabular absolute top-1/2 left-sm -translate-y-1/2 text-body text-faint">$</span>
                      <input
                        id="counter-input"
                        ref={counterInputRef}
                        type="number"
                        inputMode="decimal"
                        step="0.01"
                        min="0.10"
                        max={(selected.price - 0.01).toFixed(2)}
                        value={counterInput}
                        onChange={(e) => setCounterInput(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleSubmitCounter()}
                        placeholder="0.00"
                        disabled={counterSpent}
                        className="tabular h-14 w-full rounded-md border border-line-strong bg-panel pr-md pl-lg text-stat tracking-tight transition-colors outline-none focus:border-accent disabled:opacity-50"
                      />
                    </div>
                    <p className="mt-xs text-meta text-faint">
                      Sealed — one counteroffer per contract, and it cannot be revised.
                    </p>
                    <div className="mt-md flex items-center gap-sm">
                      <Button onClick={handleSubmitCounter} disabled={!counterInput || isPending}>
                        {isPending ? "Evaluating…" : "Submit offer"}
                      </Button>
                      {!counterSpent && (
                        <Button variant="ghost" onClick={() => setPhase("plans")}>
                          Cancel
                        </Button>
                      )}
                    </div>
                  </div>
                )}

                {(phase === "counter-result" || isPending) && (
                  <NegotiationTimeline
                    quoted={selected.price}
                    offered={Number(counterInput)}
                    pending={isPending}
                    result={result}
                    onAcceptAccepted={() => result && handleAccept(result.offer, result.jobId)}
                    onAcceptOriginal={() => handleAccept(selected.price)}
                  />
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      <p className="mt-md text-center text-meta text-faint">
        Provider pricing follows a simulated provider market; every payment against it settles for real on Algorand
        Testnet.
      </p>
    </section>
  );
}

/**
 * The machine-to-machine negotiation, rendered from real protocol values only:
 * the proposed budget, the counteroffer the customer sealed, the live engine
 * evaluation, and the verdict. Digit motion interpolates between those real
 * numbers — no invented intermediate prices.
 */
function NegotiationTimeline({
  quoted,
  offered,
  pending,
  result,
  onAcceptAccepted,
  onAcceptOriginal,
}: {
  quoted: number;
  offered: number;
  pending: boolean;
  result: CustomerOfferResult | null;
  onAcceptAccepted: () => void;
  onAcceptOriginal: () => void;
}) {
  const accepted = result?.decision === "ACCEPT";
  const declined = result?.decision === "DECLINE";
  const target = pending ? offered : accepted ? result!.offer : quoted;
  const animated = useCountUp(target, 900);
  const locked = accepted || declined;

  return (
    <div className="animate-scale-in rounded-lg border border-line bg-panel p-md shadow-card" role="status">
      <p className="text-label uppercase text-faint">Autonomous negotiation</p>

      <ol className="mt-sm flex flex-col gap-0">
        <NegotiationStep num="01" agent="MARGIN402 AGENT" label="Proposed execution budget" value={formatUsd(quoted)} state="done" />
        <NegotiationStep
          num="02"
          agent="CUSTOMER AGENT"
          label="Counteroffer submitted"
          value={Number.isFinite(offered) && offered > 0 ? formatUsd(offered) : "—"}
          state={pending || locked ? "done" : "active"}
        />
        <NegotiationStep
          num="03"
          agent="MARGIN402 AGENT"
          label={pending ? "Evaluating provider economics…" : "Evaluated provider economics"}
          value={pending ? formatUsd(animated) : undefined}
          state={pending ? "active" : locked ? "done" : "idle"}
        />
        {locked && result && (
          <NegotiationStep
            num="04"
            agent="POLICY ENGINE"
            label={accepted ? "Budget accepted — negotiation closed" : "Offer rejected — recalculating"}
            value={accepted ? formatUsd(result.offer) : undefined}
            state={accepted ? "pass" : "fail"}
            note={!accepted ? result.rationale : undefined}
            final
          />
        )}
      </ol>

      {accepted && (
        <>
          <p className="mt-sm rounded-md bg-accent-dim px-sm py-xs text-body-sm font-medium text-accent-deep">
            Margin402 will now autonomously purchase the services required to achieve the outcome.
          </p>
          <div className="mt-md">
            <Button onClick={onAcceptAccepted}>Proceed at {formatUsd(result!.offer)}</Button>
          </div>
        </>
      )}
      {declined && (
        <div className="mt-md">
          <Button variant="secondary" onClick={onAcceptOriginal}>
            Accept quoted price · {formatUsd(quoted)}
          </Button>
        </div>
      )}
    </div>
  );
}

function NegotiationStep({
  num,
  agent,
  label,
  value,
  state,
  note,
  final = false,
}: {
  num: string;
  agent: string;
  label: string;
  value?: string;
  state: "idle" | "active" | "done" | "pass" | "fail";
  note?: string;
  final?: boolean;
}) {
  const tone =
    state === "pass"
      ? "text-pass"
      : state === "fail"
        ? "text-fail"
        : state === "active"
          ? "text-accent"
          : state === "done"
            ? "text-ink"
            : "text-faint";
  return (
    <li className={`relative flex items-center justify-between gap-md pb-sm ${final ? "" : "border-l border-line pl-md ml-[7px]"}`}>
      {!final && (
        <span
          className={`absolute -left-[4.5px] top-1 h-2 w-2 rounded-full ${
            state === "active" ? "bg-accent animate-pulse" : state === "done" ? "bg-line-strong" : "bg-panel-3"
          }`}
          aria-hidden="true"
        />
      )}
      <div className="min-w-0">
        <p className={`tabular text-[9px] tracking-[0.12em] uppercase ${state === "idle" ? "text-faint/70" : "text-faint"}`}>
          <span className="mr-2">{num}</span>
          {agent}
        </p>
        <p className={`text-body-sm ${state === "idle" ? "text-faint" : "text-mute"}`}>{label}</p>
        {note && <p className="mt-0.5 text-meta text-faint">{note}</p>}
      </div>
      {value && <span className={`tabular shrink-0 text-data font-semibold ${tone}`}>{value}</span>}
    </li>
  );
}
