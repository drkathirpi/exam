import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { Card, StatTile } from '@/components/ui-extras';
import { Button, Spinner } from '@/components/ui';

interface DashboardData {
  totalUsers: number;
  activeUsers: number;
  totalBanks: number;
  totalQuestions: number;
  avgScore: number | null;
  weakest: { topic: string; accuracy: number }[];
  daily: { day: string; count: number }[];
}

async function fetchDashboard(): Promise<DashboardData> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const fourteenDaysAgo = new Date(Date.now() - 14 * 86_400_000).toISOString();

  const countOf = async (table: string) => {
    const { count, error } = await supabase
      .from(table)
      .select('*', { count: 'exact', head: true });
    if (error) throw error;
    return count ?? 0;
  };

  const [totalUsers, totalBanks, totalQuestions, recent, scores, topics] = await Promise.all([
    countOf('profiles'),
    countOf('question_banks'),
    countOf('questions'),
    supabase.from('attempts').select('user_id, started_at').gte('started_at', fourteenDaysAgo),
    supabase.from('v_score_trend').select('score_pct'),
    supabase.from('v_topic_performance').select('topic, answered, correct'),
  ]);
  if (recent.error) throw recent.error;
  if (scores.error) throw scores.error;
  if (topics.error) throw topics.error;

  // Active users (last 7 days) + daily activity (last 14 days)
  const activeSet = new Set<string>();
  const dayMap = new Map<string, number>();
  for (let i = 13; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10);
    dayMap.set(d, 0);
  }
  for (const row of recent.data ?? []) {
    const day = String(row.started_at).slice(0, 10);
    if (dayMap.has(day)) dayMap.set(day, (dayMap.get(day) ?? 0) + 1);
    if (String(row.started_at) >= sevenDaysAgo) activeSet.add(String(row.user_id));
  }

  const scoreVals = (scores.data ?? [])
    .map((r) => Number(r.score_pct))
    .filter((n) => !Number.isNaN(n));
  const avgScore =
    scoreVals.length > 0 ? Math.round(scoreVals.reduce((a, b) => a + b, 0) / scoreVals.length) : null;

  // Weakest topics aggregated across all users
  const agg = new Map<string, { answered: number; correct: number }>();
  for (const r of topics.data ?? []) {
    const cur = agg.get(r.topic) ?? { answered: 0, correct: 0 };
    cur.answered += Number(r.answered) || 0;
    cur.correct += Number(r.correct) || 0;
    agg.set(r.topic, cur);
  }
  const weakest = [...agg.entries()]
    .filter(([, v]) => v.answered >= 1)
    .map(([topic, v]) => ({ topic, accuracy: Math.round((100 * v.correct) / v.answered) }))
    .sort((a, b) => a.accuracy - b.accuracy)
    .slice(0, 5);

  return {
    totalUsers,
    activeUsers: activeSet.size,
    totalBanks,
    totalQuestions,
    avgScore,
    weakest,
    daily: [...dayMap.entries()].map(([day, count]) => ({ day, count })),
  };
}

export function Dashboard() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['admin-dashboard'],
    queryFn: fetchDashboard,
  });

  if (isLoading)
    return (
      <div className="py-16">
        <Spinner label="Loading dashboard" />
      </div>
    );

  if (isError || !data)
    return (
      <Card className="p-6">
        <p className="text-sm text-body">We couldn’t load the dashboard.</p>
        <Button className="mt-3" onClick={() => void refetch()}>
          Try again
        </Button>
      </Card>
    );

  const maxDaily = Math.max(1, ...data.daily.map((d) => d.count));

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-ink">Dashboard</h1>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="Total users" value={data.totalUsers} />
        <StatTile label="Active (7 days)" value={data.activeUsers} />
        <StatTile label="Question banks" value={data.totalBanks} />
        <StatTile label="Total questions" value={data.totalQuestions} />
        <StatTile
          label="Average score"
          value={data.avgScore === null ? '—' : `${data.avgScore}%`}
          hint="across submitted attempts"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="text-sm font-semibold text-ink">Daily activity</h2>
          <p className="mb-4 text-xs text-muted">Attempts started, last 14 days</p>
          <div className="flex h-32 items-end gap-1">
            {data.daily.map((d) => (
              <div key={d.day} className="flex flex-1 flex-col items-center gap-1">
                <div
                  className="w-full rounded-t bg-primary/80"
                  style={{ height: `${(d.count / maxDaily) * 100}%` }}
                  title={`${d.day}: ${d.count}`}
                />
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="text-sm font-semibold text-ink">Weakest topics</h2>
          <p className="mb-4 text-xs text-muted">Lowest accuracy across all students</p>
          {data.weakest.length === 0 ? (
            <p className="text-sm text-muted">No answered questions yet.</p>
          ) : (
            <ul className="space-y-2">
              {data.weakest.map((w) => (
                <li key={w.topic} className="flex items-center justify-between text-sm">
                  <span className="text-body">{w.topic}</span>
                  <span className="font-mono text-muted">{w.accuracy}%</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
