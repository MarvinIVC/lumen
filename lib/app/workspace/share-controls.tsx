'use client';

/**
 * The share dialog, wired to `/api/share` (06 §4).
 *
 * Sharing is the one thing in this workspace that needs an account, and not as a gate: a link has
 * to be readable by someone who is not this browser, and a signed-out note exists only in this
 * browser's IndexedDB. There is nothing for a stranger's request to read. The dialog says that
 * rather than showing a button that fails.
 */
import { useCallback, useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { ShareDialog } from '@/components/domain/share-dialog';
import { ExternalLinkIcon } from '@/components/ui/icons';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/lib/auth/auth-provider';
import { appStrings } from '@/lib/app/strings';
import { renderShareCard } from '@/lib/app/share-card';
import type { NoteDocument } from '@/lib/ai/schema';
import type { LocalNote } from '@/lib/store/types';

const strings = appStrings.share;

interface ShareState {
  id: string;
  allowIndex: boolean;
  expiresAt: string | null;
  hasCard: boolean;
}

export function ShareControls({ note, doc }: { note: LocalNote; doc: NoteDocument }) {
  const { user } = useAuth();
  const [share, setShare] = useState<ShareState | null>(null);
  const [creating, setCreating] = useState(false);
  const toast = useToast();

  // The note is addressed by the id the browser minted; the server resolves it to the cloud row,
  // which is also how it discovers whether this note has been synced at all.
  const localId = note.localId;

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void fetch(`/api/share?localId=${encodeURIComponent(localId)}`)
      .then((response) => (response.ok ? response.json() : { share: null }))
      .then((body: { share: ShareState | null }) => {
        if (!cancelled) setShare(body.share);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [user, localId]);

  /**
   * Draws the card and posts it, after the link exists.
   *
   * Deliberately not awaited by the create path: a link that works is worth more than a link with
   * a picture, and the card is a preview rather than the thing being shared. A failure here leaves
   * the page with no `og:image`, which is a plainer preview and not a broken one.
   */
  const uploadCard = useCallback(
    async (id: string) => {
      try {
        const card = await renderShareCard(doc);
        const form = new FormData();
        form.set('id', id);
        form.set('file', new File([card], `${id}.png`, { type: 'image/png' }));
        const response = await fetch('/api/share/card', { method: 'POST', body: form });
        if (response.ok) setShare((current) => (current ? { ...current, hasCard: true } : current));
      } catch {
        // See above: a missing card is a plainer preview, not a failure worth telling anyone about.
      }
    },
    [doc],
  );

  async function create() {
    setCreating(true);
    try {
      const response = await fetch('/api/share', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ localId }),
      });
      const body = (await response.json()) as ShareState & { error?: string };

      if (!response.ok) {
        toast({
          title: strings.failed,
          description: body.error === 'not_synced' ? strings.notSynced : strings.failedBody,
          tone: 'danger',
        });
        return;
      }

      setShare(body);
      void uploadCard(body.id);
    } catch {
      toast({ title: strings.failed, description: strings.failedBody, tone: 'danger' });
    } finally {
      setCreating(false);
    }
  }

  async function revoke() {
    if (!share) return;
    const previous = share;
    setShare(null);
    const response = await fetch(`/api/share?id=${encodeURIComponent(previous.id)}`, {
      method: 'DELETE',
    });
    if (response.ok) toast({ title: strings.revoked, tone: 'success' });
    else {
      setShare(previous);
      toast({ title: strings.failed, description: strings.failedBody, tone: 'danger' });
    }
  }

  async function setAllowIndex(allowIndex: boolean) {
    if (!share) return;
    setShare({ ...share, allowIndex });
    await fetch('/api/share', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: share.id, allowIndex }),
    });
  }

  if (!user) {
    return (
      <Button
        size="sm"
        variant="ghost"
        icon={<ExternalLinkIcon />}
        onClick={() =>
          toast({ title: strings.dialogSignedOutTitle, description: strings.dialogSignedOutBody })
        }
      >
        {appStrings.workspace.shareCta}
      </Button>
    );
  }

  return (
    <ShareDialog
      url={share ? `${window.location.origin}/s/${share.id}` : null}
      onCreate={() => void create()}
      onRevoke={() => void revoke()}
      allowIndex={share?.allowIndex ?? false}
      onAllowIndexChange={(value) => void setAllowIndex(value)}
      creating={creating}
    >
      <Button size="sm" variant="ghost" icon={<ExternalLinkIcon />}>
        {appStrings.workspace.shareCta}
      </Button>
    </ShareDialog>
  );
}
