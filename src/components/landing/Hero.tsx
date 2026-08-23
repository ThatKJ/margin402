import { ButtonLink, ArrowRight } from "@/components/primitives/Button";
import { FlowLattice } from "@/components/viz/FlowLattice";
import { LOCKED_QUOTE } from "@/lib/economics/quote";
import { PARSE_DURATION_PROBLEM, VISIBLE_TEST_COUNT } from "@/lib/workloads/parse-duration";

export function Hero() {
  return (
    <section className="relative overflow-hidden pt-32 md:pt-40">
      <div className="grid-texture pointer-events-none absolute inset-0" aria-hidden="true" />
      <div className="relative mx-auto max-w-[1200px] px-margin-mobile md:px-margin-desktop">
        <div className="mx-auto flex max-w-3xl flex-col items-center text-center">
          <p className="animate-fade-in mb-md inline-flex items-center gap-sm rounded-sm border border-line bg-panel px-sm py-xs text-label uppercase text-mute shadow-card">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" />
            Autonomous outcome underwriting
          </p>
          <h1 className="animate-fade-up text-display">
            <span className="text-faint">Autonomous agents should buy outcomes.</span>
            <br />
            Not API calls.
          </h1>
          <p className="animate-fade-up mt-lg max-w-xl text-body text-mute [animation-delay:120ms]">
            Margin402 gives AI agents a controlled execution budget, negotiates access to paid services through x402,
            verifies every result, and adapts spending until the requested outcome is achieved.
          </p>
          <div className="animate-fade-up mt-xl flex flex-col items-center gap-sm sm:flex-row [animation-delay:220ms]">
            <ButtonLink href="/quote" size="lg" variant="primary" className="group w-full sm:w-auto">
              Run an outcome
              <ArrowRight />
            </ButtonLink>
            <ButtonLink href="#how-it-works" size="lg" variant="secondary" className="w-full sm:w-auto">
              See how it works
            </ButtonLink>
          </div>
        </div>

        <FlowLattice className="relative mx-auto mt-lg h-[340px] w-full max-w-4xl md:h-[440px]" />

        <dl className="mx-auto grid max-w-4xl grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line md:grid-cols-4">
          {[
            { k: "Canonical quote", v: `$${LOCKED_QUOTE.quote.toFixed(2)}` },
            { k: "First workload", v: `${PARSE_DURATION_PROBLEM.functionName}()` },
            { k: "Verification", v: `${VISIBLE_TEST_COUNT} visible + hidden tests` },
            { k: "Settlement", v: "Algorand Testnet · USDC" },
          ].map((item) => (
            <div key={item.k} className="flex flex-col gap-1 bg-panel px-md py-sm">
              <dt className="text-label uppercase text-faint">{item.k}</dt>
              <dd className="tabular truncate text-data text-ink" title={item.v}>
                {item.v}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
