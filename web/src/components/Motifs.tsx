"use client";

import { useEffect, useRef } from "react";

// =========================================================================
// 01. OTC SPOT BLOCK — 3D Holographic Geosphere & Neural Constellation Mesh
// A high-resolution 3D Fibonacci sphere of 360 luminous amber nodes,
// interconnected by dynamic proximity lattice filaments, with dual multi-tilt
// orbital gyro rings, core nuclear bloom, and high-tech tactical HUD reticles.
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
    const N = 360; // High-density Fibonacci geosphere
    const baseR = 90;

    // Generate Fibonacci sphere points on unit sphere
    const pts = Array.from({ length: N }, (_, i) => {
      const phi = Math.acos(1 - (2 * (i + 0.5)) / N);
      const theta = Math.PI * (1 + Math.sqrt(5)) * i;
      return {
        ox: Math.sin(phi) * Math.cos(theta),
        oy: Math.cos(phi),
        oz: Math.sin(phi) * Math.sin(theta),
        phase: theta,
        size: 1.6 + Math.random() * 1.6,
        isBeacon: i % 18 === 0, // prominent beacon nodes
      };
    });

    // Precompute geodesic lattice neighbor connections (d < 0.28 on unit sphere)
    const links: [number, number][] = [];
    for (let i = 0; i < N; i++) {
      let count = 0;
      for (let j = i + 1; j < N; j++) {
        const dx = pts[i].ox - pts[j].ox;
        const dy = pts[i].oy - pts[j].oy;
        const dz = pts[i].oz - pts[j].oz;
        const distSq = dx * dx + dy * dy + dz * dz;
        if (distSq < 0.082) {
          links.push([i, j]);
          count++;
          if (count >= 4) break; // max 4 links per node for clean aesthetic
        }
      }
    }

    // Outer Orbital Gyro Ring 1 (inclined at 38 deg)
    const RING_COUNT_1 = 56;
    const ringPts1 = Array.from({ length: RING_COUNT_1 }, (_, i) => ({
      angle: (i / RING_COUNT_1) * Math.PI * 2,
      r: baseR * 1.48,
    }));

    // Outer Orbital Gyro Ring 2 (counter-tilted at -26 deg)
    const RING_COUNT_2 = 44;
    const ringPts2 = Array.from({ length: RING_COUNT_2 }, (_, i) => ({
      angle: (i / RING_COUNT_2) * Math.PI * 2,
      r: baseR * 1.62,
    }));

    let targetRotX = 0.32;
    let targetRotY = 0;
    let rotX = 0.32;
    let rotY = 0;
    let clock = 0;
    let lastTime = performance.now();

    const onMove = (e: PointerEvent) => {
      const b = canvas.getBoundingClientRect();
      const nx = (e.clientX - b.left) / b.width - 0.5;
      const ny = (e.clientY - b.top) / b.height - 0.5;
      targetRotY = nx * 1.4;
      targetRotX = 0.32 + ny * 0.9;
    };
    canvas.addEventListener("pointermove", onMove);

    const render = (now: number) => {
      animId = requestAnimationFrame(render);
      const dt = Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;
      clock += dt;

      // Inertial damping towards mouse + natural continuous spin
      rotY += (targetRotY + clock * 0.38 - rotY) * 0.07;
      rotX += (targetRotX - rotX) * 0.07;

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
      const fov = 320;
      const camZ = 240;

      // 1. Tactical HUD Crosshairs & Corner Reticles
      ctx.strokeStyle = "rgba(255, 176, 32, 0.18)";
      ctx.lineWidth = 1;
      const chSize = 8;
      // Top-left
      ctx.beginPath();
      ctx.moveTo(18, 18); ctx.lineTo(18 + chSize, 18);
      ctx.moveTo(18, 18); ctx.lineTo(18, 18 + chSize);
      // Top-right
      ctx.moveTo(w - 18, 18); ctx.lineTo(w - 18 - chSize, 18);
      ctx.moveTo(w - 18, 18); ctx.lineTo(w - 18, 18 + chSize);
      // Bottom-left
      ctx.moveTo(18, h - 18); ctx.lineTo(18 + chSize, h - 18);
      ctx.moveTo(18, h - 18); ctx.lineTo(18, h - 18 - chSize);
      // Bottom-right
      ctx.moveTo(w - 18, h - 18); ctx.lineTo(w - 18 - chSize, h - 18);
      ctx.moveTo(w - 18, h - 18); ctx.lineTo(w - 18, h - 18 - chSize);
      ctx.stroke();

      // Micro HUD telemetry labels
      ctx.font = "9px 'JetBrains Mono', monospace";
      ctx.fillStyle = "rgba(255, 176, 32, 0.4)";
      ctx.fillText("[EIP-712 ATOMIC ENGINE]", 24, 22);
      ctx.textAlign = "right";
      ctx.fillText("[0.02% SPREAD]", w - 24, 22);
      ctx.fillText("[1-TX SETTLEMENT]", w - 24, h - 18);
      ctx.textAlign = "left";
      ctx.fillText("[NODES: 360]", 24, h - 18);

      // 2. Atmospheric Core Singularity Bloom
      const glowGrad = ctx.createRadialGradient(cx, cy, 4, cx, cy, baseR * 1.6);
      glowGrad.addColorStop(0, "rgba(255, 230, 160, 0.28)");
      glowGrad.addColorStop(0.25, "rgba(255, 176, 32, 0.18)");
      glowGrad.addColorStop(0.65, "rgba(255, 176, 32, 0.04)");
      glowGrad.addColorStop(1, "rgba(255, 176, 32, 0)");
      ctx.fillStyle = glowGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, baseR * 1.6, 0, Math.PI * 2);
      ctx.fill();

      // Dynamic harmonic breathing
      const breath = 1 + Math.sin(clock * 1.8) * 0.04;

      const cosY = Math.cos(rotY), sinY = Math.sin(rotY);
      const cosX = Math.cos(rotX), sinX = Math.sin(rotX);

      // Project Sphere Points
      type Proj = {
        sx: number;
        sy: number;
        z: number;
        scale: number;
        size: number;
        isBeacon: boolean;
      };
      const projSphere: Proj[] = new Array(N);

      for (let i = 0; i < N; i++) {
        const p = pts[i];
        const r = baseR * breath + Math.sin(p.phase * 3 + clock * 2.5) * 5.5;
        const x = p.ox * r;
        const y = p.oy * r;
        const z = p.oz * r;

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

        projSphere[i] = { sx, sy, z: z2, scale, size: p.size, isBeacon: p.isBeacon };
      }

      // 3. Render Geodesic Neural Lattice Filaments
      for (let k = 0; k < links.length; k++) {
        const [i, j] = links[k];
        const p1 = projSphere[i];
        const p2 = projSphere[j];
        const avgZ = (p1.z + p2.z) / 2;
        const normZ = (avgZ + baseR * 1.2) / (baseR * 2.4); // 0 (back) to 1 (front)
        if (normZ <= 0.1) continue;

        const lineAlpha = Math.max(0.04, Math.min(0.42, normZ * 0.45));
        ctx.strokeStyle = `rgba(255, 176, 32, ${lineAlpha})`;
        ctx.lineWidth = normZ > 0.65 ? 0.9 : 0.6;
        ctx.beginPath();
        ctx.moveTo(p1.sx, p1.sy);
        ctx.lineTo(p2.sx, p2.sy);
        ctx.stroke();
      }

      // 4. Project Orbital Ring Points
      type RingProj = { sx: number; sy: number; z: number; scale: number; isPhoton: boolean };
      const ringProjections: RingProj[] = [];

      // Ring 1 (inclined at 38 deg)
      const rTilt1 = 0.65;
      const cosRT1 = Math.cos(rTilt1), sinRT1 = Math.sin(rTilt1);
      const photonAngle1 = (clock * 1.8) % (Math.PI * 2);

      for (let i = 0; i < ringPts1.length; i++) {
        const rp = ringPts1[i];
        const a = rp.angle - clock * 0.55;
        let rx = Math.cos(a) * rp.r;
        let ry = Math.sin(a) * rp.r;
        let rz = 0;

        const ry1 = ry * cosRT1 - rz * sinRT1;
        const rz1 = ry * sinRT1 + rz * cosRT1;

        const rx2 = rx * cosY - rz1 * sinY;
        const rz2 = rx * sinY + rz1 * cosY;

        const ry3 = ry1 * cosX - rz2 * sinX;
        const rz3 = ry1 * sinX + rz2 * cosX;

        const pz = rz3 + camZ;
        const scale = fov / Math.max(10, pz);
        const sx = cx + rx2 * scale;
        const sy = cy + ry3 * scale;

        const angleDist = Math.abs((a % (Math.PI * 2)) - photonAngle1);
        const isPhoton = angleDist < 0.25 || Math.abs(angleDist - Math.PI) < 0.25;

        ringProjections.push({ sx, sy, z: rz3, scale, isPhoton });
      }

      // Ring 2 (counter-inclined at -26 deg)
      const rTilt2 = -0.45;
      const cosRT2 = Math.cos(rTilt2), sinRT2 = Math.sin(rTilt2);
      for (let i = 0; i < ringPts2.length; i++) {
        const rp = ringPts2[i];
        const a = rp.angle + clock * 0.42;
        let rx = Math.cos(a) * rp.r;
        let ry = Math.sin(a) * rp.r;
        let rz = 0;

        const ry1 = ry * cosRT2 - rz * sinRT2;
        const rz1 = ry * sinRT2 + rz * cosRT2;

        const rx2 = rx * cosY - rz1 * sinY;
        const rz2 = rx * sinY + rz1 * cosY;

        const ry3 = ry1 * cosX - rz2 * sinX;
        const rz3 = ry1 * sinX + rz2 * cosX;

        const pz = rz3 + camZ;
        const scale = fov / Math.max(10, pz);
        const sx = cx + rx2 * scale;
        const sy = cy + ry3 * scale;

        ringProjections.push({ sx, sy, z: rz3, scale, isPhoton: false });
      }

      // Combine and depth-sort all elements
      type Renderable =
        | { type: "sphere"; item: Proj }
        | { type: "ring"; item: RingProj };

      const allRenderables: Renderable[] = [
        ...projSphere.map((p) => ({ type: "sphere" as const, item: p })),
        ...ringProjections.map((p) => ({ type: "ring" as const, item: p })),
      ];
      allRenderables.sort((a, b) => b.item.z - a.item.z);

      // 5. Draw 3D Nodes with Depth Color Grading & Optical Sparkles
      for (let k = 0; k < allRenderables.length; k++) {
        const el = allRenderables[k];

        if (el.type === "ring") {
          const rp = el.item;
          const normZ = (rp.z + baseR * 1.5) / (baseR * 3);
          const dotR = rp.isPhoton ? 3.0 : 1.3;
          ctx.globalAlpha = rp.isPhoton ? 0.95 : Math.max(0.12, normZ * 0.55);
          ctx.fillStyle = rp.isPhoton ? "#ffffff" : normZ > 0.5 ? "#ffd27a" : "#d97706";
          ctx.beginPath();
          ctx.arc(rp.sx, rp.sy, dotR, 0, Math.PI * 2);
          ctx.fill();

          if (rp.isPhoton) {
            ctx.beginPath();
            ctx.arc(rp.sx, rp.sy, dotR * 2.8, 0, Math.PI * 2);
            ctx.fillStyle = "rgba(255, 176, 32, 0.4)";
            ctx.fill();
          }
          continue;
        }

        const p = el.item;
        const normZ = (p.z + baseR * 1.3) / (baseR * 2.6); // 0 (back) to 1 (front)
        const dotR = Math.max(1.2, p.size * p.scale * (p.isBeacon ? 1.4 : 1.15));

        const alpha = Math.max(0.14, Math.min(1, 0.2 + normZ * 0.82));
        ctx.globalAlpha = alpha;

        // Luxurious 4-tier color palette
        if (normZ > 0.75) {
          ctx.fillStyle = "#ffffff";
        } else if (normZ > 0.48) {
          ctx.fillStyle = "#ffe494";
        } else if (normZ > 0.22) {
          ctx.fillStyle = "#ffb020";
        } else {
          ctx.fillStyle = "#b45309";
        }

        ctx.beginPath();
        ctx.arc(p.sx, p.sy, dotR, 0, Math.PI * 2);
        ctx.fill();

        // High-end luminous corona on foreground points
        if (normZ > 0.68) {
          ctx.beginPath();
          ctx.arc(p.sx, p.sy, dotR * 2.4, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(255, 176, 32, 0.28)";
          ctx.fill();
        }

        // Diamond diffraction sparkle on beacon nodes facing viewer
        if (p.isBeacon && normZ > 0.78) {
          ctx.strokeStyle = "rgba(255, 255, 255, 0.75)";
          ctx.lineWidth = 1;
          const spk = dotR * 3.2;
          ctx.beginPath();
          ctx.moveTo(p.sx - spk, p.sy); ctx.lineTo(p.sx + spk, p.sy);
          ctx.moveTo(p.sx, p.sy - spk); ctx.lineTo(p.sx, p.sy + spk);
          ctx.stroke();
        }
      }

      ctx.restore();
    };

    animId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animId);
      canvas.removeEventListener("pointermove", onMove);
    };
  }, []);

  return <canvas ref={canvasRef} className="h-full w-full" aria-hidden />;
}

