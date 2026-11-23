"use client";

import { useEffect, useRef, useState, useCallback } from "react";

type Stat = {
  value: string;
  title: string;
  desc: string;
};

const STATS_DATA: Stat[] = [
  { value: "$50K-$5M", title: "Daily block RFQ size", desc: "Guaranteed firm quotes, zero AMM slippage" },
  { value: "36", title: "Stocks & ETFs covered", desc: "Chainlink 24/5 & 24/7 oracle feeds On Chain" },
  { value: "1 tx", title: "Atomic settlement", desc: "Smart contract executes all-or-revert swap" },
  { value: "16:00 NY", title: "Official US close", desc: "NYSE/Nasdaq closing price oracle settlement" },
  { value: "24/7", title: "Continuous RFQ", desc: "Always open for size on Robinhood Chain" },
];

type Particle = {
  x0: number; // Anchor home position
  y0: number;
  x: number;  // Physics position
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
  phase: number;
};

const PAD_X = 12;
const PAD_Y = 10;

function LiquidDotText({
  text,
  isCardHovered,
  globalPointerRef,
}: {
  text: string;
  isCardHovered: boolean;
  globalPointerRef: React.RefObject<{
    x: number;
    y: number;
    vx: number;
    vy: number;
    isDown: boolean;
    active: boolean;
  }>;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
  const particlesRef = useRef<Particle[]>([]);
  const dimsRef = useRef({ width: 0, height: 0, dpr: 1 });
  const hoverFactorRef = useRef(0);

  const initParticles = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const isMobile = window.innerWidth < 768;
    const isNarrow = window.innerWidth < 1200;

    // Proportional, balanced font sizing so long stats like $50K-$5M and 16:00 NY
    // never feel cramped ("mepet") inside their column cards
    let fontSize = 48;
    if (text.length >= 8) {
      // Long values ($50K-$5M, 16:00 NY): scaled to fit comfortably with generous side margins
      fontSize = isMobile ? 26 : isNarrow ? 28 : 32;
    } else if (text.length <= 2) {
      // 36
      fontSize = isMobile ? 38 : isNarrow ? 46 : 54;
    } else {
      // 1 tx, 24/7
      fontSize = isMobile ? 34 : isNarrow ? 40 : 48;
    }

    const font = `700 ${fontSize}px "JetBrains Mono", monospace`;

    // Measure on offscreen canvas
    const offscreen = document.createElement("canvas");
    const offCtx = offscreen.getContext("2d", { willReadFrequently: true });
    if (!offCtx) return;

    offCtx.font = font;
    const metrics = offCtx.measureText(text);
    const textWidth = Math.ceil(metrics.width);
    const textHeight = Math.ceil(fontSize * 1.15);

    const width = textWidth + PAD_X * 2;
    const height = textHeight + PAD_Y * 2;

    dimsRef.current = { width, height, dpr };

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    offscreen.width = width;
    offscreen.height = height;
    offCtx.font = font;
    offCtx.fillStyle = "#ffffff";
    // Anchor to bottom baseline so all stats align horizontally at the exact same shelf
    offCtx.textBaseline = "bottom";
    offCtx.fillText(text, PAD_X, height - PAD_Y);

    const imgData = offCtx.getImageData(0, 0, width, height);
    const pixels = imgData.data;

    // High density grid resolution for solid, crisp digits
    const dotSpacing = isMobile ? 2.2 : 2.4;
    const dotSize = isMobile ? 1.6 : 1.75;

    const newParticles: Particle[] = [];

    for (let py = 0; py < height; py += dotSpacing) {
      for (let px = 0; px < width; px += dotSpacing) {
        const idx = (Math.floor(py) * width + Math.floor(px)) * 4;
        const alpha = pixels[idx + 3];

        if (alpha > 70) {
          newParticles.push({
            x0: px,
            y0: py,
            x: px,
            y: py,
            vx: 0,
            vy: 0,
            size: dotSize,
            alpha: alpha / 255,
            phase: (px / width) * 3.5 + (py / height) * 2.5,
          });
        }
      }
    }

    particlesRef.current = newParticles;
    setReady(true);
  }, [text]);

  useEffect(() => {
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(initParticles);
    } else {
      setTimeout(initParticles, 120);
    }

    window.addEventListener("resize", initParticles);
    return () => window.removeEventListener("resize", initParticles);
  }, [initParticles]);

  // Main Physics and Rendering Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId = 0;
    let lastTime = performance.now();
    let clock = 0;

    const render = (now: number) => {
      animId = requestAnimationFrame(render);
      const dt = Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;
      clock += dt;

      const { width, height, dpr } = dimsRef.current;
      if (!width || !height) return;

      ctx.save();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      // Smooth hover factor lerp
      const targetHover = isCardHovered ? 1.0 : 0.0;
      hoverFactorRef.current += (targetHover - hoverFactorRef.current) * Math.min(1, dt * 6);
      const hoverFactor = hoverFactorRef.current;

      // Pointer physics: localized, controlled fluid disturbance
      const b = canvas.getBoundingClientRect();
      const ptr = globalPointerRef.current;
      const localPx = ptr ? ptr.x - b.left : -9999;
      const localPy = ptr ? ptr.y - b.top : -9999;
      const isPtrNear =
        ptr &&
        ptr.active &&
        localPx >= -40 &&
        localPx <= width + 40 &&
        localPy >= -40 &&
        localPy <= height + 40;

      const interactRadius = 60;
      const interactRadiusSq = interactRadius * interactRadius;
      const particles = particlesRef.current;

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];

        // 1. Subtle organic liquid wave when hovered
        let targetX = p.x0;
        let targetY = p.y0;

        if (hoverFactor > 0.02) {
          const wave = Math.sin(clock * 3.5 + p.phase) * 1.5 * hoverFactor;
          targetY += wave;
        }

        // 2. Controlled Pointer Interaction: maximum displacement strictly clamped
        if (isPtrNear) {
          const dx = p.x - localPx;
          const dy = p.y - localPy;
          const distSq = dx * dx + dy * dy;

          if (distSq < interactRadiusSq && distSq > 0.5) {
            const dist = Math.sqrt(distSq);
            const force = (1 - dist / interactRadius);
            const push = force * force * (ptr.isDown ? 8.0 : 5.5);
            const angle = Math.atan2(dy, dx);

            p.vx += Math.cos(angle) * push;
            p.vy += Math.sin(angle) * push;

            // Fluid swirl
            p.vx += -Math.sin(angle) * push * 0.2;
            p.vy += Math.cos(angle) * push * 0.2;

            // Momentum transfer
            p.vx += ptr.vx * 0.06 * force;
            p.vy += ptr.vy * 0.06 * force;
          }
        }

        // 3. Elastic Spring Physics
        const springK = 0.16;
        const damping = 0.78;

        p.vx += (targetX - p.x) * springK;
        p.vy += (targetY - p.y) * springK;

        p.vx *= damping;
        p.vy *= damping;

        p.x += p.vx;
        p.y += p.vy;

        // Strictly clamp displacement to prevent numbers from deforming
        const dispX = p.x - p.x0;
        const dispY = p.y - p.y0;
        const maxDisp = 12;
        const dispDist = Math.hypot(dispX, dispY);
        if (dispDist > maxDisp) {
          p.x = p.x0 + (dispX / dispDist) * maxDisp;
          p.y = p.y0 + (dispY / dispDist) * maxDisp;
          p.vx *= 0.5;
          p.vy *= 0.5;
        }

        // 4. Color & Lighting
        const speed = Math.hypot(p.vx, p.vy);
        const activeLevel = Math.max(hoverFactor, Math.min(1, speed / 1.5));

        let fillStyle: string;
        let fillAlpha: number;

        if (speed > 2.0) {
          fillStyle = "#ffffff"; // Hot splash core
          fillAlpha = 1.0;
        } else if (speed > 0.6 || activeLevel > 0.2) {
          fillStyle = "#ffd27a"; // Radiant warm gold
          fillAlpha = 1.0;
        } else {
          // Signature Signal Amber
          fillStyle = "#ffb020";
          fillAlpha = 0.95;
        }

        ctx.fillStyle = fillStyle;
        ctx.globalAlpha = p.alpha * fillAlpha;

        // Draw crisp dot
        const halfSize = p.size / 2;
        ctx.fillRect(p.x - halfSize, p.y - halfSize, p.size, p.size);
      }

      ctx.restore();
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [isCardHovered, globalPointerRef]);

  return (
    <div className="relative select-none flex items-end">
      {!ready && (
        <span className="font-mono text-2xl font-bold tracking-tight text-signal-500 lg:text-3xl">
          {text}
        </span>
      )}
      <canvas
        ref={canvasRef}
        style={{ marginLeft: -PAD_X }}
        className={`block cursor-pointer transition-opacity duration-300 ${
          ready ? "opacity-100" : "opacity-0"
        }`}
        aria-label={text}
      />
    </div>
  );
}

