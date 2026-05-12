'use client';

/**
 * Providers — the single client-side context boundary for the whole app.
 *
 * Mounted ONCE in src/app/layout.tsx as `<Providers>{children}</Providers>`.
 * Downstream plans register their React context providers HERE, never by
 * re-editing layout.tsx (which is a cross-plan file-conflict hazard):
 *
 *   - Plan 05 wraps <AnalyticsProvider> (Amplitude) around {children} here.
 *   - Plan 07 wraps the tRPC <TRPCReactProvider> around {children} here.
 *   - any future context provider → add it in this component.
 *
 * Phase 1 wires only the TanStack Query client (a Plan-01 dependency) so the
 * provider tree exists and the extension point is real.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // sane defaults; later plans can tune per-query
        staleTime: 30_000,
        refetchOnWindowFocus: false,
      },
    },
  });
}

export function Providers({ children }: { children: ReactNode }) {
  // one client per browser session (lazy init so SSR + client agree)
  const [queryClient] = useState(makeQueryClient);

  return (
    <QueryClientProvider client={queryClient}>
      {/*
        Extension point — register additional context providers HERE, never in
        layout.tsx:
          Plan 05 → wrap <AnalyticsProvider>{children}</AnalyticsProvider>
          Plan 07 → wrap <TRPCReactProvider>{children}</TRPCReactProvider>
      */}
      {children}
    </QueryClientProvider>
  );
}
