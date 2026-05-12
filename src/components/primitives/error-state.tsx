import Link from 'next/link';
import { Logo } from '@/components/brand/logo';
import { Button } from '@/components/ui/button';

/**
 * ErrorState — the canonical failure surface. Same layout family as EmptyState.
 * Default heading "Something went wrong."; body states what failed in plain
 * language; "Try again" calls `onRetry`; "Contact support" is a link. Never a
 * raw stack trace, never blame the user.
 */
export function ErrorState({
  heading = 'Something went wrong.',
  body,
  onRetry,
  supportHref,
}: {
  heading?: string;
  body: string;
  onRetry: () => void;
  supportHref: string;
}) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-32 text-center">
      <Logo variant="mark" href={null} height={64} />
      <h3 className="text-h3 font-geist text-ink">{heading}</h3>
      <p className="text-body text-graphite">{body}</p>
      <div className="mt-2 flex items-center gap-4">
        <Button variant="primary" onClick={onRetry}>
          Try again
        </Button>
        <Button variant="link" render={<Link href={supportHref} />}>
          Contact support
        </Button>
      </div>
    </div>
  );
}
