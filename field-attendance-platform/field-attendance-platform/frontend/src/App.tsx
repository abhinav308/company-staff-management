import { ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import ErrorBoundary from './components/ErrorBoundary';
import { LoadingPageSkeleton } from './components/LoadingSkeleton';
import { useAuth } from './hooks/useAuth';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import AdminDashboard from './pages/admin/AdminDashboard';
import UserDetailsPage from './pages/admin/UserDetailsPage';
import UserDashboard from './pages/user/UserDashboard';
import type { Role } from './types';

/** UI-level routing only. Real authorization is enforced by the backend on every API call. */
function RequireRole({ role, children }: { role: Role; children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <LoadingPageSkeleton message="Authenticating session..." />;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== role) return <Navigate to={user.role === 'ADMIN' ? '/admin' : '/'} replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <ErrorBoundary>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/" element={<RequireRole role="USER"><UserDashboard /></RequireRole>} />
        <Route path="/admin" element={<RequireRole role="ADMIN"><AdminDashboard defaultTab="overview" /></RequireRole>} />
        <Route path="/admin/map" element={<RequireRole role="ADMIN"><AdminDashboard defaultTab="map" /></RequireRole>} />
        <Route path="/admin/users" element={<RequireRole role="ADMIN"><AdminDashboard defaultTab="users" /></RequireRole>} />
        <Route path="/admin/sessions" element={<RequireRole role="ADMIN"><AdminDashboard defaultTab="attendance" /></RequireRole>} />
        <Route path="/admin/reports" element={<RequireRole role="ADMIN"><AdminDashboard defaultTab="visits" /></RequireRole>} />
        <Route path="/admin/leaves" element={<RequireRole role="ADMIN"><AdminDashboard defaultTab="leaves" /></RequireRole>} />
        <Route path="/admin/holidays" element={<RequireRole role="ADMIN"><AdminDashboard defaultTab="holidays" /></RequireRole>} />
        <Route path="/admin/documents" element={<RequireRole role="ADMIN"><AdminDashboard defaultTab="documents" /></RequireRole>} />
        <Route path="/admin/announcements" element={<RequireRole role="ADMIN"><AdminDashboard defaultTab="announcements" /></RequireRole>} />
        <Route path="/admin/profile-changes" element={<RequireRole role="ADMIN"><AdminDashboard defaultTab="profile_changes" /></RequireRole>} />
        <Route path="/admin/audit" element={<RequireRole role="ADMIN"><AdminDashboard defaultTab="audit" /></RequireRole>} />
        <Route path="/admin/users/:id" element={<RequireRole role="ADMIN"><UserDetailsPage /></RequireRole>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </ErrorBoundary>
  );
}
