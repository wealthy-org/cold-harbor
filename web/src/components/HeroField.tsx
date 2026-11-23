"use client";

import { useEffect, useRef } from "react";

// Institutional 3D Perspective Matrix Field
// Cycles: Scattered quote liquidity (chaos) -> Ordered perspective trading floor (settled) -> Back.
const COLS = 101;
const ROWS = 44;
const HOLD_CHAOS = 2.0;
const MORPH = 2.8;
const HOLD_GRID = 6.2;
const CYCLE = HOLD_CHAOS + MORPH + HOLD_GRID + MORPH;

type P = {
  cx: number; cy: number; cz: number; // Chaos 3D space
  gx: number; gy: number; gz: number; // Perspective grid 3D space
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
          lead: Math.random() < 0.08,
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

      // Progress: 0 = chaos, 1 = settled grid floor
      let base: number;
      if (t < HOLD_CHAOS) base = 0;
      else if (t < HOLD_CHAOS + MORPH) base = (t - HOLD_CHAOS) / MORPH;
      else if (t < HOLD_CHAOS + MORPH + HOLD_GRID) base = 1;
      else base = 1 - (t - HOLD_CHAOS - MORPH - HOLD_GRID) / MORPH;

      ctx.clearRect(0, 0, w, h);
      const f = h * 0.95;
      const ox = w * 0.5, oy = h * 0.34;
      const textZone = w * 0.54;

      for (const p of pts) {
        const k = ease(clamp((base - p.delay * 0.5) / (1 - 0.5 * 0.6)));
        const drift = (1 - k) * 0.35;
        const x = p.cx + (p.gx - p.cx) * k + Math.sin(clock * 0.6 + p.seed) * drift;
        let y = p.cy + (p.gy - p.cy) * k + Math.cos(clock * 0.5 + p.seed) * drift;
        const z = p.cz + (p.gz - p.cz) * k;

        // Slow harmonic breathing wave across the perspective floor
        y += Math.sin(clock * 0.95 + p.gx * 0.5 + p.gz * 0.35) * 0.07 * k;

        let sx = ox + (x / z) * f;
        let sy = oy + (y / z) * f;

        // Interactive mouse deflection & illumination
        const dx = sx - mouse.x, dy = sy - mouse.y;
        const d2 = dx * dx + dy * dy;
        const mouseRadius = 150;
        let mouseBoost = 0;
        if (d2 < mouseRadius * mouseRadius) {
          const d = Math.sqrt(d2) || 1;
          const factor = 1 - d / mouseRadius;
          const push = factor * factor * 26;
          sx += (dx / d) * push;
          sy += (dy / d) * push;
          mouseBoost = factor;
        }

        if (sx < -20 || sx > w + 20 || sy < -20 || sy > h + 20) continue;

        // Depth perspective calculation (0 at horizon, 1 near camera)
        const depth = clamp(1 - (z - 1.2) / 14);

        // Premium contrast & visibility: rich Signal Amber presence without sub-pixel dust
        let a = 0.22 + depth * 0.62;
        if (mouseBoost > 0) a = Math.min(1.0, a + mouseBoost * 0.45);

        // Soften alpha behind hero text so headline stays crisp, but grid remains visible
        if (sx < textZone && sy > h * 0.16 && sy < h * 0.8) {
          a *= 0.36;
        }

        // Distinct, solid node sizing: never below 1.4px, scaling smoothly into foreground
        const baseSize = (0.0125 * f) / z;
        let size = Math.max(1.4, Math.min(4.8, baseSize));
        if (p.lead) size *= 1.35;
        if (mouseBoost > 0) size *= (1 + mouseBoost * 0.35);

        // Smooth edge falloff
        const edgeX = clamp(Math.min(sx, w - sx) / (w * 0.08));
        const edgeY = clamp((h - sy) / (h * 0.18));
        a *= Math.min(edgeX, edgeY);

        if (a < 0.01) continue;

        // Determine node coloration
        let coreColor: string;
        if (p.lead) {
          coreColor = "#ffe58f"; // Hot radiant gold for beacon nodes
        } else if (k > 0.4) {
          coreColor = p.seed > 4.2 ? "#ffd27a" : "#ffb020"; // Signature Signal Amber
        } else {
          coreColor = p.seed > 3.8 ? "#8290a4" : "#ffb020"; // Fluid chaotic quotes
        }

        // Render optical halo glow for prominent & near nodes
        if ((p.lead || z < 7 || mouseBoost > 0.2) && a > 0.25) {
          ctx.globalAlpha = a * 0.24;
          ctx.fillStyle = "#ffb020";
          ctx.beginPath();
          ctx.arc(sx, sy, size * 2.2, 0, 6.283);
          ctx.fill();
        }

        // Render crisp solid node core
        ctx.globalAlpha = a;
        ctx.fillStyle = coreColor;
        ctx.beginPath();
        ctx.arc(sx, sy, size, 0, 6.283);
        ctx.fill();

        // High-end pinpoint spark on lead landmark nodes
        if (p.lead && a > 0.3) {
          ctx.globalAlpha = a * 0.95;
          ctx.fillStyle = "#ffffff";
          ctx.beginPath();
          ctx.arc(sx, sy, size * 0.42, 0, 6.283);
          ctx.fill();
        }
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

  return <canvas ref={ref} className="absolute inset-0 h-full w-full pointer-events-none" aria-hidden />;
}
