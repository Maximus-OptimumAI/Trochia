'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { DestructiveConfirmDialog } from '@/components/primitives/destructive-confirm-dialog';
import { useTRPC } from '@/lib/trpc-client';
import { useMutation } from '@tanstack/react-query';
import { logger } from '@/lib/logger';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';

/**
 * Settings client view (Plan 01-09 / XC-04).
 *
 * Renders three Cards:
 *   1. Profile basics — read-only email + name (Phase-1 minimal; full
 *      editing is a later phase).
 *   2. Your data — "Export my data" Button → compliance.requestDataExport.
 *      Toast on success ("Your data export is on its way — check your email.").
 *   3. Danger zone — "Delete account" Button opens DestructiveConfirmDialog
 *      with requireTypedConfirmation="DELETE", dismissKeepNoun="Keep my
 *      account", onConfirm → compliance.requestAccountDeletion → sign-out →
 *      /sign-in?deletion=scheduled.
 *
 * The dismiss button label "Keep my account" satisfies the UI-SPEC's
 * "Keep {noun}" anti-pattern rule (never a bare "Cancel").
 */
export function SettingsView({ email, fullName }: { email: string; fullName: string }) {
  const router = useRouter();
  const trpc = useTRPC();
  const [deleteOpen, setDeleteOpen] = useState(false);

  const exportData = useMutation(
    trpc.compliance.requestDataExport.mutationOptions({
      onSuccess: () => {
        toast.success("Your data export is on its way. Check your email.");
      },
      onError: (err) => {
        logger.warn('settings: requestDataExport failed', { err });
        toast.error("Couldn't start your data export. Try again, or contact support.");
      },
    }),
  );

  const deleteAccount = useMutation(
    trpc.compliance.requestAccountDeletion.mutationOptions({
      onSuccess: async () => {
        setDeleteOpen(false);
        // Sign-out + redirect. The server-side soft-delete is recorded; the
        // 30-day purge is handled by the Plan-04 cron. The Supabase browser
        // client clears the session cookies; routing to /sign-in finalizes UX.
        try {
          const supabase = createBrowserSupabaseClient();
          await supabase.auth.signOut();
        } catch (err) {
          logger.warn('settings: post-delete sign-out failed (non-fatal)', { err });
        }
        router.push('/sign-in?deletion=scheduled');
        router.refresh();
      },
      onError: (err) => {
        logger.warn('settings: requestAccountDeletion failed', { err });
        toast.error("Couldn't schedule your account deletion. Contact support.");
      },
    }),
  );

  return (
    <div className="flex max-w-2xl flex-col gap-8">
      <Card>
        <h2 className="text-h3 font-geist text-ink">Profile</h2>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="settings-email">Email</Label>
            <Input id="settings-email" value={email} readOnly aria-readonly />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="settings-name">Name</Label>
            <Input id="settings-name" value={fullName} readOnly aria-readonly />
          </div>
        </div>
      </Card>

      <Card>
        <h2 className="text-h3 font-geist text-ink">Your data</h2>
        <p className="text-body-sm text-graphite">
          Export everything Trochia holds for your account as a JSON archive. You&apos;ll get an
          email with a signed download link valid for 48 hours.
        </p>
        <div className="flex">
          <Button
            variant="secondary"
            onClick={() => exportData.mutate()}
            disabled={exportData.isPending}
          >
            {exportData.isPending ? 'Preparing export…' : 'Export my data'}
          </Button>
        </div>
      </Card>

      <Card>
        <h2 className="text-h3 font-geist text-ink">Danger zone</h2>
        <p className="text-body-sm text-graphite">
          Delete your account. This soft-deletes today and permanently purges all your data
          after 30 days. You can export your data first.
        </p>
        <div className="flex">
          <Button variant="destructive" onClick={() => setDeleteOpen(true)}>
            Delete account
          </Button>
        </div>
      </Card>

      <DestructiveConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete your account?"
        body="This soft-deletes your account now and permanently purges all your data after 30 days. You can export your data first."
        confirmVerbNoun="Delete account"
        dismissKeepNoun="Keep my account"
        requireTypedConfirmation="DELETE"
        onConfirm={() => deleteAccount.mutate()}
        onDismiss={() => setDeleteOpen(false)}
        secondaryAction={
          <Button
            variant="link"
            onClick={() => exportData.mutate()}
            disabled={exportData.isPending}
          >
            Export my data first
          </Button>
        }
      />
    </div>
  );
}
