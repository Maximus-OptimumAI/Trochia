'use client';

/**
 * Interactive demos for the /styleguide page (the parts that need client state):
 * the toast triggers, the three Dialog demos (plain modal with a "Keep draft"
 * dismiss, the founder-approval Dialog, the destructive-confirm Dialog), a
 * sample react-hook-form + Zod form with a visible validation error, and the
 * motion examples with their reduced-motion toggles.
 */
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { motion } from 'motion/react';

import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { FounderApprovalDialog } from '@/components/primitives/founder-approval-dialog';
import { DestructiveConfirmDialog } from '@/components/primitives/destructive-confirm-dialog';

/* ── 10 · Toast ─────────────────────────────────────────────────────────── */

export function ToastDemo() {
  return (
    <div className="flex flex-wrap gap-3">
      <Button variant="secondary" onClick={() => toast('Deck uploaded.')}>
        Fire success toast
      </Button>
      <Button
        variant="secondary"
        onClick={() => toast.error("Couldn't upload your deck. Try a smaller file.")}
      >
        Fire error toast
      </Button>
    </div>
  );
}

/* ── 7 · Dialog ─────────────────────────────────────────────────────────── */

export function PlainDialogDemo() {
  return (
    <Dialog>
      <DialogTrigger render={<Button variant="secondary" />}>Open plain modal</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Discard your draft?</DialogTitle>
          <DialogDescription>
            A generic modal. The dismiss button is a context-specific verb+noun (&ldquo;Keep
            draft&rdquo;) — never a bare &ldquo;Cancel&rdquo; / &ldquo;OK&rdquo; / &ldquo;Close&rdquo;.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogPrimitive.Close render={<Button variant="ghost">Keep draft</Button>} />
          <Button variant="primary">Discard draft</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function FounderApprovalDialogDemo() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="signal" onClick={() => setOpen(true)}>
        Preview founder-approval
      </Button>
      <FounderApprovalDialog
        thing="outreach"
        recipient="Jane Partner — Acme Ventures (placeholder)"
        contentPreview={
          <span>
            Hi Jane — I’m building Trochia, the agentic operator for a founder’s raise. (placeholder
            draft — no real recipient or content exists in Phase 1.)
          </span>
        }
        onSend={() => setOpen(false)}
        onKeepEditing={() => setOpen(false)}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  );
}

export function DestructiveConfirmDialogDemo() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="destructive" onClick={() => setOpen(true)}>
        Preview destructive confirm
      </Button>
      <DestructiveConfirmDialog
        title="Delete your account?"
        body="This soft-deletes your account now and permanently purges all your data after 30 days. You can export your data first."
        confirmVerbNoun="Delete account"
        dismissKeepNoun="Keep my account"
        requireTypedConfirmation="DELETE"
        onConfirm={() => setOpen(false)}
        onDismiss={() => setOpen(false)}
        open={open}
        onOpenChange={setOpen}
        secondaryAction={
          <Button variant="link" onClick={() => setOpen(false)}>
            Export my data first
          </Button>
        }
      />
    </>
  );
}

/* ── 5 · Inputs & Form ──────────────────────────────────────────────────── */

const sampleSchema = z.object({
  email: z.string().email('Enter a valid email address.'),
});

export function SampleForm() {
  const form = useForm<z.infer<typeof sampleSchema>>({
    resolver: zodResolver(sampleSchema),
    defaultValues: { email: 'not-an-email' },
    mode: 'onChange',
  });

  // surface the validation error immediately so the styleguide shows the state
  if (!form.formState.isSubmitted && Object.keys(form.formState.errors).length === 0) {
    void form.trigger('email');
  }

  return (
    <Form {...form}>
      <form
        className="max-w-sm space-y-4"
        onSubmit={form.handleSubmit(() => {
          /* no-op in the styleguide */
        })}
      >
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Work email</FormLabel>
              <FormControl>
                <Input placeholder="you@startup.com" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" variant="primary">
          Continue with email
        </Button>
      </form>
    </Form>
  );
}

