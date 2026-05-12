'use client';

import type { ReactNode } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

/**
 * FounderApprovalDialog — the single sanctioned gate for ANYTHING that leaves
 * Trochia (XC-02): outreach emails, intro requests, signature requests,
 * payments. Established here in Phase 1 as a reusable, content-agnostic Dialog;
 * every later-phase external-send flow MUST route through it. There is no
 * one-click send for anything that leaves Trochia.
 *
 * The primary action is ALWAYS the noun-bearing `Send {thing}` form (e.g. "Send
 * outreach", "Send request", "Send follow-up") — never a bare "Send". The
 * dismiss is "Keep editing" — never a bare "Cancel". Use `signal` for the
 * primary only if it is *the* accent on that surface; otherwise `primary`.
 */
export function FounderApprovalDialog({
  thing,
  recipient,
  contentPreview,
  onSend,
  onKeepEditing,
  open,
  onOpenChange,
  primaryVariant = 'primary',
}: {
  /** The noun, lowercase, e.g. "outreach" / "request" / "follow-up". */
  thing: string;
  /** Who it goes to — shown read-only in the preview. */
  recipient: string;
  /** The full thing to be sent, rendered read-only. */
  contentPreview: ReactNode;
  onSend: () => void;
  onKeepEditing: () => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** `signal` only if this is the surface's one accent moment. */
  primaryVariant?: 'primary' | 'signal';
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Send this {thing}?</DialogTitle>
          <DialogDescription>
            Review what Trochia drafted. Nothing leaves Trochia until you approve it.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2 rounded-lg border border-stone bg-stone/40 p-4">
          <p className="text-label text-graphite">To</p>
          <p className="text-body text-ink">{recipient}</p>
          <div className="mt-2 border-t border-stone pt-3 text-body text-ink">{contentPreview}</div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onKeepEditing}>
            Keep editing
          </Button>
          <Button variant={primaryVariant} onClick={onSend}>
            Send {thing}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
