/**
 * The Data Processing Addendum (DPA) text — the SINGLE SOURCE, as plain structured data.
 *
 * This module is dependency-free (no React, no `server-only`) so it can be imported by:
 *   - `src/lib/compliance/dpa-content.tsx` → the `<DpaContent />` React element for the
 *     `/legal/dpa` page (Plan 08)
 *   - `scripts/generate-dpa-pdf.mts` → renders `public/legal/dpa.pdf` (@react-pdf/renderer)
 *   - tests (the banned-string self-check runs over `dpaPlainText()`)
 *
 * Keep the text here and nowhere else so the PDF and the page never drift. Bump
 * `DPA_VERSION` in `src/lib/compliance/dpa.ts` on any material revision.
 *
 * Scope: a GDPR / UK-GDPR / DPDP (India) / LGPD (Brazil)-grade processing addendum,
 * Trochia-authored — a strong real draft in plain operator English. A legal review
 * happens before broad GA. This document does not constitute legal advice.
 */

/** The current DPA text version. Bump on a material revision (triggers re-acceptance). Re-exported from `dpa.ts`. */
export const DPA_VERSION = '2026-05';

/** One section of the DPA: a heading and its paragraphs. The PDF and the web page both render this. */
export interface DpaSection {
  heading: string;
  paragraphs: string[];
}

