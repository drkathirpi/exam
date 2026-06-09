-- ============================================================================
-- MRCPCH LMS — Migration 0004 (quiz engine support)
-- ============================================================================

-- 1. Stable question order within an attempt (preserves shuffles on resume)
alter table public.answers
  add column if not exists position integer not null default 0;

create index if not exists idx_answers_attempt_position
  on public.answers (attempt_id, position);

-- 2. Server-side grading.
--    For exam/mock the browser never receives answer_index, so correctness is
--    computed here on submit. Recomputes is_correct authoritatively from the
--    stored selection vs the question key, then finalises the attempt totals.
--    SECURITY INVOKER => the caller must own the attempt (RLS enforces it).
create or replace function public.grade_attempt(p_attempt_id uuid)
returns table (correct integer, total integer)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if not exists (
    select 1 from public.attempts where id = p_attempt_id and user_id = v_uid
  ) then
    raise exception 'Attempt not found';
  end if;

  update public.answers a
  set
    is_correct = (a.selected_index is not null and a.selected_index = q.answer_index),
    answered_at = coalesce(a.answered_at, case when a.selected_index is not null then now() end)
  from public.questions q
  where a.question_id = q.id and a.attempt_id = p_attempt_id;

  update public.attempts t
  set
    status = 'submitted',
    submitted_at = now(),
    correct_count = (
      select count(*) from public.answers
      where attempt_id = p_attempt_id and is_correct = true
    ),
    total_questions = (
      select count(*) from public.answers where attempt_id = p_attempt_id
    )
  where t.id = p_attempt_id and t.user_id = v_uid;

  return query
    select t.correct_count, t.total_questions
    from public.attempts t
    where t.id = p_attempt_id;
end;
$$;

grant execute on function public.grade_attempt(uuid) to authenticated;
