import { Navigate } from 'react-router-dom';
import { useAuth } from '@/auth/useAuth';
import { isStaff } from '@/types/database';

// Sends each role to its landing area. Staff -> admin, students -> study.
export function HomeRedirect() {
  const { role } = useAuth();
  return <Navigate to={isStaff(role) ? '/admin' : '/study'} replace />;
}
