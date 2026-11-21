import { ETFS, HAS_LOGO } from "@/lib/universe";

// Company logo when we have one, otherwise our own monogram. ETFs are rounded squares, stocks are circles.
export default function Monogram({ t, size = 28 }: { t: string; size?: number }) {
  const shape = ETFS.has(t) ? "rounded-[8px]" : "rounded-full";
  if (HAS_LOGO.has(t)) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={`/logos/${t}.png`} alt="" width={size} height={size} style={{ width: size, height: size }} className={`shrink-0 bg-white object-cover ${shape}`} />
    );
  }
  return (
    <span
      aria-hidden
      style={{ width: size, height: size, fontSize: size * 0.34 }}
      className={`inline-flex shrink-0 items-center justify-center border border-ink-700 bg-ink-800 font-mono font-medium uppercase tracking-tight text-signal-500 ${shape}`}
    >
      {t.slice(0, 2)}
    </span>
  );
}
