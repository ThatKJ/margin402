import { Reveal } from "@/components/primitives/Reveal";
import { STRATEGY_CATALOG } from "@/lib/providers/strategies";

export function Architecture() {
  return (
    <section id="protocol" className="scroll-mt-20 border-t border-line bg-panel">
      <div className="mx-auto max-w-[1200px] px-margin-mobile py-section md:px-margin-desktop">
        <div className="flex flex-col items-center text-center">
          <Reveal>
            <p className="flex items-center justify-center gap-sm text-label uppercase text-faint">
              <span className="tabular text-accent">09</span>
              <span className="h-px w-6 bg-line-strong" aria-hidden="true" />
              Protocol architecture
            </p>
          </Reveal>
          <Reveal delay={80}>
            <h2 className="mt-md max-w-[36rem] text-headline">One deployable unit. Every layer owned.</h2>
          </Reveal>
        </div>

        <div className="mx-auto mt-xl flex max-w-2xl flex-col items-stretch gap-0">
          <Layer label="Customer agent" sub="machine / CI pipeline — no human in the loop" mono />
          <Connector label="task + budget" />
          <Layer label="Margin402" primary sub="quote · economic engine · orchestrator · sandbox verifier" />
          <Connector label="x402 · pay per attempt" />
          <div className="grid grid-cols-3 gap-sm">
            {STRATEGY_CATALOG.map((s) => (
              <div key={s.id} className="rounded-lg border border-line bg-panel px-sm py-md text-center shadow-card">
                <p className="text-body-sm font-medium">{s.label}</p>
                <p className="tabular mt-0.5 text-meta text-faint">provider</p>
              </div>
            ))}
          </div>
          <Connector label="402 → sign → retry → facilitator settle" />
          <Layer label="Algorand Testnet" sub="USDC · every settlement independently verifiable" />
        </div>

        <Reveal delay={200}>
          <p className="mx-auto mt-lg max-w-[32rem] text-center text-body-sm text-mute">
            No database, no queue, no cache — a single Next.js application. The verifier is in-house and free, and is
            deliberately not for sale: it is the oracle the economics are judged against.
          </p>
        </Reveal>
      </div>
    </section>
  );
}

function Layer({ label, sub, primary = false, mono = false }: { label: string; sub?: string; primary?: boolean; mono?: boolean }) {
  return (
    <div
      className={`flex flex-col items-center justify-center rounded-lg border px-md py-lg text-center ${
        primary ? "border-accent-line bg-accent-dim" : "border-line bg-panel shadow-card"
      }`}
    >
      <p className={`${mono ? "tabular" : ""} text-title ${primary ? "text-accent-deep" : ""}`}>{label}</p>
      {sub && <p className="mt-xs text-meta text-faint">{sub}</p>}
    </div>
  );
}

function Connector({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center py-xs" aria-hidden="true">
      <span className="text-[10px] font-semibold tracking-[0.12em] uppercase text-faint">{label}</span>
      <svg width="10" height="18" viewBox="0 0 10 18" fill="none" className="mt-1 text-faint">
        <path d="M5 0v14M1.5 11L5 15l3.5-4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}