/* ── 18 · Motion examples ───────────────────────────────────────────────── */

function MotionExample({
  label,
  duration,
  easing,
  children,
}: {
  label: string;
  duration: string;
  easing: string;
  children: (reduced: boolean) => React.ReactNode;
}) {
  const [reduced, setReduced] = useState(false);
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-stone p-6">
      <div className="flex items-center justify-between">
        <span className="text-body-sm font-medium text-ink">{label}</span>
        <label className="flex items-center gap-2 text-mono-sm text-graphite">
          <input
            type="checkbox"
            checked={reduced}
            onChange={(e) => setReduced(e.target.checked)}
          />
          reduced motion
        </label>
      </div>
      <p className="text-mono-sm text-graphite">
        {duration} · {easing}
      </p>
      <div className="flex min-h-16 items-center">{children(reduced)}</div>
    </div>
  );
}

export function MotionExamples() {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <MotionExample label="Hover transition" duration="120ms" easing="ease-out">
        {() => (
          <button className="rounded-lg bg-ink px-6 py-2 text-body-sm font-medium text-paper transition-colors duration-150 hover:bg-signal">
            Hover me
          </button>
        )}
      </MotionExample>

      <MotionExample label="Page enter (fade-up)" duration="200ms" easing="ease-out">
        {(reduced) => (
          <motion.div
            key={reduced ? 'static' : 'anim'}
            initial={reduced ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="rounded-lg border border-stone bg-paper px-6 py-3 text-body-sm text-ink"
          >
            Content faded up into place
          </motion.div>
        )}
      </MotionExample>

      <MotionExample label="Scroll reveal" duration="300ms" easing="ease-out">
        {(reduced) => (
          <motion.div
            initial={reduced ? false : { opacity: 0, y: 8 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            className="rounded-lg border border-stone bg-paper px-6 py-3 text-body-sm text-ink"
          >
            Revealed on viewport intersection
          </motion.div>
        )}
      </MotionExample>

      <MotionExample label="Modal / Sheet enter" duration="250ms" easing="ease-out">
        {(reduced) => (
          <motion.div
            key={reduced ? 'static' : 'anim'}
            initial={reduced ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="rounded-xl border border-stone bg-paper px-6 py-3 text-body-sm text-ink shadow-[0_8px_24px_rgba(10,14,26,0.08)]"
          >
            Modal surface entering
          </motion.div>
        )}
      </MotionExample>

      <MotionExample
        label="Hero live-element loop"
        duration="800ms/step · 2s pause"
        easing="ease-in-out"
      >
        {(reduced) => <HeroTimelineLoop reduced={reduced} />}
      </MotionExample>
    </div>
  );
}

const STEPS = ['Memory', 'Pitch Lab', 'Pipeline', 'Live Raise', 'Close'];

function HeroTimelineLoop({ reduced }: { reduced: boolean }) {
  return (
    <div className="flex items-center gap-2">
      {STEPS.map((label, i) => (
        <span key={label} className="flex items-center gap-2">
          <motion.span
            className="rounded-full px-3 py-1 text-mono-sm"
            initial={false}
            animate={
              reduced
                ? { backgroundColor: '#0A0E1A', color: '#FAFAF7' }
                : {
                    backgroundColor: ['#ECEAE3', '#0A0E1A', '#F25C2A', '#ECEAE3'],
                    color: ['#6B7280', '#FAFAF7', '#FAFAF7', '#6B7280'],
                  }
            }
            transition={
              reduced
                ? { duration: 0 }
                : { duration: 0.8, delay: i * 0.8, repeat: Infinity, repeatDelay: 2 + (STEPS.length - 1 - i) * 0.8 }
            }
          >
            {label}
          </motion.span>
          {i < STEPS.length - 1 && <span className="text-graphite">→</span>}
        </span>
      ))}
    </div>
  );
}
