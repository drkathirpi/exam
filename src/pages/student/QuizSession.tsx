import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  isImmediate,
  loadSession,
  persistTime,
  recordAnswer,
  saveNote,
  setBookmark,
  setFlag,
  submitAttempt,
} from '@/lib/quiz';
import type { Session, SessionQuestion } from '@/lib/quiz';
import { Button, Spinner } from '@/components/ui';
import { Card, Modal, Textarea } from '@/components/ui-extras';
import { AiTutor } from '@/components/AiTutor';

function fmt(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function QuizSession() {
  const { attemptId = '' } = useParams();
  const navigate = useNavigate();

  const [session, setSession] = useState<Session | null>(null);
  const [current, setCurrent] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [navOpen, setNavOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const activeSince = useRef<number>(Date.now());

  useEffect(() => {
    let alive = true;
    loadSession(attemptId)
      .then((s) => {
        if (!alive) return;
        setSession(s);
        const startMs = new Date(s.startedAt).getTime();
        setElapsed(Math.max(0, Math.round((Date.now() - startMs) / 1000)));
      })
      .catch((e: Error) => alive && setLoadError(e.message));
    return () => {
      alive = false;
    };
  }, [attemptId]);

  // Count-up timer while in progress
  const status = session?.status;
  useEffect(() => {
    if (!status || status === 'submitted') return;
    const id = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(id);
  }, [status]);

  const patch = useCallback((index: number, p: Partial<SessionQuestion>) => {
    setSession((s) =>
      s ? { ...s, questions: s.questions.map((q, i) => (i === index ? { ...q, ...p } : q)) } : s,
    );
  }, []);

  const flushTime = useCallback(
    (index: number) => {
      setSession((s) => {
        if (!s) return s;
        const q = s.questions[index];
        if (!q) return s;
        const delta = Math.round((Date.now() - activeSince.current) / 1000);
        activeSince.current = Date.now();
        if (delta <= 0) return s;
        const t = q.timeSpent + delta;
        void persistTime(q.answerId, t);
        return {
          ...s,
          questions: s.questions.map((x, i) => (i === index ? { ...x, timeSpent: t } : x)),
        };
      });
    },
    [],
  );

  const select = useCallback(
    (optIndex: number) => {
      if (!session || session.status === 'submitted') return;
      const q = session.questions[current];
      if (!q) return;
      const locked = isImmediate(session.mode) && q.selectedIndex !== null;
      if (locked) return; // immediate modes lock after answering
      flushTime(current);
      const correct =
        isImmediate(session.mode) && q.answerIndex !== null ? optIndex === q.answerIndex : null;
      patch(current, { selectedIndex: optIndex, isCorrect: correct });
      void recordAnswer(q.answerId, optIndex, correct, q.timeSpent);
    },
    [session, current, flushTime, patch],
  );

  const go = useCallback(
    (index: number) => {
      if (!session) return;
      const clamped = Math.max(0, Math.min(session.questions.length - 1, index));
      flushTime(current);
      setCurrent(clamped);
      setNavOpen(false);
    },
    [session, current, flushTime],
  );

  const toggleFlag = useCallback(() => {
    if (!session) return;
    const q = session.questions[current];
    if (!q) return;
    const next = !q.flagged;
    patch(current, { flagged: next });
    void setFlag(q.answerId, next);
  }, [session, current, patch]);

  const toggleBookmark = useCallback(() => {
    if (!session) return;
    const q = session.questions[current];
    if (!q) return;
    const next = !q.bookmarked;
    patch(current, { bookmarked: next });
    void setBookmark(q.questionId, next);
  }, [session, current, patch]);

  const submit = useCallback(async () => {
    if (!session) return;
    const unanswered = session.questions.filter((q) => q.selectedIndex === null).length;
    if (
      unanswered > 0 &&
      !confirm(`${unanswered} question${unanswered === 1 ? '' : 's'} unanswered. Submit anyway?`)
    )
      return;
    flushTime(current);
    setSubmitting(true);
    try {
      await submitAttempt(session.attemptId);
      navigate(`/study/results/${session.attemptId}`);
    } catch {
      setSubmitting(false);
      alert('Could not submit. Please check your connection and try again.');
    }
  }, [session, current, flushTime, navigate]);

  // Keyboard control (subscribed once; reads latest via ref)
  const viewRef = useRef({ select, go, current, toggleFlag, toggleBookmark });
  viewRef.current = { select, go, current, toggleFlag, toggleBookmark };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      const v = viewRef.current;
      if (e.key >= '1' && e.key <= '9') v.select(Number(e.key) - 1);
      else if (e.key === 'ArrowLeft') v.go(v.current - 1);
      else if (e.key === 'ArrowRight' || e.key === 'Enter') v.go(v.current + 1);
      else if (e.key.toLowerCase() === 'f') v.toggleFlag();
      else if (e.key.toLowerCase() === 'b') v.toggleBookmark();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (loadError)
    return (
      <Centered>
        <Card className="p-6 text-center">
          <p className="text-sm text-body">{loadError}</p>
          <Button className="mt-3" onClick={() => navigate('/study')}>
            Back to study
          </Button>
        </Card>
      </Centered>
    );
  if (!session)
    return (
      <Centered>
        <Spinner label="Loading session" />
      </Centered>
    );

  const q = session.questions[current];
  if (!q)
    return (
      <Centered>
        <p className="text-sm text-muted">This session has no questions.</p>
      </Centered>
    );

  const reviewing = session.status === 'submitted';
  const answered = session.questions.filter((x) => x.selectedIndex !== null).length;
  const correct = session.questions.filter((x) => x.isCorrect === true).length;
  const reveal = reviewing || (isImmediate(session.mode) && q.selectedIndex !== null);
  const showStats = reviewing || isImmediate(session.mode);

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      {/* Top bar */}
      <header className="flex h-14 items-center justify-between border-b border-line bg-surface px-4">
        <div className="flex items-center gap-3">
          <button className="text-sm text-muted hover:underline" onClick={() => navigate('/study')}>
            Exit
          </button>
          <span className="hidden text-sm capitalize text-body sm:inline">
            {session.mode}
            {session.topic ? ` · ${session.topic}` : ''}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-mono text-sm text-muted">{fmt(elapsed)}</span>
          {reviewing ? (
            <Button variant="ghost" onClick={() => navigate(`/study/results/${session.attemptId}`)}>
              Results
            </Button>
          ) : (
            <Button onClick={() => void submit()} disabled={submitting}>
              {submitting ? 'Submitting…' : 'Submit'}
            </Button>
          )}
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-6xl flex-1 gap-4 p-4 lg:grid-cols-[200px_1fr_240px]">
        {/* Left: navigator (desktop) */}
        <aside className="hidden lg:block">
          <Navigator session={session} current={current} reviewing={reviewing} onPick={go} />
        </aside>

        {/* Center: question */}
        <main className="min-w-0 space-y-4">
          <div className="flex items-center justify-between text-xs text-muted">
            <span>
              Question {current + 1} of {session.questions.length} · {q.topic}
            </span>
            <button className="lg:hidden text-primary hover:underline" onClick={() => setNavOpen(true)}>
              All questions
            </button>
          </div>

          <Card className="p-5">
            <p className="whitespace-pre-wrap text-body">{q.text}</p>

            <ul className="mt-4 space-y-2">
              {q.options.map((opt, i) => {
                const chosen = q.selectedIndex === i;
                const isKey = reveal && q.answerIndex === i;
                const chosenWrong = reveal && chosen && q.answerIndex !== i;
                const cls = isKey
                  ? 'border-success bg-success/5'
                  : chosenWrong
                    ? 'border-danger bg-danger/5'
                    : chosen
                      ? 'border-primary bg-primary-soft'
                      : 'border-line hover:border-primary/40';
                return (
                  <li key={i}>
                    <button
                      disabled={reviewing}
                      onClick={() => select(i)}
                      className={`flex w-full items-start gap-3 rounded-lg border px-3.5 py-2.5 text-left text-sm text-body transition-colors ${cls}`}
                    >
                      <span className="font-mono text-xs text-muted">{i + 1}</span>
                      <span>{opt}</span>
                    </button>
                  </li>
                );
              })}
            </ul>

            {reveal && q.explanation ? (
              <div className="mt-4 rounded-lg bg-canvas p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                  Explanation
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-body">{q.explanation}</p>
                {q.source ? <p className="mt-2 text-xs text-muted">Source: {q.source}</p> : null}
              </div>
            ) : null}
          </Card>

          <NotePanel question={q} />

          {reveal ? (
            <AiTutor
              context={{
                question: q.text,
                options: q.options,
                answer: q.answerIndex !== null ? q.options[q.answerIndex] : undefined,
                topic: q.topic,
                explanation: q.explanation ?? undefined,
              }}
            />
          ) : null}

          <div className="flex items-center justify-between">
            <Button variant="ghost" onClick={() => go(current - 1)} disabled={current === 0}>
              ← Previous
            </Button>
            <Button
              variant="ghost"
              onClick={() => go(current + 1)}
              disabled={current === session.questions.length - 1}
            >
              Next →
            </Button>
          </div>
        </main>

        {/* Right: progress + controls */}
        <aside className="space-y-4">
          <Card className="p-4">
            <p className="text-sm text-muted">Progress</p>
            <p className="mt-1 font-mono text-lg text-ink">
              {answered}/{session.questions.length}
            </p>
            {showStats ? (
              <p className="mt-1 text-xs text-muted">
                <span className="text-success">{correct} correct</span>
                {' · '}
                <span className="text-danger">{answered - correct} incorrect</span>
              </p>
            ) : null}
          </Card>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={toggleFlag} className="flex-1">
              {q.flagged ? '⚑ Flagged' : 'Flag'}
            </Button>
            <Button variant="ghost" onClick={toggleBookmark} className="flex-1">
              {q.bookmarked ? '★ Saved' : 'Bookmark'}
            </Button>
          </div>
          <p className="text-xs text-muted">
            Keys: 1–9 answer · ← → move · F flag · B bookmark
          </p>
        </aside>
      </div>

      {/* Mobile navigator */}
      {navOpen ? (
        <Modal title="Questions" onClose={() => setNavOpen(false)}>
          <Navigator session={session} current={current} reviewing={reviewing} onPick={go} />
        </Modal>
      ) : null}
    </div>
  );
}

function Navigator({
  session,
  current,
  reviewing,
  onPick,
}: {
  session: Session;
  current: number;
  reviewing: boolean;
  onPick: (i: number) => void;
}) {
  return (
    <div className="grid grid-cols-6 gap-1.5 lg:grid-cols-4">
      {session.questions.map((q, i) => {
        const base = 'relative h-9 rounded-md text-xs font-mono transition-colors';
        let tone = 'bg-surface border border-line text-muted hover:border-primary/40';
        if (reviewing && q.isCorrect === true) tone = 'bg-success/15 text-success';
        else if (reviewing && q.isCorrect === false) tone = 'bg-danger/15 text-danger';
        else if (q.selectedIndex !== null) tone = 'bg-primary text-white';
        const ring = i === current ? 'ring-2 ring-primary ring-offset-1' : '';
        return (
          <button key={q.answerId} onClick={() => onPick(i)} className={`${base} ${tone} ${ring}`}>
            {i + 1}
            {q.flagged ? (
              <span className="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-warning" />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

function NotePanel({ question }: { question: SessionQuestion }) {
  const [body, setBody] = useState(question.note);
  const [saved, setSaved] = useState(true);

  // Reset when the question changes
  useEffect(() => {
    setBody(question.note);
    setSaved(true);
  }, [question.questionId, question.note]);

  return (
    <details className="rounded-xl border border-line bg-surface">
      <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-body">
        Notes {body.trim() ? '•' : ''}
      </summary>
      <div className="px-4 pb-4">
        <Textarea
          rows={3}
          value={body}
          placeholder="Your private note for this question…"
          onChange={(e) => {
            setBody(e.target.value);
            setSaved(false);
          }}
          onBlur={() => {
            void saveNote(question.questionId, body);
            setSaved(true);
          }}
        />
        <p className="mt-1 text-xs text-muted">{saved ? 'Saved' : 'Editing…'}</p>
      </div>
    </details>
  );
}

function Centered({ children }: { children: ReactNode }) {
  return <div className="grid min-h-screen place-items-center bg-canvas p-4">{children}</div>;
}
