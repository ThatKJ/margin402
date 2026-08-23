import { useEffect, useRef, useState } from "react";

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return reduced;
}

/**
 * Animates a number toward `target` with ease-out cubic. Respects
 * prefers-reduced-motion by jumping straight to the value — per spec,
 * motion becomes instant but any deliberate hold calling this still waits
 * its full duration before the (instant) value change, since holds are
 * separate setTimeout delays in the calling component, not part of this hook.
 */
export function useCountUp(target: number, durationMs = 700): number {
  const reduced = usePrefersReducedMotion();
  const [value, setValue] = useState(target);
  const prevTarget = useRef(target);
  const firstRun = useRef(true);

  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      prevTarget.current = target;
      setValue(target);
      return;
    }
    if (reduced) {
      setValue(target);
      prevTarget.current = target;
      return;
    }
    const from = prevTarget.current;
    const to = target;
    if (from === to) return;
    const start = performance.now();
    let raf: number;
    let settled = false;
    const settle = () => {
      if (settled) return;
      settled = true;
      setValue(to);
      prevTarget.current = to;
    };
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(from + (to - from) * eased);
      if (t < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        settle();
      }
    };
    raf = requestAnimationFrame(tick);
    // requestAnimationFrame can stall indefinitely for a backgrounded/occluded
    // tab (unlike setTimeout, which browsers still fire, just throttled) — a
    // stat stuck at its pre-animation value on a demo screen reads as broken,
    // so this guarantees the real value lands even if rAF never ticks once.
    const fallback = setTimeout(settle, durationMs + 50);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(fallback);
    };
  }, [target, durationMs, reduced]);

  return value;
}

/**
 * A narrative hold — waits `ms` then resolves, but resolves instantly
 * (0ms) under reduced motion is wrong per spec ("holds preserved"): only
 * the motion collapses, the pacing of beats does not. So this ignores
 * reduced-motion entirely and always waits the full duration.
 */
export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
