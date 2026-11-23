"use client";

import { useEffect, useRef } from "react";

// =========================================================================
// 01. OTC SPOT BLOCK — 3D Liquid Particle Sphere & Vortex
// A revolving, breathing 3D Fibonacci sphere of luminous amber matrix dots
// =========================================================================
export function RfqMotif() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const N = 260; // particle count
    const baseR = 72;

    // Generate Fibonacci sphere points
    const pts = Array.from({ length: N }, (_, i) => {
      const phi = Math.acos(1 - (2 * (i + 0.5)) / N);
      const theta = Math.PI * (1 + Math.sqrt(5)) * i;
      return {
        ox: Math.sin(phi) * Math.cos(theta),
        oy: Math.cos(phi),
        oz: Math.sin(phi) * Math.sin(theta),
        phase: theta,
        size: 1.8 + Math.random() * 1.4,
      };
    });

    let rotX = 0.3;
    let rotY = 0;
    let clock = 0;
    let lastTime = performance.now();

    const render = (now: number) => {
      animId = requestAnimationFrame(render);
      const dt = Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;
      clock += dt;

      rotY += dt * 0.45;
      rotX = 0.35 + Math.sin(clock * 0.4) * 0.15;

      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
      }

      ctx.save();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const cx = w / 2;
      const cy = h / 2;
      const fov = 260;
      const camZ = 190;

      // Dynamic liquid pulsation
      const breath = 1 + Math.sin(clock * 2.2) * 0.06;

      // Transform, project & sort by depth
      const cosY = Math.cos(rotY), sinY = Math.sin(rotY);
      const cosX = Math.cos(rotX), sinX = Math.sin(rotX);

      const projected = pts.map((p) => {
        // Liquid harmonic wave displacement
        const r = baseR * breath + Math.sin(p.phase * 3 + clock * 3) * 6;
        let x = p.ox * r;
        let y = p.oy * r;
        let z = p.oz * r;

        // Rotate Y
        const x1 = x * cosY - z * sinY;
        const z1 = x * sinY + z * cosY;

        // Rotate X
        const y2 = y * cosX - z1 * sinX;
        const z2 = y * sinX + z1 * cosX;

        const pz = z2 + camZ;
        const scale = fov / Math.max(10, pz);
        const sx = cx + x1 * scale;
        const sy = cy + y2 * scale;

        return { sx, sy, z: z2, scale, pz, size: p.size };
      });

      projected.sort((a, b) => b.z - a.z);

      // Render 3D dots
      for (const p of projected) {
        const normZ = (p.z + baseR) / (baseR * 2); // 0 (back) to 1 (front)
        const dotR = Math.max(1.4, (p.size * p.scale * 1.1));
        const alpha = Math.max(0.12, Math.min(1, 0.2 + normZ * 0.8));

        ctx.globalAlpha = alpha;

        // Foreground dots glow with golden hot core
        if (normZ > 0.65) {
          ctx.fillStyle = "#ffffff";
        } else if (normZ > 0.35) {
          ctx.fillStyle = "#ffe082";
        } else {
          ctx.fillStyle = "#ffb020";
        }

        ctx.beginPath();
        ctx.arc(p.sx, p.sy, dotR, 0, Math.PI * 2);
        ctx.fill();

        // Ambient glow halo on closest dots
        if (normZ > 0.72) {
          ctx.beginPath();
          ctx.arc(p.sx, p.sy, dotR * 2, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(255, 176, 32, 0.22)";
          ctx.fill();
        }
      }

      ctx.restore();
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, []);

  return <canvas ref={canvasRef} className="h-full w-full" aria-hidden />;
}

// =========================================================================
// 02. CASH-SETTLED FORWARDS — 3D Undulating Volatility Terrain
// A continuous 3D perspective terrain mesh of undulating amber particles
// =========================================================================
export function ForwardMotif() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const GRID_X = 18;
    const GRID_Z = 16;
    const SPACING = 14;

    let clock = 0;
    let lastTime = performance.now();

    const render = (now: number) => {
      animId = requestAnimationFrame(render);
      const dt = Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;
      clock += dt * 1.4;

      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
      }

      ctx.save();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const cx = w / 2;
      const cy = h / 2 - 10;
      const fov = 240;
      const camZ = 220;

      // Fixed pitch angle
      const pitch = 0.65;
      const cosP = Math.cos(pitch), sinP = Math.sin(pitch);
      const yaw = Math.sin(clock * 0.2) * 0.2;
      const cosY = Math.cos(yaw), sinY = Math.sin(yaw);

      const projected: { sx: number; sy: number; z: number; scale: number; hNorm: number }[] = [];

      for (let r = 0; r < GRID_Z; r++) {
        for (let c = 0; c < GRID_X; c++) {
          const u = (c - (GRID_X - 1) / 2) * SPACING;
          const v = (r - (GRID_Z - 1) / 2) * SPACING;

          // Double harmonic wave
          const wave1 = Math.sin((c * 0.45) + clock) * 22;
          const wave2 = Math.cos((r * 0.4) + clock * 0.8) * 16;
          const wave3 = Math.sin((c + r) * 0.35 + clock * 1.2) * 10;
          const y = -(wave1 + wave2 + wave3);

          // Yaw
          const x1 = u * cosY - v * sinY;
          const z1 = u * sinY + v * cosY;

          // Pitch
          const y2 = y * cosP - z1 * sinP;
          const z2 = y * sinP + z1 * cosP;

          const pz = z2 + camZ;
          const scale = fov / Math.max(10, pz);
          const sx = cx + x1 * scale;
          const sy = cy + y2 * scale;

          projected.push({ sx, sy, z: z2, scale, hNorm: (-y + 40) / 80 });
        }
      }

      projected.sort((a, b) => b.z - a.z);

      for (const p of projected) {
        const dotR = Math.max(1.2, 2.6 * p.scale);
        const alpha = Math.max(0.15, Math.min(1, 0.35 + p.hNorm * 0.65));

        ctx.globalAlpha = alpha;
        ctx.fillStyle = p.hNorm > 0.65 ? "#ffffff" : p.hNorm > 0.4 ? "#ffe082" : "#ffb020";

        ctx.beginPath();
        ctx.arc(p.sx, p.sy, dotR, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, []);

  return <canvas ref={canvasRef} className="h-full w-full" aria-hidden />;
}

