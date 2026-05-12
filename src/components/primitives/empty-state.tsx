import Link from 'next/link';
import { Logo } from '@/components/brand/logo';
import { Button } from '@/components/ui/button';

/**
 * EmptyState — the canonical "nothing here yet" surface. 64px Mark icon, H3
 * heading, body copy, one Primary CTA, centered `max-w-md py-32`. Heading
 * follows the "{Nothing} yet" pattern (e.g. "No investors yet").
 */
export function EmptyState({
  heading,
  body,
  primaryCtaLabel,
  primaryCtaHref,
}: {
  heading: string;
  body: string;
  primaryCtaLabel: string;
  primaryCtaHref: string;
}) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-32 text-center">
      <Logo variant="mark" href={null} height={64} />
      <h3 className="text-h3 font-geist text-ink">{heading}</h3>
      <p className="text-body text-graphite">{body}</p>
      <Button variant="primary" className="mt-2" render={<Link href={primaryCtaHref} />}>
        {primaryCtaLabel}
      </Button>
    </div>
  );
}
