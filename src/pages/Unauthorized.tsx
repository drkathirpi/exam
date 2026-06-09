import { Link } from 'react-router-dom';
import { useAuth } from '@/auth/useAuth';
import { Button } from '@/components/ui';

export function Unauthorized() {
  const { signOut } = useAuth();
  return (
    <div className="grid min-h-screen place-items-center bg-canvas px-6">
      <div className="max-w-sm space-y-4 text-center">
        <h1 className="text-2xl font-semibold text-ink">No access</h1>
        <p className="text-sm text-muted">
          Your account does not have permission to view that page. Head back to your home area, or
          sign in with a different account.
        </p>
        <div className="flex justify-center gap-3">
          <Link to="/">
            <Button>Go to my home</Button>
          </Link>
          <Button variant="ghost" onClick={() => void signOut()}>
            Sign out
          </Button>
        </div>
      </div>
    </div>
  );
}
