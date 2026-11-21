export default function CtaScene() {
  const rows = 23;
  return (
    <svg viewBox="0 0 640 420" className="h-full w-full" aria-hidden>
      {Array.from({ length: rows }).map((_, i) => {
        const y = 20 + i * 17;
        const win = i === 11;
        const d = `M0 ${y} H${230 - Math.abs(i - 11) * 9} L470 210`;
        return (
          <g key={i}>
            <path d={d} fill="none" stroke={win ? "#ffb020" : "#2a2f3d"} />
            <path d={d} fill="none" className="flow-line" style={{ animationDelay: `${-i * 0.37}s` }} stroke={win ? "#ffd27a" : "#5d6475"} strokeWidth={win ? 1.8 : 1} />
          </g>
        );
      })}
      <rect x="470" y="130" width="150" height="160" fill="#ffb020" />
      <rect x="470" y="130" width="150" height="160" fill="none" stroke="#ffd27a" strokeWidth="6" strokeDasharray="1 11" className="flow-line" />
      <text x="486" y="162" fontFamily="var(--font-mono-label)" fontSize="11" letterSpacing="1.5" fill="#0a0c12">SETTLED</text>
      <text x="486" y="270" fontFamily="var(--font-mono-label)" fontSize="11" letterSpacing="1.5" fill="#0a0c12">1 TX</text>
    </svg>
  );
}
