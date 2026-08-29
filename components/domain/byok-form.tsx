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
          <SelectItem value="openrouter">OpenRouter</SelectItem>
        </Select>
      </Field>

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
