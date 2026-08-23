import { Reveal } from "@/components/primitives/Reveal";

const NUMBERS = [
  { k: "Revenue", v: "$1.05", tone: "ink" },
  { k: "Execution cost", v: "$1.28", tone: "ink" },
  { k: "Margin", v: "−$0.23", tone: "fail" },
] as const;

export function StatementPeek() {
  return (
    <section className="border-t border-line">
      <div className="mx-auto max-w-[1200px] px-margin-mobile py-section md:px-margin-desktop">
        <div className="flex flex-col items-center text-center">
          <Reveal>
            <p className="flex items-center justify-center gap-sm text-label uppercase text-faint">
              <span className="tabular text-accent">08</span>
              <span className="h-px w-6 bg-line-strong" aria-hidden="true" />
              The economic statement
            </p>
          </Reveal>
          <Reveal delay={80}>
            <h2 className="mt-md max-w-[36rem] text-headline">The loss is not hidden. The loss is the point.</h2>
          </Reveal>
        </div>

        <Reveal delay={160}>
          <div className="mx-auto mt-xl max-w-3xl rounded-xl border border-line bg-panel shadow-card">
            <div className="flex items-center justify-between border-b border-line px-lg py-sm">
              <span className="text-label uppercase text-faint">Canonical demo run</span>
              <span className="rounded-sm border border-pass-line bg-pass-dim px-2 py-0.5 text-label uppercase text-pass">
                Outcome verified
              </span>
            </div>
            <div className="grid grid-cols-1 gap-px bg-line sm:grid-cols-3">
              {NUMBERS.map((n) => (
                <div key={n.k} className="bg-panel px-sm py-xl sm:px-md">
                  <p className="text-label uppercase text-faint">{n.k}</p>
                  <p
                    className={`tabular mt-xs text-headline whitespace-nowrap ${n.tone === "fail" ? "text-fail" : ""}`}
                  >
                    {n.v}
                  </p>
                </div>
              ))}
            </div>
            <p className="border-t border-line px-lg py-md text-body-sm text-mute">
              Margin402 had already accepted the job at $1.05. When the only remaining path to a verified outcome cost
              more than the budget that was left, it paid anyway — delivering at a loss cost less than refunding after
              sunk spend. Reproduce it: <span className="tabular">npm run machine:smoke</span>.
            </p>
          </div>
        </Reveal>

        <Reveal delay={220}>
          <p className="mx-auto mt-lg max-w-[28rem] text-center text-body text-mute">
            Margin402 doesn&apos;t guarantee profit. It guarantees the outcome.
          </p>
        </Reveal>
      </div>
    </section>
  );
}
