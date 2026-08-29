'use client';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CheckIcon, ExternalLinkIcon } from '@/components/ui/icons';
import { cn } from '@/lib/utils/cn';

export type IntegrationState = 'disconnected' | 'connected' | 'expired' | 'pushing';

export interface IntegrationButtonProps {
  name: string;
  /** Where this note would land, once chosen: "Chemistry ▸ Unit 1". */
  target?: string | null;
  state: IntegrationState;
  onConnect: () => void;
  onPush: () => void;
  className?: string;
}

/**
 * Notion or Drive, in one row (06 §3).
 *
 * `expired` is a real state and not an error: a revoked token must prompt re-auth without ever
 * looking like the note is gone. That is the failure this component exists to handle gracefully —
 * everything else here is a button.
 */
export function IntegrationButton({
  name,
  target,
  state,
  onConnect,
  onPush,
  className,
}: IntegrationButtonProps) {
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-3 rounded-md border border-border bg-bg-raised px-3.5 py-3 font-sans',
        className,
      )}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-text">{name}</p>
          {state === 'connected' ? (
            <Badge tone="success" icon={<CheckIcon />}>
              Connected
            </Badge>
          ) : null}
          {state === 'expired' ? <Badge tone="warning">Needs reconnecting</Badge> : null}
        </div>
        <p className="mt-0.5 truncate text-xs text-text-muted">
          {state === 'disconnected'
            ? `Send finished notes straight to ${name}.`
            : state === 'expired'
              ? `${name} revoked our access. Your notes are untouched — reconnect to keep pushing.`
              : (target ?? 'No destination chosen yet')}
        </p>
      </div>

      {state === 'connected' ? (
        <Button
          size="sm"
          icon={<ExternalLinkIcon />}
          loading={state !== 'connected'}
          onClick={onPush}
        >
          Push
        </Button>
      ) : state === 'pushing' ? (
        <Button size="sm" loading>
          Pushing
        </Button>
      ) : (
        <Button
          size="sm"
          variant={state === 'expired' ? 'primary' : 'secondary'}
          onClick={onConnect}
        >
          {state === 'expired' ? 'Reconnect' : 'Connect'}
        </Button>
      )}
    </div>
  );
}
