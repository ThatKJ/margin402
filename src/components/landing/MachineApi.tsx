import { Reveal } from "@/components/primitives/Reveal";

function Line({ children }: { children: React.ReactNode }) {
  return <div className="whitespace-pre-wrap">{children}</div>;
}

export function MachineApi() {
  return (
    <section id="machine-api" className="scroll-mt-20 border-t border-line bg-panel">
      <div className="mx-auto grid max-w-[1200px] grid-cols-1 gap-xl px-margin-mobile py-section md:grid-cols-12 md:px-margin-desktop">
        <div className="md:col-span-5">
          <Reveal>
            <p className="flex items-center gap-sm text-label uppercase text-faint">
              <span className="tabular text-accent">07</span>
              <span className="h-px w-6 bg-line-strong" aria-hidden="true" />
              The machine customer
            </p>
          </Reveal>
          <Reveal delay={60}>
            <h2 className="mt-md max-w-[28rem] text-headline">No UI required.</h2>
          </Reveal>
          <Reveal delay={120}>
            <p className="mt-md max-w-[28rem] text-body text-mute">
              Everything this product does is available over plain HTTP — the same engine, the same payments, the same
              proof. A CI pipeline or an autonomous agent never needs to see this website.
            </p>
          </Reveal>
          <Reveal delay={180}>
            <ol className="mt-lg flex flex-col gap-xs text-body-sm text-mute">
              {[
                "POST /api/quote — price the outcome",
                "POST /api/quote { offer } — one sealed counteroffer",
                "GET /api/jobs/execute?revenue=… — stream the run as SSE",
              ].map((t) => (
                <li key={t} className="flex items-baseline gap-sm border-b border-line pb-xs last:border-0">
                  <span className="tabular shrink-0 text-[10px] text-accent">→</span>
                  <span className="tabular">{t}</span>
                </li>
              ))}
            </ol>
          </Reveal>
        </div>

        <Reveal delay={140} className="md:col-span-7">
          <figure className="overflow-hidden rounded-xl border border-line shadow-card">
            <figcaption className="flex items-center justify-between border-b border-line bg-panel-2 px-md py-xs">
              <span className="text-label uppercase text-faint">Terminal — machine flow</span>
              <span className="flex gap-1" aria-hidden="true">
                <span className="h-2 w-2 rounded-full border border-line-strong" />
                <span className="h-2 w-2 rounded-full border border-line-strong" />
              </span>
            </figcaption>
            <pre className="overflow-x-auto bg-well p-md text-[12.5px] leading-relaxed md:p-lg">
              <code className="font-mono">
                <Line>
                  <span className="text-faint"># quote the outcome</span>
                </Line>
                <Line>curl -s -X POST localhost:3000/api/quote \</Line>
                <Line>{'  '}{'  '}-H &apos;Content-Type: application/json&apos; \</Line>
                <Line>{'  '}{'  '}-d &apos;{"{"}&quot;task&quot;:&quot;Implement parseDuration()&quot;{"}"}&apos;</Line>
                <Line>{'  '}{'  '}</Line>
                <Line>
                  <span className="text-faint">{'# → {"quote":1.20,"validSeconds":60,…}'}</span>
                </Line>
                <Line>{'  '}</Line>
                <Line>
                  <span className="text-faint"># one sealed counteroffer</span>
                </Line>
                <Line>curl -s -X POST localhost:3000/api/quote \</Line>
                <Line>{'  '}{' '}-H &apos;Content-Type: application/json&apos; \</Line>
                <Line>{'  '}{' '}-d &apos;{"{"}&quot;offer&quot;:1.05{"}"}&apos;</Line>
                <Line>
                  <span className="text-faint">{'# → {"decision":"ACCEPT","offer":1.05,…}'}</span>
                </Line>
                <Line>{'  '}</Line>
                <Line>
                  <span className="text-faint"># execute — decisions, x402 payments,</span>
                </Line>
                <Line>
                  <span className="text-faint"># verification and settlement, streamed live</span>
                </Line>
                <Line>curl -N &quot;localhost:3000/api/jobs/execute?revenue=1.05&quot;</Line>
                <Line>
                  <span className="text-faint">{'# event: decision → payment → verification'}</span>
                </Line>
                <Line>
                  <span className="text-faint">{'# → closed { outcome:"VERIFIED", settlements:[…] }'}</span>
                </Line>
              </code>
            </pre>
          </figure>
        </Reveal>
      </div>
    </section>
  );
}
