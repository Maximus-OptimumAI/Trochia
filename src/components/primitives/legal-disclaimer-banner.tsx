import { cn } from '@/lib/utils';

/**
 * LegalDisclaimerBanner — a thin disclosure strip used on Legal-Stack / SAFE /
 * affiliate surfaces in later phases; established in Phase 1 as a reusable
 * component with the canonical, banned-string-safe copy. The "not-legal-advice"
 * variant uses the allowlisted negated form ("Trochia is not a law firm and
 * does not provide …"); the bare compliance phrase is never used without a
 * preceding negation (the banned-string CI check enforces this).
 */
const COPY = {
  'not-legal-advice':
    'Trochia is not a law firm and does not provide legal advice. Consult your lawyer.',
  affiliate: 'Trochia may earn a referral fee from vendors listed here.',
} as const;

export function LegalDisclaimerBanner({
  variant,
  className,
}: {
  variant: 'not-legal-advice' | 'affiliate';
  className?: string;
}) {
  return (
    <p
      role="note"
      className={cn(
        'rounded-lg border border-stone bg-stone/60 p-4 text-body-sm text-graphite',
        className
      )}
    >
      {COPY[variant]}
    </p>
  );
}
