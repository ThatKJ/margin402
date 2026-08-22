import { Reveal } from "@/components/primitives/Reveal";

const STEPS = [
  { k: "402", d: "Provider answers an unpaid request with 402 Payment Required and its terms." },
  { k: "SIGN", d: "Margin402's treasury wallet signs the exact quoted amount (@x402/avm)." },
  { k: "RETRY", d: "The same request is retried with the signed X-PAYMENT header attached." },
  { k: "VERIFY", d: "The GoPlausible facilitator verifies the payload against the challenge." },
  { k: "SETTLE", d: "The facilitator settles on-chain — USDC moves on Algorand Testnet." },
  { k: "RECEIPT", d: "The paid response carries the real transaction ID, linked to this attempt forever." },
];

const REAL_TX = {
  id: "LAZJKDUVNLOJFDLN7XNHWCFDFIBZGCFRGYGA6DUDZP5WFQ3G6SDA",
  url: "https://lora.algokit.io/testnet/transaction/LAZJKDUVNLOJFDLN7XNHWCFDFIBZGCFRGYGA6DUDZP5WFQ3G6SDA",
};

export function X402() {
  return (
    <section className="border-t border-line">
      <div className="mx-auto grid max-w-[1200px] grid-cols-1 gap-xl px-margin-mobile py-section md:grid-cols-12 md:px-margin-desktop">
        <div className="md:col-span-5">
          <Reveal>
            <p className="flex items-center gap-sm text-label uppercase text-faint">
              <span className="tabular text-accent">06</span>
              <span className="h-px w-6 bg-line-strong" aria-hidden="true" />
              x402 · machine-to-machine payment
            </p>
          </Reveal>
          <Reveal delay={60}>
            <h2 className="mt-md max-w-[28rem] text-headline">Payment is part of the request.</h2>
          </Reveal>
          <Reveal delay={120}>
            <p className="mt-md max-w-[28rem] text-body text-mute">
              A machine can&apos;t hold a card or approve a checkout. x402 turns &ldquo;pay for this&rdquo; into one HTTP
              round trip — no session, no stored credentials, no human. That is what lets Margin402 pay per attempt,
              per strategy, entirely under its own economic logic.
            </p>
          </Reveal>
          <Reveal delay={180}>
            <a
              href={REAL_TX.url}
              target="_blank"
              rel="noreferrer"
              className="group mt-lg block rounded-lg border border-line bg-panel p-md shadow-card transition-shadow hover:shadow-lift"
            >
              <p className="flex items-center justify-between text-label uppercase text-faint">
                Real settlement · recorded run
                <svg className="h-3 w-3 text-faint transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                  <path d="M3 9l6-6M4.5 3H9v4.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </p>
              <p className="tabular mt-xs truncate text-data text-ink">{REAL_TX.id}</p>
              <p className="mt-xs text-meta text-faint">
                USDC · Algorand Testnet · confirmed round 66553456 — verify independently on Lora
              </p>
            </a>
          </Reveal>
        </div>

        <div className="relative md:col-span-7">
          <ol className="relative flex flex-col">
            <span className="absolute bottom-6 left-[15px] top-6 w-px bg-line" aria-hidden="true" />
            <span className="x402-descend absolute left-[13px] h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" />
            {STEPS.map((s, i) => (
              <Reveal as="li" key={s.k} delay={i * 60} className="relative flex gap-md py-sm first:pt-0 last:pb-0">
                <span className="z-10 mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line bg-panel tabular text-[10px] font-semibold text-accent">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div className="flex flex-col justify-center pb-sm">
                  <span className="text-body-sm font-semibold tracking-wide text-ink">{s.k}</span>
                  <span className="text-body-sm text-mute">{s.d}</span>
                </div>
              </Reveal>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
