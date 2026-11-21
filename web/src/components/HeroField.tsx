"use client";

import { useEffect, useRef } from "react";

// Dots cycle: scattered quotes (chaos) -> ordered perspective floor (settled) -> back.
const COLS = 101;
const ROWS = 44;
const HOLD_CHAOS = 3.2;
const MORPH = 3;
const HOLD_GRID = 4.5;
const CYCLE = HOLD_CHAOS + MORPH + HOLD_GRID + MORPH;

type P = {
  cx: number; cy: number; cz: number; // chaos
  gx: number; gy: number; gz: number; // grid
  seed: number; delay: number; lead: boolean;
};

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const clamp = (v: number) => Math.min(1, Math.max(0, v));

export default function HeroField() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext("2d")!;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const speed = reduce ? 0.25 : 1;

    const pts: P[] = [];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const gz = 1.2 + r * 0.32;
        pts.push({
          gx: (c - (COLS - 1) / 2) * 0.3,
          gy: 1.25,
          gz,
          cx: (Math.random() - 0.5) * 18,
          cy: (Math.random() - 0.5) * 7,
          cz: 1.2 + Math.random() * 13,
          seed: Math.random() * 6.28,
          delay: (r / ROWS) * 0.45 + Math.random() * 0.15,
          lead: Math.random() < 0.06,
        });
      }
    }

    let w = 0, h = 0, dpr = 1;
    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      const b = canvas.getBoundingClientRect();
      w = b.width; h = b.height;
      canvas.width = w * dpr; canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const mouse = { x: -9999, y: -9999 };
    const onMove = (e: PointerEvent) => {
      const b = canvas.getBoundingClientRect();
      mouse.x = e.clientX - b.left; mouse.y = e.clientY - b.top;
    };
    window.addEventListener("pointermove", onMove);

    let raf = 0, last = performance.now(), clock = 0;
    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      clock += dt * speed;
      const t = clock % CYCLE;

      // progress 0 = chaos, 1 = grid, with staggered per-point delay
      let base: number;
      if (t < HOLD_CHAOS) base = 0;
      else if (t < HOLD_CHAOS + MORPH) base = (t - HOLD_CHAOS) / MORPH;
      else if (t < HOLD_CHAOS + MORPH + HOLD_GRID) base = 1;
      else base = 1 - (t - HOLD_CHAOS - MORPH - HOLD_GRID) / MORPH;

      ctx.clearRect(0, 0, w, h);
      const f = h * 0.95;
      const ox = w * 0.5, oy = h * 0.34;
      const textZone = w * 0.55;

      for (const p of pts) {
        const k = ease(clamp((base - p.delay * 0.5) / (1 - 0.5 * 0.6)));
        const drift = (1 - k) * 0.35;
        const x = p.cx + (p.gx - p.cx) * k + Math.sin(clock * 0.6 + p.seed) * drift;
        let y = p.cy + (p.gy - p.cy) * k + Math.cos(clock * 0.5 + p.seed) * drift;
        const z = p.cz + (p.gz - p.cz) * k;
        y += Math.sin(clock * 1.2 + p.gx * 0.8 + p.gz * 0.5) * 0.05 * k; // slow floor swell

        let sx = ox + (x / z) * f;
        let sy = oy + (y / z) * f;

        const dx = sx - mouse.x, dy = sy - mouse.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < 130 * 130) {
          const d = Math.sqrt(d2) || 1;
          const push = (1 - d / 130) * 22;
          sx += (dx / d) * push; sy += (dy / d) * push;
        }
        if (sx < -10 || sx > w + 10 || sy < -10 || sy > h + 10) continue;

        const depth = clamp(1 - (z - 1.2) / 14);
        let a = 0.1 + depth * 0.75;
        if (sx < textZone && sy > h * 0.2 && sy < h * 0.75) a *= 0.45; // keep copy readable
        const size = Math.max(0.7, (0.0055 * f) / z);
        const edge = clamp(Math.min(sx, w - sx) / (w * 0.14)) * clamp((h - sy) / (h * 0.22));
        a *= edge;

        ctx.globalAlpha = a;
        if (p.lead && k < 0.9) ctx.fillStyle = "#ffd27a";
        else ctx.fillStyle = k > 0.5 ? "#ffb020" : p.seed > 3.5 ? "#5d6475" : "#ffb020";
        ctx.beginPath(); ctx.arc(sx, sy, size, 0, 6.283); ctx.fill();
      }
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onMove);
    };
  }, []);

  return <canvas ref={ref} className="absolute inset-0 h-full w-full" aria-hidden />;
}