// =========================================================================
// 02. CASH-SETTLED FORWARDS — 3D Volatility Surface & Oracle Contour Grid
// 3D perspective terrain with dual-axis wireframe grid, vertical drop-lines
// from peak volatility crests down to baseline, dynamic forward wave pulses,
// and diamond oracle lock markers.
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
    const GRID_X = 24;
    const GRID_Z = 20;
    const SPACING_X = 14;
    const SPACING_Z = 13;

    let targetPitch = 0.65;
    let targetYaw = 0;
    let pitch = 0.65;
    let yaw = 0;
    let clock = 0;
    let lastTime = performance.now();

    const onMove = (e: PointerEvent) => {
      const b = canvas.getBoundingClientRect();
      const nx = (e.clientX - b.left) / b.width - 0.5;
      const ny = (e.clientY - b.top) / b.height - 0.5;
      targetYaw = nx * 0.6;
      targetPitch = 0.65 + ny * 0.4;
    };
    canvas.addEventListener("pointermove", onMove);

    const render = (now: number) => {
      animId = requestAnimationFrame(render);
      const dt = Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;
      clock += dt * 1.35;

      yaw += (targetYaw + Math.sin(clock * 0.35) * 0.14 - yaw) * 0.08;
      pitch += (targetPitch - pitch) * 0.08;

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
      const fov = 290;
      const camZ = 235;

      const cosP = Math.cos(pitch), sinP = Math.sin(pitch);
      const cosY = Math.cos(yaw), sinY = Math.sin(yaw);

      // Tactical HUD reticles
      ctx.strokeStyle = "rgba(255, 176, 32, 0.18)";
      ctx.lineWidth = 1;
      const ch = 8;
      ctx.beginPath();
      ctx.moveTo(18, 18); ctx.lineTo(18 + ch, 18);
      ctx.moveTo(18, 18); ctx.lineTo(18, 18 + ch);
      ctx.moveTo(w - 18, 18); ctx.lineTo(w - 18 - ch, 18);
      ctx.moveTo(w - 18, 18); ctx.lineTo(w - 18, 18 + ch);
      ctx.stroke();

      ctx.font = "9px 'JetBrains Mono', monospace";
      ctx.fillStyle = "rgba(255, 176, 32, 0.4)";
      ctx.fillText("[TENOR MATRIX: 1W → 90D]", 24, 22);
      ctx.textAlign = "right";
      ctx.fillText("[CHAINLINK 16:00 ET]", w - 24, 22);
      ctx.textAlign = "left";

      // Atmospheric background gradient
      const bgGrad = ctx.createRadialGradient(cx, cy + 18, 10, cx, cy + 18, w * 0.52);
      bgGrad.addColorStop(0, "rgba(255, 176, 32, 0.16)");
      bgGrad.addColorStop(0.7, "rgba(255, 176, 32, 0.02)");
      bgGrad.addColorStop(1, "rgba(255, 176, 32, 0)");
      ctx.fillStyle = bgGrad;
      ctx.beginPath();
      ctx.arc(cx, cy + 18, w * 0.52, 0, Math.PI * 2);
      ctx.fill();

      type Node = {
        sx: number;
        sy: number;
        z: number;
        scale: number;
        hNorm: number;
        baseSy: number;
        isPeak: boolean;
      };
      const grid: Node[][] = [];

      for (let r = 0; r < GRID_Z; r++) {
        const rowNodes: Node[] = [];
        for (let c = 0; c < GRID_X; c++) {
          const u = (c - (GRID_X - 1) / 2) * SPACING_X;
          const v = (r - (GRID_Z - 1) / 2) * SPACING_Z;

          // Triple harmonic volatility function
          const wave1 = Math.sin(c * 0.38 + clock * 1.2) * 22;
          const wave2 = Math.cos(r * 0.35 + clock * 0.9) * 16;
          const wave3 = Math.sin((c + r) * 0.26 + clock * 1.4) * 10;
          const y = -(wave1 + wave2 + wave3);

          // Yaw
          const x1 = u * cosY - v * sinY;
          const z1 = u * sinY + v * cosY;

          // Pitch (elevated surface node)
          const y2 = y * cosP - z1 * sinP;
          const z2 = y * sinP + z1 * cosP;

          const pz = z2 + camZ;
          const scale = fov / Math.max(10, pz);
          const sx = cx + x1 * scale;
          const sy = cy + y2 * scale;

          // Baseline floor projection (at y = 35)
          const yFloor = 35 * cosP - z1 * sinP;
          const baseSy = cy + yFloor * scale;

          const hNorm = (-y + 36) / 78; // 0 to 1
          rowNodes.push({ sx, sy, z: z2, scale, hNorm, baseSy, isPeak: hNorm > 0.78 });
        }
        grid.push(rowNodes);
      }

      // 1. Draw Longitudinal Grid Lines (along columns Z)
      for (let c = 0; c < GRID_X; c += 2) {
        ctx.beginPath();
        for (let r = 0; r < GRID_Z; r++) {
          const p = grid[r][c];
          if (r === 0) ctx.moveTo(p.sx, p.sy);
          else ctx.lineTo(p.sx, p.sy);
        }
        ctx.strokeStyle = "rgba(255, 176, 32, 0.12)";
        ctx.lineWidth = 0.75;
        ctx.stroke();
      }

      // 2. Draw Transverse Contour Grid Lines (along rows X)
      for (let r = 0; r < GRID_Z; r++) {
        ctx.beginPath();
        for (let c = 0; c < GRID_X; c++) {
          const p = grid[r][c];
          if (c === 0) ctx.moveTo(p.sx, p.sy);
          else ctx.lineTo(p.sx, p.sy);
        }
        const depthAlpha = Math.max(0.08, 0.42 * (1 - r / GRID_Z));
        ctx.strokeStyle = `rgba(255, 176, 32, ${depthAlpha})`;
        ctx.lineWidth = r % 4 === 0 ? 1.2 : 0.8;
        ctx.stroke();
      }

      // 3. Flatten and depth sort nodes
      const allPoints: Node[] = [];
      for (const row of grid) {
        for (const pt of row) {
          allPoints.push(pt);
        }
      }
      allPoints.sort((a, b) => b.z - a.z);

      // 4. Render Nodes & Vertical Projection Drop Lines
      for (const p of allPoints) {
        // Vertical drop line on peak nodes
        if (p.isPeak) {
          ctx.strokeStyle = "rgba(255, 176, 32, 0.22)";
          ctx.lineWidth = 0.8;
          ctx.setLineDash([2, 3]);
          ctx.beginPath();
          ctx.moveTo(p.sx, p.sy);
          ctx.lineTo(p.sx, p.baseSy);
          ctx.stroke();
          ctx.setLineDash([]);
        }

        const dotR = Math.max(1.2, 2.6 * p.scale);
        const alpha = Math.max(0.18, Math.min(1, 0.25 + p.hNorm * 0.75));

        ctx.globalAlpha = alpha;
        ctx.fillStyle = p.hNorm > 0.72 ? "#ffffff" : p.hNorm > 0.45 ? "#ffe494" : "#ffb020";

        ctx.beginPath();
        ctx.arc(p.sx, p.sy, dotR, 0, Math.PI * 2);
        ctx.fill();

        // Apex diamond spark on highest wave peaks
        if (p.hNorm > 0.78) {
          ctx.beginPath();
          ctx.arc(p.sx, p.sy, dotR * 2.4, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(255, 230, 160, 0.35)";
          ctx.fill();

          ctx.strokeStyle = "rgba(255, 255, 255, 0.8)";
          ctx.lineWidth = 1;
          const spk = dotR * 3;
          ctx.beginPath();
          ctx.moveTo(p.sx - spk, p.sy); ctx.lineTo(p.sx + spk, p.sy);
          ctx.moveTo(p.sx, p.sy - spk); ctx.lineTo(p.sx, p.sy + spk);
          ctx.stroke();
        }
      }

      ctx.restore();
    };

    animId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animId);
      canvas.removeEventListener("pointermove", onMove);
    };
  }, []);

  return <canvas ref={canvasRef} className="h-full w-full" aria-hidden />;
}

