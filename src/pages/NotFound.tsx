import { Link } from 'react-router-dom';
import { Button } from '@/components/ui';

export function NotFound() {
  return (
    <div className="grid min-h-screen place-items-center bg-canvas px-6">
      <div className="max-w-sm space-y-4 text-center">
        <p className="font-mono text-sm text-primary">404</p>
        <h1 className="text-2xl font-semibold text-ink">Page not found</h1>
        <p className="text-sm text-muted">That page does not exist or has moved.</p>
        <Link to="/">
          <Button>Go home</Button>
        </Link>
      </div>
    </div>
  );
}
