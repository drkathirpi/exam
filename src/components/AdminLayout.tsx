import { useState } from 'react';
import type { ReactNode } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '@/auth/useAuth';
import { Button, RoleBadge } from '@/components/ui';

interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
  end?: boolean;
}

const IconDashboard = (
  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="3" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="3" y="14" width="7" height="7" rx="1" />
    <rect x="14" y="14" width="7" height="7" rx="1" />
  </svg>
);
const IconBanks = (
  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M4 7l8-4 8 4-8 4-8-4z" />
    <path d="M4 12l8 4 8-4" />
    <path d="M4 17l8 4 8-4" />
  </svg>
);
const IconUsers = (
  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="9" cy="8" r="3" />
    <path d="M3 20a6 6 0 0 1 12 0" />
    <path d="M16 6a3 3 0 0 1 0 6" />
    <path d="M21 20a6 6 0 0 0-5-5.9" />
  </svg>
);

const IconAnalytics = (
  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
  </svg>
);
const IconAi = (
  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" />
  </svg>
);

const NAV: NavItem[] = [
  { to: '/admin', label: 'Dashboard', icon: IconDashboard, end: true },
  { to: '/admin/banks', label: 'Question banks', icon: IconBanks },
  { to: '/admin/users', label: 'Users', icon: IconUsers },
  { to: '/admin/analytics', label: 'Analytics', icon: IconAnalytics },
  { to: '/admin/ai', label: 'AI settings', icon: IconAi },
];

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="space-y-1">
      {NAV.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          onClick={onNavigate}
          className={({ isActive }) =>
            `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              isActive ? 'bg-primary text-white' : 'text-primary-soft/80 hover:bg-white/10'
            }`
          }
        >
          {item.icon}
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}

export function AdminLayout() {
  const { profile, role, signOut } = useAuth();
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-canvas">
      {/* Desktop sidebar */}
      <aside className="hidden w-60 flex-col bg-ink p-4 lg:flex">
        <span className="px-3 py-2 font-semibold tracking-tight text-white">
          MRCPCH<span className="text-primary"> Bank</span>
        </span>
        <div className="mt-4">
          <NavList />
        </div>
      </aside>

      {/* Mobile drawer */}
      {drawerOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-ink/40" onClick={() => setDrawerOpen(false)} />
          <aside className="absolute left-0 top-0 h-full w-64 bg-ink p-4">
            <span className="px-3 py-2 font-semibold text-white">
              MRCPCH<span className="text-primary"> Bank</span>
            </span>
            <div className="mt-4">
              <NavList onNavigate={() => setDrawerOpen(false)} />
            </div>
          </aside>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-between border-b border-line bg-surface px-4">
          <button
            className="rounded-md p-2 text-ink hover:bg-canvas lg:hidden"
            aria-label="Open menu"
            onClick={() => setDrawerOpen(true)}
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" stroke="currentColor" strokeWidth="2">
              <path d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <div className="ml-auto flex items-center gap-3">
            {role ? <RoleBadge role={role} /> : null}
            <span className="hidden text-sm text-muted sm:inline">
              {profile?.display_name ?? profile?.username ?? 'Signed in'}
            </span>
            <Button variant="ghost" onClick={() => void signOut()}>
              Sign out
            </Button>
          </div>
        </header>

        <main className="flex-1 px-4 py-6 pb-24 lg:px-8 lg:pb-8">
          <Outlet />
        </main>

        {/* Mobile bottom nav */}
        <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-surface lg:hidden">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex flex-1 flex-col items-center gap-1 py-2 text-xs ${
                  isActive ? 'text-primary' : 'text-muted'
                }`
              }
            >
              {item.icon}
              {item.label.split(' ')[0]}
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  );
}
