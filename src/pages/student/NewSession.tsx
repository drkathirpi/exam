import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { createSession } from '@/lib/quiz';
import type { QuizMode } from '@/lib/quiz';
import { Button, Spinner } from '@/components/ui';
import { Card, Select } from '@/components/ui-extras';

const MODES: { value: QuizMode; label: string; blurb: string; needsBank: boolean }[] = [
  { value: 'practice', label: 'Practice', blurb: 'Instant feedback after each question.', needsBank: true },
  { value: 'topic', label: 'Topic', blurb: 'Focus on a single topic.', needsBank: true },
  { value: 'exam', label: 'Exam', blurb: 'Timed, feedback on submit.', needsBank: true },
  { value: 'mock', label: 'Mock', blurb: 'Randomised, scored, timed.', needsBank: true },
  { value: 'incorrect', label: 'Incorrect', blurb: 'Retry questions you got wrong.', needsBank: false },
  { value: 'bookmarked', label: 'Bookmarked', blurb: 'Review your bookmarks.', needsBank: false },
];

async function fetchBanks() {
  const { data, error } = await supabase
    .from('question_banks')
    .select('id, name')
    .eq('archived', false)
    .order('name');
  if (error) throw error;
  return (data ?? []).map((b) => ({ id: b.id as string, name: b.name as string }));
}

async function fetchTopics(bankId: string) {
  const { data, error } = await supabase.from('questions').select('topic').eq('bank_id', bankId);
  if (error) throw error;
  return [...new Set((data ?? []).map((r) => r.topic as string))].sort();
}

export function NewSession() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [mode, setMode] = useState<QuizMode>('practice');
  const [bankId, setBankId] = useState<string>(params.get('bank') ?? '');
  const [topic, setTopic] = useState<string>('');
  const [limit, setLimit] = useState<number>(20);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  const banksQ = useQuery({ queryKey: ['banks-for-session'], queryFn: fetchBanks });
  const selected = MODES.find((m) => m.value === mode)!;

  useEffect(() => {
    if (!bankId && banksQ.data && banksQ.data.length > 0) setBankId(banksQ.data[0]!.id);
  }, [banksQ.data, bankId]);

  const topicsQ = useQuery({
    queryKey: ['topics', bankId],
    queryFn: () => fetchTopics(bankId),
    enabled: mode === 'topic' && Boolean(bankId),
  });

  const showCount = mode === 'exam' || mode === 'mock';
  const showTopic = mode === 'topic';

  const canStart = useMemo(() => {
    if (!selected.needsBank) return true;
    if (!bankId) return false;
    if (showTopic && !topic) return false;
    return true;
  }, [selected, bankId, showTopic, topic]);

  async function start() {
    setError(null);
    setStarting(true);
    try {
      const id = await createSession({
        mode,
        bankId: selected.needsBank ? bankId : null,
        topic: showTopic ? topic : null,
        limit: showCount ? limit : null,
      });
      navigate(`/study/session/${id}`);
    } catch (e) {
      setError((e as Error).message);
      setStarting(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-xl font-semibold text-ink">Start a session</h1>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {MODES.map((m) => (
          <button
            key={m.value}
            onClick={() => setMode(m.value)}
            className={`rounded-xl border p-3 text-left transition-colors ${
              mode === m.value
                ? 'border-primary bg-primary-soft'
                : 'border-line bg-surface hover:border-primary/40'
            }`}
          >
            <p className="font-medium text-ink">{m.label}</p>
            <p className="mt-0.5 text-xs text-muted">{m.blurb}</p>
          </button>
        ))}
      </div>

      <Card className="space-y-4 p-5">
        {selected.needsBank ? (
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-body">Question bank</span>
            {banksQ.isLoading ? (
              <Spinner />
            ) : banksQ.data && banksQ.data.length > 0 ? (
              <Select value={bankId} onChange={(e) => setBankId(e.target.value)}>
                {banksQ.data.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </Select>
            ) : (
              <p className="text-sm text-muted">No banks assigned to you yet.</p>
            )}
          </label>
        ) : null}

        {showTopic ? (
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-body">Topic</span>
            {topicsQ.isLoading ? (
              <Spinner />
            ) : (
              <Select value={topic} onChange={(e) => setTopic(e.target.value)}>
                <option value="">Choose a topic…</option>
                {(topicsQ.data ?? []).map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </Select>
            )}
          </label>
        ) : null}

        {showCount ? (
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-body">Number of questions</span>
            <Select value={String(limit)} onChange={(e) => setLimit(Number(e.target.value))}>
              {[10, 20, 40, 60].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </Select>
          </label>
        ) : null}

        {error ? <p className="text-sm text-danger">{error}</p> : null}

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => navigate('/study')}>
            Cancel
          </Button>
          <Button disabled={!canStart || starting} onClick={start}>
            {starting ? 'Starting…' : 'Start'}
          </Button>
        </div>
      </Card>
    </div>
  );
}
