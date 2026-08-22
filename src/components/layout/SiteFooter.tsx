import Link from "next/link";
import { SIMULATED_MARKET_LABEL } from "@/lib/providers/price-curve";

export function SiteFooter() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-[1200px] flex-col gap-lg px-margin-mobile py-xl md:flex-row md:items-start md:justify-between md:px-margin-desktop">
        <div className="flex max-w-[24rem] flex-col gap-xs">
          <p className="flex items-baseline gap-[3px] text-[15px] font-semibold tracking-[-0.02em] text-ink">
            Margin<span className="text-accent">402</span>
          </p>
          <p className="text-body-sm text-mute">
            Fixed-price, outcome-guaranteed execution. Margin402 doesn&apos;t guarantee profit. It guarantees the
            outcome.
          </p>
        </div>

        <nav aria-label="Footer" className="flex flex-col gap-xs text-body-sm">
          <span className="text-label uppercase text-faint">Product</span>
          <Link href="/" className="w-fit text-mute transition-colors hover:text-ink">
            Overview
          </Link>
          <Link href="/quote" className="w-fit text-mute transition-colors hover:text-ink">
            Run an outcome
          </Link>
          <a href="/api/quote" className="w-fit text-mute transition-colors hover:text-ink">
            Machine API
          </a>
        </nav>

        <div className="flex flex-col gap-xs text-body-sm">
          <span className="text-label uppercase text-faint">Network</span>
          <span className="text-mute">Algorand Testnet · USDC</span>
          <span className="text-faint">{`Provider pricing is a ${SIMULATED_MARKET_LABEL}.`}</span>
        </div>
      </div>
      <div className="border-t border-line">
        <div className="mx-auto flex max-w-[1200px] items-center justify-between px-margin-mobile py-sm md:px-margin-desktop">
          <p className="text-meta text-faint">© 2026 Margin402 — demonstration build.</p>
          <p className="text-meta text-faint">Settlement proof is published on every statement.</p>
        </div>
      </div>
    </footer>
  );
}
