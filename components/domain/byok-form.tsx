'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectItem } from '@/components/ui/select';
import { cn } from '@/lib/utils/cn';

export interface BYOKFormProps {
  provider: string;
  onProviderChange: (provider: string) => void;
  /**
   * The exact model id to call. Required by every provider and impossible to guess for a BYOK
   * endpoint, so it is a field rather than a default — with a sensible suggestion per provider.
   */
  model?: string;
  onModelChange?: (model: string) => void;
  /** Only meaningful for an OpenAI-compatible endpoint; the form hides it otherwise. */
  baseUrl?: string;
  onBaseUrlChange?: (baseUrl: string) => void;
  /** True once a key is stored. The key itself is never read back into the form. */
  hasKey: boolean;
  onSave: (key: string) => void;
  onRemove: () => void;
  saving?: boolean;
  error?: string;
  className?: string;
}

/**
 * Bring your own key (02-ARCHITECTURE.md §7).
 *
 * A stored key is never rendered back into the input — not masked, not partially shown, simply
 * not returned. The form's job once a key exists is to say that one exists and offer to replace
 * or remove it, which is also why "Save" and "Remove" are separate rather than one toggle.
 */
export function BYOKForm({
  provider,
  onProviderChange,
  model,
  onModelChange,
  baseUrl,
  onBaseUrlChange,
  hasKey,
  onSave,
  onRemove,
  saving = false,
  error,
  className,
}: BYOKFormProps) {
  const [key, setKey] = useState('');

  return (
    <form
      className={cn('flex flex-col gap-4 font-sans', className)}
      onSubmit={(event) => {
        event.preventDefault();
        if (key.trim()) onSave(key.trim());
        setKey('');
      }}
    >
      <Field label="Provider">
        <Select value={provider} onValueChange={onProviderChange} aria-label="Provider">
          <SelectItem value="deepseek">DeepSeek</SelectItem>
          <SelectItem value="gemini">Google Gemini</SelectItem>
          <SelectItem value="openai-compatible">Any OpenAI-compatible endpoint</SelectItem>
          <SelectItem value="anthropic">Anthropic</SelectItem>
        </Select>
      </Field>

      {onModelChange ? (
        <Field label="Model" hint="The exact model id, e.g. deepseek-v4-flash.">
          <Input
            autoComplete="off"
            spellCheck={false}
            placeholder="deepseek-v4-flash"
            value={model ?? ''}
            onChange={(event) => onModelChange(event.target.value)}
          />
        </Field>
      ) : null}

      {onBaseUrlChange && provider === 'openai-compatible' ? (
        <Field label="Base URL" hint="Must start with https://. Your key is sent to this endpoint.">
          <Input
            autoComplete="off"
            spellCheck={false}
            inputMode="url"
            placeholder="https://api.example.com/v1"
            value={baseUrl ?? ''}
            onChange={(event) => onBaseUrlChange(event.target.value)}
          />
        </Field>
      ) : null}

      <Field
        label={hasKey ? 'Replace your key' : 'API key'}
        hint={
          hasKey
            ? 'A key is saved. We never show it again — paste a new one to replace it.'
            : 'Stored encrypted, used only for your own generations, and never logged.'
        }
        error={error}
      >
        <Input
          type="password"
          autoComplete="off"
          spellCheck={false}
          placeholder={hasKey ? '••••••••••••••••' : 'ds-…'}
          value={key}
          onChange={(event) => setKey(event.target.value)}
        />
      </Field>

      <div className="flex items-center gap-2">
        <Button type="submit" variant="primary" loading={saving} disabled={!key.trim()}>
          {hasKey ? 'Replace key' : 'Save key'}
        </Button>
        {hasKey ? (
          <Button variant="ghost" onClick={onRemove}>
            Remove
          </Button>
        ) : null}
      </div>
    </form>
  );
}
