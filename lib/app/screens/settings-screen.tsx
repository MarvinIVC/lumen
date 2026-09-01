'use client';

import { useEffect, useState } from 'react';

import { BYOKForm } from '@/components/domain/byok-form';
import { OptionsPanel } from '@/components/domain/options-panel';
import { QuotaMeter } from '@/components/domain/quota-meter';
import { ThemeSwitcher } from '@/components/domain/theme-switcher';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/lib/auth/auth-provider';
import { Notice } from '@/lib/app/notice';
import { appStrings } from '@/lib/app/strings';
import { ByokError, SUGGESTED_MODEL, removeAccountKey, saveKey } from '@/lib/ai/byok-client';
import { clearByok, readByok } from '@/lib/ai/byok-store';
import type { StoredByok } from '@/lib/ai/byok-store';
import type { ProviderId } from '@/lib/ai/provider';
import type { EnhanceOptions } from '@/lib/ai/schema';
import { fetchUsage, resetsIn } from '@/lib/ai/usage-client';
import type { UsageSnapshot } from '@/lib/ai/usage-client';
import { clearAllLocalData, downloadAllNotes } from '@/lib/store/data-export';
import { DEFAULT_OPTIONS } from '@/lib/store/draft-store';
import { readDefaultOptions, writeDefaultOptions } from '@/lib/store/preferences';

/**
 * `/app/settings` — the account, the defaults, the key, and the two doors out.
 *
 * The copy carries the weight here. "Bring your own key" is a thing students are right to be
 * suspicious of, so the page says exactly where the key goes (our server, once), what is kept on
 * their device (a sealed blob we cannot read back), who bills them (their provider, not us), and
 * what it buys (no daily limit, unaffected by the community cap). Anything vaguer would be asking
 * for trust we have not earned.
 *
 * Phase-06 adds the other half of that bargain: leaving. "Download everything" is a plain zip of
 * Markdown that needs no account and no network, and "delete everything" asks the student to type
 * their own email before it removes the Storage objects, then the auth user — which cascades
 * through every owned row — and then this browser's copy. Storage goes first because no database
 * cascade reaches it, and the rows that name those objects are about to disappear.
 */
