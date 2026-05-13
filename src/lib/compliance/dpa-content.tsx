/**
 * The DPA content as a React element — for the `/legal/dpa` page (Plan 08).
 *
 * The text itself lives in `./dpa-sections.ts` (a dependency-free data module so the
 * PDF generator and tests can import it too). This file is the React view over that
 * single source. Plan 08's page renders `<DpaContent />` inside the marketing layout.
 *
 * Re-exports `DPA_SECTIONS` / `DpaSection` / `dpaPlainText` so callers that already
 * import from `dpa-content` keep working.
 */
import type { ReactElement } from 'react';

import { DPA_SECTIONS } from '@/lib/compliance/dpa-sections';

export { DPA_SECTIONS, dpaPlainText } from '@/lib/compliance/dpa-sections';
export type { DpaSection } from '@/lib/compliance/dpa-sections';

/**
 * The DPA as a React element. Intentionally unstyled here; the `/legal/dpa` page
 * wraps it in the marketing layout / prose styles.
 */
export function DpaContent(): ReactElement {
  return (
    <article>
      {DPA_SECTIONS.map((section) => (
        <section key={section.heading}>
          <h2>{section.heading}</h2>
          {section.paragraphs.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </section>
      ))}
    </article>
  );
}
