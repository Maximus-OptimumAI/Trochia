'use client';

/**
 * /styleguide — the Phase-1 design-system exit gate. Renders every themed
 * component, token, and motion example across 19 sections. The interactive
 * pieces live in ./styleguide-demos.tsx (a 'use client' module).
 *
 * This route is session-gated once auth ships (Plan 07); for now it is open. It
 * must NEVER be wrapped by `entitlements()` — it is an internal dev tool, not a
 * customer feature.
 */
import type { ReactNode } from 'react';
import {
  Brush,
  Bell,
  Search,
  Settings,
  Trash2,
  Upload,
  Plus,
} from 'lucide-react';

import { Logo } from '@/components/brand/logo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
} from '@/components/ui/navigation-menu';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';

import { SkeletonBlock } from '@/components/primitives/skeleton-block';
import { EmptyState } from '@/components/primitives/empty-state';
import { ErrorState } from '@/components/primitives/error-state';
import { SectionDivider } from '@/components/primitives/section-divider';
import { LegalDisclaimerBanner } from '@/components/primitives/legal-disclaimer-banner';
import { Sidebar } from '@/components/shell/sidebar';
import { TopBar } from '@/components/shell/top-bar';

import {
  ToastDemo,
  PlainDialogDemo,
  FounderApprovalDialogDemo,
  DestructiveConfirmDialogDemo,
  SampleForm,
  MotionExamples,
} from './styleguide-demos';

/* ── helpers ────────────────────────────────────────────────────────────── */

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-12 py-12">
      <h2 className="text-h2 font-geist text-ink">{title}</h2>
      <div className="mt-8 flex flex-col gap-6">{children}</div>
    </section>
  );
}

const COLOR_TOKENS: { name: string; hex: string; role: string }[] = [
  { name: 'paper', hex: '#FAFAF7', role: 'Page background — the default surface (never #FFF)' },
  { name: 'ink', hex: '#0A0E1A', role: 'Primary text, primary-button bg, mark color (never #000)' },
  { name: 'graphite', hex: '#6B7280', role: 'Secondary copy, muted labels, disabled nav' },
  { name: 'stone', hex: '#ECEAE3', role: '1px hairline borders, dividers, soft fills, active nav bg' },
  { name: 'signal', hex: '#F25C2A', role: 'THE single accent — one moment per surface' },
  { name: 'success', hex: '#0F9D58', role: 'Positive states, pricing checkmarks' },
  { name: 'warning', hex: '#E5A100', role: 'Caution states' },
  { name: 'danger', hex: '#E53935', role: 'Errors, destructive actions, input error borders' },
];

const TYPE_CLASSES: { cls: string; node: ReactNode; meta: string }[] = [
  { cls: 'text-display', node: <p className="text-display text-ink">Run your raise from one operator.</p>, meta: 'Geist 600 · ~4rem · -2% tracking · line-height 1.05 · hero H1 only' },
  { cls: 'text-h2', node: <p className="text-h2 font-geist text-ink">Section headline</p>, meta: 'Geist 600 · ~2.5rem · -1% tracking · line-height 1.1' },
  { cls: 'text-h3', node: <p className="text-h3 font-geist text-ink">Card title / sub-section header</p>, meta: 'Geist 500 · ~1.625rem · line-height 1.25' },
  { cls: 'text-h4', node: <p className="text-h4 font-geist text-ink">Inline emphasis</p>, meta: 'Geist 500 · ~1.25rem · line-height 1.3' },
  { cls: 'text-body', node: <p className="text-body text-ink">Body copy default. Trochia drafts, matches, briefs, scores, and tracks.</p>, meta: 'Inter 400 · ~1.0625rem · line-height 1.65' },
  { cls: 'text-body-sm', node: <p className="text-body-sm text-ink">Secondary copy, captions, helper text, footer.</p>, meta: 'Inter 400 · ~0.9375rem · line-height 1.55' },
  { cls: 'text-label', node: <p className="text-label text-graphite">EYEBROW / FORM LABEL</p>, meta: 'Inter 500 · ~0.8125rem · +4% tracking · uppercase OK' },
  { cls: 'text-mono', node: <p className="text-mono text-ink">$5,000,000 raised · 347 founders</p>, meta: 'Geist Mono 400 · text-base (16px) — NOT a custom fontSize key' },
  { cls: 'text-mono-sm', node: <p className="text-mono-sm text-graphite">inline code · badges · Phase 7</p>, meta: 'Geist Mono 400 · text-sm (14px) — NOT a custom fontSize key' },
];

