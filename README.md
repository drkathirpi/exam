# MRCPCH Bank — Learning Management System

A question-bank and learning platform for MRCPCH (FOP/TAS) exam preparation. Static React frontend, Supabase backend, deployable unchanged to GitHub Pages or Cloudflare Pages.

## Stack

- React 18 + TypeScript (strict) + Vite
- React Router (HashRouter) · TanStack Query · Tailwind CSS · Recharts
- Supabase: Auth, Postgres + Row-Level Security, Storage, Edge Functions
- AI tutor: Google Gemini, proxied through a Supabase Edge Function

## What it does

- **Roles:** super admin, admin, student — enforced by RLS, not just the UI.
- **Admin:** dashboard, user management (incl. guest generation and CSV import), question-bank upload with strict validation, bank assignment, analytics, AI settings.
- **Student:** six quiz modes (practice, exam, mock, topic, incorrect, bookmarked), flag/bookmark/notes, cross-device resume, personal analytics, AI tutor.

## Project layout

```
src/
  auth/         AuthProvider, useAuth, route guards
  components/   layouts (AppShell, AdminLayout) + UI primitives + AiTutor
  lib/          supabase client, quiz, validation, csv, adminApi, ai, queryClient
  pages/        admin/* and student/* screens
  types/        shared types
supabase/
  migrations/   0001–0005 (schema, seed, import RPC, quiz engine, AI keys)
  functions/    admin-users, ai-proxy  (hold the service_role key server-side)
.github/workflows/deploy.yml   GitHub Pages CI
```

## Local development

```bash
npm install
cp .env.example .env.local      # fill VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
npm run dev
```

Quality gates: `npm run typecheck`, `npm run lint`, `npm run format`, `npm run build`.

---

## One-time backend setup (runbook)

1. **Create a Supabase project.** Copy the project URL and the **anon** key into `.env.local` (and into your host's env — see below).

2. **Apply migrations 0001 → 0005**, in order, via the Supabase SQL editor or CLI (`supabase db push`). They create the schema, RLS, the import RPC, the quiz-engine support, and the AI-key functions.

3. **Disable public sign-ups.** Authentication → Providers → Email → turn off "Enable Sign Ups". All accounts are created in-app by an admin.

4. **Create and promote the first super admin.** Add one user under Authentication → Users, then:
   ```sql
   update public.profiles set role = 'super_admin' where id = 'PASTE-UUID';
   ```

5. **Deploy the Edge Functions:**
   ```bash
   supabase functions deploy admin-users
   supabase functions deploy ai-proxy
   ```
   (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are provided to functions automatically.)

6. **AI (optional).** Sign in as the super admin → **AI settings** → set the Gemini model, paste the API key, and toggle AI on. The key is stored in Vault and is never exposed to the browser.

After this, sign in as the super admin to create banks and users.

---

## Deployment

The same build runs on both hosts unchanged: `base: './'` makes assets relative, and HashRouter means deep links never 404 on refresh.

### GitHub Pages

1. Settings → Pages → **Source: GitHub Actions**.
2. Settings → Secrets and variables → Actions → **Variables**: add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (these are public values).
3. Push to `main`. The included workflow builds and deploys. `public/.nojekyll` is shipped so asset folders are served untouched.

### Cloudflare Pages

Create a Pages project from the repo with:

- **Build command:** `npm run build`
- **Build output directory:** `dist`
- **Environment variables:** `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
- **Node version:** 20 (set `NODE_VERSION=20` if needed)

No SPA-fallback rule is required (HashRouter handles routing).

---

## Security model (summary)

- The **anon key** is public by design; **RLS** is the real data boundary, enabled deny-by-default on every table.
- The **service_role key** lives only inside Edge Functions; the **Gemini key** lives only in Vault. Neither reaches the browser.
- Privileged operations (user management, AI calls) re-verify the caller's JWT and role server-side. Role escalation is blocked by database triggers.
