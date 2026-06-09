import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getAiStatus, setAiKey, updateAiSettings } from '@/lib/ai';
import { useAuth } from '@/auth/useAuth';
import { Button, Field, Input, Spinner } from '@/components/ui';
import { Card } from '@/components/ui-extras';

export function AiSettings() {
  const { role } = useAuth();
  const isSuper = role === 'super_admin';
  const { data, isLoading, refetch } = useQuery({ queryKey: ['ai-status'], queryFn: getAiStatus });

  const [enabled, setEnabled] = useState(false);
  const [model, setModel] = useState('gemini-2.0-flash');
  const [key, setKey] = useState('');
  const [banner, setBanner] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (data) {
      setEnabled(data.enabled);
      setModel(data.model);
    }
  }, [data]);

  async function save() {
    setBusy(true);
    setBanner(null);
    try {
      await updateAiSettings({ ai_enabled: enabled, gemini_model: model.trim() });
      if (key.trim()) {
        await setAiKey(key.trim());
        setKey('');
      }
      setBanner({ kind: 'ok', text: 'Saved.' });
      void refetch();
    } catch (e) {
      setBanner({ kind: 'err', text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  if (isLoading)
    return (
      <div className="py-16">
        <Spinner label="Loading" />
      </div>
    );

  return (
    <div className="max-w-xl space-y-5">
      <h1 className="text-xl font-semibold text-ink">AI settings</h1>

      {!isSuper ? (
        <p className="text-sm text-muted">Only a super admin can change these settings.</p>
      ) : null}

      {banner ? (
        <div
          className={`rounded-lg px-3.5 py-2.5 text-sm ${
            banner.kind === 'ok' ? 'bg-success/10 text-success' : 'border border-danger/30 bg-danger/5 text-danger'
          }`}
        >
          {banner.text}
        </div>
      ) : null}

      <Card className="space-y-4 p-5">
        <label className="flex items-center justify-between">
          <span className="text-sm font-medium text-body">Enable AI tutor</span>
          <input
            type="checkbox"
            className="h-5 w-5 accent-[#0F7C86]"
            checked={enabled}
            disabled={!isSuper}
            onChange={(e) => setEnabled(e.target.checked)}
          />
        </label>

        <Field label="Gemini model" htmlFor="ai-model">
          <Input id="ai-model" value={model} disabled={!isSuper} onChange={(e) => setModel(e.target.value)} />
        </Field>

        <Field label="Gemini API key" htmlFor="ai-key">
          <Input
            id="ai-key"
            type="password"
            placeholder={data?.keyPresent ? '•••••••• (configured — leave blank to keep)' : 'Paste key to set'}
            value={key}
            disabled={!isSuper}
            onChange={(e) => setKey(e.target.value)}
          />
        </Field>
        <p className="text-xs text-muted">
          The key is stored encrypted and is never sent back to the browser. Status:{' '}
          {data?.keyPresent ? 'configured' : 'not set'}.
        </p>

        {isSuper ? (
          <div className="flex justify-end">
            <Button onClick={save} disabled={busy}>
              {busy ? 'Saving…' : 'Save settings'}
            </Button>
          </div>
        ) : null}
      </Card>
    </div>
  );
}
