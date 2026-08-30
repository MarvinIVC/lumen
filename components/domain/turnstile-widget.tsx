'use client';

import { useEffect, useId, useRef, useState } from 'react';

import { appStrings } from '@/lib/app/strings';
import { clientEnv } from '@/lib/env';
import { useTheme } from '@/lib/design/theme-provider';
import { cn } from '@/lib/utils/cn';

interface TurnstileApi {
  render: (
    element: HTMLElement,
    options: {
      sitekey: string;
      theme?: 'light' | 'dark' | 'auto';
      callback: (token: string) => void;
      'error-callback'?: () => void;
      'expired-callback'?: () => void;
    },
  ) => string;
  remove: (widgetId: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
const SCRIPT_ID = 'cf-turnstile';

export interface TurnstileWidgetProps {
  onToken: (token: string | null) => void;
  className?: string;
}

/**
 * Cloudflare Turnstile on `/app/new` (02-ARCHITECTURE.md §7, layer 3).
 *
 * Phase-03 renders the widget and captures the token into the draft; phase-04's enhance function
 * is what verifies it. Doing it here rather than at the moment of generation is deliberate — the
 * challenge should be solved while the student is uploading and waiting anyway, not inserted into
 * the one interaction the whole product is about.
 *
 * With no site key configured it renders nothing at all, which is the state every local
 * development machine and the whole of CI is in. A gate that cannot be configured must not be a
 * gate that blocks work.
 */
export function TurnstileWidget({ onToken, className }: TurnstileWidgetProps) {
  const siteKey = clientEnv.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const container = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const onTokenRef = useRef(onToken);
  const { resolvedTheme } = useTheme();
  const [failed, setFailed] = useState(false);
  const labelId = useId();

  onTokenRef.current = onToken;

  useEffect(() => {
    if (!siteKey || !container.current) return;

    let cancelled = false;
    const element = container.current;

    const render = () => {
      if (cancelled || !window.turnstile || widgetId.current) return;
      widgetId.current = window.turnstile.render(element, {
        sitekey: siteKey,
        theme: resolvedTheme === 'dark' ? 'dark' : 'light',
        callback: (token) => onTokenRef.current(token),
        'error-callback': () => {
          setFailed(true);
          onTokenRef.current(null);
        },
        // A token is good for five minutes. Clearing it is what stops a stale one being sent.
        'expired-callback': () => onTokenRef.current(null),
      });
    };

    if (window.turnstile) {
      render();
    } else {
      let script = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
      if (!script) {
        script = document.createElement('script');
        script.id = SCRIPT_ID;
        script.src = SCRIPT_SRC;
        script.async = true;
        script.defer = true;
        document.head.append(script);
      }
      script.addEventListener('load', render);
      script.addEventListener('error', () => setFailed(true));
    }

    return () => {
      cancelled = true;
      if (widgetId.current && window.turnstile) {
        window.turnstile.remove(widgetId.current);
        widgetId.current = null;
      }
    };
    // Re-rendering on a theme change would drop a solved token, which is worse than a widget that
    // keeps the theme it was drawn in until the next visit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteKey]);

  if (!siteKey) return null;

  return (
    <div className={cn('flex flex-col gap-1.5 font-sans', className)}>
      <p id={labelId} className="text-xs text-text-muted">
        {failed ? appStrings.turnstile.failed : appStrings.turnstile.hint}
      </p>
      <div ref={container} aria-labelledby={labelId} />
    </div>
  );
}
