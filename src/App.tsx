import { Route, Routes } from 'react-router-dom';
import { RequireAuth, RequireRole } from '@/auth/guards';
import { AppShell } from '@/components/AppShell';
import { AdminLayout } from '@/components/AdminLayout';
import { LoginPage } from '@/pages/LoginPage';
import { HomeRedirect } from '@/pages/HomeRedirect';
import { StudentHome } from '@/pages/student/StudentHome';
import { NewSession } from '@/pages/student/NewSession';
import { QuizSession } from '@/pages/student/QuizSession';
import { Results } from '@/pages/student/Results';
import { StudentAnalytics } from '@/pages/student/StudentAnalytics';
import { Dashboard } from '@/pages/admin/Dashboard';
import { BanksPage } from '@/pages/admin/BanksPage';
import { UsersPage } from '@/pages/admin/UsersPage';
import { Analytics } from '@/pages/admin/Analytics';
import { AiSettings } from '@/pages/admin/AiSettings';
import { Unauthorized } from '@/pages/Unauthorized';
import { NotFound } from '@/pages/NotFound';

export function App() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/unauthorized" element={<Unauthorized />} />

      <Route element={<RequireAuth />}>
        {/* Clean role-based redirect with no layout flash */}
        <Route index element={<HomeRedirect />} />

        {/* Student area (inside the shell) */}
        <Route element={<AppShell />}>
          <Route path="study" element={<StudentHome />} />
          <Route path="study/new" element={<NewSession />} />
          <Route path="study/analytics" element={<StudentAnalytics />} />
        </Route>

        {/* Full-screen focus views (no shell chrome) */}
        <Route path="study/session/:attemptId" element={<QuizSession />} />
        <Route path="study/results/:attemptId" element={<Results />} />

        {/* Admin area — staff only, with its own sidebar layout */}
        <Route element={<RequireRole allow={['admin', 'super_admin']} />}>
          <Route path="admin" element={<AdminLayout />}>
            <Route index element={<Dashboard />} />
            <Route path="banks" element={<BanksPage />} />
            <Route path="users" element={<UsersPage />} />
            <Route path="analytics" element={<Analytics />} />
            <Route path="ai" element={<AiSettings />} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