// =========================================================================
// 03. LIQUIDITY PROVISION — 3D Gyroscopic Orbital Reactor
// 3 tilted concentric particle rings rotating in multi-axis 3D space
// =========================================================================
export function LiquidityMotif() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    // 3 rings with different radii and tilts
    const RINGS = [
      { r: 42, count: 48, tiltX: 0.8, tiltY: 0.3, speed: 0.9, color: "#ffffff" },
      { r: 68, count: 64, tiltX: -0.6, tiltY: 0.7, speed: -0.65, color: "#ffe082" },
      { r: 92, count: 80, tiltX: 0.3, tiltY: -0.9, speed: 0.45, color: "#ffb020" },
    ];

    let clock = 0;
    let lastTime = performance.now();

    const render = (now: number) => {
      animId = requestAnimationFrame(render);
      const dt = Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;
      clock += dt;

      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
      }

      ctx.save();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const cx = w / 2;
      const cy = h / 2;
      const fov = 260;
      const camZ = 210;

      const projected: { sx: number; sy: number; z: number; scale: number; color: string; size: number }[] = [];

      // Central core orb
      const coreBreath = 7 + Math.sin(clock * 3) * 1.5;
      projected.push({ sx: cx, sy: cy, z: 0, scale: 1, color: "#ffb020", size: coreBreath });

      RINGS.forEach((ring) => {
        const ringAngle = clock * ring.speed;
        const cosTX = Math.cos(ring.tiltX), sinTX = Math.sin(ring.tiltX);
        const cosTY = Math.cos(ring.tiltY), sinTY = Math.sin(ring.tiltY);

        for (let i = 0; i < ring.count; i++) {
          const theta = (i / ring.count) * Math.PI * 2 + ringAngle;
          let x = Math.cos(theta) * ring.r;
          let y = Math.sin(theta) * ring.r;
          let z = 0;

          // Tilt X
          const y1 = y * cosTX - z * sinTX;
          const z1 = y * sinTX + z * cosTX;

          // Tilt Y
          const x2 = x * cosTY - z1 * sinTY;
          const z2 = x * sinTY + z1 * cosTY;

          const pz = z2 + camZ;
          const scale = fov / Math.max(10, pz);
          const sx = cx + x2 * scale;
          const sy = cy + y1 * scale;

          projected.push({ sx, sy, z: z2, scale, color: ring.color, size: 2.2 });
        }
      });

      projected.sort((a, b) => b.z - a.z);

      for (const p of projected) {
        const normZ = (p.z + 90) / 180;
        const dotR = Math.max(1.2, p.size * p.scale);
        const alpha = Math.max(0.18, Math.min(1, 0.25 + normZ * 0.75));

        ctx.globalAlpha = alpha;
        ctx.fillStyle = p.color;

        ctx.beginPath();
        ctx.arc(p.sx, p.sy, dotR, 0, Math.PI * 2);
        ctx.fill();

        if (p.size > 5) {
          ctx.beginPath();
          ctx.arc(p.sx, p.sy, dotR * 1.8, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(255, 176, 32, 0.25)";
          ctx.fill();
        }
      }

      ctx.restore();
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, []);

  return <canvas ref={canvasRef} className="h-full w-full" aria-hidden />;
}

