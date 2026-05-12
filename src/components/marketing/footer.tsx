import Link from 'next/link';
import { Logo } from '@/components/brand/logo';

/**
 * Footer — three columns + a mark line. Col 1: logo + tagline "The agentic
 * operator for your raise." Col 2: Product nav (Pricing, Manifesto, Status) —
 * no Changelog in Phase 1. Col 3: Legal (Privacy, Terms, Security, DPA).
 * Bottom: © 2026 Trochia + mark + X / LinkedIn. `text-body-sm text-graphite`.
 */
const PRODUCT_LINKS = [
  { label: 'Pricing', href: '/pricing' },
  { label: 'Manifesto', href: '/manifesto' },
  { label: 'Status', href: '/status' },
];

const LEGAL_LINKS = [
  { label: 'Privacy', href: '/legal/privacy' },
  { label: 'Terms', href: '/legal/terms' },
  { label: 'Security', href: '/legal/security' },
  { label: 'DPA', href: '/legal/dpa' },
];

export function Footer() {
  return (
    <footer className="border-t border-stone bg-paper">
      <div className="mx-auto max-w-content px-6 py-16 md:px-12">
        <div className="grid grid-cols-1 gap-12 md:grid-cols-3">
          <div className="flex flex-col gap-4">
            <Logo height={26} />
            <p className="max-w-xs text-body-sm text-graphite">
              The agentic operator for your raise.
            </p>
          </div>
          <div className="flex flex-col gap-3">
            <p className="text-label text-graphite">Product</p>
            <ul className="flex flex-col gap-2">
              {PRODUCT_LINKS.map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    className="text-body-sm text-graphite transition-colors hover:text-ink"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div className="flex flex-col gap-3">
            <p className="text-label text-graphite">Legal</p>
            <ul className="flex flex-col gap-2">
              {LEGAL_LINKS.map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    className="text-body-sm text-graphite transition-colors hover:text-ink"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div className="mt-12 flex items-center justify-between border-t border-stone pt-6 text-body-sm text-graphite">
          <span className="flex items-center gap-2">
            <Logo variant="mark" href={null} height={16} />
            <span>© 2026 Trochia</span>
          </span>
          <span className="flex items-center gap-4">
            <a
              href="https://x.com/trochia"
              className="transition-colors hover:text-ink"
              aria-label="Trochia on X"
            >
              X
            </a>
            <a
              href="https://www.linkedin.com/company/trochia"
              className="transition-colors hover:text-ink"
              aria-label="Trochia on LinkedIn"
            >
              LinkedIn
            </a>
          </span>
        </div>
      </div>
    </footer>
  );
}
