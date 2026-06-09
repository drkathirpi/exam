-- ============================================================================
-- MRCPCH LMS — Migration 0001 (initial schema)
-- Target: Supabase (PostgreSQL 15). Deployment: <10 users, single maintainer.
-- Security model: deny-by-default RLS on every table; privileged ops via
-- Edge Functions using the service_role key (which bypasses RLS).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. Extensions
-- ---------------------------------------------------------------------------
create extension if not exists pgcrypto;        -- gen_random_uuid()
-- Vault is used to hold the Gemini API key (read only by the ai-proxy function):
create extension if not exists supabase_vault;

-- ---------------------------------------------------------------------------
-- 1. Enums
-- ---------------------------------------------------------------------------
create type public.app_role  as enum ('super_admin', 'admin', 'student');
create type public.quiz_mode as enum ('practice', 'exam', 'mock', 'topic', 'incorrect', 'bookmarked');
create type public.attempt_status as enum ('in_progress', 'submitted');

-- ---------------------------------------------------------------------------
-- 2. Tables
-- ---------------------------------------------------------------------------

-- 2.1 profiles — one row per auth user; role lives here (no separate roles table)
create table public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  role         public.app_role not null default 'student',
  display_name text,
  username     text unique,
  is_guest     boolean not null default false,
  disabled     boolean not null default false,
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now()
);

