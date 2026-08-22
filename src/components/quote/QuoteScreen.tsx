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
import type { QuoteBreakdown } from "@/lib/economics/types";
import type { CustomerOfferResult } from "@/lib/actions/quote-actions";

const QUOTE_VALIDITY_SECONDS = 60;

type Phase = "quoted" | "counter-open" | "counter-result" | "confirming" | "expired";

export function QuoteScreen({ quote }: { quote: QuoteBreakdown }) {
  const router = useRouter();
  const { acceptQuote, reset } = useJob();

  const [phase, setPhase] = useState<Phase>("quoted");
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
    if (phase !== "quoted" && phase !== "counter-open") return;
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

  function handleAccept(amount: number) {
    if (startedRef.current) return;
    startedRef.current = true;
    setPhase("confirming");
    void (async () => {
      await wait(900);
      acceptQuote(amount);
      router.push("/execution");
    })();
  }

  function handleSubmitCounter() {
    if (counterSpent || isPending) return;
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
    setPhase(result?.decision === "ACCEPT" ? "counter-result" : "quoted");
  }

  const acceptedOffer = result?.decision === "ACCEPT" ? result.offer : null;
  const displayPrice = useCountUp(acceptedOffer ?? quote.quote, acceptedOffer !== null ? 800 : 0);
  const urgent = secondsLeft <= 10;
  const validityPct = Math.max(0, Math.min(100, (secondsLeft / QUOTE_VALIDITY_SECONDS) * 100));

  return (
    <section className="mx-auto w-full max-w-[880px] px-margin-mobile pt-28 pb-section md:px-margin-desktop md:pt-32">
      <div className="mb-md flex items-center justify-between">
        <p className="flex items-center gap-sm text-label uppercase text-faint">
          <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" />
          Outcome contract · quote
        </p>
        {(phase === "quoted" || phase === "counter-open") && (
          <p
            className={`tabular text-meta ${urgent ? "font-semibold text-fail" : "text-mute"}`}
            role="timer"
            aria-label={`Quote valid for ${secondsLeft} seconds`}
          >
            Valid for {secondsLeft}s
          </p>
        )}
      </div>

      <article className="overflow-hidden rounded-xl border border-line bg-panel shadow-card" aria-live="polite">
        <div className="h-0.5 w-full bg-panel-3">
          <div
            className={`h-full transition-[width] duration-1000 ease-linear ${urgent ? "bg-fail" : "bg-accent"}`}
            style={{ width: `${validityPct}%` }}
            aria-hidden="true"
          />
        </div>

        <div className="flex flex-col gap-xs px-lg pt-xl md:px-xl">
          <span className="text-label uppercase text-faint">Task</span>
          <h1 className="text-title">Implement {PARSE_DURATION_PROBLEM.functionName}()</h1>
          <pre className="tabular mt-xs w-fit rounded-md border border-line bg-well px-sm py-xs text-data text-mute">
{PARSE_DURATION_PROBLEM.signature}
          </pre>
          <p className="mt-sm max-w-[36rem] text-body-sm text-mute">{PARSE_DURATION_PROBLEM.description}</p>
        </div>

        <div className="mx-lg my-lg grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-line bg-line md:mx-xl lg:grid-cols-3">
          <Term k="Verification" v={`${PARSE_DURATION_TESTS.length} tests — ${PARSE_DURATION_TESTS.length - 2} visible, 2 hidden. Binary: all pass or nothing ships.`} />
          <Term k="Guarantee" v="You pay for the completed outcome only. If Margin402 cannot verify it, the contract is refunded." />
          <Term k="Execution policy" v="Margin402 selects providers and manages every payment internally. Internal economics are not disclosed." />
        </div>

        <div className="border-t border-line bg-base/40 px-lg py-xl md:px-xl">
          {phase === "expired" ? (
            <div className="flex flex-col items-start justify-between gap-md md:flex-row md:items-center">
              <div>
                <p className="text-label uppercase text-fail">Quote expired</p>
                <p className="mt-xs text-body-sm text-mute">This validity window closed without acceptance.</p>
              </div>
              <Button variant="secondary" onClick={restartValidity}>
                Request fresh quote
              </Button>
            </div>
          ) : phase === "confirming" ? (
            <div className="flex items-center gap-sm py-md" role="status">
              <Spinner className="text-accent" />
              <span className="text-body-sm text-mute">Opening execution — Margin402 is taking the job…</span>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-xl lg:grid-cols-12">
              <div className="flex flex-col justify-between lg:col-span-7">
                <div>
                  <span className="text-label uppercase text-faint">
                    {acceptedOffer !== null ? "Agreed price" : "Your price"}
                  </span>
                  <div className="tabular mt-xs text-price">{formatUsd(displayPrice)}</div>
                  <div className="mt-md">
                    <Badge tone="pass">Verified outcome</Badge>
                  </div>
                </div>
                {phase === "quoted" && (
                  <div className="mt-xl flex flex-col items-stretch gap-sm sm:flex-row sm:items-center">
                    <Button size="lg" onClick={() => handleAccept(quote.quote)} className="sm:w-auto">
                      Accept quote
                    </Button>
                    <Button size="lg" variant="ghost" onClick={() => setPhase("counter-open")}>
                      Make one counteroffer
                    </Button>
                  </div>
                )}
              </div>

              <div className="lg:col-span-5" aria-live="polite">
                {phase === "quoted" && (
                  <ul className="flex flex-col gap-sm border-l border-line pl-md text-body-sm text-mute">
                    <li>Fixed price — no meters, no overruns.</li>
                    <li>Settlement receipts published on completion.</li>
                    <li>One sealed counteroffer permitted per contract.</li>
                  </ul>
                )}

                {phase === "counter-open" && (
                  <div className="animate-scale-in rounded-lg border border-line bg-panel p-md shadow-card">
                    <div className="flex items-baseline justify-between">
                      <label htmlFor="counter-input" className="text-label uppercase text-faint">
                        Your offer
                      </label>
                      <span className="tabular text-meta text-faint line-through">{formatUsd(quote.quote)}</span>
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
                        max={(quote.quote - 0.01).toFixed(2)}
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
                        <Button variant="ghost" onClick={() => setPhase("quoted")}>
                          Cancel
                        </Button>
                      )}
                    </div>
                  </div>
                )}

                {phase === "counter-result" && result && (
                  <CounterVerdict
                    result={result}
                    quoted={quote.quote}
                    onAcceptAccepted={() => handleAccept(result.offer)}
                    onAcceptOriginal={() => handleAccept(quote.quote)}
                  />
                )}
              </div>
            </div>
          )}
        </div>
      </article>

      <p className="mt-md text-center text-meta text-faint">
        Provider pricing along this contract follows a simulated provider market; every payment against it is real.
      </p>
    </section>
  );
}

