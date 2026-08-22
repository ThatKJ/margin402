"use client";

import { useEffect, useRef } from "react";

type V3 = { x: number; y: number; z: number };

const STAGES: { label: string; p: V3 }[] = [
  { label: "TASK", p: { x: -1.08, y: 0.16, z: -0.2 } },
  { label: "QUOTE", p: { x: -0.65, y: -0.18, z: 0.26 } },
  { label: "CAPITAL", p: { x: -0.22, y: 0.2, z: -0.32 } },
  { label: "STRATEGY", p: { x: 0.22, y: -0.16, z: 0.22 } },
  { label: "VERIFY", p: { x: 0.65, y: 0.16, z: -0.28 } },
  { label: "OUTCOME", p: { x: 1.08, y: -0.06, z: 0.14 } },
];

type Particle = { edge: number; t: number; speed: number; trail: { x: number; y: number }[] };
type Pulse = { node: number; t: number; color: string };

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const v = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)];
}

const rgba = (rgb: [number, number, number], a: number) => `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a})`;

export function FlowLattice({ className = "" }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const css = getComputedStyle(document.documentElement);
    const readVar = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
    const ACCENT = hexToRgb(readVar("--color-accent", "#2456d8"));
    const PASS = hexToRgb(readVar("--color-pass", "#17803d"));
    const INK = hexToRgb(readVar("--color-ink", "#17191b"));

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const canHover = window.matchMedia("(hover: hover)").matches;

    let width = 0;
    let height = 0;
    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    let raf = 0;
    let running = false;
    let visible = true;
    const start = performance.now();
    let last = start;

    const state = {
      rotY: -0.06,
      rotX: -0.14,
      targetRotY: -0.06,
      targetRotX: -0.14,
      particles: [] as Particle[],
      pulses: [] as Pulse[],
      nextSpawn: 600,
      dash: 0,
    };

    if (!reduced) {
      // Stagger 3 particles across the 5 edges (6 stages) at mount instead
      // of all starting together at edge 0 — the spread is (i * 5) / 3, but
      // STAGES[] is indexed by whole stage number, so that fraction has to
      // split into an integer edge plus how far along it (t), or
      // STAGES[edge] lands on a non-integer index and comes back undefined.
      for (let i = 0; i < 3; i++) {
        const spread = (i * (STAGES.length - 1)) / 3;
        const edge = Math.min(STAGES.length - 2, Math.floor(spread));
        const t = spread - edge;
        state.particles.push({ edge, t, speed: 1 / 1100, trail: [] });
      }
    }

    const project = (p: V3, rotY: number, rotX: number) => {
      const cosY = Math.cos(rotY);
      const sinY = Math.sin(rotY);
      const x1 = p.x * cosY + p.z * sinY;
      const z1 = -p.x * sinY + p.z * cosY;
      const cosX = Math.cos(rotX);
      const sinX = Math.sin(rotX);
      const y1 = p.y * cosX - z1 * sinX;
      const z2 = p.y * sinX + z1 * cosX;
      const f = 3;
      const persp = f / (f + z2);
      const unit = Math.min(width * 0.415, height * 0.66);
      return {
        x: width / 2 + x1 * unit * persp,
        y: height / 2 + y1 * unit * persp,
        s: persp,
      };
    };

    const edgePoint = (a: V3, b: V3, t: number): V3 => ({
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t - Math.sin(t * Math.PI) * 0.07,
      z: a.z + (b.z - a.z) * t,
    });

    const spawn = () => {
      if (state.particles.length < 5) {
        state.particles.push({ edge: 0, t: 0, speed: 1 / (950 + Math.random() * 500), trail: [] });
      }
    };

    const draw = (now: number) => {
      const dt = Math.min(50, now - last);
      last = now;
      const elapsed = now - start;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      const drift = reduced ? 0 : Math.sin(elapsed * 0.00012) * 0.055;
      const breatheTilt = reduced ? 0 : Math.sin(elapsed * 0.00009) * 0.02;
      state.rotY += (state.targetRotY + drift - state.rotY) * 0.04;
      state.rotX += (state.targetRotX + breatheTilt - state.rotX) * 0.04;

      const projected = STAGES.map((s) => ({ ...project(s.p, state.rotY, state.rotX) }));

      ctx.lineWidth = 1;
      for (let i = 0; i < STAGES.length - 1; i++) {
        const a = projected[i];
        const b = projected[i + 1];
        const mid = project(edgePoint(STAGES[i].p, STAGES[i + 1].p, 0.5), state.rotY, state.rotX);
        const depth = (a.s + b.s) / 2;
        ctx.strokeStyle = rgba(INK, 0.13 * depth);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.quadraticCurveTo(mid.x, mid.y, b.x, b.y);
        ctx.stroke();

        if (!reduced) {
          ctx.save();
          ctx.setLineDash([1.5, 7]);
          ctx.lineDashOffset = -state.dash;
          ctx.strokeStyle = rgba(ACCENT, 0.34 * depth);
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.quadraticCurveTo(mid.x, mid.y, b.x, b.y);
          ctx.stroke();
          ctx.restore();
        }
      }

      const fbA = projected[4];
      const fbB = projected[3];
      ctx.save();
      ctx.setLineDash([2, 6]);
      ctx.strokeStyle = rgba(INK, 0.11);
      ctx.beginPath();
      ctx.moveTo(fbA.x, fbA.y + 14);
      ctx.quadraticCurveTo((fbA.x + fbB.x) / 2, Math.max(fbA.y, fbB.y) + 44, fbB.x, fbB.y + 14);
      ctx.stroke();
      ctx.restore();

      if (!reduced) {
        state.dash += dt * 0.012;
        state.nextSpawn -= dt;
        if (state.nextSpawn <= 0) {
          spawn();
          state.nextSpawn = 1150 + Math.random() * 500;
        }
        for (let i = state.particles.length - 1; i >= 0; i--) {
          const pt = state.particles[i];
          pt.t += dt * pt.speed;
          if (pt.t >= 1 && pt.edge >= STAGES.length - 2) {
            state.pulses.push({
              node: STAGES.length - 1,
              t: 0,
              color: rgba(PASS, 1),
            });
            state.particles.splice(i, 1);
            continue;
          }
          if (pt.t >= 1) {
            pt.edge += 1;
            pt.t = 0;
            pt.trail = [];
            if (pt.edge === 4) state.pulses.push({ node: 4, t: 0, color: rgba(ACCENT, 1) });
          }
          const pos = project(
            edgePoint(STAGES[pt.edge].p, STAGES[pt.edge + 1].p, pt.t),
            state.rotY,
            state.rotX,
          );
          pt.trail.push({ x: pos.x, y: pos.y });
          if (pt.trail.length > 6) pt.trail.shift();
          for (let k = 0; k < pt.trail.length; k++) {
            const tp = pt.trail[k];
            const fade = ((k + 1) / pt.trail.length) * 0.5 * pos.s;
            ctx.fillStyle = rgba(ACCENT, fade);
            ctx.beginPath();
            ctx.arc(tp.x, tp.y, 1.6 * pos.s, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.fillStyle = rgba(ACCENT, 0.95);
          ctx.beginPath();
          ctx.arc(pos.x, pos.y, 2.2 * pos.s, 0, Math.PI * 2);
          ctx.fill();
        }
        for (let i = state.pulses.length - 1; i >= 0; i--) {
          const pulse = state.pulses[i];
          pulse.t += dt / 900;
          if (pulse.t >= 1) {
            state.pulses.splice(i, 1);
            continue;
          }
          const n = projected[pulse.node];
          const r = 8 + pulse.t * 30;
          ctx.strokeStyle = pulse.color.replace(/,[01]\)$/, `,${(1 - pulse.t) * 0.55})`);
          ctx.lineWidth = 1.25;
          ctx.beginPath();
          ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
          ctx.stroke();
        }
      } else {
        for (const frac of [0.18, 0.42, 0.66, 0.88]) {
          const e = Math.min(STAGES.length - 2, Math.floor(frac * (STAGES.length - 1)));
          const pos = project(edgePoint(STAGES[e].p, STAGES[e + 1].p, frac % 1 || 0.5), state.rotY, state.rotX);
          ctx.fillStyle = rgba(ACCENT, 0.85);
          ctx.beginPath();
          ctx.arc(pos.x, pos.y, 2.2 * pos.s, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      ctx.font = `600 10px ${getComputedStyle(canvas).fontFamily || "monospace"}`;
      ctx.textAlign = "center";
      for (let i = 0; i < STAGES.length; i++) {
        const s = STAGES[i];
        const pr = projected[i];
        const size = (i === 0 || i === STAGES.length - 1 ? 8 : 6.5) * pr.s;
        const depthFade = Math.min(1, Math.max(0.35, pr.s - 0.55));

        if (!reduced && i === 4) {
          const scan = (elapsed * 0.0011) % (Math.PI * 2);
          ctx.strokeStyle = rgba(ACCENT, 0.4);
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(pr.x, pr.y, 13 * pr.s, scan, scan + 1.1);
          ctx.stroke();
        }

        ctx.save();
        ctx.translate(pr.x, pr.y);
        ctx.rotate(Math.PI / 4 + (reduced ? 0 : Math.sin(elapsed * 0.0006 + i) * 0.08));
        ctx.strokeStyle = rgba(INK, 0.35 * depthFade);
        ctx.lineWidth = 1;
        ctx.strokeRect(-size / 2, -size / 2, size, size);
        ctx.restore();

        const isOutcome = i === STAGES.length - 1;
        const coreAlpha = isOutcome && !reduced ? 0.65 + Math.sin(elapsed * 0.003) * 0.35 : 0.9;
        ctx.fillStyle = isOutcome ? rgba(PASS, coreAlpha) : rgba(ACCENT, coreAlpha);
        ctx.beginPath();
        ctx.arc(pr.x, pr.y, 2 * pr.s, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = rgba(INK, 0.62 * depthFade);
        ctx.fillText(s.label, pr.x, pr.y - 17 * pr.s);
      }

      ctx.font = `400 10px ${getComputedStyle(canvas).fontFamily || "monospace"}`;
      ctx.fillStyle = rgba(INK, 0.28);
      ctx.fillText("MONEY → DECISION → EXECUTION → VERIFICATION → SETTLEMENT", width / 2, height - 10);
    };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      if (!running) draw(performance.now());
    };

    const loop = (now: number) => {
      if (!running) return;
      draw(now);
      raf = requestAnimationFrame(loop);
    };

    const play = () => {
      if (running || reduced || !visible || document.hidden) return;
      running = true;
      last = performance.now();
      raf = requestAnimationFrame(loop);
    };

    const pause = () => {
      running = false;
      cancelAnimationFrame(raf);
    };

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();

    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) play();
      else pause();
    });
    io.observe(canvas);

    const onVis = () => (document.hidden ? pause() : play());
    document.addEventListener("visibilitychange", onVis);

    const onMove = (e: PointerEvent) => {
      if (!canHover || reduced) return;
      const rect = canvas.getBoundingClientRect();
      const nx = (e.clientX - rect.left) / rect.width - 0.5;
      const ny = (e.clientY - rect.top) / rect.height - 0.5;
      state.targetRotY = -0.06 + nx * 0.09;
      state.targetRotX = -0.14 + ny * 0.06;
    };
    const onLeave = () => {
      state.targetRotY = -0.06;
      state.targetRotX = -0.14;
    };
    if (canHover) {
      window.addEventListener("pointermove", onMove, { passive: true });
      canvas.addEventListener("pointerleave", onLeave);
    }

    document.fonts?.ready.then(() => {
      if (!running) draw(performance.now());
    });

    play();

    return () => {
      pause();
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  return (
    <div className={className}>
      <canvas ref={canvasRef} aria-hidden="true" className="h-full w-full" />
      <p className="sr-only">
        Diagram: a task becomes a quote, capital is committed to a strategy, work is executed and verified, and the outcome
        settles — payment particles flow through each stage.
      </p>
    </div>
  );
}
