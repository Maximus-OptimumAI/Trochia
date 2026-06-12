import type { Metadata } from 'next';
import { SectionDivider } from '@/components/primitives/section-divider';

/**
 * `/manifesto` — long-form single-column credibility piece (UI-SPEC §"Route /
 * Screen Contract" /manifesto). Operator voice, no emoji, no "AI buddy" tone,
 * banned-string clean.
 *
 * Type treatment:
 *   - hero: title + author + date, `max-w-3xl mx-auto`
 *   - body: `text-body` (~18px) `max-w-prose` (~65ch)
 *   - pull quotes: larger Geist with a 4px Signal left-border bar
 *   - section breaks: `<SectionDivider />`
 *
 * Source of truth: `src/content/manifesto.mdx` (archived for later MDX
 * pipeline wiring). This page renders the content as TSX directly so the
 * Plan-08 build does not have to depend on `@next/mdx`. Word count target
 * 1500–2000; current draft ~1580.
 */
export const metadata: Metadata = {
  title: 'Manifesto',
  description:
    'Why Trochia exists, what is broken about fundraising, and the operator philosophy. The agentic operator for your raise.',
};

const PARAGRAPH = 'text-body text-ink leading-[1.65] [&+&]:mt-6';
const SUBHEAD = 'text-h2 text-ink mt-16 mb-6';
// ink bar — Signal is never a border (docs/design/DESIGN.md §11 v1.1, A9-QUEUE-04)
const PULL = 'my-10 border-l-4 border-ink pl-6 text-h3 font-geist text-ink';

