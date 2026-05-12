import Link from 'next/link';
import { Logo } from '@/components/brand/logo';
import { Button } from '@/components/ui/button';

/**
 * Placeholder homepage. The full marketing homepage (hero, trust strip, "How it
 * works", modules, founder voices, pricing teaser, final CTA, footer) ships in
 * a later Phase-1 plan (07–09). This stub establishes the brand surface and a
 * link into the styleguide exit-gate route.
 */
export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-content flex-col items-start justify-center gap-8 px-6 py-32 md:px-12">
      <Logo height={32} priority />
      <div className="flex flex-col gap-4">
        <p className="text-label text-signal">THE AGENTIC OPERATOR FOR YOUR RAISE</p>
        <h1 className="max-w-3xl text-display text-ink">Run your raise from one operator.</h1>
        <p className="max-w-xl text-body text-graphite">
          Trochia holds your business memory, finds the right investors, drafts your outreach, and
          closes the round. From F&amp;F to Series A.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <Button variant="primary" render={<Link href="/sign-up" />}>
          Start your raise
        </Button>
        <Button variant="link" render={<Link href="/styleguide" />}>
          See the design system →
        </Button>
      </div>
    </main>
  );
}
