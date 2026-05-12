'use client';

import { useState, type ReactNode } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/**
 * DestructiveConfirmDialog — the reusable pattern for every destructive action
 * (delete account, cancel subscription, and any later-phase delete/reject). The
 * confirm button is `bg-danger` and carries the literal action verb+noun
 * (`confirmVerbNoun`, e.g. "Delete account", "Cancel subscription"). If
 * `requireTypedConfirmation` is set (e.g. "DELETE"), the confirm button stays
 * disabled until an input exactly matches it. The dismiss button uses the
 * literal `dismissKeepNoun` (e.g. "Keep my account", "Keep subscription") —
 * never a bare "Cancel" / "OK" / "Close" (banned anti-pattern). In dev we
 * assert `dismissKeepNoun` starts with "Keep ".
 */
export function DestructiveConfirmDialog({
  title,
  body,
  confirmVerbNoun,
  dismissKeepNoun,
  requireTypedConfirmation,
  onConfirm,
  onDismiss,
  open,
  onOpenChange,
  secondaryAction,
}: {
  title: string;
  body: ReactNode;
  confirmVerbNoun: string;
  dismissKeepNoun: string;
  requireTypedConfirmation?: string;
  onConfirm: () => void;
  onDismiss: () => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Optional extra non-destructive affordance, e.g. "Export my data first". */
  secondaryAction?: ReactNode;
}) {
  const [typed, setTyped] = useState('');

  if (process.env.NODE_ENV !== 'production' && !dismissKeepNoun.startsWith('Keep ')) {
    // eslint-disable-next-line no-console
    console.error(
      `DestructiveConfirmDialog: dismissKeepNoun must start with "Keep " (got ${JSON.stringify(dismissKeepNoun)}). Never a bare "Cancel".`
    );
  }

  const confirmDisabled =
    requireTypedConfirmation !== undefined && typed !== requireTypedConfirmation;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{body}</DialogDescription>
        </DialogHeader>
        {requireTypedConfirmation !== undefined && (
          <div>
            <Label htmlFor="destructive-confirm-input">
              Type {requireTypedConfirmation} to confirm
            </Label>
            <Input
              id="destructive-confirm-input"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              aria-label={`Type ${requireTypedConfirmation} to confirm`}
            />
          </div>
        )}
        <DialogFooter>
          {secondaryAction}
          <Button variant="ghost" onClick={onDismiss}>
            {dismissKeepNoun}
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={confirmDisabled}>
            {confirmVerbNoun}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
