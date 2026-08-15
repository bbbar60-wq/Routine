/**
 * The mark: a cycle (the routine) with a marker on it (today).
 * Deliberately simple — it has to stay legible at 26px in the sidebar.
 */
export function LogoMark({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 26 26" fill="none" aria-hidden className="shrink-0">
      <rect width="26" height="26" rx="7.5" fill="var(--accent)" />
      {/* The break sits at the upper right rather than at 12 o'clock — a
          vertical gap with a dot above it is the power symbol, not this. */}
      <circle
        cx="13" cy="13" r="5.6"
        stroke="var(--ink-on-accent)" strokeWidth="1.9" strokeLinecap="round"
        strokeDasharray="29.13 6.06" transform="rotate(336 13 13)"
      />
      <circle cx="16.21" cy="8.41" r="2.15" fill="var(--ink-on-accent)" />
    </svg>
  );
}

export function Logo({ size = 26 }: { size?: number }) {
  return (
    <div className="flex items-center gap-2.5">
      <LogoMark size={size} />
      <span className="text-[15px] font-semibold tracking-[-0.02em] text-[var(--ink)]">Routine</span>
    </div>
  );
}
