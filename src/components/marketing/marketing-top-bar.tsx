'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Menu } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Logo } from '@/components/brand/inline-logo';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';

/**
 * MarketingTopBar — the floating pill nav (docs/design/DESIGN.md §7
 * Navigation, motion M5). Always a pill from load (no variant morph — the hero
 * is light, there is no dark-over-hero state). Sticky transparent band; inner
 * pill `bg-card rounded-nav shadow-card h-14`; after 8px scroll the shadow
 * deepens one step (200ms ease-out). Zero JS dependency for correctness — the
 * scroll listener only deepens a shadow.
 *
 * CTA discipline (PDR-01): the nav CTA is SECONDARY (white pill, stone
 * border) — the page's one Signal moment is the hero CTA, and ink fills are
 * retired from marketing surfaces (DESIGN.md C7). Logo: inline SVG lockup with
 * the one-time node-settle entrance.
 *
 * Mobile: the pill holds logo + hamburger; full-screen Sheet menu (PDR-03).
 */
const NAV = [
  { label: 'How it works', href: '/#how-it-works' },
  { label: 'Pricing', href: '/pricing' },
  { label: 'Manifesto', href: '/manifesto' },
];

export function MarketingTopBar() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header className="sticky top-0 z-40 px-4 pt-4 sm:px-6">
      <div
        className={cn(
          'mx-auto flex h-14 w-fit max-w-full items-center gap-1 rounded-nav bg-card pr-2 pl-4 transition-shadow duration-200 sm:gap-2 sm:pl-5',
          scrolled ? 'shadow-overlay' : 'shadow-card'
        )}
      >
        <Logo height={34} animate className="-ml-1" />

        <nav className="hidden items-center md:flex">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-full px-3 py-2 text-body-sm font-medium text-graphite transition-colors duration-150 outline-none hover:text-ink focus-visible:text-ink focus-visible:ring-2 focus-visible:ring-ink/40"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-1 md:flex">
          <Link
            href="/sign-in"
            className="rounded-full px-3 py-2 text-body-sm font-medium text-ink transition-colors duration-150 outline-none hover:text-signal focus-visible:ring-2 focus-visible:ring-ink/40"
          >
            Sign in
          </Link>
          <Button variant="secondary" size="compact" render={<Link href="/sign-up" />}>
            Start raising
          </Button>
        </div>

        {/* mobile */}
        <div className="md:hidden">
          <Sheet>
            <SheetTrigger
              className="inline-flex size-9 items-center justify-center rounded-full text-ink outline-none hover:bg-stone/50 focus-visible:ring-2 focus-visible:ring-ink/40"
              aria-label="Open menu"
            >
              <Menu className="size-5" aria-hidden />
            </SheetTrigger>
            <SheetContent side="top" className="h-dvh">
              <SheetHeader>
                <SheetTitle>Trochia</SheetTitle>
              </SheetHeader>
              <nav className="mt-4 flex flex-col gap-1 px-4">
                {NAV.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="rounded-xl px-3 py-3 text-body font-medium text-ink hover:bg-stone/50"
                  >
                    {item.label}
                  </Link>
                ))}
                <Link
                  href="/sign-in"
                  className="rounded-xl px-3 py-3 text-body font-medium text-ink hover:bg-stone/50"
                >
                  Sign in
                </Link>
                <Button variant="secondary" className="mt-2" render={<Link href="/sign-up" />}>
                  Start raising
                </Button>
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
