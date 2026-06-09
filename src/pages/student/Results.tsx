import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { loadSession } from '@/lib/quiz';
import type { Session } from '@/lib/quiz';
import { Button, Spinner } from '@/components/ui';
import { Card, StatTile } from '@/components/ui-extras';

export function Results() {
  const { attemptId = '' } = useParams();
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    loadSession(attemptId)
      .then((s) => alive && setSession(s))
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [attemptId]);

  if (error)
    return (
      <div className="mx-auto max-w-2xl p-6">
        <Card className="p-6">
          <p className="text-sm text-body">{error}</p>
          <Button className="mt-3" onClick={() => navigate('/study')}>
            Back to study
          </Button>
        </Card>
      </div>
    );
  if (!session)
    return (
      <div className="py-16">
        <Spinner label="Loading results" />
      </div>
    );

  const total = session.questions.length;
  const correct = session.questions.filter((q) => q.isCorrect === true).length;
  const accuracy = total > 0 ? Math.round((100 * correct) / total) : 0;
  const totalTime = session.questions.reduce((a, q) => a + q.timeSpent, 0);
  const perQ = total > 0 ? Math.round(totalTime / total) : 0;

  const byTopic = new Map<string, { total: number; correct: number }>();
  for (const q of session.questions) {
    const t = byTopic.get(q.topic) ?? { total: 0, correct: 0 };
    t.total += 1;
    if (q.isCorrect) t.correct += 1;
    byTopic.set(q.topic, t);
  }
  const topics = [...byTopic.entries()].sort((a, b) => a[1].correct / a[1].total - b[1].correct / b[1].total);

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 lg:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-ink capitalize">{session.mode} results</h1>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => navigate('/study')}>
            Back to study
          </Button>
          <Button onClick={() => navigate(`/study/session/${session.attemptId}`)}>
            Review answers
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatTile label="Score" value={`${accuracy}%`} />
        <StatTile label="Correct" value={`${correct}/${total}`} />
        <StatTile label="Total time" value={`${Math.floor(totalTime / 60)}m`} />
        <StatTile label="Per question" value={`${perQ}s`} />
      </div>

      <Card className="p-5">
        <h2 className="mb-3 text-sm font-semibold text-ink">By topic</h2>
        <ul className="space-y-2">
          {topics.map(([topic, t]) => {
            const pct = Math.round((100 * t.correct) / t.total);
            return (
              <li key={topic} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-body">{topic}</span>
                  <span className="font-mono text-muted">
                    {t.correct}/{t.total} · {pct}%
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-line">
                  <div
                    className={pct >= 50 ? 'h-full bg-success' : 'h-full bg-danger'}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}
