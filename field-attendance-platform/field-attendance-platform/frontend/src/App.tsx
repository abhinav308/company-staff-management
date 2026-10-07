import { ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
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
  if (loading) return <p className="p-6">Loading…</p>;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== role) return <Navigate to={user.role === 'ADMIN' ? '/admin' : '/'} replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/" element={<RequireRole role="USER"><UserDashboard /></RequireRole>} />
      <Route path="/admin" element={<RequireRole role="ADMIN"><AdminDashboard /></RequireRole>} />
      <Route path="/admin/users/:id" element={<RequireRole role="ADMIN"><UserDetailsPage /></RequireRole>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
