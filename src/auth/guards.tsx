import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './useAuth';
import { Spinner } from '@/components/ui';
import type { AppRole } from '@/types/database';

// Gate 1: must be signed in. Remembers where the user was headed.
export function RequireAuth() {
  const { loading, session } = useAuth();
  const location = useLocation();
  if (loading) return <FullPageSpinner />;
  if (!session) return <Navigate to="/login" replace state={{ from: location }} />;
  return <Outlet />;
}

// Gate 2: must hold one of the allowed roles. Assumes it sits inside RequireAuth.
// NOTE: this is UX-level defence-in-depth only. RLS in Supabase is the real guard.
export function RequireRole({ allow }: { allow: AppRole[] }) {
  const { loading, role } = useAuth();
  if (loading) return <FullPageSpinner />;
  if (!role || !allow.includes(role)) return <Navigate to="/unauthorized" replace />;
  return <Outlet />;
}

function FullPageSpinner() {
  return (
    <div className="grid min-h-screen place-items-center bg-canvas">
      <Spinner label="Loading" />
    </div>
  );
}