/** The DPA body, as structured data. The single source of truth. */
export const DPA_SECTIONS: DpaSection[] = [
  {
    heading: '1. Parties and scope',
    paragraphs: [
      'This Data Processing Addendum ("Addendum") forms part of the agreement between Trochia AI ("Trochia", "we", the processor) and the customer who accepts it ("Customer", "you", the controller) for use of the Trochia product (the "Service").',
      'It governs Trochia\'s processing of personal data on the Customer\'s behalf in the course of providing the Service. Where it conflicts with the rest of the agreement on the subject of data processing, this Addendum controls.',
      'It is drafted to meet the requirements of the EU General Data Protection Regulation (GDPR), the UK GDPR, India\'s Digital Personal Data Protection Act (DPDP), and Brazil\'s Lei Geral de Proteção de Dados (LGPD), and applies to the extent any of those laws governs the processing.',
    ],
  },
  {
    heading: '2. Subject matter and duration',
    paragraphs: [
      'Subject matter: the processing necessary to operate the Service for the Customer — storing the Customer\'s tenant data, running the product features the Customer invokes, and the supporting infrastructure.',
      'Duration: for as long as the Customer\'s account is active, plus the wind-down window described in Section 9 (deletion). Trochia processes the Customer\'s personal data only for the duration of the agreement and for the limited post-termination period needed to delete it.',
    ],
  },
  {
    heading: '3. Nature and purpose of processing',
    paragraphs: [
      'Trochia processes personal data solely to provide, secure, maintain, and improve the Service for the Customer, and to comply with the Customer\'s documented instructions (the agreement, this Addendum, and the configuration choices the Customer makes in the product).',
      'Trochia does not process the Customer\'s personal data for its own purposes, does not sell it, and does not share it except with the sub-processors listed in Section 5 and as required by law.',
    ],
  },
  {
    heading: '4. Categories of data subjects and personal data',
    paragraphs: [
      'Data subjects: the Customer\'s authorized users (the founder and any team members), and — in later product modules — the individuals named in the Customer\'s uploaded materials (e.g. investor contacts the Customer adds to their pipeline).',
      'Categories of personal data: account and contact details (name, email); authentication metadata; billing identifiers (not full payment-card numbers — those are handled by the payments sub-processor); and the content the Customer puts into the Service (which may include pitch materials, business documents, contact records, and meeting transcripts in later modules). Trochia does not require special-category data and asks Customers not to submit it.',
    ],
  },
  {
    heading: '5. Sub-processors',
    paragraphs: [
      'Trochia uses the sub-processors listed in its vendor data-flow inventory (the document at docs/vendor-data-flow.md in the product repository, surfaced on the /legal/dpa page) to provide the Service. That inventory records, for each sub-processor, what data reaches it, whether it trains any model on inputs, its retention, and its contract status. It is kept current.',
      'Trochia imposes data-protection terms on each sub-processor no less protective than those in this Addendum. Trochia will give Customers a way to be notified of new sub-processors before they begin processing, and a reasonable opportunity to object on legitimate data-protection grounds.',
      'Trochia remains responsible for its sub-processors\' performance of their data-protection obligations.',
    ],
  },
  {
    heading: '6. No use of customer data for model training (XC-01)',
    paragraphs: [
      'Trochia does not use the Customer\'s data — including any content the Customer submits to the Service and any prompts or outputs derived from it — to train, fine-tune, or otherwise improve any machine-learning model, whether Trochia\'s own or a third party\'s.',
      'The AI sub-processors Trochia uses are engaged on terms under which the Customer\'s inputs and outputs are not used to train their models, and are retained only briefly for abuse-monitoring before deletion. The per-vendor specifics (including which vendor, what posture, and what retention) are recorded in the vendor data-flow inventory referenced in Section 5.',
      'This commitment is also stated in the product and in the Terms of Service. Any change to it would be a material revision communicated to Customers in advance.',
    ],
  },
  {
    heading: '7. Confidentiality and security measures',
    paragraphs: [
      'Trochia ensures that the people authorized to process the Customer\'s personal data are bound by confidentiality obligations.',
      'Trochia implements appropriate technical and organizational measures, including: tenant isolation enforced at the database layer (row-level security, default-deny), encryption of data in transit and at rest, scoped credentials and least-privilege access, redaction of sensitive fields in logs and error reports, secret-management for service credentials, and monitoring. Measures are reviewed and updated as the product and the threat landscape evolve.',
    ],
  },
  {
    heading: '8. Personal-data breach notification',
    paragraphs: [
      'If Trochia becomes aware of a personal-data breach affecting the Customer\'s personal data, Trochia will notify the Customer without undue delay and will provide the information the Customer reasonably needs to meet its own notification obligations to regulators and data subjects.',
      'Trochia will take reasonable steps to mitigate the breach and prevent recurrence, and will document breaches and the remedial action taken.',
    ],
  },
  {
    heading: '9. Assistance to the Customer; data-subject rights',
    paragraphs: [
      'Taking into account the nature of the processing, Trochia will assist the Customer — by appropriate technical and organizational measures, insofar as possible — in responding to requests from data subjects to exercise their rights (access, rectification, erasure, restriction, portability, objection), and in meeting the Customer\'s obligations around security, breach notification, and data-protection impact assessments.',
      'The Service provides the Customer with self-service tools for the most common requests: an on-demand export of all of the Customer\'s tenant data (a structured JSON dump, delivered via an expiring signed download link), and account deletion.',
    ],
  },
  {
    heading: '10. Deletion and return of data',
    paragraphs: [
      'On request, and on termination of the agreement, Trochia will delete the Customer\'s personal data, except to the extent applicable law requires Trochia to retain it.',
      'Account deletion is a soft delete followed by a permanent purge: when a Customer deletes their account, Trochia marks it deleted and stops using it; thirty (30) days later an automated process permanently removes the account and all of its tenant data, cascading to every dependent record. Within that 30-day window the Customer may restore the account; after it, the deletion is irreversible by design.',
      'On termination without a deletion request, Trochia deletes the Customer\'s data within a reasonable period after the wind-down of the agreement.',
    ],
  },
  {
    heading: '11. International transfers and data residency',
    paragraphs: [
      'Trochia hosts Customer data in a region appropriate to the Customer. The Service supports United States and India data regions, with an European Union region planned. The product carries a region seam so a Customer\'s data can be placed in the region selected for them.',
      'Where personal data is transferred out of the EEA, the UK, or another jurisdiction with transfer-restriction rules, Trochia relies on a lawful transfer mechanism — the European Commission\'s Standard Contractual Clauses (and the UK International Data Transfer Addendum / Addendum to the SCCs) or another approved mechanism — and applies supplementary measures as needed. The Customer authorizes such transfers for the purpose of providing the Service.',
    ],
  },
  {
    heading: '12. Audit rights',
    paragraphs: [
      'Trochia will make available to the Customer the information reasonably necessary to demonstrate compliance with this Addendum, and will allow for and contribute to audits — including inspections — conducted by the Customer or an auditor the Customer mandates, on reasonable prior notice, during business hours, no more than once a year (unless a regulator requires otherwise or a breach has occurred), and subject to confidentiality. Trochia may satisfy audit requests by providing relevant third-party certifications or reports where available.',
    ],
  },
  {
    heading: '13. General',
    paragraphs: [
      'This Addendum is governed by the law that governs the underlying agreement, except where mandatory data-protection law requires otherwise. If any provision is held invalid, the rest remains in effect. Trochia may update this Addendum to reflect changes in law, sub-processors, or the Service; material changes are communicated to Customers in advance and require renewed acceptance.',
      'This Addendum does not constitute legal advice. The Customer is responsible for determining whether the Service and this Addendum meet the Customer\'s own compliance obligations.',
    ],
  },
];

/** The plain-text rendering of the DPA (used by the banned-string self-check and the PDF). */
export function dpaPlainText(): string {
  return DPA_SECTIONS.map((s) => `${s.heading}\n\n${s.paragraphs.join('\n\n')}`).join('\n\n');
}
