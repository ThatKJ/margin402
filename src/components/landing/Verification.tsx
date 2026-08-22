"use client";

import { useEffect, useRef, useState } from "react";
import { Reveal } from "@/components/primitives/Reveal";
import { HIDDEN_TEST_COUNT, VISIBLE_TEST_COUNT } from "@/lib/workloads/parse-duration";

const TOTAL = VISIBLE_TEST_COUNT + HIDDEN_TEST_COUNT;
const STEP = 110;

export function Verification() {
  const ref = useRef<HTMLDivElement | null>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setShown(true);
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShown(true);
          io.disconnect();
        }
      },
      { threshold: 0.35 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const hiddenStart = VISIBLE_TEST_COUNT;

  return (
    <section className="border-t border-line">
      <div className="mx-auto grid max-w-[1200px] grid-cols-1 items-center gap-xl px-margin-mobile py-section md:grid-cols-12 md:px-margin-desktop">
        <div className="md:col-span-5">
          <Reveal>
            <p className="flex items-center gap-sm text-label uppercase text-faint">
              <span className="tabular text-accent">04</span>
              <span className="h-px w-6 bg-line-strong" aria-hidden="true" />
              Verification
            </p>
          </Reveal>
          <Reveal delay={60}>
            <h2 className="mt-md max-w-[28rem] text-headline">Verified against tests the provider never saw.</h2>
          </Reveal>
          <Reveal delay={120}>
            <p className="mt-md max-w-[28rem] text-body text-mute">
              Providers are shown only the {VISIBLE_TEST_COUNT} visible tests. The other {HIDDEN_TEST_COUNT} exist to
              catch work that special-cases what it can see instead of solving the problem. Every attempt faces all{" "}
              {TOTAL} — there is no looser check for what the provider was shown.
            </p>
          </Reveal>
        </div>

        <div ref={ref} className="md:col-span-7">
          <div className="rounded-xl border border-line bg-panel p-lg shadow-card md:p-xl">
            <p className="text-label uppercase text-faint">Visible suite · provider saw these</p>
            <div className="mt-sm grid grid-cols-6 gap-xs sm:gap-sm">
              {Array.from({ length: VISIBLE_TEST_COUNT }).map((_, i) => (
                <Cell key={`v${i}`} shown={shown} delay={i * STEP} />
              ))}
            </div>

            <p className="mt-lg text-label uppercase text-faint">Hidden suite · never exposed to providers</p>
            <div className="mt-sm grid grid-cols-6 gap-xs sm:gap-sm">
              {Array.from({ length: HIDDEN_TEST_COUNT }).map((_, i) => (
                <Cell key={`h${i}`} shown={shown} delay={(hiddenStart + i) * STEP} masked />
              ))}
            </div>

            <div className="mt-lg flex items-center justify-between border-t border-line pt-lg" aria-live="polite">
              <span className="text-label uppercase text-faint">Outcome</span>
              <span className="flex items-center gap-md">
                <span className="tabular text-stat">{shown ? `8 / 8` : "0 / 8"}</span>
                <span
                  className={`rounded-sm border px-2 py-0.5 text-label uppercase transition-opacity duration-500 ${
                    shown ? "border-pass-line bg-pass-dim text-pass opacity-100" : "opacity-0"
                  }`}
                  style={{ transitionDelay: `${TOTAL * STEP + 200}ms` }}
                >
                  Verified
                </span>
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Cell({ shown, delay, masked }: { shown: boolean; delay: number; masked?: boolean }) {
  return (
    <div
      className={`flex aspect-square items-center justify-center rounded-md border transition-all duration-300 ${
        shown ? "border-pass-line bg-pass-dim text-pass" : "border-line bg-panel-2 text-faint"
      }`}
      style={{ transitionDelay: `${delay}ms` }}
      aria-hidden="true"
    >
      {shown ? (
        <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none">
          <path d="M3.5 8.5l3 3 6-7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : (
        <span className="tabular text-meta">{masked ? "?" : ""}</span>
      )}
    </div>
  );
}
