import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

/**
 * Trochia ESLint config (flat).
 *
 * Extends Next core-web-vitals + TypeScript and adds the cross-cutting
 * guardrails configured in Phase 1 (some are no-ops until the dirs they guard
 * exist — they "just work" once those dirs land):
 *
 *  1. Import boundaries:
 *     - `src/safe-engine/**` and `src/cap-table-engine/**` may NOT import `src/ai/**`
 *       (or `@/ai/*`). [no-op until those dirs exist]
 *     - Nothing outside `src/ai/**` may import `@anthropic-ai/sdk` or `openai`
 *       — those SDKs are chokepoint-only (`ai/client.ts` / `ai/fallback.ts`).
 *  2. No hardcoded site URLs: string literals matching /https?:\/\/trochia/i are
 *     banned everywhere except `src/lib/env.ts` and test/e2e files.
 *  3. No raw `console.*` in `src/**` except `src/lib/logger.ts`, `scripts/**`,
 *     and test/e2e files — everything logs through `@/lib/logger`.
 */

const HARDCODED_URL_SYNTAX = {
  selector:
    "Literal[value=/https?:\\/\\/trochia/i], TemplateElement[value.raw=/https?:\\/\\/trochia/i]",
  message:
    'Do not hardcode trochia.* URLs. Read SITE_URL / APP_URL from "@/lib/env" instead (FND-08).',
};

const AI_SDK_RESTRICTED_IMPORTS = {
  paths: [
    {
      name: '@anthropic-ai/sdk',
      message:
        'The Anthropic SDK is chokepoint-only. Import the AI client from src/ai/** (ai/client.ts), never the SDK directly.',
    },
    {
      name: 'openai',
      message:
        'The OpenAI SDK is chokepoint-only (ai/fallback.ts). Do not import it directly outside src/ai/**.',
    },
  ],
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,

  globalIgnores([
    '.next/**',
    'out/**',
    'build/**',
    'coverage/**',
    'playwright-report/**',
    'test-results/**',
    'next-env.d.ts',
  ]),

  // ── Repo-wide: no hardcoded trochia URLs ──
  {
    files: ['src/**/*.{ts,tsx,js,jsx,mjs}'],
    ignores: ['src/lib/env.ts'],
    rules: {
      'no-restricted-syntax': ['error', HARDCODED_URL_SYNTAX],
    },
  },

  // ── No raw console in src/** (logger.ts excepted) ──
  {
    files: ['src/**/*.{ts,tsx,js,jsx}'],
    ignores: ['src/lib/logger.ts'],
    rules: {
      'no-console': 'error',
    },
  },

  // ── AI SDK chokepoint: ban direct SDK imports outside src/ai/** ──
  {
    files: ['src/**/*.{ts,tsx,js,jsx}'],
    ignores: ['src/ai/**'],
    rules: {
      'no-restricted-imports': ['error', AI_SDK_RESTRICTED_IMPORTS],
    },
  },

  // ── safe-engine / cap-table-engine may never reach into ai/** ──
  {
    files: ['src/safe-engine/**/*.{ts,tsx,js,jsx}', 'src/cap-table-engine/**/*.{ts,tsx,js,jsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          ...AI_SDK_RESTRICTED_IMPORTS,
          patterns: [
            {
              group: ['@/ai', '@/ai/*', '**/ai/*', '../ai/*', '../../ai/*'],
              message:
                'safe-engine and cap-table-engine must not import from ai/** — cap-table / SAFE math never touches an LLM (constraints.md).',
            },
          ],
        },
      ],
    },
  },

  // ── Tests, e2e, scripts, configs: relax console + URL rules ──
  {
    files: [
      'tests/**/*.{ts,tsx}',
      'e2e/**/*.{ts,tsx}',
      'scripts/**/*.{mjs,js,ts}',
      '*.config.{ts,mjs,js}',
      'playwright.config.ts',
      'vitest.config.ts',
    ],
    rules: {
      'no-console': 'off',
      'no-restricted-syntax': 'off',
      'no-restricted-imports': 'off',
    },
  },
]);

export default eslintConfig;
