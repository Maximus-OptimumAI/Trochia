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
 * MarketingTopBar — spread-at-top → pill-on-scroll (docs/design/DESIGN.md §7
 * Navigation v1.1 / D3-B, motion M5). At page top: a full-content-width
 * transparent row over Paper (logo left, links + secondary CTA right). Past
 * ~64px scroll it contracts into the centered floating pill (`bg-card
 * rounded-nav shadow-card h-14`). 200ms ease-out morph (max-width /
 * background / shadow / padding transition); the reduced-motion kill-switch
 * makes the two states SNAP. LIGHT-ONLY — no dark variant, no color morph.
 * Both states are fully functional without JS (the listener is enhancement
 * only; no-JS renders the spread state permanently).
 *
 * CTA discipline (D1-B): the nav is sticky — co-visible with everything — so
 * its CTA is SECONDARY (white pill) in ALL states, never Signal. Logo: inline
 * SVG lockup with the one-time node-settle entrance.
 *
 * Mobile: logo + hamburger; full-screen Sheet menu (PDR-03).
 */
const NAV = [
  { label: 'How it works', href: '/#how-it-works' },
  { label: 'Pricing', href: '/pricing' },
  { label: 'Manifesto', href: '/manifesto' },
];

export function MarketingTopBar() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 64);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    // pointer-events-none on the full-width sticky band so the transparent
    // gutters beside the contracted pill never intercept clicks (CDX-13);
    // the inner nav row re-enables hit-testing.
    <header className="pointer-events-none sticky top-0 z-40 px-4 pt-4 sm:px-6">
      <div
        className={cn(
          'pointer-events-auto mx-auto flex h-14 items-center justify-between rounded-nav transition-[max-width,background-color,box-shadow,padding] duration-200 ease-out',
          scrolled
            ? 'max-w-[780px] bg-card pr-2 pl-4 shadow-card sm:pl-5'
            : 'max-w-content bg-transparent px-0 shadow-none'
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
