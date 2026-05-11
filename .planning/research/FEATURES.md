# Feature Research

**Domain:** Founder fundraising tooling — agentic "founder OS for raising capital" (pre-seed/seed). Adjacent categories: AI deck-review, investor CRMs/matchers, data rooms, AI meeting notes, SAFE/cap-table tools, founder-knowledge RAG assistants.
**Researched:** 2026-05-11
**Confidence:** MEDIUM-HIGH — competitive landscape verified against current (2026) product pages and review roundups; PRD/Strategy docs read in full. Lower confidence on exact pricing of fast-moving SaaS and on what unannounced competitors are building.

---

## Executive Read (for the roadmap)

The space is a **fragmented constellation of point tools** — no one ships the full F&F-to-Series-A journey under one memory spine. The Trochia PRD's feature *coverage* is comprehensive; the risk isn't missing modules, it's (a) under-specifying the table-stakes polish inside each module that incumbents have spent years on (deck analytics, investor-DB freshness, CRM ergonomics, e-sign reliability) and (b) over-trusting "integration is the moat" without the connective tissue that makes integration *felt* (auto-propagation of facts between modules, a single timeline view, proactive nudges). The team's anti-feature list is sound and I'd add a few more.

The single most important validation finding: **every credible competitor in the "fundraising platform" sub-category (Flowlie, Visible, Foundersuite, Metal, Papermark) is converging on the same bundle Trochia describes** — investor DB + AI matching + network/warm-intro mapping + pipeline CRM + deck hosting/analytics + meeting intelligence + (increasingly) AI outreach drafting. Trochia's genuine white space is **(1) the deck *contradiction* reviewer grounded in the founder's actual business**, **(2) the persistent Business Memory seeded by Knowledge Pack Import**, and **(3) owning the *close* (SAFE + cap-table preview + e-sign) in the same tool** — which the CRM players deliberately don't touch and the cap-table players (Carta/Pulley) only enter once you've already closed. Everything else Trochia builds is table stakes that must be *at parity*, not differentiated.

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features founders assume any "fundraising tool" has. Missing or weak = the product feels like a toy next to Flowlie/Visible/Foundersuite and founders churn back to their spreadsheet + ChatGPT.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Investor pipeline / kanban CRM with custom stages, notes, reminders, last-contact tracking** | This *is* the baseline product category — Visible, Foundersuite, Flowlie, Metal, OpenVC, Affinity-lite all have it. | MEDIUM | PRD covers it (Pipeline Memory, §9.4). Under-specified: bulk actions, CSV import/export of the pipeline, email-sync ("BCC to log"), per-investor activity timeline, custom fields. Founders coming from Foundersuite/Visible will expect these. **Add to scope.** |
| **Investor database / discovery with stage, sector, check-size, geo filters** | Visible Connect (21k+ funds, 100k+ angels), Foundersuite (230k+), OpenVC, Crunchbase, Signal NFX, Flowlie all ship a searchable DB. A curated top-200 list will feel thin against this. | HIGH (to do well) | PRD's MVP curated-list approach is *defensible* for matching quality but **will be felt as a gap** for "let me just browse". Mitigation: be explicit in UI that it's a *curated* list ("we don't dump 20k funds on you"), and prioritize Harmonic at V2 sooner if churn data shows it. Don't under-sell this to design partners. |
| **Personalized cold-outreach email drafting** | Flowlie ("prepare your outreach"), Foundersuite (email sequences), and every GPT-wrapper does this. Founders expect AI to write the email. | LOW-MEDIUM | PRD covers it well (§8.3, with enrichment via Exa/Firecrawl). Strong here. Make sure tone-matching to the founder's writing actually works — that's the differentiator vs. generic GPT output. |
| **Deck hosting with per-view analytics (who opened, time per slide, downloads, forwards)** | DocSend invented this; Visible, Papermark, Flowlie, Gamma, Foundersuite all have it. Founders *expect* "DocSend-style tracking" the moment they hear "fundraising tool". | MEDIUM | **GAP in the PRD.** The Data Room module (V2) has *file-level* access analytics for the data room, but there is **no deck-link tracking** ("send my deck to this investor, see when they viewed it"). Decks are the #1 thing founders send and track. This should arguably be MVP-adjacent, not V2, and not buried inside "Data Room". **Flag for roadmap.** |
| **Investor update / newsletter sending** | Visible's flagship feature; Foundersuite, Rundit, Metal all have it. Even pre-raise founders want to "build the relationship before the ask". | MEDIUM | PRD has the **Investor Update Generator gated to V3 / Alumni tier only**. That's a defensible monetization choice but it's a table-stakes feature that competitors give away earlier. Consider a lightweight version (draft-only, no send) earlier, or accept the gap consciously. |
| **Application tracking for accelerators (YC, Techstars, Antler, etc.) with deadlines** | Niche but expected by the pre-seed segment; nobody does it *well* — this is a near-differentiator. | LOW-MEDIUM | PRD covers it (§8.2) with pre-loaded application banks for top 15 — genuinely good and rare. Keep it. |
| **Meeting transcript ingestion + summary (concerns/commitments/next-steps)** | Granola, Otter, Fireflies, Fathom, Fellow are ubiquitous; Flowlie now does "connect Google Calendar, get a deep-dive report per investor meeting". Founders already live in these. | MEDIUM | PRD covers paste/upload at MVP, Granola/Otter API at V2 (§9.2). Sensible. The summary→Pipeline Memory write-back is the differentiating bit. **Watch:** Flowlie's "meeting intelligence" is the closest competing feature — Trochia must do follow-up drafting *off the transcript* better than Flowlie's "next steps" bullets. |
| **24-hour post-call follow-up drafting referencing actual conversation** | Half-built everywhere (Flowlie's next-steps, generic GPT). Doing it grounded in the real transcript + business memory is near-table-stakes-becoming-differentiator. | MEDIUM | PRD covers it well (§9.3). Strong. |
| **Pre-call investor brief / dossier (partner, fund, recent deals, portfolio overlap, objections)** | Founders manually do this via Crunchbase + the partner's Twitter + podcasts. A few GPTs attempt it. Becoming expected. | MEDIUM-HIGH | PRD covers it (§9.1). The quality bar here is "this won't embarrass me" — citation accuracy and no-hallucinated-portfolio-companies is critical. **High eval priority.** |
| **Secure document/data room with permissions, expiry, watermarking, NDA gate** | DocSend, Digify, Papermark, Visible — the floor for "share my diligence docs". | MEDIUM-HIGH | PRD's approach (orchestrate Google Drive, `drive.file` scope, store only metadata) is *clever and privacy-forward* but means Trochia **inherits Drive's UX limits** — no watermarking, no print-blocking, no NDA gate, no screen-capture protection that Digify/DocSend offer. Diligence-stage founders *will* notice. Decide consciously: is "data room = a tidy Drive folder with tracking" enough, or does it need a hosted-viewer mode later? **Flag.** |
| **Cap-table view (founders / options / SAFEs / common) with ownership %** | Carta (80%+ share), Pulley, AngelList Equity, Cake, Eqvista. Even "pre-Carta" founders have *seen* Carta. | HIGH | PRD covers it (§12.2) as a "pre-Carta" deterministic-math preview with Excel export + Carta/Pulley hand-off. Smart positioning. Risk: founders may try to use it *as* the system of record — the "graduate to Carta at 30 SAFEs" warning is the right guardrail; keep it loud. |
| **SAFE generation from standard templates** | Cooley GO's free YC SAFE generator, Clerky, YC's own docs, AngelList. The *generator* part is commoditized and free. | MEDIUM (the engine is easy; the compliance posture is the hard part) | PRD covers it (§12.1) deterministically with the lawyer-review gate. **The feature itself is not a differentiator** (Cooley GO does it free) — the value is that it's *in the same tool as the cap table, e-sign, and F&F tracker*. Position accordingly: "generate → sign → cap table updates" as one flow, not "we have a SAFE generator". |
| **E-signature for the SAFE** | DocuSign, Dropbox Sign, HelloSign, Carta's built-in e-sign. Universal expectation. | MEDIUM | PRD covers it (§12.4) via Dropbox Sign. Standard. Buy it, don't build it — the PRD does. Investor-side mobile signing is correctly in scope (the *only* mobile surface that matters). |
| **Onboarding that doesn't require re-typing your whole business** | Every AI tool now offers "import your context" or starts with a wizard. Founders are import-fatigued. | MEDIUM | This is the Knowledge Pack Import — see "Differentiators" / "Onboarding" sections below. The *concept* is becoming table stakes; the *execution* (ChatGPT export ZIP, Claude Project MD, Notion export parsing) is still rare and is a genuine wedge. |
| **Citations on every AI answer / "I don't know" instead of hallucinating** | Post-2024, founders distrust un-cited AI. Perplexity-style citations are expected. | MEDIUM | PRD covers it (§6.2). Non-negotiable; good that it's specified. |
| **Privacy posture: not training on your data, tenant isolation, data export, deletion** | Carta/DocSend/Visible all have enterprise-grade trust pages; founders sharing decks + cap tables expect it. | MEDIUM | PRD covers it thoroughly (§5.4). This is itself a *stated* reason-to-believe ("defensibly mine, not training someone else's model") — make it visible in-product, not just in the ToS. |

### Differentiators (Competitive Advantage)

Where Trochia actually competes. The PRD's stated moat is "integrated memory + full-journey workflow ownership." Pressure-tested below.

| Feature | Value Proposition | Complexity | Notes / Pressure Test |
|---------|-------------------|------------|------------------------|
| **Deck *contradiction* reviewer grounded in the founder's real business (Business Memory)** | Nobody does this. PitchGrade/Slidebean grade against a generic rubric ("missing financials slide", "too much jargon"). DeckMatch generates an *investor-side* memo. Trochia catches "slide 3 says $40k MRR, slide 9 says $25k MRR" and "you claim 'no competitors' but your memory lists three" — deck-vs-reality mismatches. This is the "won't embarrass me" proof point. | HIGH (eval-heavy: false-positive rate must stay <25%; no fabricated slide refs) | **Strongest differentiator.** Genuinely defensible because it *requires* the memory spine — a deck-review GPT can't do it without your business facts. Eval harness from day 1 is correctly specified. This + the import wedge is the demo that sells the product. Protect it: keep the defect taxonomy proprietary and tuned. |
| **Persistent Business Memory + Pipeline Memory that every module reads/writes** | The spine. A fact entered once (MRR, team, raise target, what investor X said on the last call) propagates to the deck reviewer, outreach drafter, pre-call brief, application answers, DDQ filler, SAFE generator. Point tools each ask you to re-enter everything. | HIGH (schema design, RAG, conflict resolution, keeping it fresh) | **The real moat — but only if the propagation is *felt*.** The risk: if modules just *read* memory but the founder still has to manually trigger everything and re-confirm facts each time, it feels like seven tools sharing a database, not "one operator". The roadmap should explicitly fund the connective tissue: (a) auto-surface "your memory says X, your deck says Y — fix one?", (b) a single chronological "raise timeline" view across all modules, (c) memory-staleness prompts ("you said $40k MRR 6 weeks ago — still true?"). **These are not in the PRD as discrete features and should be added.** |
| **Knowledge Pack Import (paste / upload existing ChatGPT, Claude, Notion, Gemini context → seeded Business Memory)** | Removes the #1 onboarding friction. Founders have *already* spent hours setting up a "my startup" Custom GPT or Claude Project. Trochia inherits it in 30s. Almost no competitor does this. | MEDIUM (Tier 1 paste); MEDIUM-HIGH (Tier 2 ZIP/MD/Notion parsing); HIGH (Tier 3 browser extension) | **Best wedge; correctly prioritized.** Pressure test: (1) ChatGPT's Data Export ZIP is *huge and messy* (every conversation ever) — parsing the *relevant* startup context out of it is non-trivial; budget eval time. (2) The "confirm/edit each field with source snippet" UX is what makes founders trust it — don't cut it. (3) Tier 1 (paste) alone delivers ~80% of the value; ship it Week 3 as planned and don't let Tier 2/3 block. (4) Risk: a thin import that mostly produces "couldn't extract much, please fill this in manually" *destroys* the wedge — set a quality bar: a typical 1,500-word paste should auto-fill ≥8 fields. |
| **Owning the close: SAFE + cap-table preview + F&F tracker + e-sign in one flow** | Carta/Pulley start *after* you've closed; Cooley GO gives you a SAFE PDF and leaves; DocuSign signs anything; F&F tracking is done in spreadsheets. Nobody connects "verbal commit → generate SAFE → send for signature → cap table updates → investor moves to 'committed'". | HIGH (deterministic cap-table math + e-sign integration + UPL-safe SAFE engine) | **Real white space, V3.** The cap-table players won't come down-market (no margin in pre-seed); the e-sign players won't go vertical. F&F Round Manager specifically — "a CRM for the messy first $250k–$1M that is explicitly NOT a rolling fund" — is a genuine, un-served niche. Risk is regulatory (UPL, broker-dealer optics), not competitive — the PRD's guardrails are right; the Security Engineer audit of the variable-substitution engine is correctly flagged as critical. |
| **Warm-intro mapper from the founder's own LinkedIn export / Gmail, cross-referenced to the target investor list** | Flowlie has a "connection graph"; Signal NFX has "strongest intro path"; LinkedIn itself shows degrees of connection. Trochia's version is ToS-safe (founder-supplied export, no bulk scrape) and *integrated with the pipeline* (the intro request gets drafted, the contact gets logged). | MEDIUM | **Near-table-stakes-becoming-differentiator.** Flowlie is the closest competitor and does it well — Trochia's edge is integration + the auto-drafted intro request, not the mapping itself. Don't over-invest; get it to parity. The "no LinkedIn ToS violation" constraint is correct and important. |
| **Voice pitch coach (60–90s recording → structure + delivery scorecard, re-record, compare)** | Yoodli, VirtualSpeech, some GPTs do generic public-speaking coaching; almost none do *pitch-specific* scoring (Hook/Problem/Solution/Why You/Why Now × clarity/specificity/conviction) grounded in *your deck*. Also a viral content surface (founders share scored pitches). | HIGH (WebRTC capture, Deepgram, Hume prosody, custom filler detector, scoring agent) | **Good differentiator + GTM asset (the "pitch coaching reels" content pillar depends on it).** Risks: (1) accent-fairness on filler detection is a real liability — the >90% accuracy "on native and non-native speakers, never penalize accent" requirement is correctly specified and must be tested with diverse speakers; (2) it's the most infra-heavy V2 feature — if V2 is at risk of slipping, this is the candidate to cut to text-pitch-only first. |
| **Vertical-aware data-room checklist (distinct stacks for fintech/SaaS/marketplace/hardware/healthtech/consumer)** | DocSend/Papermark give you a generic startup checklist; Trochia tailors it (fintech gets BSA/AML, healthtech gets HIPAA/BAA, hardware gets FCC/CE/BOM). Cheap to build (it's a curated decision tree), surprisingly valuable. | LOW-MEDIUM | **High value-to-cost ratio.** Worth doing well. Note tension with the "no multi-vertical positioning" rule — this is *vertical-aware within fundraising*, which is fine; just don't let it leak into "we're a fintech compliance tool".|
| **Legal/vendor stack recommender as an affiliate-revenue decision tree** | Cooley GO links to its own templates; nobody runs a neutral "given your business type × stage × geography, here are 2-4 incorporation/banking/cap-table/counsel/compliance vendors with pros/cons/cost". | LOW-MEDIUM (it's curated content + affiliate plumbing) | Cheap, monetizable, low-risk *if* the "not legal advice" disclaimer discipline holds. Not a moat (anyone can build a decision tree) but a sensible revenue + retention feature. The affiliate-disclosure-on-every-card requirement is correct (FTC). |
| **DDQ auto-filler from Business Memory + data-room contents** | Carta has diligence tooling for funds; nothing founder-side auto-answers an investor's DDQ. Real time-saver at the diligence stage. | MEDIUM | Genuinely useful, depends entirely on Business Memory + Data Room being populated (dependency, see below). Format-preservation on the output DDQ is the tricky bit (the PRD flags it). |
| **Q&A drill (generate the 10–15 hardest investor questions about *your* deck, practice answering)** | Some GPTs do "generate investor questions"; doing it grounded in *your specific deck claims and memory gaps* + voice practice is rare. | MEDIUM | Nice complement to the deck reviewer (same underlying analysis). Lower priority than the reviewer itself — correctly V2. |

**Moat verdict:** The "integrated memory + full-journey" thesis holds — *conditionally*. The journey breadth alone is not defensible (Flowlie/Visible are creeping toward it). What's defensible is the **triad**: (1) the memory spine is genuinely hard to retrofit; (2) the deck-contradiction reviewer *only works* because of the spine; (3) owning the close is a category the incumbents structurally won't enter. The roadmap must protect all three and explicitly fund the "connective tissue" features that make the integration *felt* — without them, "integrated" is just a claim.

### Anti-Features (Commonly Requested, Often Problematic)

The team has already rejected the right things. Confirming each holds, plus additions.

| Feature | Why Requested / Tempting | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **AI joins the call and pitches in the founder's (or its own) voice** *(already rejected)* | "Let the AI do the meeting." Air.ai, Bland, Tavus speaker-mode tried it. | Buyers reject the category outright; liability surface; investors would walk. Confirmed dead. | The founder pitches; Trochia preps the brief, drills the Q&A, drafts the follow-up. **Hold the rejection.** |
| **Autonomous external sends (email, intros, signature requests, payments) without founder approval** *(already rejected)* | "Just send the 30 outreach emails for me." | One bad autonomous send to an investor is unrecoverable; spam-filter and reputation risk; trust-killer for a tool whose whole pitch is "won't embarrass you." | Founder approves every external action; sends go via the founder's own Gmail. **Hold — even at V3.** |
| **Avatar / "name your AI" persona UX** *(already rejected)* | Cute; some consumer AI apps do it. | Cosmetic; doesn't move retention; off-brand ("operator, not assistant"). | Plain, operator-grade UI. **Hold.** |
| **Mobile app at MVP** *(already rejected)* | "I want to check my pipeline on my phone." | Founders raise from laptops; full app is a V4-at-earliest investment that splits engineering focus. | Responsive web for read-only checks; **the one exception is investor-side mobile *signing*** (correctly in V3 e-sign scope) — that's the only mobile surface that matters. **Hold the no-app rule.** |
| **Legal advice of any kind / interpreting documents / recommending specific clauses, valuations, terms** *(already rejected)* | "What cap should I use?" "Is this term sheet fair?" | UPL exposure; the entire Legal Stack + SAFE generator depends on staying "templates + recommendations only." | Vendor recommendations + standard templates + "consult your lawyer" disclaimer on every screen + the un-bypassable lawyer-review gate on SAFE download. **Hold absolutely.** |
| **Cap-table as system of record** *(already rejected)* | "Why do I need Carta if Trochia tracks my cap table?" | Carta/Pulley are the systems of record investors and lawyers trust; trying to be one means audit-trail, 409A, compliance burdens Trochia shouldn't carry; the math being LLM-free is non-negotiable and even then it's "preview" grade. | "Pre-Carta" preview + Excel export + one-click Carta/Pulley hand-off; loud "graduate at 30 SAFEs" warnings. **Hold.** |
| **"Rolling fund" naming anywhere** *(already rejected)* | F&F module looks fund-ish. | Regulated SEC term (AngelList's 506(c) Adviser Act vehicle); permanent regulatory landmine. | "F&F Round Manager" / "Pre-Carta tracker" + "Trochia is not an investment vehicle, broker-dealer, or investment adviser" copy. **Hold — banned from product and marketing.** |
| **Multi-vertical positioning (creators, marketers, designers, "AI for everyone")** *(already rejected)* | Bigger TAM. | Broad ICP = no ICP; undifferentiated vs. ChatGPT/Claude/Copilot; dilutes the memory schema and the curated corpus. | Narrowly founder-fundraise. **Hold.** (Note: "vertical-*aware*" inside fundraising — fintech vs. healthtech data rooms — is fine and different.) |
| **Crypto/web3 token-raise founders** *(already rejected)* | Adjacent "raising" use case. | Regulatory complexity (securities, SAFT, jurisdiction roulette) the team explicitly won't take on; would compromise the UPL posture. | Equity SAFEs only. **Hold.** |
| **Investor-side product (deal-flow, scouting, portfolio management for VCs)** *(already rejected)* | "Sell to both sides." DeckMatch did this. | Different buyer, different sales motion, different data needs; would split focus before founder-side PMF. V4+ at earliest. | Stay founder-side; *maybe* a thin "founder-readiness" integration with accelerators later (GTM, not product). **Hold.** |
| **Cap-table math / SAFE legal language via LLM** *(already rejected)* | Faster to build. | A string-injection bug or a math error in a legal/financial doc is catastrophic and uninsurable. | Deterministic, unit-tested code for math; deterministic variable substitution against vetted templates for SAFEs; Security Engineer audit. **Hold absolutely.** |
| **Generic browser-controlling operator agent / overnight research briefings / GitHub-repo skill absorption** *(already rejected)* | Demo-flashy. | Anthropic Computer Use / OpenAI Operator will eat the browser-operator; the others aren't why founders pay; all are scope-creep away from the raise. | Focused, founder-approved workflows inside the seven modules. **Hold.** |
| **Permanent free tier** *(already rejected)* | More signups. | Dilutes the buyer pool with founders who'll never raise; raises support load; cheapens the "operator" positioning. | 7-day trial, card on file. **Hold.** (Counter-consideration: a *time-limited* free seat for accelerator cohorts is already in the GTM plan — that's targeted, not a permanent tier.) |
| **— ADDITIONAL, not yet on the team's list —** | | | |
| **Building your own deck *generator* (Gamma/Beautiful.ai/Pitch competitor)** | "Founders need to make decks too." | Crowded, commoditized (Gamma, Beautiful.ai, Pitch, Tome's corpse, Slidebean, Canva); a UI/design problem, not a memory/agent problem; would consume enormous design effort for no moat. | **Review** the founder's deck; don't *make* it. If anything, export a "reviewed/rewritten" version (already in scope for V2). **Recommend adding to the rejected list.** |
| **AI-generated *fake* traction / metrics / "make my numbers look better" rewrites** | A founder *will* ask the deck reviewer to "make this sound more impressive." | Catastrophic — Trochia's whole pitch is "won't embarrass you with investors"; helping a founder fluff numbers is the opposite, and is fraud-adjacent if it touches financials. The PRD already says financial figures never go in logs/training, but it should also say the reviewer *flags* unsupported claims rather than *amplifying* them. | Reviewer flags unsupported/vague claims and suggests *defensible* rewrites grounded in Business Memory; never invents or inflates. **Recommend an explicit product principle.** |
| **A built-in video-pitch / Loom-style recorder for sending async pitch videos to investors** | Some founders send async video pitches; DocSend/Papermark added video. | Adjacent but not core; recording/hosting/transcoding video is its own infra rabbit hole; the voice pitch *coach* is the in-scope, differentiated version. | Voice pitch coach for *practice*; if async video matters later, integrate Loom rather than build. **Recommend deferring / rejecting at MVP/V2.** |
| **Direct in-app investor messaging / "DM the VC through Trochia"** | "Why leave the app to email?" | Deliverability nightmare (founder's domain reputation matters; in-app relay lands in spam); investors don't want another inbox; conflicts with "send via your own Gmail." | Draft in Trochia, send from the founder's Gmail (already the design). **Recommend explicitly rejecting in-app relay.** |
| **Marketplace / "apply to investors through Trochia" (OpenVC-style inbound)** | OpenVC does this; "let investors find founders." | Drifts toward an investor-side product; quality-control and spam problems; not the buyer Trochia is built for. | Founder-driven outreach + warm intros only. **Recommend rejecting.** |

---

## Feature Dependencies

```
Business Memory (schema + Knowledge Pack Import + confirmation UI)         ← THE SPINE; nothing works without it
   ├──requires──> pgvector embeddings + curated fundraising corpus
   ├──feeds──────> Deck Reviewer (deck-vs-reality contradiction detection)
   ├──feeds──────> Ambient Q&A sidebar
   ├──feeds──────> VC/Accelerator Match (filters + scoring inputs)
   ├──feeds──────> Outreach Drafter (company hook, ask, tone)
   ├──feeds──────> Application-answer Drafter
   ├──feeds──────> Pre-Call Brief (objections reference memory fields)
   ├──feeds──────> Post-Call Follow-Up Drafter
   ├──feeds──────> Data-Room vertical checklist generator
   ├──feeds──────> DDQ Filler
   ├──feeds──────> Q&A Drill
   ├──feeds──────> SAFE Generator (company/founder identity, amounts)
   └──feeds──────> Investor Update Generator

Pipeline Memory (kanban + stages)                                          ← SECOND SPINE
   ├──requires──> Business Memory (a pipeline entry is meaningless without "what business is this")
   ├──fed by─────> VC/Accelerator Match ("interested" → creates entry)
   ├──fed by─────> Transcript Ingestion (transcript aligns to entry, updates stage)
   ├──fed by─────> Post-Call Follow-Up (sent → advances stage)
   ├──fed by─────> Data Room share links (per-investor analytics surface on the entry)
   ├──fed by─────> E-Sign (signed SAFE → investor → "committed")
   ├──fed by─────> F&F Round Manager (F&F entries → conversation stages)
   └──drives─────> Pre-Call Brief (prior interactions), Reminders, "round closed" → Alumni downgrade

Deck Reviewer ──enhances──> Q&A Drill (same deck analysis), Pre-Call Brief (deck context), Outreach (the hook)
Voice Pitch Coach ──shares-infra──> Q&A Drill (same WebRTC/Deepgram/Hume capture pipeline)
Warm-Intro Mapper ──requires──> founder's LinkedIn export  +  target investor list (from Match)
SAFE Generator ──requires──> standard templates + law-firm review partner (must be locked before build starts)
SAFE Generator ──feeds──> Cap-Table Orchestrator  +  E-Sign  +  F&F Round Manager (shared investor+amount+terms)
Cap-Table Orchestrator ──requires──> deterministic math engine (unit-tested; NO LLM)  ──exports──> Carta/Pulley
DDQ Filler ──requires──> Business Memory  +  Data Room contents (answers cite both)
Data Room ──requires──> Google Drive OAuth (drive.file scope)
Investor DB / Match quality ──improves-with──> Harmonic API (V2)  [MVP: curated top-200 fallback]
Investor Update Generator ──requires──> Business Memory  +  KPI snapshot  +  prior updates (tone-match)

[MISSING-FROM-PRD, recommend adding]
Deck-link tracking ("send deck, see views")  ──should-precede or accompany──> Data Room analytics
"Raise timeline" unified view  ──reads-from──> Business Memory + Pipeline Memory + all module activity
Memory-staleness prompts  ──reads-from──> Business Memory (last-updated timestamps)
Cross-module fact-conflict surfacing  ──reads-from──> Business Memory vs. deck/transcript/application content
```

### Dependency Notes

- **Everything depends on Business Memory.** It must be the first real feature built (PRD has it at Weeks 3–4, correctly — after foundation). If the import + confirmation UX is weak, *every downstream module degrades*. This is the highest-leverage thing to get right and the right place to spend extra eval time.
- **Pipeline Memory depends on Business Memory** (an investor interaction is contextless without "which company / which raise"). Build order in the PRD (Knowledge Layer → Pitch Lab → Investor Pipeline) is sound, though Pitch Lab arguably could swap with Pipeline — minor.
- **Deck Reviewer and Q&A Drill share the same underlying deck+memory analysis.** Building the reviewer first (MVP) makes the drill (V2) much cheaper. Good sequencing.
- **Voice Pitch Coach and Q&A Drill share the audio-capture pipeline.** Build the coach's WebRTC/Deepgram/Hume stack once; the drill reuses it. The PRD notes this. If V2 slips, ship Q&A Drill as text-only on the reviewer's analysis and defer voice.
- **SAFE Generator → Cap Table / E-Sign / F&F all share the (investor, amount, terms) tuple** — this is *why the PRD builds Raise Ops as one cohesive V3 module*, which is correct. The cap-table math engine is the long pole and must be built and unit-tested (30-scenario suite) before the UI.
- **The law-firm template-review partner must be locked before V3 build starts (Week ~23).** This is a *business* dependency on the critical path, currently an Open Question. Flag it loudly to the roadmap — it can't be resolved by engineering.
- **Harmonic API turns the "curated top-200" MVP fallback into a real investor DB at V2.** Match quality and pre-call-brief richness both step-change here. If design-partner feedback shows the curated list is a churn driver, accelerate Harmonic.
- **Data Room depends on Google Drive OAuth.** The `drive.file`-only scope is a deliberate trust choice that caps the feature's UX (no watermarking/print-block). If diligence-stage founders demand DocSend-grade controls, that's a future "hosted viewer" feature, not a config change.
- **Deck-link tracking (missing from PRD)** logically belongs *before or alongside* the V2 Data Room analytics — founders send the deck long before they send a data room. Recommend the roadmap pull a minimal version forward (a tracked link on the reviewed-deck PDF export) into the MVP or early-V2 window.

---

## MVP Definition

The PRD's own MVP (Weeks 0–10) is: Foundation + Knowledge Layer (Business Memory + Knowledge Pack Import Tiers 1–2 + ambient Q&A) + Pitch Lab deck reviewer (text) + Investor Pipeline (match + application tracker + outreach + warm-intro) + Live Raise (pre-call brief + transcript + follow-up + Pipeline Memory). This is well-scoped — it's the smallest end-to-end loop a founder can actually run a raise inside. Assessment below.

### Launch With (MVP / soft launch, Week 10) — agree with the PRD, with two adjustments

- [x] **Business Memory + Knowledge Pack Import (Tier 1 paste, Tier 2 file upload) + confirmation UI** — the wedge and the spine. Non-negotiable. (PRD: Weeks 3–4.) ✅ Keep.
- [x] **Ambient Q&A sidebar (RAG over corpus + memory, cited)** — the daily-use surface; cheap once the embeddings exist. ✅ Keep.
- [x] **Deck contradiction reviewer (text, PDF/PPTX/Slides) + accept/reject/edit + annotated-PDF export + eval harness** — the "won't embarrass me" demo. ✅ Keep; this is *the* feature to over-invest in.
- [x] **VC + accelerator match (curated top-200 + 30+ accelerators) + interested/not/met marking** — table stakes; curated-list approach is fine for MVP *if framed honestly* in the UI. ✅ Keep.
- [x] **Application tracker + AI-drafted answers (top-15 application banks)** — rare, valuable, cheap. ✅ Keep.
- [x] **Outreach drafter (enriched, tone-matched, send via own Gmail)** — table stakes. ✅ Keep.
- [x] **Warm-intro mapper (LinkedIn export → cross-ref → drafted intro request)** — near-table-stakes; get to parity with Flowlie. ✅ Keep.
- [x] **Pre-call brief + transcript ingestion (paste/upload) + post-call follow-up + Pipeline Memory kanban** — the live-raise loop; the "saves 5+ hours/week" proof. ✅ Keep.
- [x] **Billing (Pre-Raise $49 / Active Raise $199), trial, card-on-file; auth (Google SSO); privacy posture in-product** — non-negotiable plumbing. ✅ Keep.
- [ ] **ADD: minimal deck-link tracking** — when the founder exports the reviewed deck, give them a trackable link ("see when investor X opened it"). Small lift on top of the deck pipeline; closes a glaring table-stakes gap (DocSend-style tracking) without building a full data room. **Recommend pulling into MVP or earliest V2.**
- [ ] **ADD: a single "raise timeline" view** — one chronological feed across modules (deck reviewed, brief generated, transcript ingested, follow-up sent, stage changed). Makes the "one operator" claim *visible* from day 1. Modest lift (it's a query over existing event data). **Recommend MVP if cheap, else early V2.**

### Add After Validation (V2 — Weeks 11–22) — agree with the PRD's V2

- [ ] **Voice Pitch Coach** — differentiator + GTM content engine; most infra-heavy V2 item (cut to text-pitch-only if V2 slips). Trigger: deck reviewer validated, design partners asking for pitch help.
- [ ] **Q&A Drill** — cheap on top of the reviewer + voice infra. Trigger: voice coach shipped.
- [ ] **Knowledge Pack Import Tier 3 (browser extension)** — nice; Tier 1/2 deliver most of the value, so this is genuinely "after validation."
- [ ] **Data Room (vertical checklist + Drive orchestration + access analytics + DDQ filler)** — table stakes for the diligence stage; the vertical-aware checklist is the cheap high-value bit. Trigger: founders reaching diligence.
- [ ] **Legal Stack recommender + affiliate tracking** — revenue + retention; cheap (curated decision tree). Trigger: any time after Data Room; not gating.
- [ ] **Harmonic API integration** — upgrades match + brief quality. Trigger: curated-list quality complaints, or just "V2 budget allows it."
- [ ] **EU data residency + MFA** — needed for the EU founder push.
- [ ] **Memory-staleness prompts + cross-module fact-conflict surfacing** *(recommend adding)* — the "connective tissue" that makes the memory moat *felt*. Cheap-ish; high leverage on the core thesis.

### Future Consideration (V3+ — Weeks 23–36 and beyond)

- [ ] **Raise Ops bundle (SAFE generator + cap-table preview + F&F Round Manager + e-sign)** — the "own the close" white space. V3 as the PRD has it. **Hard dependency: law-firm template partner locked before build.**
- [ ] **Investor Update Generator + Alumni tier** — table-stakes-ish but consciously monetization-gated to V3/Alumni; consider a draft-only-no-send lite version earlier if churn data warrants.
- [ ] **Close Mode tier billing + auto-downgrade-to-Alumni** — V3 monetization plumbing.
- [ ] **V4+ (defer hard):** mobile app, investor-side product, post-raise KPI/reporting, hosted data-room viewer with watermarking. None of these before V3 traction proves out.

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Business Memory + Knowledge Pack Import (Tier 1 + 2) + confirmation UI | HIGH | MEDIUM-HIGH | **P1** |
| Deck contradiction reviewer (text) + eval harness | HIGH | HIGH | **P1** |
| Ambient Q&A sidebar (cited RAG) | MEDIUM-HIGH | MEDIUM | **P1** |
| VC + accelerator match (curated MVP list) + marking | HIGH | MEDIUM | **P1** |
| Outreach drafter (enriched, tone-matched) | HIGH | LOW-MEDIUM | **P1** |
| Pre-call brief + transcript ingest + follow-up + Pipeline Memory kanban | HIGH | MEDIUM-HIGH | **P1** |
| Application tracker + AI-drafted answers | MEDIUM-HIGH | LOW-MEDIUM | **P1** |
| Warm-intro mapper (LinkedIn export) | MEDIUM | MEDIUM | **P1/P2** |
| Billing + auth + privacy posture | HIGH (gating) | LOW-MEDIUM | **P1** |
| Deck-link tracking (DocSend-style) — *PRD gap* | HIGH | LOW-MEDIUM | **P1/P2** (recommend pulling forward) |
| "Raise timeline" unified view — *PRD gap* | MEDIUM-HIGH | LOW-MEDIUM | **P2** |
| Memory-staleness prompts + cross-module conflict surfacing — *PRD gap* | MEDIUM-HIGH (core thesis) | MEDIUM | **P2** |
| Voice Pitch Coach | HIGH (+ GTM) | HIGH | **P2** |
| Q&A Drill | MEDIUM | MEDIUM | **P2** |
| Vertical-aware data-room checklist | MEDIUM-HIGH | LOW-MEDIUM | **P2** |
| Google Drive data-room orchestration + access analytics | MEDIUM-HIGH | MEDIUM-HIGH | **P2** |
| DDQ filler | MEDIUM | MEDIUM | **P2** |
| Knowledge Pack Import Tier 3 (browser extension) | MEDIUM | HIGH | **P2/P3** |
| Legal Stack recommender + affiliate tracking | MEDIUM | LOW-MEDIUM | **P2** |
| Harmonic API integration | MEDIUM-HIGH (quality step-change) | MEDIUM | **P2** |
| SAFE generator (deterministic + lawyer-gate) | MEDIUM (commoditized as a feature; valuable in-flow) | MEDIUM (engine) + HIGH (compliance posture) | **P3 (V3)** |
| Cap-table orchestrator (deterministic math + Excel + Carta hand-off) | HIGH (for Close Mode) | HIGH | **P3 (V3)** |
| F&F Round Manager | MEDIUM-HIGH (un-served niche) | MEDIUM | **P3 (V3)** |
| E-Sign integration (Dropbox Sign) | HIGH (for Close Mode) | MEDIUM | **P3 (V3)** |
| Investor Update Generator | MEDIUM-HIGH (table-stakes elsewhere) | MEDIUM | **P3 (V3 / Alumni)** |

**Priority key:** P1 = MVP / soft launch (Week 10). P2 = V2 (Weeks 11–22). P3 = V3 (Weeks 23–36). Items tagged "*PRD gap*" are not currently in the PRD as discrete features and are recommended additions.

---

## Competitor Feature Analysis

(All products verified as active and current as of 2026 unless noted. Confidence MEDIUM-HIGH on existence/positioning; MEDIUM on exact feature depth.)

| Feature area | Closest competitors (current) | What they do | Trochia's approach / edge |
|--------------|-------------------------------|--------------|---------------------------|
| **AI deck review** | PitchGrade, Slidebean's AI reviewer, Gamma (analytics, not review), various GPT deck reviewers; DeckMatch (investor-side memos), Evalyze. *Tome's presentation product was sunset April 2025 — pivoted to sales automation.* | Generic-rubric grading: "missing financials/team slide", "too much jargon", "grade turns green when fixed". DeckMatch generates an investor-side investment memo. None ground feedback in the founder's *actual business facts*. | **Deck-vs-reality contradiction detection grounded in Business Memory** — catches numeric contradictions, claims unsupported by the founder's own memory, internal inconsistencies. Genuinely new. Eval-gated (false-positive <25%, no fabricated slide refs). |
| **Investor CRM / pipeline** | Visible.vc (kanban, custom stages, email sync, Zapier), Foundersuite (kanban, 230k+ DB, email sequences), Flowlie (CRM + 40-signal matching + connection graph), Metal (high-precision pipeline), OpenVC (opt-in directory), Affinity (heavier, more VC-side). | Mature kanban CRMs with custom stages, notes, reminders, deck hosting, email logging, CSV import/export. The category baseline. | **Pipeline Memory** auto-updated by transcript/follow-up/SAFE events, integrated with the rest of the journey. *Must reach feature parity on CRM ergonomics* (bulk actions, CSV, email-sync, custom fields) — PRD under-specifies these. |
| **Investor database / matching** | Visible Connect (21k+ funds, 100k+ angels — free tier), Foundersuite (230k+), Crunchbase, PitchBook (enterprise), Signal NFX (free, AI matching + intro paths), Harmonic (API/data layer), Flowlie (predictive matching). | Large searchable DBs with stage/sector/geo/check-size filters; some with AI fit-scoring and warm-path mapping (Flowlie, Signal). | **MVP: curated top-200 + 30+ accelerators** with stage/sector/geo tags + thesis-embedding similarity (quality over quantity). **V2: Harmonic API.** Edge is match *explanation* + integration; risk is the DB feeling thin — frame honestly. |
| **Warm-intro mapping** | Flowlie (connection graph), Signal NFX ("strongest intro path"), LinkedIn (degrees), Affinity (relationship intelligence, VC-side). | Map your network → target investors → suggest intro paths and strength. | **Founder-supplied LinkedIn export** (ToS-safe, no bulk scrape) → cross-ref → **auto-drafted intro request** → logged in Pipeline. Parity feature; edge is the drafting + integration. |
| **Cold outreach drafting** | Flowlie ("prepare your outreach"), Foundersuite (sequences), Apollo/Instantly (generic), countless GPTs. | Templated/AI-drafted emails, sometimes personalized. | **Enriched** (partner's recent X/LinkedIn posts, recent fund deals, podcasts via Exa+Firecrawl) + **tone-matched to the founder's writing** + send via own Gmail. Strong; the enrichment + tone-match is the edge. |
| **Meeting intelligence** | Granola (no-bot local capture, AI notes), Otter (real-time, highlights), Fireflies (bot + desktop, sentiment/analytics, 90+ integrations, CRM sync), Fathom (generous free tier), Fellow (agenda + notes), Flowlie (calendar-connected per-investor meeting reports). | Transcribe + summarize + (Fireflies/Flowlie) deal insights / sentiment / next steps. | **Ingest** from those tools (paste/upload MVP; Granola/Otter API V2), align to the pipeline entry, write topics/concerns/commitments to **Pipeline Memory**, and **draft the follow-up off the transcript**. Trochia is downstream of these, not competing with capture — the follow-up draft + memory write-back is the edge. |
| **Data room / doc sharing** | DocSend (page analytics, NDA gate, watermarking), Digify (VDR-grade: print-block, screen-capture-block, Q&A module, 6 permission levels), Papermark (open-source, self-hostable, DocSend-like), Visible (built-in data rooms), Notion-based rooms (DIY). | Secure hosting, granular permissions, watermarking, access analytics, NDA gates. | **Orchestrate Google Drive** (`drive.file` scope, store only metadata) + **vertical-aware checklist** + per-investor share-link analytics + **DDQ filler**. Privacy-forward but inherits Drive's UX limits (no watermark/print-block) — a conscious tradeoff; the vertical checklist + DDQ filler are the genuine adds. |
| **SAFE generation** | Cooley GO (free YC SAFE generator, US/UK/Singapore), Clerky (paid, lawyer-grade), YC's own docs page, AngelList (in-platform), Carta (in-platform). | Fill-in-the-blanks standard SAFE PDFs; Clerky/Carta add lawyer/cap-table integration. | **Deterministic variable substitution** against YC + Cooley GO templates + **un-bypassable lawyer-review gate** + audit trail, *integrated with cap table, e-sign, F&F tracker*. The generator alone isn't a moat (Cooley GO is free) — the in-flow integration is. |
| **Cap table** | Carta (~80%+ share, full equity OS, 409A, diligence), Pulley (~15%, cheaper, scenario modeling, 409A), AngelList Equity (*stopped accepting new Stack customers Aug 2026, pivoting*), Cake, Eqvista, Pilot. | System-of-record cap tables, 409A valuations, scenario modeling, investor portals. | **"Pre-Carta" deterministic-math preview** (no LLM), Excel export, what-if mode, **one-click Carta/Pulley hand-off** + "graduate at 30 SAFEs" warnings. Deliberately NOT a system of record — fills the gap *before* the founder needs Carta. |
| **E-signature** | DocuSign, Dropbox Sign (HelloSign), Carta's built-in e-sign, PandaDoc. | ESIGN/eIDAS-compliant signing, audit trails, mobile signing. | **Dropbox Sign API** wired into the SAFE flow → signed SAFE → cap table updates → investor → "committed". Buy, don't build; investor-side mobile signing in scope. |
| **F&F / angel-round tracking** | Spreadsheets (the actual incumbent), AngelList (SPV/syndicate vehicles — *not* what Trochia is), generic CRMs. | Mostly nothing purpose-built; founders use Sheets or a generic CRM; AngelList offers actual fund vehicles (different, regulated). | **F&F Round Manager** — a CRM/tracker for the messy first $250k–$1M, conversation stages, aggregate totals, integrated with SAFE gen + cap table. **Explicitly NOT a "rolling fund."** Genuinely un-served niche; risk is regulatory optics, not competition. |
| **Founder-knowledge / RAG assistant** | ChatGPT Custom GPTs, Claude Projects, Notion AI, Gemini Gems, generic "ask your docs" tools; Mem0/Letta (memory infra). | Founders DIY a "my startup" GPT/Project and re-paste context everywhere. No fundraising-specific grounding. | **Knowledge Pack Import** (inherit their existing GPT/Project/Notion context) + **persistent Business Memory** + **curated fundraising corpus** (YC manual, Sam Altman, Lenny's, Pari Passu, NfX, Charles Hudson, term-sheet libraries) + cited RAG. The import wedge + fundraising-specific corpus is the edge over a generic GPT. |
| **AI fundraising "copilot" (direct competitors)** | FundSpark, PitchBob, EasyVC, and various "AI fundraising copilot" launches (2026). | Bundle some of: investor discovery + outreach + tracking + (some) due diligence. Mostly thin, mostly no persistent memory, mostly no close-the-round features, several are also investor-side. | **Full F&F→Series-A journey under one memory spine** + deck-contradiction reviewer + owning the close. Breadth + the memory spine + the close are the moat; the journey breadth alone is being chased. **This is the segment to watch most closely.** |
| **"Founder OS" plays** | Notion templates, AngelList (founder side), Carta Launch, Stripe Atlas + ecosystem, Mercury's founder tooling, bundles like "Capbase". | Pieces of incorporation + banking + cap table + docs, loosely stitched. None own the *raise* end-to-end. | Trochia is the *raise-specific* OS — narrow by design. Doesn't compete with Atlas/Mercury/Carta; *recommends* them (Legal Stack) and hands off to them (cap table). Positioning, not feature, differentiation. |

---

## Gaps & Risks in the PRD's Feature Coverage (explicit call-outs for the roadmap)

1. **No standalone deck-link tracking ("DocSend for your deck").** Founders send the deck constantly and expect view-tracking on it — it's the single most-recognized fundraising-tool feature. The PRD only has *data-room* file analytics at V2. **Recommend: a tracked link on the reviewed-deck export, in MVP or earliest V2.**
2. **The "integration is the moat" thesis lacks the connective-tissue features that make it *felt*.** No unified "raise timeline" view, no memory-staleness prompts, no cross-module fact-conflict surfacing. Without these, "integrated" is a claim, not an experience. **Recommend: add a timeline view (MVP if cheap), staleness prompts + conflict surfacing (V2).**
3. **CRM ergonomics under-specified.** Founders migrating from Foundersuite/Visible expect bulk actions, CSV import/export of the pipeline, email-sync ("BCC to log"), custom fields. The PRD's Pipeline Memory describes the data model but not these affordances. **Recommend: spec these into the Pipeline Memory phase.**
4. **Investor-update generation gated to V3/Alumni only.** It's a table-stakes feature competitors give away earlier (Visible's flagship). The gating is a defensible monetization call, but be conscious it's a felt gap; consider a draft-only-no-send lite version earlier.
5. **Data Room inherits Google Drive's UX ceiling** — no watermarking, print-blocking, NDA gate, screen-capture protection that DocSend/Digify offer. Fine for early diligence; may need a "hosted viewer" mode if institutional-round founders push. **Recommend: note as a known limitation, not a near-term build.**
6. **Curated-list investor DB will be felt as thin** vs. Visible Connect / Foundersuite / Crunchbase. Defensible for *match quality* at MVP but frame honestly in-product, and have a trigger to accelerate Harmonic if it drives churn.
7. **Law-firm SAFE-template-review partner is a business dependency on the V3 critical path** and is currently an Open Question. It can't be solved by engineering — **flag for the roadmap as a hard, non-engineering blocker that must be resolved before Week ~23.**
8. **Accuracy/hallucination is the existential product risk, not a feature gap** — but worth restating: the pre-call brief (no fabricated portfolio companies), the deck reviewer (no fabricated slide refs, <25% false positives), and the SAFE engine (deterministic, string-injection-audited) are the three places where one bad output destroys "won't embarrass you." The eval-harness-from-day-1 discipline is correctly in the PRD; the roadmap should treat eval coverage as a phase exit gate, not an afterthought.
9. **Recommended additions to the rejected/anti-feature list:** building a deck *generator*; AI-amplified/fluffed metrics in the deck reviewer (it must flag unsupported claims, never inflate them); async video-pitch recorder; in-app investor messaging relay; OpenVC-style inbound investor marketplace.

---

## Onboarding / Activation Features — Assessment of the "Knowledge Pack Import" wedge

**The wedge is real and correctly identified.** Founders who use ChatGPT/Claude daily have *already* invested effort building a "my startup" Custom GPT, Claude Project, or Notion brief. The #1 onboarding friction for any new founder tool is "now re-type everything you've told ChatGPT." Trochia inheriting that context in 30 seconds is a genuine, near-unique entry point — I found no fundraising tool doing this, and only a handful of AI tools generally.

**What makes it work (don't cut these):**
- **The confirmation/edit UX with source snippets.** Founders won't trust an auto-extracted business profile they can't see the provenance of. "Here's what we pulled, here's the sentence we pulled it from, edit anything" is what turns extraction into trust. This is the activation moment — it's where the founder *feels* "this knows my business." Make it feel fast and accurate, not like data-entry homework.
- **Conflict surfacing.** Real founder docs contradict themselves ("$40k MRR" in one place, "$25k" in another). Surfacing both and asking the founder to resolve is *also* a trust signal (it shows the system actually read the content) — and it seeds the cross-module conflict-detection capability.
- **Tier 1 (paste) is ~80% of the value and ships Week 3.** Correctly prioritized. A founder pasting their Custom GPT instructions or a Notion company brief should produce a usefully-populated Business Memory (≥8 fields auto-filled for a typical 1,500-word paste). Don't let Tier 2 (ZIP/MD/Notion parsing) or Tier 3 (browser extension) block — they're polish, not the wedge.

**Risks specific to the import:**
- **ChatGPT's Data Export ZIP is enormous and noisy** (every conversation the user has ever had). Extracting the *startup-relevant* context out of it is genuinely hard — budget eval time, and consider asking the user to point at specific conversations or just lean on Tier 1 paste for ChatGPT users.
- **A thin import is worse than no import.** If the typical result is "we couldn't extract much, please fill in these 12 fields manually," the wedge backfires — the founder feels the tool is dumb *and* they still have the data-entry chore. Set and enforce a quality bar.
- **Privacy in the import path.** Pasted/uploaded content may contain PII for unrelated parties (employees, customers, other founders) — the PRD's "flag and redact before save" requirement (§6.1.6) is correct and important; make sure it actually fires.
- **The "<5 minute onboarding" target depends entirely on this.** Sign-in → welcome → Knowledge Pack Import → deck upload → auto deck review → dashboard with 3 CTAs. If the import takes 4 minutes or produces a mess that needs 10 minutes of editing, the whole activation funnel breaks. The PRD's >70%-complete-import-within-5-minutes activation metric is the right thing to measure.

**Other activation features in the PRD, assessed:**
- **Auto deck review immediately after upload** — strong activation moment ("first contradiction flagged in <5 min" is the time-to-first-value metric). This + the import are the two activation hooks; both are well-chosen.
- **Dashboard with three CTAs ("Generate VC fit list", "Prepare for a call", "Draft outreach")** — good; gives the founder an obvious next action. Make sure each CTA delivers value in one click (the fit list especially — if it's slow or thin, the activation stalls there).
- **7-day trial, card on file** — appropriate for a high-intent, time-bounded buyer; no friction-reducing free tier needed (and correctly rejected).
- **Founder Audit ($499, first 100)** — doubles as high-touch onboarding + a training-data loop; smart, low-risk to keep.

**Verdict:** The onboarding/activation design is the strongest part of the PRD's GTM-meets-product thinking. The single biggest risk is execution quality of the import extraction — it's a hard NLP/parsing problem dressed up as a simple feature, and it deserves the same eval rigor as the deck reviewer. If it works, it's the demo that converts; if it's mediocre, the whole "knows my business better than ChatGPT" pillar wobbles.

---

## Sources

Competitive landscape verified against current (2026) product pages and review roundups:

- [Visible.vc — investor relationship hub / fundraising CRM / Visible Connect database](https://visible.vc/) ; [Visible.vc Review 2026 (StartupOwl)](https://startupowl.com/reviews/visible-vc) ; [Visible Connect investor database announcement](https://visible.vc/blog/visible-connect-investor-database/)
- [Foundersuite vs Visible vs OpenVC comparison (Flowlie blog)](https://www.flowlie.com/blog/fundraising-tools-quick-look-at-five-alternatives-to-foundersuite/) ; [Best CRM for fundraising 2026 (Gritt.io)](https://www.gritt.io/blog/best-crm-for-fundraising) ; [Foundersuite vs Visible (SaaSHub)](https://www.saashub.com/compare-foundersuite-vs-visible-vc)
- [Flowlie — AI-powered VC fundraising platform](https://www.flowlie.com/) ; [Flowlie investor CRM](https://www.flowlie.com/product/investor-crm/) ; [Flowlie 2026 (GetApp)](https://www.getapp.com/finance-accounting-software/a/flowlie/)
- [Metal — high-precision fundraising](https://www.metal.so/) ; [Best startup fundraising tools 2026 (Papermark)](https://www.papermark.com/blog/best-startup-fundraising-tools)
- [Best pitch deck software 2026 (Winning Presentations)](https://winningpresentations.com/best-pitch-deck-software/) ; [PitchGrade review 2026 (AI Cloudbase)](https://aicloudbase.com/tool/pitchgrade) ; [Slidebean free AI pitch deck reviewer](https://slidebean.com/pitch-deck-reviewer) ; [Gamma AI review 2026](https://www.slidegmm.ai/en/blog/gamma-ai-review-2026) — note: Tome sunset its presentation product April 30, 2025
- [DeckMatch](https://www.deckmatch.com/) ; [DeckMatch Crunchbase profile](https://www.crunchbase.com/organization/deckmatch) ; [Evalyze — AI investor matching + pitch deck analysis](https://www.evalyze.ai/)
- [Signal by NFX — investor matching + intro paths](https://signal.nfx.com/) ; [Signal FAQ](https://signal.nfx.com/faq)
- [DocSend vs Digify 2026 (Dataroom-Providers)](https://dataroom-providers.org/blog/digify-vs-docsend/) ; [Top 10 DocSend alternatives 2026 (Digify)](https://digify.com/top-10-docsend-alternatives-in-2026.html) ; [Best DocSend alternatives for startups 2026 (Ellty)](https://www.ellty.com/blog/docsend-alternatives)
- [Granola vs Fireflies 2026 (Fireflies blog)](https://fireflies.ai/blog/granola-vs-fireflies-an-honest-comparison-for-teams-in-2026/) ; [Meeting note tool pricing — Granola vs Fireflies vs Fathom vs Otter (Granola)](https://www.granola.ai/blog/meeting-note-tool-pricing-granola-vs-fireflies-fathom-otter) ; [Best AI meeting notes 2026 (Zack Proser)](https://zackproser.com/blog/best-ai-meeting-notes-tools-2026)
- [Carta — switching from AngelList or Pulley](https://carta.com/blog/switch-cap-table/) ; [Best cap table software 2026 (VC Beast)](https://vcbeast.com/best-cap-table-management-software) ; [AngelList vs Carta vs Pulley (VC Beast)](https://vcbeast.com/angellist-vs-carta-vs-pulley-comparison) — note: AngelList stopped accepting new Stack customers Aug 2026
- [Cooley GO — generate custom Y Combinator SAFE documents](https://www.cooleygo.com/generate-y-combinator-safe/) ; [YC Safe financing documents](https://www.ycombinator.com/documents) ; [Clerky](https://www.clerky.com/)
- [FundSpark — AI copilot for fundraising (Product Hunt)](https://www.producthunt.com/products/fundspark-founders-edition) ; [PitchBob AI startup founder's co-pilot](https://pitchbob.io/products/ai-startup-founders-co-pilot) ; [Best fundraising CRM platforms with AI features (EasyVC)](https://easyvc.ai/blog/best-fundraising-crm-platforms-with-ai-features/)

Primary source documents (read in full):
- `.planning/PROJECT.md` — full Active requirements list + Out of Scope list
- `.planning/intel/Trochia_AI_PRD_v2.docx` — full PRD (per-feature user stories, functional requirements, acceptance criteria, data models, edge cases, 36-week build sequence)
- `.planning/intel/Trochia_AI_Strategy_v1.md` — strategy & decision log incl. "What We Killed"

---
*Feature research for: agentic founder-fundraising operating system (pre-seed/seed)*
*Researched: 2026-05-11*
