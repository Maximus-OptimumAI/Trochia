'use client';

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';

/**
 * FaqAccordion — the 8-question FAQ on `/pricing` (UI-SPEC §"Route / Screen
 * Contract" /pricing). Operator voice. All copy passes the banned-string check
 * — the two "advice" lines use the allowlisted "this is not" negation.
 *
 * Phase 1 fact-check:
 *   - 7-day trial + card-on-file at signup, no permanent free tier (PROJECT.md)
 *   - US + UK + India at MVP; EU at V2 (Phase 8) — see tasks/constraints.md
 *   - Customer data NEVER enters a training pipeline (XC-01, DPA single source)
 *   - Founder approves every external send (XC-02)
 */
const FAQ: { q: string; a: string }[] = [
  {
    q: 'Is there a free tier?',
    a: 'No. The Pre-Raise tier starts at $49/month with a 7-day trial and card on file at signup. A permanent free tier dilutes the buyer pool. Trochia is a tool founders pay for during the raise.',
  },
  {
    q: 'What happens after the round closes?',
    a: 'Close Mode and the $19 Alumni tier, available with the close stack. Close Mode orchestrates the data room and runs the cap table; Alumni keeps the memory warm between rounds and powers the Investor Update Generator.',
  },
  {
    q: 'Do you train AI on my data?',
    a: 'No. Your business memory, decks, transcripts, and pipeline never enter a training pipeline, ours or any vendor’s. The commitment is contractual with our model provider and stated in the DPA.',
  },
  {
    q: 'Which countries are supported?',
    a: 'EU data residency is coming; US, UK, and India today. The pricing above is in USD; local currencies follow.',
  },
  {
    q: 'Will Trochia send emails on my behalf?',
    a: 'Never autonomously. Trochia drafts outreach, application answers, and follow-ups grounded in your memory. You read each draft, edit it, and approve the send. Every external action goes through a founder-approval step.',
  },
  {
    q: 'Does Trochia join my investor calls?',
    a: 'No. Trochia is not a call speaker. It handles transcripts and post-call drafts only; your pitch stays yours.',
  },
  {
    q: 'Is Trochia an investment advisor?',
    a: 'No. This is not investment advice. Trochia is a tool that drafts and tracks; it does not recommend specific investors, terms, or valuations the way a regulated firm would. You decide who to talk to and what to sign.',
  },
  {
    q: 'Is Trochia a law firm?',
    a: 'No. This is not legal advice. The SAFE generator uses deterministic substitution into YC and Cooley GO templates and shows an un-bypassable lawyer-review gate before download. Trochia is not a law firm. Consult yours.',
  },
];

export function FaqAccordion() {
  return (
    <Accordion className="border-t border-stone">
      {FAQ.map((item, i) => (
        <AccordionItem key={i} value={`faq-${i}`} className="border-b border-stone">
          <AccordionTrigger className="w-full py-6 text-left text-h3 text-ink">
            {item.q}
          </AccordionTrigger>
          <AccordionContent className="text-body text-graphite">
            <p>{item.a}</p>
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}