export function SettingsScreen() {
  const { user, openSignIn, signOut } = useAuth();
  const toast = useToast();
  const [stored, setStored] = useState<StoredByok | null>(null);
  const [usage, setUsage] = useState<UsageSnapshot | null>(null);
  const [provider, setProvider] = useState<ProviderId>('deepseek');
  const [model, setModel] = useState(SUGGESTED_MODEL.deepseek);
  const [baseUrl, setBaseUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const [options, setOptions] = useState<EnhanceOptions>(DEFAULT_OPTIONS);
  const [downloading, setDownloading] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState('');
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const found = readByok();
    setStored(found);
    setOptions(readDefaultOptions(DEFAULT_OPTIONS));
    if (found) {
      setProvider(found.provider);
      setModel(found.model);
      setBaseUrl(found.baseUrl ?? '');
    }
    const controller = new AbortController();
    void fetchUsage(controller.signal).then(setUsage);
    if (user) {
      void fetch('/api/account/profile', { signal: controller.signal, cache: 'no-store' })
        .then((response) => (response.ok ? response.json() : null))
        .then((body: { profile?: { prefs?: { defaults?: EnhanceOptions } } } | null) => {
          const defaults = body?.profile?.prefs?.defaults;
          if (defaults) {
            setOptions(defaults);
            writeDefaultOptions(defaults);
          }
        })
        .catch(() => undefined);
    }
    return () => controller.abort();
  }, [user]);

  const chooseProvider = (next: string) => {
    const id = next as ProviderId;
    setProvider(id);
    if (!model || Object.values(SUGGESTED_MODEL).includes(model))
      setModel(SUGGESTED_MODEL[id] ?? '');
  };

  const save = async (apiKey: string) => {
    setSaving(true);
    setError(undefined);
    try {
      const saved = await saveKey({
        provider,
        model: model.trim(),
        ...(baseUrl.trim() ? { baseUrl: baseUrl.trim() } : {}),
        apiKey,
      });
      setStored(saved);
      toast({ title: appStrings.settings.saved });
    } catch (cause) {
      setError(cause instanceof ByokError ? cause.message : appStrings.auth.failed);
    } finally {
      setSaving(false);
    }
  };

  const remove = () => {
    clearByok();
    setStored(null);
    if (user) void removeAccountKey();
    toast({ title: appStrings.settings.removed });
  };

  const saveOptions = async (next: EnhanceOptions) => {
    setOptions(next);
    writeDefaultOptions(next);
    if (user) {
      await fetch('/api/account/profile', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ defaults: next }),
      });
    }
    toast({ title: appStrings.settings.prefsSaved });
  };

  const download = async () => {
    setDownloading(true);
    try {
      await downloadAllNotes();
    } finally {
      setDownloading(false);
    }
  };

  const deleteEverything = async () => {
    if (!user || confirmEmail.trim().toLocaleLowerCase() !== user.email.toLocaleLowerCase()) return;
    setDeleting(true);
    const response = await fetch('/api/ai/delete-account', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: confirmEmail.trim() }),
    });
    if (!response.ok) {
      setDeleting(false);
      toast({ title: appStrings.settings.deleteFailed, tone: 'danger' });
      return;
    }
    await clearAllLocalData();
    clearByok();
    await signOut();
    setDeleting(false);
    setDeleteOpen(false);
    toast({ title: appStrings.settings.accountDeleted });
  };

  return (
    <main className="mx-auto flex w-full max-w-[42rem] flex-col gap-8 px-5 py-10">
      <header className="flex flex-col gap-2">
        <h1 className="font-serif text-3xl font-semibold text-text">{appStrings.settings.title}</h1>
        <p className="font-sans text-text-muted">{appStrings.settings.lead}</p>
      </header>

      <section className="flex flex-col gap-4">
        <h2 className="font-sans text-lg font-medium text-text">
          {appStrings.settings.accountHeading}
        </h2>
        {user ? (
          <>
            <Notice tone="info">{appStrings.settings.signedInAs(user.email)}</Notice>
            <Button className="self-start" onClick={() => void signOut()}>
              {appStrings.settings.signOut}
            </Button>
          </>
        ) : (
          <>
            <p className="text-sm text-text-muted">{appStrings.settings.signedOutLead}</p>
            <Button className="self-start" onClick={openSignIn}>
              {appStrings.auth.signIn}
            </Button>
          </>
        )}
      </section>
      <Separator />

      {/* The meter is absent whenever `usage` could not be read — offline, or a deployment with no
          Supabase behind it. Its separator goes with it; two rules with nothing between them read
          as a section that failed to render, which is exactly what we do not want to imply. */}
      {usage ? (
        <>
          <QuotaMeter
            used={usage.enhance.used}
            total={usage.enhance.total}
            {...(resetsIn(usage.enhance.resetsAt)
              ? { resetsIn: resetsIn(usage.enhance.resetsAt) }
              : {})}
            ownKey={Boolean(stored)}
          />
          <Separator />
        </>
      ) : null}

      <section className="flex flex-col gap-4">
        <h2 className="font-sans text-lg font-medium text-text">
          {appStrings.settings.appearanceHeading}
        </h2>
        <ThemeSwitcher />
        <div>
          <h3 className="mb-1 font-sans font-medium text-text">
            {appStrings.settings.defaultsHeading}
          </h3>
          <p className="mb-4 text-sm text-text-muted">{appStrings.settings.defaultsLead}</p>
          <OptionsPanel options={options} onChange={(next) => void saveOptions(next)} />
        </div>
      </section>
      <Separator />

      <section className="flex flex-col gap-4">
        <div>
          <h2 className="font-sans text-lg font-medium text-text">
            {appStrings.settings.byokHeading}
          </h2>
          <p className="mt-2 max-w-prose font-sans text-sm leading-relaxed text-text-muted">
            {appStrings.settings.byokLead}
          </p>
          <p className="mt-2 font-sans text-sm text-text-muted">
            {appStrings.settings.byokBilling}
          </p>
        </div>
        {stored ? (
          <Notice tone="info">
            {appStrings.settings.savedOn(new Date(stored.savedAt).toLocaleDateString())} ·{' '}
            {stored.provider} · {stored.model}
          </Notice>
        ) : null}
        <BYOKForm
          provider={provider}
          onProviderChange={chooseProvider}
          model={model}
          onModelChange={setModel}
          baseUrl={baseUrl}
          onBaseUrlChange={setBaseUrl}
          hasKey={Boolean(stored)}
          onSave={(key) => void save(key)}
          onRemove={remove}
          saving={saving}
          {...(error ? { error } : {})}
        />
        {saving ? (
          <p className="font-sans text-xs text-text-muted">{appStrings.settings.checking}</p>
        ) : null}
      </section>
      <Separator />

      <section className="flex flex-col gap-4">
        <div>
          <h2 className="font-sans text-lg font-medium text-text">
            {appStrings.settings.dataHeading}
          </h2>
          <p className="mt-1 text-sm text-text-muted">{appStrings.settings.dataLead}</p>
        </div>
        <Button className="self-start" loading={downloading} onClick={() => void download()}>
          {downloading ? appStrings.settings.downloading : appStrings.settings.downloadAll}
        </Button>
        {user ? (
          <div className="mt-4 rounded-md border border-danger/40 p-4">
            <h3 className="font-medium text-danger">{appStrings.settings.deleteHeading}</h3>
            <p className="mt-1 text-sm text-text-muted">{appStrings.settings.deleteLead}</p>
            <Button className="mt-3" variant="danger" onClick={() => setDeleteOpen(true)}>
              {appStrings.settings.deleteButton}
            </Button>
          </div>
        ) : null}
      </section>

      {user ? (
        <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <DialogContent
            title={appStrings.settings.deleteTitle}
            description={appStrings.settings.deleteBody(user.email)}
            footer={
              <>
                <DialogClose asChild>
                  <Button>{appStrings.library.cancel}</Button>
                </DialogClose>
                <Button
                  variant="danger"
                  loading={deleting}
                  disabled={
                    confirmEmail.trim().toLocaleLowerCase() !== user.email.toLocaleLowerCase()
                  }
                  onClick={() => void deleteEverything()}
                >
                  {deleting ? appStrings.settings.deleting : appStrings.settings.deleteConfirm}
                </Button>
              </>
            }
          >
            <label className="flex flex-col gap-1 font-medium">
              {appStrings.settings.confirmEmail}
              <Input
                type="email"
                autoComplete="off"
                value={confirmEmail}
                onChange={(event) => setConfirmEmail(event.target.value)}
              />
            </label>
          </DialogContent>
        </Dialog>
      ) : null}
    </main>
  );
}
