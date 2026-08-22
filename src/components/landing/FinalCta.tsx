import { ButtonLink, ArrowRight } from "@/components/primitives/Button";
import { Reveal } from "@/components/primitives/Reveal";

export function FinalCta() {
  return (
    <section className="border-t border-line">
      <div className="mx-auto flex max-w-[1200px] flex-col items-center px-margin-mobile py-section text-center md:px-margin-desktop">
        <Reveal>
          <h2 className="max-w-2xl text-headline">
            The agent doesn&apos;t need to know how the work gets done.
            <br />
            <span className="text-mute">It only needs to know the outcome will be delivered.</span>
          </h2>
        </Reveal>
        <Reveal delay={120}>
          <p className="mt-md max-w-[32rem] text-body text-mute">
            Buy outcomes. Not tokens, not hours, not hope.
          </p>
        </Reveal>
        <Reveal delay={200}>
          <div className="mt-xl">
            <ButtonLink href="/quote" size="lg" className="group">
              Run a contract
              <ArrowRight />
            </ButtonLink>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