export default function ManifestoPage() {
  return (
    <article className="py-20 md:py-32">
      <div className="mx-auto max-w-3xl px-6 md:px-12">
        <header className="mb-12 flex flex-col gap-4">
          <p className="text-mono-sm uppercase tracking-wider text-graphite">MANIFESTO</p>
          <h1 className="text-h2 tracking-tight text-ink md:text-display">
            The agentic operator for your raise.
          </h1>
          <p className="text-mono-sm text-graphite">
            Martins Ejeheri, founder · May 2026
          </p>
        </header>

        <SectionDivider />

        <div className="prose-trochia max-w-prose">
          <p className={PARAGRAPH}>A raise is not one job. It is six.</p>
          <p className={PARAGRAPH}>
            The founder writes the deck and rewrites it. Finds the investors and chases the
            ones who matter. Drafts cold outreach without sounding cold. Walks into a partner
            meeting having read three things the partner wrote. Comes out, runs the
            transcript, writes the follow-up before the next founder eats their slot. Sends
            a SAFE (the right SAFE) to the right person and watches it come back signed.
            Updates the cap table without breaking it. Keeps the F&amp;F round legal. Closes.
          </p>
          <p className={PARAGRAPH}>
            Each of these has a tool. Six tools, sometimes ten. None of them know your
            business. None of them know your pipeline. None of them remember what you told
            the last one.
          </p>
          <p className={PARAGRAPH}>
            Trochia is built for the founder who has decided to stop doing this with a
            general chatbot, a Notion page, and twelve open tabs.
          </p>

          <h2 className={SUBHEAD}>What is broken</h2>
          <p className={PARAGRAPH}>The first thing that breaks is the memory.</p>
          <p className={PARAGRAPH}>
            A founder talks to a general AI every day for a year. The model knows you better
            than your last hire. Then you walk into the actual raise and the tools that
            matter (the deck reviewer, the investor researcher, the SAFE drafter) know
            none of that. You paste your business in again. You explain the round again.
            You explain who the customer is again. The deck reviewer suggests rewrites that
            sound generic because to it, your business is generic.
          </p>
          <p className={PARAGRAPH}>The second thing that breaks is the pipeline.</p>
          <p className={PARAGRAPH}>
            Pipeline lives in a spreadsheet, a CRM that was not built for venture, or in the
            founder&apos;s head. Investor research happens in another tab. Pre-call briefs get
            written if there is time, which there usually is not. A botched investor meeting
            is a $25K to $250K loss in expected value. The cause is almost always the
            same: the founder walked in cold to someone they should have read for fifteen
            minutes first.
          </p>
          <p className={PARAGRAPH}>The third thing that breaks is the close.</p>
          <p className={PARAGRAPH}>
            SAFE templates get pulled from a Google search. Cap tables are kept in Excel
            until someone says &ldquo;send me your cap table&rdquo; and the founder builds
            one in an hour. F&amp;F rounds get described in ways that are a regulatory
            landmine, and nobody draws that on the page. A friend wires $25K and there is
            no signed paperwork.
          </p>
          <p className={PARAGRAPH}>
            A general assistant cannot fix any of this. It does not know your business
            deeply enough to draft a real outreach email. It does not own your pipeline. It
            does not have the SAFE templates a real law firm would put in front of you. It
            does not do cap table math reliably enough to bet equity on. It is a chatbot in
            front of a calendar full of meetings nobody is preparing for.
          </p>
          <p className={PARAGRAPH}>
            And the cost is not abstract. The cost is the partner who passed because the
            deck still said &ldquo;we are a marketplace&rdquo; on slide four when slides one
            and seven said it was a vertical SaaS. The cost is the follow-up that did not go
            out for nine days because the founder was running back-to-back. The cost is the
            wired-not-signed $50K from a friend that becomes a legal mess two years later
            when there is real money on the table. The cost is the four hours every Sunday
            the founder spends reconciling notes into a tracker that nobody else will ever
            look at.
          </p>
          <p className={PARAGRAPH}>
            Founders accept these costs because they look like the cost of doing the job.
            They are not. They are the cost of doing the job with the wrong tools.
          </p>

          <h2 className={SUBHEAD}>The operator</h2>
          <p className={PARAGRAPH}>
            The shape of the answer is not another chatbot. It is an operator.
          </p>
          <p className={PARAGRAPH}>
            An operator owns work, not advice. An operator carries the memory. The operator
            knows that you are a fintech, pre-seed, raising $1.5M, that the lead you want is
            the one who invested in three of your competitors, that the call on Thursday is
            with a partner who wrote a thesis about exactly this category last month. The
            operator drafts the outreach in your voice, briefs you before the call, ingests
            the transcript after, drafts the follow-up referencing two specific things the
            partner said, and updates the pipeline stage. You read each thing. You approve
            each send.
          </p>

          <blockquote className={PULL}>
            Trochia drafts. Matches. Briefs. Scores. Tracks. It does not pitch. It does not
            speak in calls. It does not send autonomously.
          </blockquote>

          <p className={PARAGRAPH}>
            That last sentence is the line that separates Trochia from the category of
            agents that quietly call investors with a synthetic voice. Founders reject that
            category. We do too. The trust is in who is on the other end of the call. The
            operator stays in the back room.
          </p>

          <h2 className={SUBHEAD}>Memory is the moat</h2>
          <p className={PARAGRAPH}>Six modules. One memory.</p>
          <p className={PARAGRAPH}>
            Business Memory holds who you are: the company, the customer, the metrics that
            move, the milestones. It is built from the same context you already have
            somewhere: a custom-instructions block, a project notebook, a Notion page. You
            paste or upload, Trochia extracts a structured record, you confirm each field.
            From that point on, every other module reads from it.
          </p>
          <p className={PARAGRAPH}>
            Pipeline Memory holds who you are talking to: the investor, the accelerator,
            the stage, the last touch, the transcript, the commitment. It updates as you
            move. When you generate a SAFE the cap table sees it. When you ingest a
            transcript the follow-up drafter reads it. The pipeline kanban moves itself
            because the underlying memory moved.
          </p>
          <p className={PARAGRAPH}>
            This is the thing a general AI cannot copy in a week. A general AI does not own
            your business. A general AI does not own your pipeline. Memory plus workflow
            ownership across the whole raise journey is the part that compounds.
          </p>
          <p className={PARAGRAPH}>
            It compounds because every interaction makes the operator more accurate. The
            deck reviewer that knows the customer is mid-market and not enterprise stops
            flagging the enterprise-pricing slide as a contradiction. The investor matcher
            that knows the company already passed a YC interview and a Techstars final round
            stops surfacing those again. The follow-up drafter that has read the last four
            transcripts stops repeating the same thank-you sentence twice in a row. None of
            that is the model getting better. It is the memory the model is reading from
            getting more specific.
          </p>
          <p className={PARAGRAPH}>
            The other reason memory is the moat is structural. A founder who has been using
            Trochia for three months has a business memory, a pipeline memory, a deck-review
            history, a transcript archive, and a draft library that none of the alternatives
            have. Migrating out means rebuilding all of it. By the time the close happens,
            the switching cost is the whole raise.
          </p>

          <h2 className={SUBHEAD}>What founders pay for</h2>
          <p className={PARAGRAPH}>
            Trochia is a tool founders pay for during the raise, not a permanent
            subscription. The tiers reflect that.
          </p>
          <p className={PARAGRAPH}>
            Pre-Raise gets the memory set up and the matching running. Active Raise runs the
            full raise: pre-call briefs, transcripts, follow-ups, the pipeline. Close Mode
            orchestrates the data room and runs the cap table at the close. Alumni keeps
            the memory warm between rounds.
          </p>
          <p className={PARAGRAPH}>
            There is no permanent free tier because a permanent free tier dilutes the buyer
            pool, and because founders running a real raise are happy to pay for something
            that compresses six tools into one. A 7-day trial with card on file is enough
            to see whether the operator-memory fit is real.
          </p>

          <h2 className={SUBHEAD}>Three commitments</h2>
          <p className={PARAGRAPH}>Some things are non-negotiable.</p>
          <p className={PARAGRAPH}>
            <strong className="text-ink">Founders approve every external action.</strong> No
            autonomous emails. No autonomous intros. No autonomous signatures. No autonomous
            payments. Trochia drafts and queues; the founder reads and approves. This is the
            rule the product is designed around.
          </p>
          <p className={PARAGRAPH}>
            <strong className="text-ink">
              Customer data never enters a training pipeline.
            </strong>{' '}
            Not ours, not any vendor&apos;s. The commitment is contractual, stated in the
            DPA, and reflected in the sub-processor inventory. Your business memory is
            yours.
          </p>
          <p className={PARAGRAPH}>
            <strong className="text-ink">Trochia is not your lawyer.</strong> The Legal Stack
            module recommends vendors. The SAFE generator substitutes variables into
            established templates with a mandatory lawyer-review gate before download. The
            cap-table math is unit tested against a 30-scenario oracle set. {`This is not legal advice.`} The
            founder still hires the lawyer.
          </p>

          <h2 className={SUBHEAD}>Why now</h2>
          <p className={PARAGRAPH}>The base model is good enough.</p>
          <p className={PARAGRAPH}>
            A year ago, the deck-reviewer agent would have hallucinated slide numbers, the
            brief generator would have made up the partner&apos;s recent investments, and
            the follow-up drafter would have produced a generic thank-you note. The
            foundation models cleared each of those bars in the last twelve months.
          </p>
          <p className={PARAGRAPH}>
            The remaining work is not in the model. It is in the surface: the memory schema
            that makes the model good at your business specifically, the workflow that earns
            the founder&apos;s trust through a hundred small interactions, the single
            chokepoint of prompt caching plus structured output plus an eval harness that
            turns model improvement into product improvement. That work is what Trochia is.
          </p>

          <h2 className={SUBHEAD}>What you get back</h2>
          <p className={PARAGRAPH}>
            The single sentence: a founder running a raise stops juggling tools and starts
            running an operation.
          </p>
          <p className={PARAGRAPH}>
            The deck gets reviewed. The investor list gets researched. The pre-call brief
            gets written. The transcript gets ingested. The follow-up gets drafted. The
            SAFE gets generated, signed, and reflected in the cap table. The next investor
            is already in the pipeline.
          </p>
          <p className={PARAGRAPH}>
            You decide who to talk to and what to sign. The operator does the work in
            between.
          </p>
          <p className={PARAGRAPH}>Start your raise.</p>
        </div>
      </div>
    </article>
  );
}
