import { supabase } from './supabase';

export type QuizMode = 'practice' | 'exam' | 'mock' | 'topic' | 'incorrect' | 'bookmarked';

// Modes that reveal correctness as you go (and therefore may load the key).
export function isImmediate(mode: QuizMode): boolean {
  return mode === 'practice' || mode === 'topic' || mode === 'incorrect' || mode === 'bookmarked';
}

export interface SessionQuestion {
  answerId: string;
  questionId: string;
  position: number;
  topic: string;
  exam: string;
  text: string;
  options: string[];
  source: string | null;
  // Present only when allowed to reveal (immediate modes, or after submission):
  answerIndex: number | null;
  explanation: string | null;
  // Per-answer state:
  selectedIndex: number | null;
  isCorrect: boolean | null;
  flagged: boolean;
  timeSpent: number;
  // Personalisation (loaded alongside):
  bookmarked: boolean;
  note: string;
}

export interface Session {
  attemptId: string;
  mode: QuizMode;
  status: 'in_progress' | 'submitted';
  bankId: string | null;
  topic: string | null;
  startedAt: string;
  questions: SessionQuestion[];
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const ai = a[i] as T;
    a[i] = a[j] as T;
    a[j] = ai;
  }
  return a;
}

async function currentUserId(): Promise<string> {
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error('Your session has expired. Please sign in again.');
  return data.user.id;
}

export interface CreateOptions {
  mode: QuizMode;
  bankId?: string | null;
  topic?: string | null;
  limit?: number | null;
}

// Resolves the question id list for a given mode.
async function selectQuestionIds(opts: CreateOptions): Promise<string[]> {
  if (opts.mode === 'incorrect') {
    const { data, error } = await supabase
      .from('answers')
      .select('question_id, is_correct')
      .eq('is_correct', false);
    if (error) throw error;
    const ids = [...new Set((data ?? []).map((r) => r.question_id as string))];
    return shuffle(ids);
  }
  if (opts.mode === 'bookmarked') {
    const { data, error } = await supabase.from('bookmarks').select('question_id');
    if (error) throw error;
    return (data ?? []).map((r) => r.question_id as string);
  }

  // bank-based modes
  let query = supabase.from('questions').select('id').eq('bank_id', opts.bankId ?? '');
  if (opts.mode === 'topic' && opts.topic) query = query.eq('topic', opts.topic);
  const { data, error } = await query;
  if (error) throw error;
  let ids = (data ?? []).map((r) => r.id as string);
  if (opts.mode === 'exam' || opts.mode === 'mock') ids = shuffle(ids);
  if (opts.limit && opts.limit > 0) ids = ids.slice(0, opts.limit);
  return ids;
}

export async function createSession(opts: CreateOptions): Promise<string> {
  const userId = await currentUserId();
  const ids = await selectQuestionIds(opts);
  if (ids.length === 0) throw new Error('There are no questions to start this session.');

  const { data: attempt, error: aErr } = await supabase
    .from('attempts')
    .insert({
      user_id: userId,
      bank_id: opts.mode === 'incorrect' || opts.mode === 'bookmarked' ? null : opts.bankId ?? null,
      mode: opts.mode,
      topic: opts.topic ?? null,
      total_questions: ids.length,
      status: 'in_progress',
    })
    .select('id')
    .single();
  if (aErr || !attempt) throw new Error('Could not start the session.');

  const rows = ids.map((qid, i) => ({ attempt_id: attempt.id, question_id: qid, position: i }));
  const { error: ansErr } = await supabase.from('answers').insert(rows);
  if (ansErr) throw new Error('Could not build the session.');

  return attempt.id as string;
}

export async function findResumable(): Promise<{ id: string; mode: QuizMode } | null> {
  const { data, error } = await supabase
    .from('attempts')
    .select('id, mode')
    .eq('status', 'in_progress')
    .order('started_at', { ascending: false })
    .limit(1);
  if (error || !data || data.length === 0) return null;
  const row = data[0] as { id: string; mode: QuizMode };
  return { id: row.id, mode: row.mode };
}

