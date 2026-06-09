import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { findResumable } from '@/lib/quiz';
import { useAuth } from '@/auth/useAuth';
import { Button, Spinner } from '@/components/ui';
import { Card, EmptyState } from '@/components/ui-extras';

interface BankCard {
  id: string;
  name: string;
  count: number;
}
interface RecentAttempt {
  id: string;
  mode: string;
  score: number | null;
  submitted_at: string;
}

async function fetchHome(): Promise<{
  banks: BankCard[];
  recent: RecentAttempt[];
  resumable: { id: string; mode: string } | null;
}> {
  const [banksRes, recentRes, resumable] = await Promise.all([
    supabase
      .from('question_banks')
      .select('id, name, questions(count)')
      .eq('archived', false)
      .order('name'),
    supabase
      .from('attempts')
      .select('id, mode, correct_count, total_questions, submitted_at')
      .eq('status', 'submitted')
      .order('submitted_at', { ascending: false })
      .limit(5),
    findResumable(),
  ]);
  if (banksRes.error) throw banksRes.error;
  if (recentRes.error) throw recentRes.error;

  const banks: BankCard[] = (banksRes.data ?? []).map((b) => ({
    id: b.id as string,
    name: b.name as string,
    count: (b.questions as unknown as { count: number }[] | null)?.[0]?.count ?? 0,
  }));
  const recent: RecentAttempt[] = (recentRes.data ?? []).map((a) => ({
    id: a.id as string,
    mode: a.mode as string,
    score:
      a.total_questions > 0 ? Math.round((100 * a.correct_count) / a.total_questions) : null,
    submitted_at: a.submitted_at as string,
  }));
  return { banks, recent, resumable };
}

export function StudentHome() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['student-home'],
    queryFn: fetchHome,
  });

  const name = profile?.display_name ?? profile?.username ?? 'there';

  if (isLoading)
    return (
      <div className="py-16">
        <Spinner label="Loading" />
      </div>
    );
  if (isError || !data)
    return (
      <Card className="p-6">
        <p className="text-sm text-body">We couldn’t load your study area.</p>
        <Button className="mt-3" onClick={() => void refetch()}>
          Try again
        </Button>
      </Card>
    );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-ink">Welcome back, {name}</h1>
        <div className="flex gap-2">
          <Link to="/study/analytics">
            <Button variant="ghost">Analytics</Button>
          </Link>
          <Link to="/study/new">
            <Button>Start a session</Button>
          </Link>
        </div>
      </div>

      {data.resumable ? (
        <Card className="flex items-center justify-between gap-4 border-primary/30 bg-primary-soft p-4">
          <p className="text-sm text-body">
            You have an unfinished <span className="font-medium">{data.resumable.mode}</span>{' '}
            session.
          </p>
          <Button onClick={() => navigate(`/study/session/${data.resumable?.id}`)}>Resume</Button>
        </Card>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-ink">Your question banks</h2>
        {data.banks.length === 0 ? (
          <EmptyState
            title="No banks assigned yet"
            body="When an admin assigns you a question bank, it will appear here."
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.banks.map((b) => (
              <Card key={b.id} className="p-4">
                <p className="font-medium text-ink">{b.name}</p>
                <p className="mt-0.5 font-mono text-xs text-muted">{b.count} questions</p>
                <Link to={`/study/new?bank=${b.id}`}>
                  <Button variant="ghost" className="mt-3 px-0">
                    Practice →
                  </Button>
                </Link>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-ink">Recent results</h2>
        {data.recent.length === 0 ? (
          <p className="text-sm text-muted">No completed sessions yet.</p>
        ) : (
          <Card className="overflow-x-auto">
            <table className="w-full text-sm">
              <tbody>
                {data.recent.map((a) => (
                  <tr key={a.id} className="border-b border-line last:border-0">
                    <td className="px-4 py-3 capitalize text-body">{a.mode}</td>
                    <td className="px-4 py-3 font-mono text-muted">
                      {a.score === null ? '—' : `${a.score}%`}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        to={`/study/results/${a.id}`}
                        className="text-xs text-primary hover:underline"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </section>
    </div>
  );
}
