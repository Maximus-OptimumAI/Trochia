import { Card } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';

/**
 * FounderVoices — 2 testimonial cards (UI-SPEC §"Route / Screen Contract"
 * homepage section 5). PLACEHOLDER content until design partners exist — the
 * eyebrow and the per-quote attribution make clear these are not real
 * testimonials yet. The "Trusted by" + fake-logos pattern is a banned anti-
 * pattern; this section follows the honest-placeholder rule.
 *
 * When the first 25 design partners onboard at Phase 4, the founder swaps in
 * real quotes — same shape, same component.
 */
const VOICES: { quote: string; name: string; meta: string; fallback: string }[] = [
  {
    quote:
      'A real design-partner quote lands here once Phase 4 ships and the first 25 founders have raised through Trochia.',
    name: 'Design partner',
    meta: 'pre-seed · TBD',
    fallback: 'DP',
  },
  {
    quote:
      'A second placeholder. The bar Trochia sets: short, specific, operator-voiced — never a marketing-template testimonial.',
    name: 'Design partner',
    meta: 'seed · TBD',
    fallback: 'DP',
  },
];

export function FounderVoices() {
  return (
    <section className="border-t border-stone py-20 md:py-32">
      <div className="mx-auto max-w-content px-6 md:px-12">
        <header className="mb-12 flex flex-col gap-3 md:mb-16">
          <p className="text-label text-graphite">FOUNDER VOICES</p>
          <h2 className="max-w-2xl text-h2 text-ink">
            Quotes go here once founders ship.
          </h2>
          <p className="max-w-xl text-body-sm text-graphite">
            Placeholder — Trochia does not run fake testimonials. The first 25 design partners
            land at Phase 4.
          </p>
        </header>

        <ul className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {VOICES.map((v, i) => (
            <li key={i}>
              <Card className="h-full gap-8">
                <blockquote className="text-h3 font-geist text-ink">
                  &ldquo;{v.quote}&rdquo;
                </blockquote>
                <div className="flex items-center gap-3">
                  <Avatar size="sm" aria-hidden>
                    <AvatarFallback>{v.fallback}</AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col">
                    <span className="text-mono-sm text-ink">{v.name}</span>
                    <span className="text-mono-sm text-graphite">{v.meta}</span>
                  </div>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
