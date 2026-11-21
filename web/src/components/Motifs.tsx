export function RfqMotif() {
  const ys = Array.from({ length: 11 }, (_, i) => 20 + i * 12);
  return (
    <svg viewBox="0 0 320 160" className="h-full w-full" aria-hidden>
      {ys.map((y, i) => {
        const win = i === 5;
        const d = `M0 ${y} H${120 - Math.abs(i - 5) * 8} L238 80`;
        return (
          <g key={i}>
            <path d={d} fill="none" stroke={win ? "#ffb020" : "#2a2f3d"} />
            <path d={d} fill="none" className="flow-line" style={{ animationDelay: `${-i * 0.45}s` }} stroke={win ? "#ffd27a" : "#5d6475"} strokeWidth={win ? 1.6 : 1} />
          </g>
        );
      })}
      <rect x="238" y="56" width="62" height="48" fill="#ffb020" />
      <text x="247" y="84" fontFamily="var(--font-mono-label)" fontSize="8" fill="#0a0c12" letterSpacing="1">1 TX</text>
    </svg>
  );
}

export function ForwardMotif() {
  const path = "M30 130 L290 30";
  return (
    <svg viewBox="0 0 320 160" className="h-full w-full" aria-hidden>
      <path d="M30 20 V130 H300" stroke="#2a2f3d" fill="none" />
      <path d="M30 80 H300" stroke="#2a2f3d" strokeDasharray="3 5" />
      <path d={path} stroke="#5d6475" fill="none" />
      <path d="M160 130 L290 30" stroke="#ffb020" strokeWidth="2" fill="none" />
      <path d="M160 20 V130" stroke="#ffb020" strokeDasharray="3 4" />
      <text x="166" y="26" fontFamily="var(--font-mono-label)" fontSize="8" fill="#a2a9b8" letterSpacing="1">STRIKE</text>
      <text x="236" y="150" fontFamily="var(--font-mono-label)" fontSize="8" fill="#a2a9b8" letterSpacing="1">CLOSE PRICE</text>
      <circle r="4" fill="#ffd27a">
        <animateMotion dur="4s" repeatCount="indefinite" path="M60 130 H160 L290 30" />
      </circle>
    </svg>
  );
}

export function ApiMotif() {
  const rows = Array.from({ length: 9 }, (_, i) => i);
  return (
    <svg viewBox="0 0 320 160" className="h-full w-full" aria-hidden>
      {rows.map((i) => (
        <g key={i} style={{ animation: `slideL ${5 + (i % 4)}s linear infinite`, animationDelay: `${-i}s` }}>
          {Array.from({ length: 8 }).map((_, j) => {
            const w = 14 + ((i * 7 + j * 13) % 34);
            return <rect key={j} x={j * 60} y={14 + i * 15} width={w} height="6" fill={(i + j) % 5 === 0 ? "#ffb020" : "#2a2f3d"} />;
          })}
        </g>
      ))}
    </svg>
  );
}