// =========================================================================
// 03. LIQUIDITY PROVISION — 3D Quantum Gyroscopic Reactor
// 5 concentric multi-axis particle rings rotating in 3D Euler space,
// with tangential laser conduits connecting opposite poles, central plasma
// core, and high-speed liquidity particle showers.
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

    const RINGS = [
      { r: 36, count: 42, tiltX: 0.95, tiltY: 0.2, speed: 1.25, color: "#ffffff", size: 2.4 },
      { r: 62, count: 58, tiltX: -0.72, tiltY: 0.8, speed: -0.85, color: "#ffe494", size: 2.2 },
      { r: 88, count: 74, tiltX: 0.5, tiltY: -0.88, speed: 0.6, color: "#ffb020", size: 2.0 },
      { r: 112, count: 88, tiltX: -0.35, tiltY: 0.45, speed: -0.4, color: "#d97706", size: 1.8 },
      { r: 136, count: 96, tiltX: 0.22, tiltY: -0.3, speed: 0.28, color: "#b45309", size: 1.6 },
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
      const fov = 320;
      const camZ = 240;

      // Tactical HUD reticles
      ctx.strokeStyle = "rgba(255, 176, 32, 0.18)";
      ctx.lineWidth = 1;
      const ch = 8;
      ctx.beginPath();
      ctx.moveTo(18, 18); ctx.lineTo(18 + ch, 18);
      ctx.moveTo(18, 18); ctx.lineTo(18, 18 + ch);
      ctx.moveTo(w - 18, 18); ctx.lineTo(w - 18 - ch, 18);
      ctx.moveTo(w - 18, 18); ctx.lineTo(w - 18, 18 + ch);
      ctx.stroke();

      ctx.font = "9px 'JetBrains Mono', monospace";
      ctx.fillStyle = "rgba(255, 176, 32, 0.4)";
      ctx.fillText("[WS: /mm/ws ACTIVE]", 24, 22);
      ctx.textAlign = "right";
      ctx.fillText("[ROUTING: ARCUS + LIGHTER]", w - 24, 22);
      ctx.textAlign = "left";

      // Central core reactor ambient halo
      const coreBreath = 9 + Math.sin(clock * 3.5) * 2;
      const coreGrad = ctx.createRadialGradient(cx, cy, 3, cx, cy, 88);
      coreGrad.addColorStop(0, "rgba(255, 255, 255, 0.5)");
      coreGrad.addColorStop(0.2, "rgba(255, 220, 140, 0.35)");
      coreGrad.addColorStop(0.55, "rgba(255, 176, 32, 0.08)");
      coreGrad.addColorStop(1, "rgba(255, 176, 32, 0)");
      ctx.fillStyle = coreGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, 88, 0, Math.PI * 2);
      ctx.fill();

      type Dot = {
        sx: number;
        sy: number;
        z: number;
        scale: number;
        color: string;
        size: number;
        isCore?: boolean;
      };
      const projected: Dot[] = [];

      // Central core singularity
      projected.push({ sx: cx, sy: cy, z: 0, scale: 1, color: "#ffffff", size: coreBreath, isCore: true });

      // Project all concentric orbital rings
      RINGS.forEach((ring) => {
        const ringAngle = clock * ring.speed;
        const cosTX = Math.cos(ring.tiltX), sinTX = Math.sin(ring.tiltX);
        const cosTY = Math.cos(ring.tiltY), sinTY = Math.sin(ring.tiltY);

        for (let i = 0; i < ring.count; i++) {
          const theta = (i / ring.count) * Math.PI * 2 + ringAngle;
          let x = Math.cos(theta) * ring.r;
          let y = Math.sin(theta) * ring.r;
          let z = 0;

          // Multi-axis rotation
          const y1 = y * cosTX - z * sinTX;
          const z1 = y * sinTX + z * cosTX;

          const x2 = x * cosTY - z1 * sinTY;
          const z2 = x * sinTY + z1 * cosTY;

          const pz = z2 + camZ;
          const scale = fov / Math.max(10, pz);
          const sx = cx + x2 * scale;
          const sy = cy + y1 * scale;

          projected.push({ sx, sy, z: z2, scale, color: ring.color, size: ring.size });
        }
      });

      projected.sort((a, b) => b.z - a.z);

      for (const p of projected) {
        if (p.isCore) {
          // Solid incandescent central plasma core
          ctx.globalAlpha = 1;
          ctx.fillStyle = "#ffffff";
          ctx.beginPath();
          ctx.arc(p.sx, p.sy, p.size, 0, Math.PI * 2);
          ctx.fill();

          ctx.beginPath();
          ctx.arc(p.sx, p.sy, p.size * 1.8, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(255, 176, 32, 0.4)";
          ctx.fill();
          continue;
        }

        const normZ = (p.z + 110) / 220;
        const dotR = Math.max(1.1, p.size * p.scale);
        const alpha = Math.max(0.18, Math.min(1, 0.22 + normZ * 0.78));

        ctx.globalAlpha = alpha;
        ctx.fillStyle = p.color;

        ctx.beginPath();
        ctx.arc(p.sx, p.sy, dotR, 0, Math.PI * 2);
        ctx.fill();

        // Orbital beacon glow
        if (normZ > 0.72) {
          ctx.beginPath();
          ctx.arc(p.sx, p.sy, dotR * 2.3, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(255, 176, 32, 0.32)";
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
// 04. ON CHAIN SETTLEMENT — 3D Cryptographic Tesseract & Hypercube Vault
// True 3D wireframe hypercube with 8 outer vertices, 8 inner vertices,
// diagonal hypercube interconnects, 6 matrix dot face facets, and periodic
// block settlement shockwaves.
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

    const RES = 8;
    const S = 60; // Outer cube size
    const S_IN = 30; // Inner cube size

    // Outer and Inner Vertices (8 each)
    const vOuter = [
      [-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1],
      [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1],
    ].map(([x, y, z]) => ({ x: x * S, y: y * S, z: z * S }));

    const vInner = [
      [-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1],
      [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1],
    ].map(([x, y, z]) => ({ x: x * S_IN, y: y * S_IN, z: z * S_IN }));

    // Cube Edge Pairs (0-3: bottom loop, 4-7: top loop, 0-4 etc: verticals)
    const cubeEdges: [number, number][] = [
      [0, 1], [1, 2], [2, 3], [3, 0],
      [4, 5], [5, 6], [6, 7], [7, 4],
      [0, 4], [1, 5], [2, 6], [3, 7],
    ];

    // Face Matrix Dots
    const dots: { x: number; y: number; z: number }[] = [];
    for (let i = 0; i < RES; i++) {
      for (let j = 0; j < RES; j++) {
        const u = -S + (2 * S * i) / (RES - 1);
        const v = -S + (2 * S * j) / (RES - 1);
        dots.push({ x: u, y: v, z: S });
        dots.push({ x: u, y: v, z: -S });
        dots.push({ x: u, y: S, z: v });
        dots.push({ x: u, y: -S, z: v });
      }
    }

    let rotX = 0.55;
    let rotY = 0.55;
    let clock = 0;
    let lastTime = performance.now();

    const render = (now: number) => {
      animId = requestAnimationFrame(render);
      const dt = Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;
      clock += dt;

      rotX += dt * 0.42;
      rotY += dt * 0.56;

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
      const fov = 300;
      const camZ = 220;

      // Tactical HUD reticles
      ctx.strokeStyle = "rgba(255, 176, 32, 0.18)";
      ctx.lineWidth = 1;
      const ch = 8;
      ctx.beginPath();
      ctx.moveTo(18, 18); ctx.lineTo(18 + ch, 18);
      ctx.moveTo(18, 18); ctx.lineTo(18, 18 + ch);
      ctx.moveTo(w - 18, 18); ctx.lineTo(w - 18 - ch, 18);
      ctx.moveTo(w - 18, 18); ctx.lineTo(w - 18, 18 + ch);
      ctx.stroke();

      ctx.font = "9px 'JetBrains Mono', monospace";
      ctx.fillStyle = "rgba(255, 176, 32, 0.4)";
      ctx.fillText("[1-TX ALL-OR-REVERT]", 24, 22);
      ctx.textAlign = "right";
      ctx.fillText("[SLITHER AUDITED]", w - 24, 22);
      ctx.textAlign = "left";

      // Settlement block atomic shockwave ripple
      const wavePhase = (clock * 0.5) % 1; // 0 to 1 every 2s
      const waveRadius = wavePhase * 140;
      const waveAlpha = (1 - wavePhase) * 0.35;
      ctx.strokeStyle = `rgba(255, 176, 32, ${waveAlpha})`;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(cx, cy, waveRadius, 0, Math.PI * 2);
      ctx.stroke();

      // Ambient vault backdrop
      const bgGrad = ctx.createRadialGradient(cx, cy, 5, cx, cy, 105);
      bgGrad.addColorStop(0, "rgba(255, 176, 32, 0.22)");
      bgGrad.addColorStop(0.6, "rgba(255, 176, 32, 0.04)");
      bgGrad.addColorStop(1, "rgba(255, 176, 32, 0)");
      ctx.fillStyle = bgGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, 105, 0, Math.PI * 2);
      ctx.fill();

      const cosX = Math.cos(rotX), sinX = Math.sin(rotX);
      const cosY = Math.cos(rotY), sinY = Math.sin(rotY);

      const project3D = (pt: { x: number; y: number; z: number }) => {
        const x1 = pt.x * cosY - pt.z * sinY;
        const z1 = pt.x * sinY + pt.z * cosY;
        const y2 = pt.y * cosX - z1 * sinX;
        const z2 = pt.y * sinX + z1 * cosX;
        const pz = z2 + camZ;
        const scale = fov / Math.max(10, pz);
        return { sx: cx + x1 * scale, sy: cy + y2 * scale, z: z2, scale };
      };

      // Project vertices
      const projOuter = vOuter.map(project3D);

      // Inner vertices counter-rotate slightly
      const spin = clock * 0.35;
      const cs = Math.cos(spin), ss = Math.sin(spin);
      const projInner = vInner.map((v) => {
        const rx = v.x * cs - v.z * ss;
        const rz = v.x * ss + v.z * cs;
        return project3D({ x: rx, y: v.y, z: rz });
      });

      // 1. Draw Hypercube Connecting Beams (outer to inner vertices)
      for (let i = 0; i < 8; i++) {
        ctx.strokeStyle = "rgba(255, 176, 32, 0.28)";
        ctx.lineWidth = 0.9;
        ctx.beginPath();
        ctx.moveTo(projOuter[i].sx, projOuter[i].sy);
        ctx.lineTo(projInner[i].sx, projInner[i].sy);
        ctx.stroke();
      }

      // 2. Draw Outer Cube Wireframe
      for (const [i, j] of cubeEdges) {
        ctx.strokeStyle = "rgba(255, 176, 32, 0.55)";
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        ctx.moveTo(projOuter[i].sx, projOuter[i].sy);
        ctx.lineTo(projOuter[j].sx, projOuter[j].sy);
        ctx.stroke();
      }

      // 3. Draw Inner Cube Wireframe
      for (const [i, j] of cubeEdges) {
        ctx.strokeStyle = "rgba(255, 230, 160, 0.75)";
        ctx.lineWidth = 1.0;
        ctx.beginPath();
        ctx.moveTo(projInner[i].sx, projInner[i].sy);
        ctx.lineTo(projInner[j].sx, projInner[j].sy);
        ctx.stroke();
      }

      // 4. Project and Draw Face Matrix Dots
      const projDots = dots.map(project3D);
      projDots.sort((a, b) => b.z - a.z);

      for (const p of projDots) {
        const normZ = (p.z + S * 1.4) / (S * 2.8);
        const dotR = Math.max(1.1, 2.2 * p.scale);
        const alpha = Math.max(0.18, Math.min(1, 0.2 + normZ * 0.8));

        ctx.globalAlpha = alpha;
        ctx.fillStyle = normZ > 0.7 ? "#ffffff" : normZ > 0.4 ? "#ffe494" : "#ffb020";

        // Draw crisp square matrix pixel
        ctx.fillRect(p.sx - dotR, p.sy - dotR, dotR * 2, dotR * 2);
      }

      // 5. Draw Vertex Anchor Points
      for (const v of [...projOuter, ...projInner]) {
        ctx.globalAlpha = 1;
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(v.sx, v.sy, 2.8 * v.scale, 0, Math.PI * 2);
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
// 05. ALGORITHMIC TRADING & API — 3D Cyber Dual-Helix & Laser Quoting Pipeline
// High-frequency dual-helix particle conduit with horizontal base-pair rungs,
// central photonic laser axis with high-speed packet shooting, and concentric
// radar telemetry rings.
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
    const STEPS = 44;
    const RADIUS = 68;
    const HEIGHT = 160;

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
      const cy = h / 2;
      const fov = 300;
      const camZ = 230;

      // Tactical HUD reticles
      ctx.strokeStyle = "rgba(255, 176, 32, 0.18)";
      ctx.lineWidth = 1;
      const ch = 8;
      ctx.beginPath();
      ctx.moveTo(18, 18); ctx.lineTo(18 + ch, 18);
      ctx.moveTo(18, 18); ctx.lineTo(18, 18 + ch);
      ctx.moveTo(w - 18, 18); ctx.lineTo(w - 18 - ch, 18);
      ctx.moveTo(w - 18, 18); ctx.lineTo(w - 18, 18 + ch);
      ctx.stroke();

      ctx.font = "9px 'JetBrains Mono', monospace";
      ctx.fillStyle = "rgba(255, 176, 32, 0.4)";
      ctx.fillText("[WS QUOTE LATENCY: <12MS]", 24, 22);
      ctx.textAlign = "right";
      ctx.fillText("[EIP-712 TYPED DATA]", w - 24, 22);
      ctx.textAlign = "left";

      // Ambient cylinder glow
      const bgGrad = ctx.createRadialGradient(cx, cy, 10, cx, cy, 95);
      bgGrad.addColorStop(0, "rgba(255, 176, 32, 0.2)");
      bgGrad.addColorStop(0.7, "rgba(255, 176, 32, 0.03)");
      bgGrad.addColorStop(1, "rgba(255, 176, 32, 0)");
      ctx.fillStyle = bgGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, 95, 0, Math.PI * 2);
      ctx.fill();

      // Pitch & continuous rotation
      const pitch = 0.36;
      const rotY = clock * 0.65;

      const cosP = Math.cos(pitch), sinP = Math.sin(pitch);
      const cosY = Math.cos(rotY), sinY = Math.sin(rotY);

      const project3D = (x: number, y: number, z: number) => {
        const x1 = x * cosY - z * sinY;
        const z1 = x * sinY + z * cosY;
        const y2 = y * cosP - z1 * sinP;
        const z2 = y * sinP + z1 * cosP;
        const pz = z2 + camZ;
        const scale = fov / Math.max(10, pz);
        return { sx: cx + x1 * scale, sy: cy + y2 * scale, z: z2, scale };
      };

      // 1. Central Photonic Laser Core Axis
      const topAxis = project3D(0, -HEIGHT / 2, 0);
      const botAxis = project3D(0, HEIGHT / 2, 0);
      ctx.strokeStyle = "rgba(255, 230, 160, 0.35)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(topAxis.sx, topAxis.sy);
      ctx.lineTo(botAxis.sx, botAxis.sy);
      ctx.stroke();

      // High-speed photon packets shooting vertically
      for (let p = 0; p < 4; p++) {
        const packetY = ((clock * 95 + p * (HEIGHT / 4)) % HEIGHT) - HEIGHT / 2;
        const pt = project3D(0, packetY, 0);
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(pt.sx, pt.sy, 3.2 * pt.scale, 0, Math.PI * 2);
        ctx.fill();

        ctx.beginPath();
        ctx.arc(pt.sx, pt.sy, 6.5 * pt.scale, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255, 176, 32, 0.45)";
        ctx.fill();
      }

      // 2. Dual-Helix Strands and Rungs
      type HelixNode = { sx: number; sy: number; z: number; scale: number; strand: number };
      const strandA: HelixNode[] = [];
      const strandB: HelixNode[] = [];

      for (let i = 0; i < STEPS; i++) {
        const yNorm = (i / (STEPS - 1) - 0.5) * HEIGHT;
        const theta = (i / STEPS) * Math.PI * 4;

        const xA = Math.cos(theta) * RADIUS;
        const zA = Math.sin(theta) * RADIUS;
        strandA.push({ ...project3D(xA, yNorm, zA), strand: 0 });

        const xB = Math.cos(theta + Math.PI) * RADIUS;
        const zB = Math.sin(theta + Math.PI) * RADIUS;
        strandB.push({ ...project3D(xB, yNorm, zB), strand: 1 });
      }

      // Draw connecting base-pair rungs
      for (let i = 0; i < STEPS; i += 2) {
        const pA = strandA[i];
        const pB = strandB[i];
        const avgZ = (pA.z + pB.z) / 2;
        const normZ = (avgZ + RADIUS) / (RADIUS * 2);

        ctx.strokeStyle = `rgba(255, 176, 32, ${Math.max(0.12, normZ * 0.45)})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(pA.sx, pA.sy);
        ctx.lineTo(pB.sx, pB.sy);
        ctx.stroke();
      }

      // Draw helix strand nodes
      const allHelix = [...strandA, ...strandB];
      allHelix.sort((a, b) => b.z - a.z);

      for (const p of allHelix) {
        const normZ = (p.z + RADIUS) / (RADIUS * 2);
        const dotR = Math.max(1.2, 2.6 * p.scale);
        const alpha = Math.max(0.2, Math.min(1, 0.25 + normZ * 0.75));

        ctx.globalAlpha = alpha;
        ctx.fillStyle = normZ > 0.7 ? "#ffffff" : normZ > 0.4 ? "#ffe494" : "#ffb020";

        ctx.beginPath();
        ctx.arc(p.sx, p.sy, dotR, 0, Math.PI * 2);
        ctx.fill();

        if (normZ > 0.7) {
          ctx.beginPath();
          ctx.arc(p.sx, p.sy, dotR * 2.2, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(255, 176, 32, 0.32)";
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
