"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { submitCounteroffer } from "@/lib/actions/quote-actions";
import { PARSE_DURATION_PROBLEM, PARSE_DURATION_TESTS } from "@/lib/workloads/parse-duration";
import { formatUsd } from "@/lib/ui/format";
import { useCountUp, wait } from "@/lib/ui/motion";
import { useJob } from "@/lib/state/job-context";
import { Badge } from "@/components/primitives/Badge";
import { Button } from "@/components/primitives/Button";
import { Spinner } from "@/components/primitives/Indicators";
import { PlanCard } from "./PlanCard";
import type { CustomerPlan } from "@/lib/economics/plans";
import type { PlanId } from "@/lib/orchestrator/types";
import type { CustomerOfferResult } from "@/lib/actions/quote-actions";

const QUOTE_VALIDITY_SECONDS = 60;

type Phase = "plans" | "counter-open" | "counter-result" | "confirming" | "expired";

export function QuoteScreen({ quotePrice, plans }: { quotePrice: number; plans: CustomerPlan[] }) {
  const router = useRouter();
  const { acceptQuote, reset } = useJob();

  const [phase, setPhase] = useState<Phase>("plans");
  const [selectedId, setSelectedId] = useState<PlanId | null>(null);
  const [expandedId, setExpandedId] = useState<PlanId | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(QUOTE_VALIDITY_SECONDS);
  const [counterInput, setCounterInput] = useState("");
  const [result, setResult] = useState<CustomerOfferResult | null>(null);
  const [counterSpent, setCounterSpent] = useState(false);
  const [isPending, startTransition] = useTransition();
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

  function handleAccept(amount: number) {
    if (startedRef.current || !selected) return;
    startedRef.current = true;
    setPhase("confirming");
    void (async () => {
      await wait(900);
      acceptQuote(amount, selected.id);
      router.push("/execution");
    })();
  }

  function handleSubmitCounter() {
    if (counterSpent || isPending || !selected) return;
    const value = Number(counterInput);
    setCounterSpent(true);
    startTransition(async () => {
      const evaluation = await submitCounteroffer(value);
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
          Autonomous job · job quote
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
        <div className="flex flex-wrap items-center gap-md rounded-lg border border-line bg-panel px-md py-sm shadow-card">
          <span className="text-label uppercase text-faint">Job</span>
          <span className="text-body-sm font-medium">Implement {PARSE_DURATION_PROBLEM.functionName}()</span>
          <code className="tabular hidden text-meta text-mute lg:block">{PARSE_DURATION_PROBLEM.signature}</code>
          <span className="hidden h-3 w-px bg-line-strong sm:block" aria-hidden="true" />
          <Badge tone="pass">{PARSE_DURATION_TESTS.length}-test verified outcome</Badge>
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
                        Accept &amp; execute
                      </Button>
                      <Button size="lg" variant="ghost" onClick={() => setPhase("counter-open")}>
                        Make one counteroffer
                      </Button>
                    </div>
                  </>
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
                    onAcceptAccepted={() => result && handleAccept(result.offer)}
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
        <NegotiationStep num="01" label="Proposed execution budget" value={formatUsd(quoted)} state="done" />
        <NegotiationStep
          num="02"
          label="Counteroffer submitted"
          value={Number.isFinite(offered) && offered > 0 ? formatUsd(offered) : "—"}
          state={pending || locked ? "done" : "active"}
        />
        <NegotiationStep
          num="03"
          label={pending ? "Margin402 is evaluating provider economics…" : "Evaluating provider economics"}
          value={pending ? formatUsd(animated) : undefined}
          state={pending ? "active" : locked ? "done" : "idle"}
        />
        {locked && result && (
          <NegotiationStep
            num="04"
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
  label,
  value,
  state,
  note,
  final = false,
}: {
  num: string;
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
        <p className={`text-body-sm ${state === "idle" ? "text-faint" : "text-mute"}`}>
          <span className="tabular mr-2 text-[10px] text-faint">{num}</span>
          {label}
        </p>
        {note && <p className="mt-0.5 pl-6 text-meta text-faint">{note}</p>}
      </div>
      {value && <span className={`tabular shrink-0 text-data font-semibold ${tone}`}>{value}</span>}
    </li>
  );
}
