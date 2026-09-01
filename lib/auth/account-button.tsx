'use client';

import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { APP_SETTINGS } from '@/lib/app/routes';
import { appStrings } from '@/lib/app/strings';
import { useAuth } from './auth-provider';

export function AccountButton() {
  const { user, loading, openSignIn } = useAuth();
  if (loading) return <span className="h-8 w-16" aria-hidden="true" />;

  if (user) {
    return (
      <Button asChild size="sm" variant="ghost">
        <Link href={APP_SETTINGS}>{appStrings.auth.account}</Link>
      </Button>
    );
  }

  return (
    <Button size="sm" variant="secondary" onClick={openSignIn}>
      {appStrings.auth.signIn}
    </Button>
  );
}
