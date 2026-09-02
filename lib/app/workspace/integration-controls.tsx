'use client';

/**
 * Notion and Drive, on the note (06 §3).
 *
 * `expired` is the state this component exists for. A revoked token must prompt a reconnect
 * without ever looking like the note is in danger — the note is local, it was never at risk, and
 * the mapping to a Notion database survives in `integration.meta` so reconnecting puts it back
 * where it was going rather than asking the student to choose again.
 */
import { useCallback, useEffect, useState } from 'react';

import { IntegrationButton } from '@/components/domain/integration-button';
import type { IntegrationState } from '@/components/domain/integration-button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/lib/auth/auth-provider';
import { appStrings } from '@/lib/app/strings';
import { DEFAULT_EXPORT_OPTIONS } from '@/lib/export/types';
import { readExportOptions } from '@/lib/store/preferences';
import {
  ReauthNeeded,
  connectHref,
  notionTargets,
  pushToDrive,
  pushToNotion,
} from '@/lib/integrations/client';
import type { NotionTarget } from '@/lib/integrations/client';
import { noteHref } from '@/lib/app/routes';
import type { NoteDocument } from '@/lib/ai/schema';
import type { LocalNote } from '@/lib/store/types';

const strings = appStrings.integrations;

interface Status {
  kind: 'notion' | 'drive';
  connected: boolean;
  revoked: boolean;
  accountLabel: string | null;
  target: string | null;
}

export function IntegrationControls({ note, doc }: { note: LocalNote; doc: NoteDocument }) {
  const { user } = useAuth();
  const [statuses, setStatuses] = useState<Status[]>([]);
  const [busy, setBusy] = useState<'notion' | 'drive' | null>(null);
  const [picking, setPicking] = useState<NotionTarget[] | null>(null);
  const toast = useToast();

  const course = note.context.course || 'Unsorted';

  const refresh = useCallback(async () => {
    if (!user) return;
    const response = await fetch(`/api/integrations?course=${encodeURIComponent(course)}`);
    if (!response.ok) return;
    const body = (await response.json()) as { integrations: Status[] };
    setStatuses(body.integrations);
  }, [user, course]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (!user) return null;

  const stateOf = (kind: 'notion' | 'drive'): IntegrationState => {
    if (busy === kind) return 'pushing';
    const status = statuses.find((entry) => entry.kind === kind);
    if (!status) return 'disconnected';
    return status.revoked ? 'expired' : 'connected';
  };

  const connect = (kind: 'notion' | 'drive') => {
    window.location.href = connectHref(kind, noteHref(note.id));
  };

  async function pushNotion(target: { type: 'database_id' | 'page_id'; id: string } | null) {
    setBusy('notion');
    try {
      const options = readExportOptions(DEFAULT_EXPORT_OPTIONS);
      const result = await pushToNotion(note, doc, options, target, (stage) => {
        if (stage === 'pushing') toast({ title: strings.notionPushing });
      });
      toast({
        title: result.updated ? strings.notionUpdated : strings.notionCreated,
        tone: 'success',
        action: { label: strings.open, onClick: () => window.open(result.url, '_blank') },
      });
      await refresh();
    } catch (thrown) {
      if (thrown instanceof ReauthNeeded) {
        // Never "your note failed": the note is on this device and was never involved.
        toast({
          title: strings.reauthTitle('Notion'),
          description: strings.reauthBody,
          tone: 'warning',
        });
        await refresh();
      } else {
        toast({
          title: strings.pushFailed('Notion'),
          description: thrown instanceof Error ? thrown.message : strings.pushFailedBody,
          tone: 'danger',
        });
      }
    } finally {
      setBusy(null);
      setPicking(null);
    }
  }

  async function startNotionPush() {
    const status = statuses.find((entry) => entry.kind === 'notion');
    // The first push for a course asks where it goes; after that the mapping is remembered.
    if (status && !status.target) {
      setBusy('notion');
      try {
        const { targets } = await notionTargets();
        setPicking(targets);
      } catch {
        toast({
          title: strings.pushFailed('Notion'),
          description: strings.noTargets,
          tone: 'danger',
        });
      } finally {
        setBusy(null);
      }
      return;
    }
    await pushNotion(null);
  }

  async function pushDrive() {
    setBusy('drive');
    try {
      const options = readExportOptions(DEFAULT_EXPORT_OPTIONS);
      const result = await pushToDrive(note, doc, options, (stage) => {
        if (stage === 'pushing') toast({ title: strings.drivePushing });
      });
      toast({
        title: strings.driveDone(result.folder),
        tone: 'success',
        action: { label: strings.open, onClick: () => window.open(result.url, '_blank') },
      });
      await refresh();
    } catch (thrown) {
      if (thrown instanceof ReauthNeeded) {
        toast({
          title: strings.reauthTitle('Drive'),
          description: strings.reauthBody,
          tone: 'warning',
        });
        await refresh();
      } else {
        toast({
          title: strings.pushFailed('Drive'),
          description: thrown instanceof Error ? thrown.message : strings.pushFailedBody,
          tone: 'danger',
        });
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <IntegrationButton
        name="Notion"
        state={stateOf('notion')}
        target={statuses.find((entry) => entry.kind === 'notion')?.target ?? null}
        onConnect={() => connect('notion')}
        onPush={() => void startNotionPush()}
      />
      <IntegrationButton
        name="Google Drive"
        state={stateOf('drive')}
        target={statuses.find((entry) => entry.kind === 'drive')?.target ?? null}
        onConnect={() => connect('drive')}
        onPush={() => void pushDrive()}
      />

      <Dialog open={picking !== null} onOpenChange={(open) => !open && setPicking(null)}>
        <DialogContent title={strings.pickTitle} description={strings.pickBody(course)}>
          <div className="flex flex-col gap-2">
            {picking?.length ? (
              picking.map((target) => (
                <Button
                  key={target.id}
                  variant="secondary"
                  onClick={() => void pushNotion({ type: target.type, id: target.id })}
                >
                  {target.title}
                </Button>
              ))
            ) : (
              <p className="font-sans text-sm text-text-muted">{strings.noTargets}</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
