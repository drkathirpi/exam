export type AppRole = 'super_admin' | 'admin' | 'student';

export interface Profile {
  id: string;
  role: AppRole;
  display_name: string | null;
  username: string | null;
  disabled: boolean;
}

export const STAFF_ROLES: AppRole[] = ['admin', 'super_admin'];

export function isStaff(role: AppRole | null | undefined): boolean {
  return role === 'admin' || role === 'super_admin';
}

export interface UserRow {
  id: string;
  role: AppRole;
  display_name: string | null;
  username: string | null;
  is_guest: boolean;
  disabled: boolean;
  created_at: string;
  created_by: string | null;
}

export interface BankRow {
  id: string;
  name: string;
  description: string | null;
  archived: boolean;
  created_at: string;
}
