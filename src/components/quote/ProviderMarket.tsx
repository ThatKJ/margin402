import { STRATEGY_CATALOG } from "@/lib/providers/strategies";
import { SIMULATED_MARKET_LABEL } from "@/lib/providers/price-curve";

/**
 * The real provider catalog, shown once — not once per plan card — since
 * it's the same underlying market every plan draws from; the plans differ
 * in policy (which providers, in what order, under what rule), not in what
 * providers exist. Reads STRATEGY_CATALOG directly so this can never drift
 * from what the orchestrator actually pays (see plans.ts/strategies.ts).
 */
export function ProviderMarket() {
  return (
    <section className="mt-lg rounded-xl border border-line bg-panel p-lg">
      <div className="flex flex-wrap items-baseline justify-between gap-sm">
        <h2 className="text-label uppercase text-faint">Provider market</h2>
        <span className="text-meta text-faint">{SIMULATED_MARKET_LABEL} — every payment against it settles for real</span>
      </div>
      <dl className="mt-sm grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-3">
        {STRATEGY_CATALOG.map((s) => (
          <div key={s.id} className="flex flex-col gap-1 bg-panel px-md py-sm">
            <dt className="text-body-sm font-medium text-ink">{s.label}</dt>
            <dd className="tabular text-data font-semibold">{Math.round(s.pSuccess * 100)}% success estimate</dd>
            <dd className="text-meta text-faint">{s.marketNote}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
