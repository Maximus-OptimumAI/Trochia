'use client';

import { useEffect, useRef } from 'react';

/**
 * Reveal — the §9 M4 scroll reveal (docs/design/DESIGN.md): fade-up
 * `opacity 0→1` + `translateY(8px→0)`, 300ms ease-out, once per element on
 * viewport intersection.
 *
 * Progressive enhancement, strictly: children are server-rendered VISIBLE.
 * On mount, JS adds the initial-hidden state — and only for elements still
 * below the fold. With JS off nothing hides; under `prefers-reduced-motion`
 * the hide is skipped entirely (content visible, no reveal).
 */
export function Reveal({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    // Only hide what the viewer hasn't seen yet.
    if (el.getBoundingClientRect().top < window.innerHeight * 0.95) return;

    el.classList.add('reveal-hidden');
    // Force a style flush so the transition runs from the hidden state.
    void el.offsetHeight;
    el.classList.add('reveal-ready');

    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          el.classList.remove('reveal-hidden');
          io.disconnect();
        }
      },
      { rootMargin: '0px 0px -10% 0px' }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
