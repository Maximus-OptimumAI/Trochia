'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Menu } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Logo } from '@/components/brand/logo';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';

/**
 * MarketingTopBar — `h-16 bg-paper/95 backdrop-blur-sm sticky top-0 z-40`,
 * `border-b border-stone` only when scrolled past 8px. Left: logo lockup → `/`.
 * Center: nav "How it works" / "Pricing" / "Manifesto" (no Docs/Changelog in
 * Phase 1). Right: "Sign in" link + "Start raising" primary button. Mobile:
 * hamburger → full-screen Sheet, mark stays top-left.
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
    <header
      className={cn(
        'sticky top-0 z-40 h-16 bg-paper/95 backdrop-blur-sm transition-colors',
        scrolled && 'border-b border-stone'
      )}
    >
      <div className="mx-auto flex h-full max-w-content items-center justify-between px-6 md:px-12">
        <Logo height={26} />

        <nav className="hidden items-center gap-8 md:flex">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-body-sm font-medium text-graphite transition-colors hover:text-ink"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-4 md:flex">
          <Link
            href="/sign-in"
            className="text-body-sm font-medium text-ink transition-colors hover:text-signal"
          >
            Sign in
          </Link>
          <Button variant="primary" size="compact" render={<Link href="/sign-up" />}>
            Start raising
          </Button>
        </div>

        {/* mobile */}
        <div className="md:hidden">
          <Sheet>
            <SheetTrigger
              className="inline-flex size-9 items-center justify-center rounded-lg text-ink hover:bg-stone/50"
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
                    className="rounded-md px-3 py-3 text-body font-medium text-ink hover:bg-stone/50"
                  >
                    {item.label}
                  </Link>
                ))}
                <Link
                  href="/sign-in"
                  className="rounded-md px-3 py-3 text-body font-medium text-ink hover:bg-stone/50"
                >
                  Sign in
                </Link>
                <Button variant="primary" className="mt-2" render={<Link href="/sign-up" />}>
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
