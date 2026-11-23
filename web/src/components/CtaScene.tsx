"use client";

import { useEffect, useRef, useState } from "react";

type Packet = {
  lineIndex: number;
  progress: number;
  speed: number;
  length: number;
  color: string;
  lead: boolean;
};

type Shockwave = {
  radius: number;
  maxRadius: number;
  alpha: number;
};

export default function CtaScene() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [phaseText, setPhaseText] = useState("SETTLED");
  const [fillCount, setFillCount] = useState(1);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let w = 0;
    let h = 0;
    let dpr = 1;

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      const b = canvas.getBoundingClientRect();
      w = b.width;
      h = b.height;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    // Mouse tracking
    const mouse = { x: -9999, y: -9999, active: false };
    const onMove = (e: PointerEvent) => {
      const b = canvas.getBoundingClientRect();
      mouse.x = e.clientX - b.left;
      mouse.y = e.clientY - b.top;
      mouse.active = true;
    };
    const onLeave = () => {
      mouse.active = false;
      mouse.x = -9999;
      mouse.y = -9999;
    };
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerleave", onLeave);

    // Setup network lines
    const lineCount = 21;
    const winningIndex = 10; // Center line is the winning execution path

    // Photons / RFQ streaming packets
    const packets: Packet[] = [];
    for (let i = 0; i < 42; i++) {
      const isLead = Math.random() < 0.22;
      packets.push({
        lineIndex: Math.floor(Math.random() * lineCount),
        progress: Math.random(),
        speed: 0.35 + Math.random() * 0.45,
        length: 12 + Math.random() * 24,
        color: isLead ? "#ffffff" : Math.random() < 0.6 ? "#ffb020" : "#ffd27a",
        lead: isLead,
      });
    }

    const shockwaves: Shockwave[] = [];
    let lastSettlementTime = 0;
    let rotationAngle = 0;
    let clock = 0;
    let lastTime = performance.now();
    let animId = 0;

    const spawnSettlementPulse = () => {
      shockwaves.push({
        radius: 10,
        maxRadius: Math.max(w, h) * 0.85,
        alpha: 0.9,
      });
      setFillCount((prev) => (prev < 999 ? prev + 1 : 1));
    };

    const render = (now: number) => {
      animId = requestAnimationFrame(render);
      const dt = Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;
      clock += dt;
      rotationAngle += dt * 0.65;

      if (!w || !h) return;

      ctx.clearRect(0, 0, w, h);

      // Core anchor geometry (responsive layout)
      const isMobile = w < 640;
      const boxW = isMobile ? Math.min(140, w * 0.36) : Math.min(176, w * 0.3);
      const boxH = isMobile ? Math.min(140, h * 0.65) : Math.min(170, h * 0.58);
      const coreX = isMobile ? w * 0.78 : w * 0.76;
      const coreY = h * 0.5;

      const vaultLeft = coreX - boxW / 2;
      const vaultTop = coreY - boxH / 2;
      const targetX = vaultLeft;
      const targetY = coreY;

      // Settlement lifecycle timing (every 3.8s)
      const cycleLength = 3.8;
      const cycleTime = clock % cycleLength;
      const isSettling = cycleTime > 2.5 && cycleTime < 3.2;

      // Trigger atomic settlement event once per cycle
      if (cycleTime > 2.7 && lastSettlementTime !== Math.floor(clock / cycleLength)) {
        lastSettlementTime = Math.floor(clock / cycleLength);
        spawnSettlementPulse();
      }

      // 1. Draw Network RFQ Bus Lines
      const busLines: { startY: number; elbowX: number; path: { x: number; y: number }[] }[] = [];
      const lineSpread = (h * 0.88) / (lineCount - 1);
      const startBaseY = h * 0.06;

      for (let i = 0; i < lineCount; i++) {
        const startY = startBaseY + i * lineSpread;
        const distFromCenter = Math.abs(i - winningIndex);
        const elbowX = Math.max(
          w * 0.22,
          targetX - 70 - distFromCenter * (isMobile ? 5 : 9)
        );

        const isWin = i === winningIndex;

        // Path: (0, startY) -> (elbowX, startY) -> (targetX, targetY)
        ctx.beginPath();
        ctx.moveTo(0, startY);
        ctx.lineTo(elbowX, startY);
        ctx.lineTo(targetX, targetY);

        if (isWin) {
          // Winning execution path: radiant glowing amber
          ctx.strokeStyle = "rgba(255, 176, 32, 0.4)";
          ctx.lineWidth = 1.8;
          ctx.stroke();

          // Core inner beam
          ctx.beginPath();
          ctx.moveTo(0, startY);
          ctx.lineTo(elbowX, startY);
          ctx.lineTo(targetX, targetY);
          ctx.strokeStyle = isSettling ? "#ffffff" : "rgba(255, 210, 122, 0.85)";
          ctx.lineWidth = isSettling ? 2.5 : 1.2;
          ctx.stroke();
        } else {
          // Inactive / competing maker lines
          ctx.strokeStyle = "rgba(42, 47, 61, 0.55)";
          ctx.lineWidth = 1;
          ctx.stroke();
        }

        busLines.push({
          startY,
          elbowX,
          path: [
            { x: 0, y: startY },
            { x: elbowX, y: startY },
            { x: targetX, y: targetY },
          ],
        });
      }

      // 2. Animate Streaming Photons along the lines
      for (let i = 0; i < packets.length; i++) {
        const p = packets[i];
        p.progress += dt * p.speed * (isSettling && p.lineIndex === winningIndex ? 1.6 : 1);
        if (p.progress > 1) {
          p.progress = 0;
          p.lineIndex = Math.random() < 0.35 ? winningIndex : Math.floor(Math.random() * lineCount);
        }

        const line = busLines[p.lineIndex];
        if (!line) continue;

        // Calculate position along 2-segment polyline: (0, startY) -> (elbowX, startY) -> (targetX, targetY)
        const d1 = line.elbowX;
        const d2 = Math.hypot(targetX - line.elbowX, targetY - line.startY);
        const totalLen = d1 + d2;
        const curDist = p.progress * totalLen;

        let px = 0;
        let py = 0;
        let angle = 0;

        if (curDist <= d1) {
          px = curDist;
          py = line.startY;
          angle = 0;
        } else {
          const t2 = (curDist - d1) / d2;
          px = line.elbowX + (targetX - line.elbowX) * t2;
          py = line.startY + (targetY - line.startY) * t2;
          angle = Math.atan2(targetY - line.startY, targetX - line.elbowX);
        }

        // Draw packet with gradient comet trail
        const trailLen = p.length;
        const tailX = px - Math.cos(angle) * trailLen;
        const tailY = py - Math.sin(angle) * trailLen;

        const grad = ctx.createLinearGradient(tailX, tailY, px, py);
        grad.addColorStop(0, "rgba(255, 176, 32, 0)");
        grad.addColorStop(0.7, p.lead ? "rgba(255, 210, 122, 0.7)" : "rgba(255, 176, 32, 0.5)");
        grad.addColorStop(1, p.color);

        ctx.beginPath();
        ctx.moveTo(tailX, tailY);
        ctx.lineTo(px, py);
        ctx.strokeStyle = grad;
        ctx.lineWidth = p.lead || p.lineIndex === winningIndex ? 2.2 : 1.4;
        ctx.stroke();

        // Luminous head spark
        ctx.beginPath();
        ctx.arc(px, py, p.lead ? 2.4 : 1.6, 0, 6.283);
        ctx.fillStyle = p.lead ? "#ffffff" : p.color;
        ctx.fill();
      }

      // 3. Expanding Shockwaves on Atomic Settlement
      for (let i = shockwaves.length - 1; i >= 0; i--) {
        const sw = shockwaves[i];
        sw.radius += dt * 380;
        sw.alpha = Math.max(0, 0.9 * (1 - sw.radius / sw.maxRadius));

        if (sw.alpha <= 0.01 || sw.radius >= sw.maxRadius) {
          shockwaves.splice(i, 1);
          continue;
        }

        // Concentric harmonic ripples
        ctx.beginPath();
        ctx.arc(coreX, coreY, sw.radius, 0, 6.283);
        ctx.strokeStyle = `rgba(255, 176, 32, ${sw.alpha * 0.4})`;
        ctx.lineWidth = 1.5;
        ctx.stroke();

        if (sw.radius > 30) {
          ctx.beginPath();
          ctx.arc(coreX, coreY, sw.radius * 0.72, 0, 6.283);
          ctx.strokeStyle = `rgba(255, 225, 140, ${sw.alpha * 0.25})`;
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }

      // 4. Cryptographic Rotating Verification Rings
      ctx.save();
      ctx.translate(coreX, coreY);

      // Outer dashed cryptographic ring
      ctx.beginPath();
      ctx.arc(0, 0, boxW * 0.68, rotationAngle, rotationAngle + Math.PI * 1.5);
      ctx.strokeStyle = "rgba(255, 176, 32, 0.25)";
      ctx.lineWidth = 1.2;
      ctx.setLineDash([4, 8]);
      ctx.stroke();
      ctx.setLineDash([]);

      // Inner counter-rotating accent arcs
      ctx.beginPath();
      ctx.arc(0, 0, boxW * 0.78, -rotationAngle * 1.2, -rotationAngle * 1.2 + Math.PI * 0.8);
      ctx.strokeStyle = "rgba(255, 210, 122, 0.35)";
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Orbital indicator beacon
      const orbX = Math.cos(rotationAngle) * (boxW * 0.68);
      const orbY = Math.sin(rotationAngle) * (boxW * 0.68);
      ctx.beginPath();
      ctx.arc(orbX, orbY, 3, 0, 6.283);
      ctx.fillStyle = "#ffffff";
      ctx.shadowColor = "#ffb020";
      ctx.shadowBlur = 8;
      ctx.fill();
      ctx.shadowBlur = 0;

      ctx.restore();

      // 5. The Settlement Vault Chamber (Chiseled Glass & Gold Reactor)
      // Ambient atmospheric glow behind vault
      const glowGrad = ctx.createRadialGradient(
        coreX,
        coreY,
        10,
        coreX,
        coreY,
        boxW * 1.1
      );
      glowGrad.addColorStop(0, isSettling ? "rgba(255, 176, 32, 0.35)" : "rgba(255, 176, 32, 0.18)");
      glowGrad.addColorStop(0.6, "rgba(255, 176, 32, 0.05)");
      glowGrad.addColorStop(1, "rgba(255, 176, 32, 0)");

      ctx.fillStyle = glowGrad;
      ctx.beginPath();
      ctx.arc(coreX, coreY, boxW * 1.1, 0, 6.283);
      ctx.fill();

      // Main Vault Body: Signal Amber with subtle depth gradient
      const vaultGrad = ctx.createLinearGradient(vaultLeft, vaultTop, vaultLeft + boxW, vaultTop + boxH);
      vaultGrad.addColorStop(0, "#ffb020");
      vaultGrad.addColorStop(0.5, "#f59e0b");
      vaultGrad.addColorStop(1, "#d97706");

      ctx.fillStyle = vaultGrad;
      ctx.beginPath();
      ctx.roundRect(vaultLeft, vaultTop, boxW, boxH, 8);
      ctx.fill();

      // High-tech internal bevel border
      ctx.strokeStyle = isSettling ? "#ffffff" : "#ffe494";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(vaultLeft, vaultTop, boxW, boxH, 8);
      ctx.stroke();

      // Outer animated dashed perimeter ring
      ctx.strokeStyle = "rgba(255, 255, 255, 0.65)";
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 12]);
      ctx.lineDashOffset = -clock * 28;
      ctx.beginPath();
      ctx.roundRect(vaultLeft - 4, vaultTop - 4, boxW + 8, boxH + 8, 12);
      ctx.stroke();
      ctx.setLineDash([]);

      // Cyber Corner Brackets on the Chamber
      const bracketLen = 14;
      ctx.strokeStyle = "#0a0c12";
      ctx.lineWidth = 2.5;

      // Top-left
      ctx.beginPath();
      ctx.moveTo(vaultLeft + 10, vaultTop + 10 + bracketLen);
      ctx.lineTo(vaultLeft + 10, vaultTop + 10);
      ctx.lineTo(vaultLeft + 10 + bracketLen, vaultTop + 10);
      ctx.stroke();

      // Top-right
      ctx.beginPath();
      ctx.moveTo(vaultLeft + boxW - 10 - bracketLen, vaultTop + 10);
      ctx.lineTo(vaultLeft + boxW - 10, vaultTop + 10);
      ctx.lineTo(vaultLeft + boxW - 10, vaultTop + 10 + bracketLen);
      ctx.stroke();

      // Bottom-left
      ctx.beginPath();
      ctx.moveTo(vaultLeft + 10, vaultTop + boxH - 10 - bracketLen);
      ctx.lineTo(vaultLeft + 10, vaultTop + boxH - 10);
      ctx.lineTo(vaultLeft + 10 + bracketLen, vaultTop + boxH - 10);
      ctx.stroke();

      // Bottom-right
      ctx.beginPath();
      ctx.moveTo(vaultLeft + boxW - 10 - bracketLen, vaultTop + boxH - 10);
      ctx.lineTo(vaultLeft + boxW - 10, vaultTop + boxH - 10);
      ctx.lineTo(vaultLeft + boxW - 10, vaultTop + boxH - 10 - bracketLen);
      ctx.stroke();

      // 6. Typography & Live Execution Data inside Vault
      const paddingX = vaultLeft + (isMobile ? 16 : 22);

      // Top label: "SETTLED" + live status pulse dot
      ctx.font = '700 12px "JetBrains Mono", monospace';
      ctx.fillStyle = "#0a0c12";
      ctx.letterSpacing = "2px";
      ctx.fillText("SETTLED", paddingX, vaultTop + (isMobile ? 32 : 38));

      // Live green cryptographic radar ping
      const pingX = vaultLeft + boxW - (isMobile ? 22 : 28);
      const pingY = vaultTop + (isMobile ? 28 : 34);
      ctx.beginPath();
      ctx.arc(pingX, pingY, 3.5, 0, 6.283);
      ctx.fillStyle = "#15803d";
      ctx.fill();

      ctx.beginPath();
      ctx.arc(pingX, pingY, 3.5 + (Math.sin(clock * 6) + 1) * 2.5, 0, 6.283);
      ctx.strokeStyle = "rgba(21, 128, 61, 0.6)";
      ctx.lineWidth = 1;
      ctx.stroke();

      // Middle: Micro telemetry hash
      ctx.font = '600 10px "JetBrains Mono", monospace';
      ctx.fillStyle = "rgba(10, 12, 18, 0.72)";
      ctx.letterSpacing = "0.5px";
      ctx.fillText("ALL-OR-REVERT", paddingX, vaultTop + (isMobile ? 54 : 64));

      // Divider line inside chamber
      ctx.beginPath();
      ctx.moveTo(paddingX, vaultTop + (isMobile ? 66 : 78));
      ctx.lineTo(vaultLeft + boxW - (isMobile ? 16 : 22), vaultTop + (isMobile ? 66 : 78));
      ctx.strokeStyle = "rgba(10, 12, 18, 0.22)";
      ctx.lineWidth = 1;
      ctx.stroke();

      // Primary Headline: "1 TX"
      ctx.font = `800 ${isMobile ? 28 : 36}px "JetBrains Mono", monospace`;
      ctx.fillStyle = "#0a0c12";
      ctx.letterSpacing = "-0.5px";
      ctx.fillText("1 TX", paddingX, vaultTop + (isMobile ? 104 : 124));

      // Bottom sub-badge: "ATOMIC EXECUTION"
      ctx.font = '700 9px "JetBrains Mono", monospace';
      ctx.fillStyle = "rgba(10, 12, 18, 0.85)";
      ctx.letterSpacing = "1.5px";
      ctx.fillText("ATOMIC SWAP", paddingX, vaultTop + (isMobile ? 124 : 148));
    };

    animId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  return (
    <div className="relative h-full w-full select-none overflow-hidden rounded-xl border border-ink-700/60 bg-ink-950/80 p-2 shadow-2xl backdrop-blur-sm">
      <canvas ref={canvasRef} className="block h-full w-full" aria-label="Atomic 1-Tx Settlement Engine" />
      {/* Floating status tag */}
      <div className="pointer-events-none absolute bottom-3 left-4 flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-slate-400">
        <span className="flex h-1.5 w-1.5 rounded-full bg-signal-500 animate-pulse shadow-[0_0_6px_rgba(255,176,32,0.8)]" />
        <span>EIP-712 Atomic Settlement Bus</span>
      </div>
    </div>
  );
}
