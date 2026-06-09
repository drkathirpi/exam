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
import { Card } from '@/components/ui-extras';

interface AdminAnalytics {
  topics: { topic: string; accuracy: number }[];
  banks: { name: string; attempts: number }[];
  daily: { day: string; attempts: number }[];
  mostMissed: { question: string; topic: string; wrong: number; answered: number }[];
  users: { name: string; avg: number; sessions: number }[];
}

async function fetchAnalytics(): Promise<AdminAnalytics> {
  const [topicRes, attemptsRes, banksRes, dailyRes, missedRes, scoreRes, profRes] =
    await Promise.all([
      supabase.from('v_topic_performance').select('topic, answered, correct'),
      supabase.from('attempts').select('bank_id'),
      supabase.from('question_banks').select('id, name'),
      supabase.from('v_daily_activity').select('day, attempts_started'),
      supabase
        .from('v_most_missed')
        .select('question_text, topic, times_wrong, times_answered')
        .order('times_wrong', { ascending: false })
        .limit(10),
      supabase.from('v_score_trend').select('user_id, score_pct'),
      supabase.from('profiles').select('id, display_name, username'),
    ]);

  // Topic difficulty
  const tAgg = new Map<string, { a: number; c: number }>();
  for (const r of topicRes.data ?? []) {
    const cur = tAgg.get(r.topic) ?? { a: 0, c: 0 };
    cur.a += Number(r.answered) || 0;
    cur.c += Number(r.correct) || 0;
    tAgg.set(r.topic, cur);
  }
  const topics = [...tAgg.entries()]
    .filter(([, v]) => v.a > 0)
    .map(([topic, v]) => ({ topic, accuracy: Math.round((100 * v.c) / v.a) }))
    .sort((a, b) => a.accuracy - b.accuracy)
    .slice(0, 10);

  // Bank usage
  const bankName = new Map<string, string>(
    (banksRes.data ?? []).map((b) => [b.id as string, b.name as string] as [string, string]),
  );
  const bAgg = new Map<string, number>();
  for (const r of attemptsRes.data ?? []) {
    const id = r.bank_id as string | null;
    if (!id) continue;
    bAgg.set(id, (bAgg.get(id) ?? 0) + 1);
  }
  const banks = [...bAgg.entries()]
    .map(([id, attempts]) => ({ name: bankName.get(id) ?? 'Unknown', attempts }))
    .sort((a, b) => b.attempts - a.attempts);

  // Daily activity (sum across users per day)
  const dAgg = new Map<string, number>();
  for (const r of dailyRes.data ?? []) {
    const day = String(r.day);
    dAgg.set(day, (dAgg.get(day) ?? 0) + (Number(r.attempts_started) || 0));
  }
  const daily = [...dAgg.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-14)
    .map(([day, attempts]) => ({ day: day.slice(5), attempts }));

  const mostMissed = (missedRes.data ?? []).map((r) => ({
    question: String(r.question_text).slice(0, 90),
    topic: r.topic as string,
    wrong: Number(r.times_wrong) || 0,
    answered: Number(r.times_answered) || 0,
  }));

  // User performance
  const name = new Map<string, string>(
    (profRes.data ?? []).map(
      (p) =>
        [p.id as string, (p.display_name as string) || (p.username as string) || 'User'] as [
          string,
          string,
        ],
    ),
  );
  const uAgg = new Map<string, { sum: number; n: number }>();
  for (const r of scoreRes.data ?? []) {
    const id = r.user_id as string;
    const cur = uAgg.get(id) ?? { sum: 0, n: 0 };
    cur.sum += Number(r.score_pct) || 0;
    cur.n += 1;
    uAgg.set(id, cur);
  }
  const users = [...uAgg.entries()]
    .map(([id, v]) => ({ name: name.get(id) ?? 'User', avg: Math.round(v.sum / v.n), sessions: v.n }))
    .sort((a, b) => b.avg - a.avg);

  return { topics, banks, daily, mostMissed, users };
}

export function Analytics() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['admin-analytics'],
    queryFn: fetchAnalytics,
  });

  if (isLoading)
    return (
      <div className="py-16">
        <Spinner label="Loading analytics" />
      </div>
    );
  if (isError || !data)
    return (
      <Card className="p-6">
        <p className="text-sm text-body">We couldn’t load analytics.</p>
        <Button className="mt-3" onClick={() => void refetch()}>
          Try again
        </Button>
      </Card>
    );

  const empty =
    data.topics.length === 0 && data.banks.length === 0 && data.daily.length === 0;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-ink">Analytics</h1>

      {empty ? (
        <p className="text-sm text-muted">No activity yet. Charts appear once students start answering.</p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="mb-4 text-sm font-semibold text-ink">Topic difficulty (lowest accuracy)</h2>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data.topics} layout="vertical" margin={{ left: 8, right: 8 }}>
              <XAxis type="number" domain={[0, 100]} fontSize={11} />
              <YAxis type="category" dataKey="topic" width={90} fontSize={11} />
              <Tooltip />
              <Bar dataKey="accuracy" fill="#0F7C86" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card className="p-5">
          <h2 className="mb-4 text-sm font-semibold text-ink">Bank usage (attempts)</h2>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data.banks} margin={{ left: 8, right: 8 }}>
              <XAxis dataKey="name" fontSize={11} />
              <YAxis allowDecimals={false} fontSize={11} />
              <Tooltip />
              <Bar dataKey="attempts" fill="#0E2A3A" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      <Card className="p-5">
        <h2 className="mb-4 text-sm font-semibold text-ink">Daily activity (14 days)</h2>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={data.daily} margin={{ left: 8, right: 8 }}>
            <CartesianGrid stroke="#E2F1F2" vertical={false} />
            <XAxis dataKey="day" fontSize={11} />
            <YAxis allowDecimals={false} fontSize={11} />
            <Tooltip />
            <Line type="monotone" dataKey="attempts" stroke="#0F7C86" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="overflow-hidden">
          <h2 className="border-b border-line px-4 py-3 text-sm font-semibold text-ink">
            Most-missed questions
          </h2>
          {data.mostMissed.length === 0 ? (
            <p className="p-4 text-sm text-muted">No data yet.</p>
          ) : (
            <ul className="divide-y divide-line">
              {data.mostMissed.map((m, i) => (
                <li key={i} className="px-4 py-3 text-sm">
                  <p className="text-body">{m.question}…</p>
                  <p className="mt-0.5 font-mono text-xs text-muted">
                    {m.topic} · wrong {m.wrong}/{m.answered}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="overflow-hidden">
          <h2 className="border-b border-line px-4 py-3 text-sm font-semibold text-ink">
            User performance
          </h2>
          {data.users.length === 0 ? (
            <p className="p-4 text-sm text-muted">No completed sessions yet.</p>
          ) : (
            <table className="w-full text-sm">
              <tbody>
                {data.users.map((u, i) => (
                  <tr key={i} className="border-b border-line last:border-0">
                    <td className="px-4 py-2.5 text-body">{u.name}</td>
                    <td className="px-4 py-2.5 font-mono text-muted">{u.avg}%</td>
                    <td className="px-4 py-2.5 text-right font-mono text-xs text-muted">
                      {u.sessions} sessions
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </div>
  );
}
