import { Reveal } from "@/components/primitives/Reveal";

const PROBLEMS = [
  {
    num: "01",
    title: "Agents buy work, not API calls",
    body: "A task may require several paid attempts before it succeeds — and the agent carries a budget, not infinite money.",
  },
  {
    num: "02",
    title: "The cheapest provider is rarely the cheapest path",
    body: "A cheap provider that fails half the time can cost more in expectation than an expensive one that rarely fails.",
  },
  {
    num: "03",
    title: "Every failed attempt is sunk cost",
    body: "Pay-per-call means the agent bears 100% of provider-failure risk on every single request, with no recourse.",
  },
  {
    num: "04",
    title: "Nobody is watching",
    body: "No human can review each micro-decision of a fleet of agents in real time — payment and selection logic has to be trustworthy on its own.",
  },
];

export function Problem() {
  return (
    <section className="border-t border-line">
      <div className="mx-auto grid max-w-[1200px] grid-cols-1 gap-xl px-margin-mobile py-section md:grid-cols-12 md:px-margin-desktop">
        <div className="md:col-span-5">
          <div className="md:sticky md:top-28">
            <Reveal>
              <p className="flex items-center gap-sm text-label uppercase text-faint">
                <span className="tabular text-accent">01</span>
                <span className="h-px w-6 bg-line-strong" aria-hidden="true" />
                The problem
              </p>
            </Reveal>
            <Reveal delay={60}>
              <h2 className="mt-md max-w-[24rem] text-headline">Machines can&apos;t open accounts, hold cards, or ask for help.</h2>
            </Reveal>
            <Reveal delay={120}>
              <p className="mt-md max-w-[24rem] text-body text-mute">
                Autonomous software needs to purchase work the way it makes any other call: programmatically,
                per-request, without a human approving checkout. Margin402 is the counterparty that makes that possible —
                it sells outcomes and manages everything underneath.
              </p>
            </Reveal>
          </div>
        </div>
        <ol className="md:col-span-7">
          {PROBLEMS.map((p, i) => (
            <Reveal as="li" key={p.num} delay={i * 70} className="group border-t border-line py-lg first:border-t-0 first:pt-0 md:first:pt-lg">
              <div className="flex items-baseline gap-md">
                <span className="tabular text-meta text-faint">{p.num}</span>
                <div>
                  <h3 className="text-title">{p.title}</h3>
                  <p className="mt-xs max-w-[28rem] text-body-sm text-mute">{p.body}</p>
                </div>
              </div>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  );
}
