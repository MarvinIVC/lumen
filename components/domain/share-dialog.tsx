'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { CheckIcon, ExternalLinkIcon } from '@/components/ui/icons';

export interface ShareDialogProps {
  url: string | null;
  onCreate: () => void;
  onRevoke: () => void;
  allowIndex: boolean;
  onAllowIndexChange: (value: boolean) => void;
  creating?: boolean;
  children?: React.ReactNode;
}

/**
 * A read-only share link (06 §4).
 *
 * The dialog says exactly what a link does and does not carry, because "share" means very
 * different things in different products and a student is about to put this in a group chat. No
 * name on the page, no editing, revocable, and not indexed unless they say so.
 */
export function ShareDialog({
  url,
  onCreate,
  onRevoke,
  allowIndex,
  onAllowIndexChange,
  creating = false,
  children,
}: ShareDialogProps) {
  const [copied, setCopied] = useState(false);

  return (
    <Dialog>
      <DialogTrigger asChild>{children ?? <Button>Share</Button>}</DialogTrigger>
      <DialogContent
        title="Share this study guide"
        description="Anyone with the link can read it. They cannot edit it, and your name is not on the page."
        footer={
          url ? (
            <Button variant="ghost" onClick={onRevoke}>
              Revoke link
            </Button>
          ) : (
            <Button variant="primary" loading={creating} onClick={onCreate}>
              Create link
            </Button>
          )
        }
      >
        <div className="flex flex-col gap-5">
          {url ? (
            <Field label="Link" labelHidden>
              <div className="flex items-center gap-2">
                <Input readOnly value={url} aria-label="Share link" />
                <Button
                  icon={copied ? <CheckIcon /> : undefined}
                  onClick={() => {
                    void navigator.clipboard.writeText(url);
                    setCopied(true);
                    window.setTimeout(() => setCopied(false), 2000);
                  }}
                >
                  {copied ? 'Copied' : 'Copy'}
                </Button>
                <Button asChild variant="ghost" icon={<ExternalLinkIcon />}>
                  <a href={url} target="_blank" rel="noopener noreferrer">
                    Open
                  </a>
                </Button>
              </div>
            </Field>
          ) : (
            <p className="text-text-muted">
              No link yet. Creating one makes a read-only copy of this note at a public address.
            </p>
          )}

          <Switch
            justified
            checked={allowIndex}
            onCheckedChange={onAllowIndexChange}
            label="Let search engines index it"
            hint="Off by default. Shared pages are noindex unless you turn this on."
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