function Term({ k, v }: { k: string; v: string }) {
  return (
    <div className="bg-panel p-md">
      <p className="text-label uppercase text-faint">{k}</p>
      <p className="mt-xs text-body-sm leading-relaxed text-mute">{v}</p>
    </div>
  );
}

function CounterVerdict({
  result,
  quoted,
  onAcceptAccepted,
  onAcceptOriginal,
}: {
  result: CustomerOfferResult;
  quoted: number;
  onAcceptAccepted: () => void;
  onAcceptOriginal: () => void;
}) {
  const accepted = result.decision === "ACCEPT";
  return (
    <div
      className={`animate-scale-in rounded-lg border p-md ${
        accepted ? "border-pass-line bg-pass-dim" : "border-fail-line bg-fail-dim"
      }`}
      role="status"
    >
      <p className="flex items-center gap-xs text-label uppercase">
        {accepted ? (
          <>
            <CheckIcon className="text-pass" />
            <span className="text-pass">Counteroffer accepted</span>
          </>
        ) : (
          <>
            <CrossIcon className="text-fail" />
            <span className="text-fail">Offer declined</span>
          </>
        )}
      </p>
      <p className="tabular mt-sm text-[28px] font-semibold tracking-tight">{formatUsd(result.offer)}</p>
      <p className="mt-xs text-body-sm text-mute">
        {accepted ? `Locked in below the ${formatUsd(quoted)} quote.` : result.rationale}
      </p>
      <p className="mt-xs text-meta text-faint">This negotiation is closed — one counteroffer per contract.</p>
      <div className="mt-md">
        {accepted ? (
          <Button onClick={onAcceptAccepted}>Proceed at {formatUsd(result.offer)}</Button>
        ) : (
          <Button variant="secondary" onClick={onAcceptOriginal}>
            Accept quoted price · {formatUsd(quoted)}
          </Button>
        )}
      </div>
    </div>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={`h-3.5 w-3.5 ${className ?? ""}`} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.4" />
      <path d="M5 8.2l2 2 4-4.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CrossIcon({ className }: { className?: string }) {
  return (
    <svg className={`h-3.5 w-3.5 ${className ?? ""}`} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.4" />
      <path d="M5.5 5.5l5 5m0-5l-5 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}
