import { Reveal } from "@/components/primitives/Reveal";
import { STRATEGY_CATALOG } from "@/lib/providers/strategies";
import { SIMULATED_MARKET_LABEL } from "@/lib/providers/price-curve";

const CURVES: Record<string, string> = {
  s1: "$0.05 flat",
  s2: "$0.09 flat",
  s3: "$0.55 → $0.85 → $1.05",
};

export function Economics() {
  return (
    <section className="border-t border-line bg-panel">
      <div className="mx-auto grid max-w-[1200px] grid-cols-1 gap-xl px-margin-mobile py-section md:grid-cols-12 md:px-margin-desktop">
        <div className="md:col-span-5">
          <Reveal>
            <p className="flex items-center gap-sm text-label uppercase text-faint">
              <span className="tabular text-accent">05</span>
              <span className="h-px w-6 bg-line-strong" aria-hidden="true" />
              Autonomous economics
            </p>
          </Reveal>
          <Reveal delay={60}>
            <h2 className="mt-md max-w-[28rem] text-headline">Not a payment forwarder. An underwriter.</h2>
          </Reveal>
          <Reveal delay={120}>
            <div className="mt-lg flex flex-col gap-md border-l border-line pl-md">
              <Principle title="Selection by expected cost" body="Every round, remaining strategies are ranked by expected cost-to-success — price and failure probability together, never price alone." />
              <Principle title="Affordability is a separate check" body="Being able to pay is never the reason to pay. A strategy that fits the budget can still lose to a cheaper expectation." />
              <Principle title="The honouring rule" body="If the only path to done costs more than what remains of the budget, Margin402 pays anyway while losing less than a refund would cost. Delivery beats retreat." />
            </div>
          </Reveal>
        </div>

        <div className="md:col-span-7">
          <Reveal delay={100}>
            <div className="overflow-hidden rounded-xl border border-line bg-panel shadow-card">
              <table className="w-full text-left">
                <caption className="sr-only">Provider strategies in the simulated provider market</caption>
                <thead>
                  <tr className="border-b border-line">
                    <th scope="col" className="px-md py-sm text-label uppercase font-semibold text-faint">Strategy</th>
                    <th scope="col" className="px-md py-sm text-label uppercase font-semibold text-faint">Price curve</th>
                    <th scope="col" className="px-md py-sm text-right text-label uppercase font-semibold text-faint">p&nbsp;(pass)</th>
                    <th scope="col" className="hidden px-md py-sm text-right text-label uppercase font-semibold text-faint sm:table-cell">Attempt cap</th>
                  </tr>
                </thead>
                <tbody>
                  {STRATEGY_CATALOG.map((s) => (
                    <tr key={s.id} className="border-b border-line last:border-b-0 hover:bg-panel-2 transition-colors">
                      <td className="px-md py-md text-body-sm font-medium">{s.label}</td>
                      <td className="tabular px-md py-md text-data text-mute">{CURVES[s.id]}</td>
                      <td className="tabular px-md py-md text-right text-data">{s.pSuccess.toFixed(2)}</td>
                      <td className="tabular hidden px-md py-md text-right text-data text-mute sm:table-cell">{s.maxAttempts}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="border-t border-line bg-well px-md py-xs text-meta text-faint">
                Prices move along a scripted curve — a {SIMULATED_MARKET_LABEL}. Every payment against them is real.
              </p>
            </div>
          </Reveal>
          <Reveal delay={180}>
            <p className="mt-md max-w-[28rem] text-body-sm text-mute md:ml-auto">
              The cheapest option isn&apos;t always the cheapest outcome — a $0.05 attempt failing 65% of the time can
              cost more than it looks.
            </p>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

function Principle({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <h3 className="text-body-sm font-semibold text-ink">{title}</h3>
      <p className="mt-1 max-w-[24rem] text-body-sm text-mute">{body}</p>
    </div>
  );
}
