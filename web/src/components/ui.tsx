export function PillButton({
  href, children, variant = "primary",
}: { href: string; children: React.ReactNode; variant?: "primary" | "ghost" }) {
  const base = "inline-flex h-12 items-center rounded-full px-7 text-[15px] font-medium";
  const styles =
    variant === "primary"
      ? "bg-signal-500 text-ink-950 hover:bg-signal-300"
      : "border border-ink-700 text-mist-100 hover:border-signal-500 hover:text-signal-500";
  return <a href={href} className={`${base} ${styles}`}>{children}</a>;
}

export function SectionHead({ index, label, title }: { index: string; label: string; title: string }) {
  return (
    <div data-r className="mb-14 lg:mb-20">
      <p className="mono-label mb-6 flex items-center gap-4">
        <span className="text-signal-500">{index}</span>
        <span className="h-px w-10 bg-ink-700" />
        {label}
      </p>
      <h2 className="max-w-[22ch] text-[2.2rem] font-semibold leading-[1.05] tracking-[-0.025em] lg:text-[3.6rem]">
        {title}
      </h2>
    </div>
  );
}
