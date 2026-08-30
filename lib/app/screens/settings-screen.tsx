'use client';

import { useEffect, useState } from 'react';

import { Separator } from '@/components/ui/separator';
import { useToast } from '@/components/ui/toast';
import { BYOKForm } from '@/components/domain/byok-form';
import { QuotaMeter } from '@/components/domain/quota-meter';
import { Notice } from '@/lib/app/notice';
import { appStrings } from '@/lib/app/strings';
import { ByokError, SUGGESTED_MODEL, saveKey } from '@/lib/ai/byok-client';
import { clearByok, readByok } from '@/lib/ai/byok-store';
import type { StoredByok } from '@/lib/ai/byok-store';
import { fetchUsage, resetsIn } from '@/lib/ai/usage-client';
import type { UsageSnapshot } from '@/lib/ai/usage-client';
import type { ProviderId } from '@/lib/ai/provider';

/**
 * `/app/settings` — for now, the one setting that changes what a student can do.
 *
 * The copy carries the weight here. "Bring your own key" is a thing students are right to be
 * suspicious of, so the page says exactly where the key goes (our server, once), what is kept on
 * their device (a sealed blob we cannot read back), who bills them (their provider, not us), and
 * what it buys (no daily limit, unaffected by the community cap). Anything vaguer would be asking
 * for trust we have not earned.
 */
export function SettingsScreen() {
  const toast = useToast();
  const [stored, setStored] = useState<StoredByok | null>(null);
  const [usage, setUsage] = useState<UsageSnapshot | null>(null);
  const [provider, setProvider] = useState<ProviderId>('deepseek');
  const [model, setModel] = useState(SUGGESTED_MODEL.deepseek);
  const [baseUrl, setBaseUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  useEffect(() => {
    const found = readByok();
    setStored(found);
    if (found) {
      setProvider(found.provider);
      setModel(found.model);
      setBaseUrl(found.baseUrl ?? '');
    }
    const controller = new AbortController();
    void fetchUsage(controller.signal).then(setUsage);
    return () => controller.abort();
  }, []);

  const chooseProvider = (next: string) => {
    const id = next as ProviderId;
    setProvider(id);
    // Only overwrite a model the student has not typed over themselves.
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
      setError(cause instanceof ByokError ? cause.message : 'Something went wrong. Try again.');
    } finally {
      setSaving(false);
    }
  };

  const remove = () => {
    clearByok();
    setStored(null);
    toast({ title: appStrings.settings.removed });
  };

  return (
    <main className="mx-auto flex w-full max-w-[42rem] flex-col gap-8 px-5 py-10">
      <header className="flex flex-col gap-2">
        <h1 className="font-serif text-3xl font-semibold text-text">{appStrings.settings.title}</h1>
        <p className="font-sans text-text-muted">{appStrings.settings.lead}</p>
      </header>

      {usage ? (
        <QuotaMeter
          used={usage.enhance.used}
          total={usage.enhance.total}
          {...(resetsIn(usage.enhance.resetsAt)
            ? { resetsIn: resetsIn(usage.enhance.resetsAt) }
            : {})}
          ownKey={Boolean(stored)}
        />
      ) : null}

      <Separator />

      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <h2 className="font-sans text-lg font-medium text-text">
            {appStrings.settings.byokHeading}
          </h2>
          <p className="max-w-prose font-sans text-sm leading-relaxed text-text-muted">
            {appStrings.settings.byokLead}
          </p>
          <p className="font-sans text-sm text-text-muted">{appStrings.settings.byokBilling}</p>
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
    </main>
  );
}