const SPACING: { token: string; px: number }[] = [
  { token: 'xs', px: 4 },
  { token: 'sm', px: 8 },
  { token: 'md', px: 16 },
  { token: 'lg', px: 24 },
  { token: 'xl', px: 32 },
  { token: '2xl', px: 48 },
  { token: '3xl', px: 64 },
];

/* ── page ───────────────────────────────────────────────────────────────── */

export default function StyleguidePage() {
  return (
    <div>
      <header className="border-b border-stone pb-8">
        <Logo height={28} />
        <h1 className="mt-6 text-h2 font-geist text-ink">Trochia design system</h1>
        <p className="mt-2 max-w-prose text-body text-graphite">
          The Phase-1 exit gate. Every component below is themed to the brand tokens (not a stock
          preset). This route is session-gated once auth ships (Plan 07); it is never gated behind
          entitlements.
        </p>
      </header>

      {/* 1 · Color tokens */}
      <Section id="color" title="1 · Color tokens">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" data-testid="color-swatches">
          {COLOR_TOKENS.map((t) => (
            <div key={t.name} className="rounded-xl border border-stone p-4">
              <div
                className="h-16 w-full rounded-lg border border-stone"
                style={{ backgroundColor: t.hex }}
              />
              <p className="mt-3 text-body-sm font-medium text-ink">{t.name}</p>
              <p className="text-mono-sm text-graphite">{t.hex}</p>
              <p className="mt-1 text-body-sm text-graphite">{t.role}</p>
            </div>
          ))}
        </div>
        <Card className="bg-stone/40">
          <CardHeader>
            <CardTitle className="text-h4">Signal usage — reserved for, and ONLY for</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc space-y-1 pl-5 text-body-sm text-graphite">
              <li>The mark&rsquo;s signal node (the dot)</li>
              <li>The hero eyebrow text (text-label text-signal)</li>
              <li>ONE call-to-action per surface — a bg-signal button OR a text-signal link, never both</li>
              <li>The mono step numbers in &ldquo;How it works&rdquo; (01 02 03 04)</li>
              <li>The pricing &ldquo;Most chosen&rdquo; featured-card border + badge</li>
              <li>Pull-quote left-border bar on /manifesto</li>
              <li>Link hover color · the hero live-element illumination accent</li>
            </ul>
          </CardContent>
        </Card>
      </Section>

      {/* 2 · Typography */}
      <Section id="typography" title="2 · Typography specimens">
        <div className="flex flex-col divide-y divide-stone">
          {TYPE_CLASSES.map((t) => (
            <div key={t.cls} className="grid gap-2 py-5 md:grid-cols-[12rem_1fr]">
              <p className="text-mono-sm text-graphite">{t.cls}</p>
              <div>
                {t.node}
                <p className="mt-1 text-body-sm text-graphite">{t.meta}</p>
              </div>
            </div>
          ))}
        </div>
        <Card className="bg-stone/40">
          <CardHeader>
            <CardTitle className="text-h4">Per-typeface guardrail exception (documented, approved)</CardTitle>
            <CardDescription>
              The &ldquo;≤4 sizes, ≤2 weights&rdquo; heuristic is interpreted per typeface for a
              3-typeface system.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-body-sm text-graphite">
            <ul className="space-y-1">
              <li><strong className="text-ink">Geist</strong> — 4 sizes (display / h2 / h3 / h4), 2 weights (600 / 700)</li>
              <li><strong className="text-ink">Inter</strong> — 3 sizes (body / body-sm / label), 2 weights (400 / 500)</li>
              <li><strong className="text-ink">Geist Mono</strong> — 2 sizes (text-mono = text-base, text-mono-sm = text-sm; NOT custom fontSize keys), 1 weight (400)</li>
            </ul>
            <p className="mt-3">
              tailwind.config.ts defines <strong className="text-ink">7</strong> custom fontSize keys
              (Geist&rsquo;s 4 + Inter&rsquo;s 3) — expected and correct.
            </p>
          </CardContent>
        </Card>
      </Section>

      {/* 3 · Spacing scale */}
      <Section id="spacing" title="3 · Spacing scale">
        <div className="flex flex-col gap-3">
          {SPACING.map((s) => (
            <div key={s.token} className="flex items-center gap-4">
              <span className="w-16 text-mono-sm text-graphite">{s.token}</span>
              <span className="h-6 rounded bg-signal" style={{ width: s.px }} />
              <span className="text-body-sm text-graphite">{s.px}px</span>
            </div>
          ))}
          <div className="flex items-center gap-4">
            <span className="w-16 text-mono-sm text-graphite">section</span>
            <span className="h-6 rounded bg-ink" style={{ width: 128 }} />
            <span className="text-body-sm text-graphite">80px mobile / 128px desktop (py-20 md:py-32)</span>
          </div>
        </div>
      </Section>

      {/* 4 · Buttons */}
      <Section id="buttons" title="4 · Buttons">
        {(['primary', 'signal', 'secondary', 'ghost', 'link'] as const).map((v) => (
          <div key={v} className="flex flex-wrap items-center gap-4">
            <span className="w-24 text-mono-sm text-graphite">{v}</span>
            <Button variant={v} size="compact">Compact h-9</Button>
            <Button variant={v}>Default h-11</Button>
            <Button variant={v} size="mobile">Mobile h-12</Button>
            <Button variant={v} disabled>Disabled</Button>
            {v !== 'link' && (
              <Button variant={v}>
                <Plus /> With icon
              </Button>
            )}
            {v !== 'link' && (
              <Button variant={v} size="icon" aria-label="Icon only">
                <Settings />
              </Button>
            )}
          </div>
        ))}
        <p className="text-body-sm text-graphite">
          The <code className="text-mono-sm">signal</code> variant is the one accent CTA — use once
          per surface. No <code className="text-mono-sm">xs</code> size (small buttons read as a
          toy). Press state: <code className="text-mono-sm">active:scale-[0.98]</code>.
        </p>
      </Section>

      {/* 5 · Inputs & Form */}
      <Section id="inputs" title="5 · Inputs & Form">
        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-4">
            <div>
              <Label htmlFor="sg-input-default">Default</Label>
              <Input id="sg-input-default" placeholder="you@startup.com" />
            </div>
            <div>
              <Label htmlFor="sg-input-error">Error</Label>
              <Input id="sg-input-error" aria-invalid defaultValue="not-an-email" />
              <p className="mt-1.5 text-body-sm text-danger">Enter a valid email address.</p>
            </div>
            <div>
              <Label htmlFor="sg-input-disabled">Disabled</Label>
              <Input id="sg-input-disabled" disabled placeholder="Disabled" />
            </div>
            <div>
              <Label htmlFor="sg-textarea">Textarea</Label>
              <textarea
                id="sg-textarea"
                rows={3}
                placeholder="Paste 500–5,000 words…"
                className="w-full rounded-lg border border-stone bg-paper px-4 py-3 text-body text-ink outline-none placeholder:text-graphite focus-visible:border-ink"
              />
            </div>
          </div>
          <div>
            <p className="mb-3 text-body-sm text-graphite">react-hook-form + Zod, validation error shown:</p>
            <SampleForm />
          </div>
        </div>
      </Section>

      {/* 6 · Cards */}
      <Section id="cards" title="6 · Cards">
        <div className="grid gap-6 md:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle>Default card</CardTitle>
              <CardDescription>1px stone border, no shadow, no lift, no gradient.</CardDescription>
            </CardHeader>
            <CardContent className="text-body-sm text-graphite">bg-paper border border-stone rounded-xl p-8</CardContent>
          </Card>
          <Card interactive>
            <CardHeader>
              <CardTitle>Interactive card</CardTitle>
              <CardDescription>hover:border-ink/20 — no lift.</CardDescription>
            </CardHeader>
            <CardContent className="text-body-sm text-graphite">Hover me</CardContent>
          </Card>
          <Card featured>
            <Badge variant="signal" className="absolute right-6 top-6">Most chosen</Badge>
            <CardHeader>
              <CardTitle>Featured card</CardTitle>
              <CardDescription>border-2 border-signal + Signal badge — the pricing &ldquo;Most chosen&rdquo; variant.</CardDescription>
            </CardHeader>
            <CardContent className="text-body-sm text-graphite">$199 / month</CardContent>
          </Card>
        </div>
      </Section>

      {/* 7 · Dialog */}
      <Section id="dialog" title="7 · Dialog">
        <div className="flex flex-wrap gap-4">
          <PlainDialogDemo />
          <FounderApprovalDialogDemo />
          <DestructiveConfirmDialogDemo />
        </div>
        <p className="text-body-sm text-graphite">
          Dismiss buttons use the &ldquo;Keep {'{'}noun{'}'}&rdquo; convention (&ldquo;Keep
          draft&rdquo; / &ldquo;Keep editing&rdquo; / &ldquo;Keep my account&rdquo;) — never a bare
          &ldquo;Cancel&rdquo; / &ldquo;OK&rdquo; / &ldquo;Close&rdquo;. The founder-approval
          Dialog&rsquo;s primary is the noun-bearing <code className="text-mono-sm">Send {'{'}thing{'}'}</code> (&ldquo;Send
          outreach&rdquo;) — never a bare &ldquo;Send&rdquo; (XC-02: no one-click external sends).
        </p>
      </Section>

      {/* 8 · Sheet */}
      <Section id="sheet" title="8 · Sheet">
        <div className="flex flex-wrap gap-4">
          <Sheet>
            <SheetTrigger render={<Button variant="secondary" />}>Open side panel (Q&amp;A slot shape)</SheetTrigger>
            <SheetContent side="right">
              <SheetHeader>
                <SheetTitle>Ask Trochia</SheetTitle>
                <SheetDescription>This is the shape of the Phase-2 ambient Q&amp;A sidebar.</SheetDescription>
              </SheetHeader>
            </SheetContent>
          </Sheet>
          <Sheet>
            <SheetTrigger render={<Button variant="secondary" />}>Open top sheet (mobile nav)</SheetTrigger>
            <SheetContent side="top">
              <SheetHeader>
                <SheetTitle>Menu</SheetTitle>
                <SheetDescription>The mobile-nav drawer pattern.</SheetDescription>
              </SheetHeader>
            </SheetContent>
          </Sheet>
        </div>
      </Section>

      {/* 9 · Tabs */}
      <Section id="tabs" title="9 · Tabs">
        <Tabs defaultValue="monthly" className="max-w-md">
          <TabsList>
            <TabsTrigger value="monthly">Monthly</TabsTrigger>
            <TabsTrigger value="annual">Annual</TabsTrigger>
          </TabsList>
          <TabsContent value="monthly" className="pt-4 text-body text-ink">Pre-Raise $49 · Active Raise $199</TabsContent>
          <TabsContent value="annual" className="pt-4 text-body text-ink">Pre-Raise $39 · Active Raise $159</TabsContent>
        </Tabs>
      </Section>

      {/* 10 · Toast */}
      <Section id="toast" title="10 · Toast">
        <ToastDemo />
        <p className="text-body-sm text-graphite">
          Sonner, bottom-right, ~4s auto-dismiss. Copy is a plain statement (&ldquo;Deck
          uploaded.&rdquo; / &ldquo;Couldn&rsquo;t upload your deck.&rdquo;). No emoji, no confetti.
        </p>
      </Section>

      {/* 11 · NavigationMenu */}
      <Section id="navigation-menu" title="11 · NavigationMenu (marketing top bar)">
        <div className="rounded-xl border border-stone p-4">
          <NavigationMenu>
            <NavigationMenuList>
              <NavigationMenuItem>
                <NavigationMenuLink href="/#how-it-works">How it works</NavigationMenuLink>
              </NavigationMenuItem>
              <NavigationMenuItem>
                <NavigationMenuLink href="/pricing">Pricing</NavigationMenuLink>
              </NavigationMenuItem>
              <NavigationMenuItem>
                <NavigationMenuLink href="/manifesto">Manifesto</NavigationMenuLink>
              </NavigationMenuItem>
            </NavigationMenuList>
          </NavigationMenu>
        </div>
      </Section>

      {/* 12 · Avatar */}
      <Section id="avatar" title="12 · Avatar">
        <div className="flex items-center gap-4">
          <Avatar className="size-6"><AvatarFallback className="text-mono-sm">MJ</AvatarFallback></Avatar>
          <Avatar className="size-9"><AvatarFallback>MJ</AvatarFallback></Avatar>
          <Avatar className="size-12"><AvatarFallback>MJ</AvatarFallback></Avatar>
        </div>
      </Section>

      {/* 13 · Badge */}
      <Section id="badge" title="13 · Badge">
        <div className="flex flex-wrap items-center gap-3">
          <Badge variant="signal">Most chosen</Badge>
          <Badge variant="phase">Phase 6</Badge>
          <Badge variant="default">New</Badge>
          <Badge variant="outline">Default</Badge>
        </div>
      </Section>

      {/* 14 · DropdownMenu */}
      <Section id="dropdown-menu" title="14 · DropdownMenu (sidebar user menu)">
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="secondary" />}>
            <Avatar className="size-6"><AvatarFallback className="text-mono-sm">MJ</AvatarFallback></Avatar>
            Founder
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-52">
            <DropdownMenuItem>Settings</DropdownMenuItem>
            <DropdownMenuItem>Billing</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem>Sign out</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </Section>

      {/* 15 · Accordion */}
      <Section id="accordion" title="15 · Accordion (pricing FAQ)">
        <Accordion className="max-w-2xl">
          <AccordionItem value="q1">
            <AccordionTrigger>What does Trochia actually do?</AccordionTrigger>
            <AccordionContent>It holds your business memory, matches investors, drafts your outreach, and tracks the round — from F&amp;F to Series A.</AccordionContent>
          </AccordionItem>
          <AccordionItem value="q2">
            <AccordionTrigger>Does Trochia send emails on my behalf?</AccordionTrigger>
            <AccordionContent>No autonomous external sends — every outgoing message goes through the founder-approval Dialog first.</AccordionContent>
          </AccordionItem>
          <AccordionItem value="q3">
            <AccordionTrigger>Can I cancel anytime?</AccordionTrigger>
            <AccordionContent>Yes — you keep access until the end of your billing period.</AccordionContent>
          </AccordionItem>
        </Accordion>
      </Section>

      {/* 16 · Cross-cutting primitives */}
      <Section id="primitives" title="16 · Cross-cutting primitives">
        <div className="space-y-2">
          <p className="text-body-sm text-graphite">SkeletonBlock</p>
          <SkeletonBlock className="h-6 w-3/4" />
          <SkeletonBlock className="h-6 w-1/2" />
          <SkeletonBlock className="h-32 w-full" />
        </div>
        <div className="rounded-xl border border-stone">
          <EmptyState
            heading="No investors yet"
            body="Trochia builds your pipeline from your business memory. Generate your first VC fit list to get started."
            primaryCtaLabel="Generate VC fit list"
            primaryCtaHref="/app/pipeline"
          />
        </div>
        <div className="rounded-xl border border-stone">
          <ErrorState
            body="We couldn't load your pipeline. Try again, or contact support if it keeps happening."
            onRetry={() => {}}
            supportHref="mailto:support@trochia.ai"
          />
        </div>
        <SectionDivider label="Section divider" />
        <LegalDisclaimerBanner variant="not-legal-advice" />
        <LegalDisclaimerBanner variant="affiliate" />
      </Section>

      {/* 17 · App shell */}
      <Section id="app-shell" title="17 · App shell (framed preview)">
        <div className="overflow-hidden rounded-xl border border-stone">
          <div className="flex h-96">
            <Sidebar activeHref="/app/memory" userName="Martins Ejeheri" userEmail="founder@trochia.ai" />
            <div className="flex min-w-0 flex-1 flex-col">
              <TopBar
                title="Dashboard"
                actions={
                  <>
                    <Button variant="ghost" size="icon-sm" aria-label="Search"><Search /></Button>
                    <Button variant="ghost" size="icon-sm" aria-label="Notifications"><Bell /></Button>
                  </>
                }
              />
              <div className="flex-1 p-8 text-body text-graphite">Page content slot</div>
            </div>
          </div>
        </div>
      </Section>

      {/* 18 · Motion examples */}
      <Section id="motion" title="18 · Motion examples">
        <p className="text-body-sm text-graphite">
          Built with <code className="text-mono-sm">motion</code> (not framer-motion). Each example
          has a &ldquo;reduced motion&rdquo; toggle showing the static fallback and is labeled with
          its duration + easing; <code className="text-mono-sm">prefers-reduced-motion: reduce</code> also
          disables animation globally.
        </p>
        <MotionExamples />
      </Section>

      {/* 19 · Iconography */}
      <Section id="iconography" title="19 · Iconography">
        <p className="text-body-sm text-graphite">Lucide, 1.5px stroke, Ink color, never filled. Sizes 16 / 20 / 24:</p>
        <div className="flex items-center gap-8">
          {[16, 20, 24].map((px) => (
            <div key={px} className="flex items-center gap-3 text-ink">
              <Brush size={px} strokeWidth={1.5} />
              <Settings size={px} strokeWidth={1.5} />
              <Upload size={px} strokeWidth={1.5} />
              <Trash2 size={px} strokeWidth={1.5} />
              <span className="text-mono-sm text-graphite">{px}px</span>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}
