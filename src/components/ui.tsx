import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';
import type { AppRole } from '@/types/database';

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' }) {
  const base =
    'inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60';
  const styles =
    variant === 'primary'
      ? 'bg-primary text-white hover:bg-primary-hover'
      : 'bg-transparent text-body hover:bg-primary-soft';
  return <button className={`${base} ${styles} ${className}`} {...props} />;
}

export function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-medium text-body">
        {label}
      </label>
      {children}
    </div>
  );
}

export function Input({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`w-full rounded-lg border border-line bg-surface px-3.5 py-2.5 text-sm text-body placeholder:text-muted/70 focus:border-primary ${className}`}
      {...props}
    />
  );
}

export function Alert({ children }: { children: ReactNode }) {
  return (
    <div
      role="alert"
      className="rounded-lg border border-danger/30 bg-danger/5 px-3.5 py-2.5 text-sm text-danger"
    >
      {children}
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 text-muted">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-line border-t-primary" />
      {label ? <span className="text-sm">{label}…</span> : null}
    </div>
  );
}

export function RoleBadge({ role }: { role: AppRole }) {
  const map: Record<AppRole, string> = {
    super_admin: 'bg-ink text-white',
    admin: 'bg-primary-soft text-primary-hover',
    student: 'bg-line text-body',
  };
  const label: Record<AppRole, string> = {
    super_admin: 'Super admin',
    admin: 'Admin',
    student: 'Student',
  };
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${map[role]}`}>
      {label[role]}
    </span>
  );
}
