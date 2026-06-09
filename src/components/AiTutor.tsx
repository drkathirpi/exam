import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { askTutor, getAiStatus } from '@/lib/ai';
import type { TutorContext, TutorFeature } from '@/lib/ai';
import { Button, Spinner } from '@/components/ui';

const ACTIONS: { feature: TutorFeature; label: string }[] = [
  { feature: 'explain', label: 'Explain' },
  { feature: 'simplify', label: 'Simplify' },
  { feature: 'memory', label: 'Memory trick' },
  { feature: 'similar', label: 'Similar question' },
  { feature: 'revision', label: 'Revision notes' },
];

export function AiTutor({ context }: { context: TutorContext }) {
  const { data: status } = useQuery({ queryKey: ['ai-status'], queryFn: getAiStatus });
  const [busy, setBusy] = useState<TutorFeature | null>(null);
  const [text, setText] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  if (!status || !status.enabled || !status.keyPresent) return null;

  async function run(feature: TutorFeature) {
    setBusy(feature);
    setError(null);
    setText('');
    try {
      setText(await askTutor(feature, context));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-ink">AI tutor</span>
        {ACTIONS.map((a) => (
          <Button
            key={a.feature}
            variant="ghost"
            className="px-2.5 py-1.5 text-xs"
            disabled={busy !== null}
            onClick={() => run(a.feature)}
          >
            {busy === a.feature ? '…' : a.label}
          </Button>
        ))}
      </div>
      {busy ? (
        <div className="mt-3">
          <Spinner label="Thinking" />
        </div>
      ) : null}
      {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
      {text ? (
        <p className="mt-3 whitespace-pre-wrap text-sm text-body">{text}</p>
      ) : null}
    </div>
  );
}
