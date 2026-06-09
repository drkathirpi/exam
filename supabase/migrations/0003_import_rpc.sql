-- ============================================================================
-- MRCPCH LMS — Migration 0003 (question-bank import RPC)
-- Atomic import: the bank and all its questions commit in one transaction, so a
-- constraint violation on any question rolls back the whole import (no orphans,
-- no partial banks). Runs as SECURITY INVOKER, so RLS still applies — only staff
-- can insert (enforced by the banks_all_staff / questions_all_staff policies).
-- ============================================================================

create or replace function public.import_question_bank(
  p_name        text,
  p_description text,
  p_questions   jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_bank_id uuid;
begin
  if p_name is null or length(btrim(p_name)) = 0 then
    raise exception 'Bank name is required';
  end if;
  if p_questions is null or jsonb_typeof(p_questions) <> 'array'
     or jsonb_array_length(p_questions) = 0 then
    raise exception 'At least one question is required';
  end if;

  insert into public.question_banks (name, description, created_by)
  values (btrim(p_name), nullif(btrim(coalesce(p_description, '')), ''), (select auth.uid()))
  returning id into v_bank_id;

  insert into public.questions
    (bank_id, external_id, topic, exam, question_text, options, answer_index, source, explanation)
  select
    v_bank_id, x.id, x.topic, x.exam, x.q, x.opts, x.answer, x.source, x.explanation
  from jsonb_to_recordset(p_questions)
    as x(id int, topic text, exam text, q text, opts jsonb, answer int, source text, explanation text);

  return v_bank_id;
end;
$$;

grant execute on function public.import_question_bank(text, text, jsonb) to authenticated;
