import type { EmailOtpType } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

import { safeAppNext } from '@/lib/auth/safe-next';
import { createSupabaseServerClient } from '@/lib/supabase/server.server';

const EMAIL_TYPES = new Set<EmailOtpType>([
  'email',
  'signup',
  'invite',
  'magiclink',
  'recovery',
  'email_change',
]);

export async function GET(request: Request) {
  const url = new URL(request.url);
  const tokenHash = url.searchParams.get('token_hash');
  const type = url.searchParams.get('type') as EmailOtpType | null;
  const next = safeAppNext(url.searchParams.get('next') ?? url.searchParams.get('redirect_to'));

  if (tokenHash && type && EMAIL_TYPES.has(type)) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) return NextResponse.redirect(new URL(next, url.origin));
  }

  const failed = new URL('/app', url.origin);
  failed.searchParams.set('auth', 'failed');
  return NextResponse.redirect(failed);
}