-- 2.2 question_banks
create table public.question_banks (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  archived    boolean not null default false,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- 2.3 questions
create table public.questions (
  id            uuid primary key default gen_random_uuid(),
  bank_id       uuid not null references public.question_banks(id) on delete cascade,
  external_id   integer not null,             -- the "id" field from the uploaded JSON
  topic         text not null,
  exam          text not null,
  question_text text not null,                -- the "q" field
  options       jsonb not null,               -- the "opts" array of strings
  answer_index  integer not null,             -- the "answer" field (0-based)
  source        text,
  explanation   text not null,
  created_at    timestamptz not null default now(),
  -- no duplicate external IDs within the same bank:
  unique (bank_id, external_id),
  -- options must be a JSON array of >=2 items and answer_index must be in range:
  constraint options_valid check (
    jsonb_typeof(options) = 'array'
    and (case when jsonb_typeof(options) = 'array'
              then jsonb_array_length(options) >= 2
                   and answer_index >= 0
                   and answer_index < jsonb_array_length(options)
              else false end)
  ),
  constraint question_text_not_blank check (length(btrim(question_text)) > 0),
  constraint explanation_not_blank   check (length(btrim(explanation))   > 0)
);

-- 2.4 assignments — which bank is visible to which user
create table public.assignments (
  id          uuid primary key default gen_random_uuid(),
  bank_id     uuid not null references public.question_banks(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  assigned_by uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  unique (bank_id, user_id)
);

-- 2.5 attempts — one quiz session (resume/sync state lives here + in answers)
create table public.attempts (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  bank_id         uuid references public.question_banks(id) on delete set null, -- null for cross-bank modes
  mode            public.quiz_mode not null,
  topic           text,                          -- set for 'topic' mode
  status          public.attempt_status not null default 'in_progress',
  total_questions integer not null default 0,
  correct_count   integer not null default 0,
  started_at      timestamptz not null default now(),
  submitted_at    timestamptz
);

-- 2.6 answers — one row per question within an attempt (granular = clean sync)
create table public.answers (
  id                 uuid primary key default gen_random_uuid(),
  attempt_id         uuid not null references public.attempts(id) on delete cascade,
  question_id        uuid not null references public.questions(id) on delete cascade,
  selected_index     integer,                   -- null until answered
  is_correct         boolean,                   -- null until answered
  flagged            boolean not null default false,
  time_spent_seconds integer not null default 0,
  answered_at        timestamptz,
  unique (attempt_id, question_id)
);

-- 2.7 bookmarks — persistent, per user/question
create table public.bookmarks (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (user_id, question_id)
);

-- 2.8 notes — per user/question free text
create table public.notes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  body        text not null default '',
  updated_at  timestamptz not null default now(),
  unique (user_id, question_id)
);

-- 2.9 ai_settings — SINGLETON (id always = 1). Holds NON-secret AI config only.
--     The Gemini API key is NOT stored here; it lives in Supabase Vault and is
--     read only by the ai-proxy Edge Function via the service_role.
create table public.ai_settings (
  id           integer primary key default 1 check (id = 1),
  ai_enabled   boolean not null default false,
  gemini_model text not null default 'gemini-2.0-flash',
  updated_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 3. Indexes (FKs are not auto-indexed in Postgres; add the ones we join on)
-- ---------------------------------------------------------------------------
create index idx_questions_bank      on public.questions(bank_id);
create index idx_questions_topic     on public.questions(topic);
create index idx_assignments_user    on public.assignments(user_id);
create index idx_assignments_bank    on public.assignments(bank_id);
create index idx_attempts_user       on public.attempts(user_id);
create index idx_attempts_bank       on public.attempts(bank_id);
create index idx_answers_attempt     on public.answers(attempt_id);
create index idx_answers_question    on public.answers(question_id);
create index idx_bookmarks_user      on public.bookmarks(user_id);
create index idx_notes_user          on public.notes(user_id);
create index idx_profiles_created_by on public.profiles(created_by);

-- ---------------------------------------------------------------------------
-- 4. Helper functions (SECURITY DEFINER so they read profiles without tripping
--    profiles' own RLS — the standard Supabase pattern, with locked search_path)
-- ---------------------------------------------------------------------------
create or replace function public.current_app_role()
returns public.app_role
language sql stable security definer set search_path = ''
as $$
  select role from public.profiles where id = (select auth.uid());
$$;

create or replace function public.is_super_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(public.current_app_role() = 'super_admin', false);
$$;

create or replace function public.is_staff()  -- admin OR super_admin
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(public.current_app_role() in ('admin','super_admin'), false);
$$;

-- ---------------------------------------------------------------------------
-- 5. Triggers
-- ---------------------------------------------------------------------------

-- 5.1 Auto-create a profile when an auth user is created.
--     Role/created_by from metadata are trusted ONLY when the caller is the
--     service_role (i.e. the admin-users Edge Function). Public self-signups
--     can never escalate themselves — they always land as 'student'.
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_trusted boolean := (auth.role() = 'service_role');
begin
  insert into public.profiles (id, role, display_name, username, is_guest, created_by)
  values (
    new.id,
    case when v_trusted
         then coalesce((new.raw_user_meta_data->>'role')::public.app_role, 'student')
         else 'student' end,
    new.raw_user_meta_data->>'display_name',
    new.raw_user_meta_data->>'username',
    case when v_trusted
         then coalesce((new.raw_user_meta_data->>'is_guest')::boolean, false)
         else false end,
    case when v_trusted
         then nullif(new.raw_user_meta_data->>'created_by','')::uuid
         else null end
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 5.2 Block role changes by anyone who is not a super_admin (or the service_role).
create or replace function public.prevent_role_escalation()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.role is distinct from old.role
     and not public.is_super_admin()
     and auth.role() <> 'service_role' then
    raise exception 'Only a super admin may change a user role';
  end if;
  return new;
end;
$$;

create trigger trg_prevent_role_escalation
  before update on public.profiles
  for each row execute function public.prevent_role_escalation();

-- 5.3 Generic updated_at maintenance
create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = ''
as $$ begin new.updated_at := now(); return new; end; $$;

create trigger trg_banks_touch    before update on public.question_banks
  for each row execute function public.touch_updated_at();
create trigger trg_notes_touch    before update on public.notes
  for each row execute function public.touch_updated_at();
create trigger trg_ai_touch       before update on public.ai_settings
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- 6. Enable Row-Level Security on every table (deny-by-default once enabled)
-- ---------------------------------------------------------------------------
alter table public.profiles       enable row level security;
alter table public.question_banks enable row level security;
alter table public.questions      enable row level security;
alter table public.assignments    enable row level security;
alter table public.attempts       enable row level security;
alter table public.answers        enable row level security;
alter table public.bookmarks      enable row level security;
alter table public.notes          enable row level security;
alter table public.ai_settings    enable row level security;

-- ---------------------------------------------------------------------------
-- 7. Policies
-- ---------------------------------------------------------------------------

-- 7.1 profiles
create policy profiles_select_self on public.profiles
  for select using (id = (select auth.uid()));
create policy profiles_select_staff on public.profiles
  for select using (public.is_staff());
create policy profiles_update_self on public.profiles
  for update using (id = (select auth.uid()))
              with check (id = (select auth.uid()));      -- role change blocked by trigger
create policy profiles_update_super on public.profiles
  for update using (public.is_super_admin())
              with check (public.is_super_admin());
create policy profiles_update_admin_created on public.profiles
  for update using (public.current_app_role() = 'admin' and created_by = (select auth.uid()))
              with check (public.current_app_role() = 'admin' and created_by = (select auth.uid()));
create policy profiles_delete_super on public.profiles
  for delete using (public.is_super_admin());
-- (INSERT happens only via the on_auth_user_created trigger; no client INSERT policy.)

-- 7.2 question_banks
create policy banks_all_staff on public.question_banks
  for all using (public.is_staff()) with check (public.is_staff());
create policy banks_select_assigned on public.question_banks
  for select using (
    archived = false
    and exists (select 1 from public.assignments a
                where a.bank_id = question_banks.id
                  and a.user_id = (select auth.uid()))
  );

-- 7.3 questions
create policy questions_all_staff on public.questions
  for all using (public.is_staff()) with check (public.is_staff());
create policy questions_select_assigned on public.questions
  for select using (
    exists (select 1 from public.assignments a
            where a.bank_id = questions.bank_id
              and a.user_id = (select auth.uid()))
  );

-- 7.4 assignments
create policy assignments_all_staff on public.assignments
  for all using (public.is_staff()) with check (public.is_staff());
create policy assignments_select_own on public.assignments
  for select using (user_id = (select auth.uid()));

-- 7.5 attempts (owner full control; staff may read for analytics)
create policy attempts_owner_all on public.attempts
  for all using (user_id = (select auth.uid()))
              with check (user_id = (select auth.uid()));
create policy attempts_select_staff on public.attempts
  for select using (public.is_staff());

-- 7.6 answers (ownership checked through the parent attempt)
create policy answers_owner_all on public.answers
  for all using (
    exists (select 1 from public.attempts t
            where t.id = answers.attempt_id and t.user_id = (select auth.uid()))
  ) with check (
    exists (select 1 from public.attempts t
            where t.id = answers.attempt_id and t.user_id = (select auth.uid()))
  );
create policy answers_select_staff on public.answers
  for select using (public.is_staff());

-- 7.7 bookmarks (strictly private)
create policy bookmarks_owner_all on public.bookmarks
  for all using (user_id = (select auth.uid()))
              with check (user_id = (select auth.uid()));

-- 7.8 notes (strictly private)
create policy notes_owner_all on public.notes
  for all using (user_id = (select auth.uid()))
              with check (user_id = (select auth.uid()));

-- 7.9 ai_settings (any signed-in user may read model/enabled; only super may write)
create policy ai_settings_select_auth on public.ai_settings
  for select using ((select auth.role()) = 'authenticated');
create policy ai_settings_write_super on public.ai_settings
  for all using (public.is_super_admin()) with check (public.is_super_admin());

-- ---------------------------------------------------------------------------
-- 8. Analytics as views (security_invoker = true => caller's RLS applies,
--    so a student only ever sees their own rows through these views).
--    No stored analytics table needed at this scale.
-- ---------------------------------------------------------------------------

-- 8.1 Per-user, per-topic performance
create view public.v_topic_performance
with (security_invoker = true) as
select
  t.user_id,
  q.topic,
  count(*)                              as answered,
  count(*) filter (where a.is_correct)  as correct,
  round(100.0 * count(*) filter (where a.is_correct) / nullif(count(*),0), 1) as accuracy_pct,
  round(avg(a.time_spent_seconds)::numeric, 1) as avg_seconds
from public.answers a
join public.attempts  t on t.id = a.attempt_id
join public.questions q on q.id = a.question_id
where a.is_correct is not null
group by t.user_id, q.topic;

-- 8.2 Per-user score trend (one point per submitted attempt)
create view public.v_score_trend
with (security_invoker = true) as
select
  user_id,
  id as attempt_id,
  mode,
  submitted_at,
  total_questions,
  correct_count,
  round(100.0 * correct_count / nullif(total_questions,0), 1) as score_pct
from public.attempts
where status = 'submitted';

-- 8.3 Most-missed questions (admins/super; students see only their own via RLS)
create view public.v_most_missed
with (security_invoker = true) as
select
  q.id as question_id,
  q.bank_id,
  q.topic,
  q.question_text,
  count(*) filter (where a.is_correct = false) as times_wrong,
  count(*) filter (where a.is_correct is not null) as times_answered
from public.questions q
join public.answers a on a.question_id = q.id
group by q.id, q.bank_id, q.topic, q.question_text;

-- 8.4 Daily activity (attempts started per day, per user)
create view public.v_daily_activity
with (security_invoker = true) as
select
  user_id,
  date_trunc('day', started_at)::date as day,
  count(*) as attempts_started
from public.attempts
group by user_id, date_trunc('day', started_at)::date;

-- ---------------------------------------------------------------------------
-- 9. Grants (RLS gates rows WITHIN these privileges; service_role bypasses RLS)
-- ---------------------------------------------------------------------------
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on public.v_topic_performance, public.v_score_trend,
                public.v_most_missed, public.v_daily_activity to authenticated;

-- ============================================================================
-- End of migration 0001
-- ============================================================================
