import { useState } from 'react';
import type { FormEvent } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/auth/useAuth';
import { Alert, Button, Field, Input } from '@/components/ui';

interface LocationState {
  from?: { pathname: string };
}

export function LoginPage() {
  const { session, loading, signIn } = useAuth();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Already signed in -> bounce to where they were headed (or home).
  if (!loading && session) {
    const to = (location.state as LocationState | null)?.from?.pathname ?? '/';
    return <Navigate to={to} replace />;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const { error: signInError } = await signIn(email.trim(), password);
    setSubmitting(false);
    if (signInError) setError(signInError);
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Brand panel — the one place we spend visual boldness */}
      <aside className="relative hidden flex-col justify-between bg-ink p-12 text-white lg:flex">
        <span className="text-lg font-semibold tracking-tight">
          MRCPCH<span className="text-primary"> Bank</span>
        </span>
        <div className="space-y-4">
          <p className="font-mono text-sm uppercase tracking-[0.2em] text-primary-soft/70">
            FOP · TAS · Clinical
          </p>
          <h1 className="max-w-sm text-3xl font-semibold leading-tight">
            Practice, mock exams, and progress that follows you across devices.
          </h1>
        </div>
        <p className="text-sm text-primary-soft/60">A paediatric exam question bank.</p>
      </aside>

      {/* Form */}
      <main className="flex items-center justify-center bg-canvas px-6 py-12">
        <div className="w-full max-w-sm space-y-6">
          <div className="space-y-1">
            <h2 className="text-2xl font-semibold text-ink">Sign in</h2>
            <p className="text-sm text-muted">Use the credentials your administrator gave you.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error ? <Alert>{error}</Alert> : null}
            <Field label="Email" htmlFor="email">
              <Input
                id="email"
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
              />
            </Field>
            <Field label="Password" htmlFor="password">
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
            <Button type="submit" disabled={submitting} className="w-full">
              {submitting ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>
        </div>
      </main>
    </div>
  );
}