// =========================================================================
// 04. ON CHAIN SETTLEMENT — 3D Revolving Dot Matrix Hypercube
// Matching Wintermute Governance (wm_gov.jpg) - 3D cube with 6 matrix dot faces
// =========================================================================
export function SettlementMotif() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    // Build 6 faces of a 3D matrix cube (7 x 7 dots per face)
    const RES = 7;
    const S = 54; // half cube size
    const dots: { x: number; y: number; z: number }[] = [];

    for (let i = 0; i < RES; i++) {
      for (let j = 0; j < RES; j++) {
        const u = -S + (2 * S * i) / (RES - 1);
        const v = -S + (2 * S * j) / (RES - 1);
        // 6 faces: front, back, top, bottom, left, right
        dots.push({ x: u, y: v, z: S });
        dots.push({ x: u, y: v, z: -S });
        dots.push({ x: u, y: S, z: v });
        dots.push({ x: u, y: -S, z: v });
        dots.push({ x: S, y: u, z: v });
        dots.push({ x: -S, y: u, z: v });
      }
    }

    let rotX = 0.5;
    let rotY = 0.5;
    let clock = 0;
    let lastTime = performance.now();

    const render = (now: number) => {
      animId = requestAnimationFrame(render);
      const dt = Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;
      clock += dt;

      rotX += dt * 0.42;
      rotY += dt * 0.58;

      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
      }

      ctx.save();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const cx = w / 2;
      const cy = h / 2;
      const fov = 250;
      const camZ = 190;

      const cosX = Math.cos(rotX), sinX = Math.sin(rotX);
      const cosY = Math.cos(rotY), sinY = Math.sin(rotY);

      const projected = dots.map((d) => {
        // Rotate Y
        const x1 = d.x * cosY - d.z * sinY;
        const z1 = d.x * sinY + d.z * cosY;

        // Rotate X
        const y2 = d.y * cosX - z1 * sinX;
        const z2 = d.y * sinX + z1 * cosX;

        const pz = z2 + camZ;
        const scale = fov / Math.max(10, pz);
        const sx = cx + x1 * scale;
        const sy = cy + y2 * scale;

        return { sx, sy, z: z2, scale };
      });

      projected.sort((a, b) => b.z - a.z);

      for (const p of projected) {
        const normZ = (p.z + S * 1.5) / (S * 3);
        const dotR = Math.max(1.2, 2.3 * p.scale);
        const alpha = Math.max(0.16, Math.min(1, 0.22 + normZ * 0.78));

        ctx.globalAlpha = alpha;
        ctx.fillStyle = normZ > 0.65 ? "#ffffff" : normZ > 0.35 ? "#ffe082" : "#ffb020";

        // Draw crisp square matrix dot (matching wm_gov.jpg)
        const half = dotR;
        ctx.fillRect(p.sx - half, p.sy - half, dotR * 2, dotR * 2);
      }

      ctx.restore();
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, []);

  return <canvas ref={canvasRef} className="h-full w-full" aria-hidden />;
}

// =========================================================================
// 05. ALGORITHMIC TRADING & API — 3D Cyber Streaming Helix Cylinder
// Matching Wintermute Prop Trading (wm_prop.jpg) - 3D matrix particle column
// =========================================================================
export function ApiMotif() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const COLS = 12;
    const ROWS = 20;
    const RADIUS = 62;
    const HEIGHT = 140;

    let clock = 0;
    let lastTime = performance.now();

    const render = (now: number) => {
      animId = requestAnimationFrame(render);
      const dt = Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;
      clock += dt * 1.2;

      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
      }

      ctx.save();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const cx = w / 2;
      const cy = h / 2;
      const fov = 260;
      const camZ = 190;

      // Slight tilt
      const tilt = 0.35;
      const cosT = Math.cos(tilt), sinT = Math.sin(tilt);

      const projected: { sx: number; sy: number; z: number; scale: number; streamSpeed: number }[] = [];

      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const theta = (c / COLS) * Math.PI * 2 + clock * 0.7;
          const yRaw = -HEIGHT / 2 + (r / (ROWS - 1)) * HEIGHT;
          // Upward high-speed data stream flow
          const yStream = ((yRaw + clock * 45) % HEIGHT) - HEIGHT / 2;

          let x = Math.cos(theta) * RADIUS;
          let y = yStream;
          let z = Math.sin(theta) * RADIUS;

          // Tilt
          const y1 = y * cosT - z * sinT;
          const z1 = y * sinT + z * cosT;

          const pz = z1 + camZ;
          const scale = fov / Math.max(10, pz);
          const sx = cx + x * scale;
          const sy = cy + y1 * scale;

          projected.push({ sx, sy, z: z1, scale, streamSpeed: Math.sin(theta * 2 + clock * 4) });
        }
      }

      projected.sort((a, b) => b.z - a.z);

      for (const p of projected) {
        const normZ = (p.z + RADIUS) / (RADIUS * 2);
        const dotR = Math.max(1.2, 2.4 * p.scale);
        const alpha = Math.max(0.15, Math.min(1, 0.25 + normZ * 0.75));

        ctx.globalAlpha = alpha;
        ctx.fillStyle = normZ > 0.65 ? "#ffffff" : normZ > 0.35 ? "#ffe082" : "#ffb020";

        // Draw crisp square matrix dot
        ctx.fillRect(p.sx - dotR, p.sy - dotR, dotR * 2, dotR * 2);
      }

      ctx.restore();
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, []);

  return <canvas ref={canvasRef} className="h-full w-full" aria-hidden />;
}
