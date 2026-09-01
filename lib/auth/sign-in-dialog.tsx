'use client';

import { usePathname } from 'next/navigation';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { appStrings } from '@/lib/app/strings';

export function SignInDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const pathname = usePathname();
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<'email' | 'google' | null>(null);

  const magicLink = async (event: React.FormEvent) => {
    event.preventDefault();
    setSending(true);
    setError(null);
    try {
      const response = await fetch('/api/auth/magic-link', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, next: pathname }),
      });
      if (!response.ok) throw new Error('sign-in failed');
      setSent(true);
    } catch {
      setError('email');
    } finally {
      setSending(false);
    }
  };

  /**
   * Google is a provider a deployment either has configured or has not, and Supabase says so by
   * refusing the call. "Check the address and try again" would be advice about the wrong field, so
   * this failure names itself and points at the link that does work.
   */
  const google = async () => {
    setSending(true);
    setError(null);
    try {
      const response = await fetch('/api/auth/google', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ next: pathname }),
      });
      const result = (await response.json()) as { url?: string };
      if (!response.ok || !result.url) throw new Error('sign-in failed');
      window.location.assign(result.url);
    } catch {
      setError('google');
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={appStrings.auth.title} description={appStrings.auth.lead} size="sm">
        {sent ? (
          <div className="flex flex-col gap-2 font-sans">
            <p className="font-medium text-text">{appStrings.auth.sentTitle}</p>
            <p className="text-sm text-text-muted">{appStrings.auth.sentBody(email)}</p>
          </div>
        ) : (
          <div className="flex flex-col gap-4 font-sans">
            <form className="flex flex-col gap-3" onSubmit={(event) => void magicLink(event)}>
              <label className="flex flex-col gap-1.5 text-sm font-medium text-text">
                {appStrings.auth.emailLabel}
                <Input
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder={appStrings.auth.emailPlaceholder}
                />
              </label>
              <Button type="submit" variant="primary" fullWidth loading={sending}>
                {sending ? appStrings.auth.sending : appStrings.auth.magicLink}
              </Button>
            </form>

            <div className="flex items-center gap-3 text-xs text-text-muted" aria-hidden="true">
              <span className="h-px flex-1 bg-border" />
              {appStrings.auth.divider}
              <span className="h-px flex-1 bg-border" />
            </div>

            <Button fullWidth onClick={() => void google()} disabled={sending}>
              {appStrings.auth.google}
            </Button>

            {error ? (
              <p role="alert" className="text-sm text-danger">
                {error === 'google' ? appStrings.auth.googleFailed : appStrings.auth.failed}
              </p>
            ) : null}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
