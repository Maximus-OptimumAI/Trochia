/**
 * SectionDivider — Harmonic-style section break: a small mono uppercase label +
 * a hairline rule. Use between major sections on long pages.
 */
export function SectionDivider({ label }: { label?: string }) {
  return (
    <div className="my-20 flex items-center gap-4">
      {label && (
        <span className="text-mono-sm uppercase tracking-wider text-graphite">{label}</span>
      )}
      <span className="h-px flex-1 bg-stone" />
    </div>
  );
}
