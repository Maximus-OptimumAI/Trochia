#!/usr/bin/env tsx
/**
 * Generate `public/legal/dpa.pdf` from the single-source DPA content
 * (`src/lib/compliance/dpa-sections.ts` → `DPA_SECTIONS`) using @react-pdf/renderer.
 *
 * Run via `npm run gen:dpa-pdf` (uses `tsx`). The committed PDF is the artifact;
 * re-run this whenever `DPA_SECTIONS` or `DPA_VERSION` changes. (We commit the
 * rendered PDF rather than rendering at build time to keep the build deterministic
 * and dependency-light.)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import React from 'react';
import { Document, Page, Text, View, StyleSheet, renderToFile } from '@react-pdf/renderer';

import { DPA_SECTIONS, DPA_VERSION } from '../src/lib/compliance/dpa-sections';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, '..', 'public', 'legal', 'dpa.pdf');

const styles = StyleSheet.create({
  page: {
    paddingTop: 56,
    paddingBottom: 56,
    paddingHorizontal: 56,
    fontSize: 10,
    lineHeight: 1.5,
    color: '#0A0E1A',
  },
  title: { fontSize: 16, marginBottom: 4 },
  version: { fontSize: 9, color: '#6B7280', marginBottom: 18 },
  heading: { fontSize: 11, marginTop: 14, marginBottom: 4 },
  paragraph: { marginBottom: 6 },
});

const doc = React.createElement(
  Document,
  null,
  React.createElement(
    Page,
    { size: 'A4', style: styles.page },
    React.createElement(Text, { style: styles.title }, 'Trochia AI — Data Processing Addendum'),
    React.createElement(Text, { style: styles.version }, `Version ${DPA_VERSION}`),
    ...DPA_SECTIONS.map((section, si) =>
      React.createElement(
        View,
        { key: si, wrap: true },
        React.createElement(Text, { style: styles.heading }, section.heading),
        ...section.paragraphs.map((p, pi) =>
          React.createElement(Text, { key: pi, style: styles.paragraph }, p),
        ),
      ),
    ),
  ),
);

async function main(): Promise<void> {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  await renderToFile(doc, OUT as unknown as string);
  console.log(`Wrote ${OUT}`);
}

void main();
