import { Outlet } from 'react-router-dom';
import { useAuth } from '@/auth/useAuth';
import { Button, RoleBadge } from '@/components/ui';

// Minimal authenticated frame for Phase 3. The sidebar + dashboard widgets
// arrive in Phase 4 and slot into the <main> region below.
export function AppShell() {
  const { profile, role, signOut } = useAuth();
  return (
    <div className="min-h-screen bg-canvas">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <span className="font-semibold tracking-tight text-ink">
            MRCPCH<span className="text-primary"> Bank</span>
          </span>
          <div className="flex items-center gap-3">
            {role ? <RoleBadge role={role} /> : null}
            <span className="hidden text-sm text-muted sm:inline">
              {profile?.display_name ?? profile?.username ?? 'Signed in'}
            </span>
            <Button variant="ghost" onClick={() => void signOut()}>
              Sign out
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}
