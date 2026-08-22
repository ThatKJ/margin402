import type { ReactNode } from "react";
import { Reveal } from "./Reveal";

export function SectionHeader({
  index,
  kicker,
  title,
  lede,
  align = "left",
}: {
  index?: string;
  kicker: string;
  title: ReactNode;
  lede?: ReactNode;
  align?: "left" | "center";
}) {
  return (
    <div className={`flex flex-col gap-md ${align === "center" ? "items-center text-center" : ""}`}>
      <Reveal>
        <p className="flex items-center gap-sm text-label uppercase text-faint">
          {index && <span className="tabular text-accent">{index}</span>}
          <span className="h-px w-6 bg-line-strong" aria-hidden="true" />
          {kicker}
        </p>
      </Reveal>
      <Reveal delay={60}>
        <h2 className={`max-w-[720px] text-headline ${align === "center" ? "mx-auto" : ""}`}>{title}</h2>
      </Reveal>
      {lede && (
        <Reveal delay={120}>
          <p className={`max-w-[560px] text-body text-mute ${align === "center" ? "mx-auto" : ""}`}>{lede}</p>
        </Reveal>
      )}
    </div>
  );
}
