import { afterEach, describe, expect, it, vi } from 'vitest';

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.resetModules();
});

describe('lib/env', () => {
  it('exports env, SITE_URL and APP_URL when the site URLs are set', async () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://example.test';
    process.env.NEXT_PUBLIC_APP_URL = 'https://app.example.test';
    vi.resetModules();
    const mod = await import('@/lib/env');
    expect(mod.env).toBeDefined();
    expect(mod.SITE_URL).toBe('https://example.test');
    expect(mod.APP_URL).toBe('https://app.example.test');
  });

  it('throws a Zod error when NEXT_PUBLIC_SITE_URL is unset', async () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    delete process.env.NEXT_PUBLIC_APP_URL;
    vi.resetModules();
    await expect(import('@/lib/env')).rejects.toThrow();
  });

  it('treats every other Phase-1 var as optional (no throw when only site URLs are set)', async () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://example.test';
    process.env.NEXT_PUBLIC_APP_URL = 'https://example.test';
    delete process.env.DATABASE_URL;
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    vi.resetModules();
    const mod = await import('@/lib/env');
    expect(mod.env.DATABASE_URL).toBeUndefined();
    expect(mod.env.STRIPE_SECRET_KEY).toBeUndefined();
    expect(mod.env.ANTHROPIC_API_KEY).toBeUndefined();
  });

  it('coerces AI_FALLBACK_ENABLED to a boolean', async () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://example.test';
    process.env.NEXT_PUBLIC_APP_URL = 'https://example.test';
    process.env.AI_FALLBACK_ENABLED = 'true';
    vi.resetModules();
    const mod = await import('@/lib/env');
    expect(mod.env.AI_FALLBACK_ENABLED).toBe(true);
  });
});