export async function loadSession(attemptId: string): Promise<Session> {
  const { data: attempt, error: aErr } = await supabase
    .from('attempts')
    .select('id, mode, status, bank_id, topic, started_at')
    .eq('id', attemptId)
    .single();
  if (aErr || !attempt) throw new Error('Session not found.');

  const mode = attempt.mode as QuizMode;
  const reveal = attempt.status === 'submitted' || isImmediate(mode);
  const keyCols = reveal ? ', answer_index, explanation' : '';

  const { data: rows, error: rErr } = await supabase
    .from('answers')
    .select(
      `id, question_id, position, selected_index, is_correct, flagged, time_spent_seconds,
       questions ( id, topic, exam, question_text, options, source${keyCols} )`,
    )
    .eq('attempt_id', attemptId)
    .order('position', { ascending: true });
  if (rErr) throw new Error('Could not load the session.');

  const questionIds = (rows ?? []).map((r) => r.question_id as string);

  // Bookmarks + notes for this question set (owner-scoped by RLS)
  const [bm, nt] = await Promise.all([
    supabase.from('bookmarks').select('question_id').in('question_id', questionIds),
    supabase.from('notes').select('question_id, body').in('question_id', questionIds),
  ]);
  const bookmarked = new Set((bm.data ?? []).map((b) => b.question_id as string));
  const notes = new Map<string, string>(
    (nt.data ?? []).map((n) => [n.question_id as string, (n.body as string) ?? ''] as [string, string]),
  );

  const questions: SessionQuestion[] = (rows ?? []).map((r) => {
    const q = r.questions as unknown as {
      id: string;
      topic: string;
      exam: string;
      question_text: string;
      options: string[];
      source: string | null;
      answer_index?: number;
      explanation?: string;
    };
    return {
      answerId: r.id as string,
      questionId: r.question_id as string,
      position: r.position as number,
      topic: q.topic,
      exam: q.exam,
      text: q.question_text,
      options: q.options,
      source: q.source,
      answerIndex: reveal ? (q.answer_index ?? null) : null,
      explanation: reveal ? (q.explanation ?? null) : null,
      selectedIndex: r.selected_index as number | null,
      isCorrect: r.is_correct as boolean | null,
      flagged: Boolean(r.flagged),
      timeSpent: (r.time_spent_seconds as number) ?? 0,
      bookmarked: bookmarked.has(r.question_id as string),
      note: notes.get(r.question_id as string) ?? '',
    };
  });

  return {
    attemptId,
    mode,
    status: attempt.status as 'in_progress' | 'submitted',
    bankId: attempt.bank_id as string | null,
    topic: attempt.topic as string | null,
    startedAt: attempt.started_at as string,
    questions,
  };
}

export async function recordAnswer(
  answerId: string,
  selectedIndex: number,
  isCorrect: boolean | null,
  timeSpent: number,
): Promise<void> {
  await supabase
    .from('answers')
    .update({
      selected_index: selectedIndex,
      is_correct: isCorrect,
      answered_at: new Date().toISOString(),
      time_spent_seconds: timeSpent,
    })
    .eq('id', answerId);
}

export async function persistTime(answerId: string, timeSpent: number): Promise<void> {
  await supabase.from('answers').update({ time_spent_seconds: timeSpent }).eq('id', answerId);
}

export async function setFlag(answerId: string, flagged: boolean): Promise<void> {
  await supabase.from('answers').update({ flagged }).eq('id', answerId);
}

export async function setBookmark(questionId: string, on: boolean): Promise<void> {
  const userId = await currentUserId();
  if (on) {
    await supabase.from('bookmarks').upsert(
      { user_id: userId, question_id: questionId },
      { onConflict: 'user_id,question_id' },
    );
  } else {
    await supabase.from('bookmarks').delete().eq('question_id', questionId);
  }
}

export async function saveNote(questionId: string, body: string): Promise<void> {
  const userId = await currentUserId();
  if (body.trim().length === 0) {
    await supabase.from('notes').delete().eq('question_id', questionId);
    return;
  }
  await supabase.from('notes').upsert(
    { user_id: userId, question_id: questionId, body, updated_at: new Date().toISOString() },
    { onConflict: 'user_id,question_id' },
  );
}

export async function submitAttempt(attemptId: string): Promise<void> {
  const { error } = await supabase.rpc('grade_attempt', { p_attempt_id: attemptId });
  if (error) throw new Error('Could not submit the session.');
}