export default function LiquidStats() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  // Global pointer tracking across the entire stats strip
  const pointerRef = useRef({
    x: -9999,
    y: -9999,
    vx: 0,
    vy: 0,
    isDown: false,
    active: false,
    lastTime: performance.now(),
  });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let lastX = -9999;
    let lastY = -9999;

    const updatePointer = (clientX: number, clientY: number, isDown: boolean) => {
      const now = performance.now();
      const dt = Math.max(1, now - pointerRef.current.lastTime);

      const vx = ((clientX - lastX) / dt) * 16;
      const vy = ((clientY - lastY) / dt) * 16;

      lastX = clientX;
      lastY = clientY;

      pointerRef.current = {
        x: clientX,
        y: clientY,
        vx: Math.max(-25, Math.min(25, vx)),
        vy: Math.max(-25, Math.min(25, vy)),
        isDown,
        active: true,
        lastTime: now,
      };
    };

    const onPointerMove = (e: PointerEvent) => {
      updatePointer(e.clientX, e.clientY, e.buttons > 0);
    };

    const onPointerDown = (e: PointerEvent) => {
      updatePointer(e.clientX, e.clientY, true);
    };

    const onPointerUp = () => {
      pointerRef.current.isDown = false;
    };

    const onPointerLeave = () => {
      pointerRef.current.active = false;
      pointerRef.current.isDown = false;
      pointerRef.current.x = -9999;
      pointerRef.current.y = -9999;
      pointerRef.current.vx = 0;
      pointerRef.current.vy = 0;
      setHoveredIndex(null);
    };

    el.addEventListener("pointermove", onPointerMove);
    el.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointerup", onPointerUp);
    el.addEventListener("pointerleave", onPointerLeave);

    return () => {
      el.removeEventListener("pointermove", onPointerMove);
      el.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointerup", onPointerUp);
      el.removeEventListener("pointerleave", onPointerLeave);
    };
  }, []);

  return (
    <section
      ref={containerRef}
      className="border-b border-ink-700 bg-ink-950 overflow-hidden relative select-none"
    >
      <div className="mx-auto grid max-w-[1440px] grid-cols-1 divide-y divide-ink-700 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 lg:divide-y-0 lg:divide-x lg:divide-ink-700">
        {STATS_DATA.map((st, i) => {
          const isHovered = hoveredIndex === i;
          return (
            <div
              key={i}
              onMouseEnter={() => setHoveredIndex(i)}
              onMouseLeave={() => setHoveredIndex((prev) => (prev === i ? null : prev))}
              className={`group relative flex flex-col justify-between p-6 transition-all duration-300 lg:px-7 lg:py-8 ${
                isHovered ? "bg-ink-900/40" : "hover:bg-ink-900/20"
              }`}
            >
              {/* Top ambient highlight on active stat */}
              <div
                className={`absolute top-0 left-0 right-0 h-[2px] transition-all duration-300 ${
                  isHovered ? "bg-signal-500 opacity-100 shadow-[0_0_12px_rgba(255,176,32,0.8)]" : "opacity-0"
                }`}
              />

              {/* Liquid Dot Matrix Canvas - Shared uniform baseline shelf */}
              <div className="overflow-visible flex items-end h-[56px] lg:h-[64px]">
                <LiquidDotText
                  text={st.value}
                  isCardHovered={isHovered}
                  globalPointerRef={pointerRef}
                />
              </div>

              {/* Stat metadata & labels - Perfectly aligned with number's left edge */}
              <div className="mt-5">
                <p
                  className={`font-mono text-xs font-bold uppercase tracking-[0.08em] transition-colors duration-200 ${
                    isHovered ? "text-signal-500" : "text-mist-100"
                  }`}
                >
                  {st.title}
                </p>
                <p className="mt-1.5 text-xs leading-relaxed text-slate-400">
                  {st.desc}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
