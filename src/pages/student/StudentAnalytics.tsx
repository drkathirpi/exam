import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { supabase } from '@/lib/supabase';
import { Button, Spinner } from '@/components/ui';
import { Card, StatTile } from '@/components/ui-extras';

interface StudentAnalytics {
  trend: { label: string; score: number }[];
  topics: { topic: string; accuracy: number }[];
  accuracy: number | null;
  answered: number;
  avgSeconds: number | null;
}

async function fetchStudentAnalytics(): Promise<StudentAnalytics> {
  const [scoreRes, topicRes] = await Promise.all([
    supabase.from('v_score_trend').select('submitted_at, score_pct').order('submitted_at'),
    supabase.from('v_topic_performance').select('topic, answered, correct, avg_seconds'),
  ]);

  const trend = (scoreRes.data ?? []).map((r, i) => ({
    label: String(i + 1),
    score: Math.round(Number(r.score_pct) || 0),
  }));

  const topics = (topicRes.data ?? [])
    .map((r) => ({
      topic: r.topic as string,
      answered: Number(r.answered) || 0,
      correct: Number(r.correct) || 0,
      avg: Number(r.avg_seconds) || 0,
    }))
    .filter((t) => t.answered > 0);

  const totalAnswered = topics.reduce((a, t) => a + t.answered, 0);
  const totalCorrect = topics.reduce((a, t) => a + t.correct, 0);
  const weightedSeconds = topics.reduce((a, t) => a + t.avg * t.answered, 0);

  return {
    trend,
    topics: topics
      .map((t) => ({ topic: t.topic, accuracy: Math.round((100 * t.correct) / t.answered) }))
      .sort((a, b) => a.accuracy - b.accuracy),
    accuracy: totalAnswered > 0 ? Math.round((100 * totalCorrect) / totalAnswered) : null,
    answered: totalAnswered,
    avgSeconds: totalAnswered > 0 ? Math.round(weightedSeconds / totalAnswered) : null,
  };
}

export function StudentAnalytics() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['student-analytics'],
    queryFn: fetchStudentAnalytics,
  });

  if (isLoading)
    return (
      <div className="py-16">
        <Spinner label="Loading" />
      </div>
    );
  if (isError || !data)
    return (
      <Card className="p-6">
        <p className="text-sm text-body">We couldn’t load your analytics.</p>
        <Button className="mt-3" onClick={() => void refetch()}>
          Try again
        </Button>
      </Card>
    );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-ink">Your performance</h1>
        <Link to="/study" className="text-sm text-primary hover:underline">
          ← Back
        </Link>
      </div>

      {data.answered === 0 ? (
        <p className="text-sm text-muted">
          No answered questions yet. Start a session and your trends will build here.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-4">
            <StatTile label="Accuracy" value={data.accuracy === null ? '—' : `${data.accuracy}%`} />
            <StatTile label="Questions answered" value={data.answered} />
            <StatTile
              label="Avg time / question"
              value={data.avgSeconds === null ? '—' : `${data.avgSeconds}s`}
            />
          </div>

          <Card className="p-5">
            <h2 className="mb-4 text-sm font-semibold text-ink">Score trend (by session)</h2>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={data.trend} margin={{ left: 8, right: 8 }}>
                <CartesianGrid stroke="#E2F1F2" vertical={false} />
                <XAxis dataKey="label" fontSize={11} />
                <YAxis domain={[0, 100]} fontSize={11} />
                <Tooltip />
                <Line type="monotone" dataKey="score" stroke="#0F7C86" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </Card>

          <Card className="p-5">
            <h2 className="mb-4 text-sm font-semibold text-ink">Accuracy by topic</h2>
            <ResponsiveContainer width="100%" height={Math.max(160, data.topics.length * 28)}>
              <BarChart data={data.topics} layout="vertical" margin={{ left: 8, right: 8 }}>
                <XAxis type="number" domain={[0, 100]} fontSize={11} />
                <YAxis type="category" dataKey="topic" width={100} fontSize={11} />
                <Tooltip />
                <Bar dataKey="accuracy" fill="#0F7C86" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </>
      )}
    </div>
  );
}
