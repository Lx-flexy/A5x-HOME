import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import Loader from '../ui/Loader';

/**
 * Renders children only when a Firebase Auth session exists.
 * While auth state is being determined, shows a full-page loader.
 * Unauthenticated users are redirected to /login, preserving the
 * intended destination so they can be sent back after login.
 */
export default function ProtectedRoute() {
  const { user, loading } = useAuth();

  if (loading) return <Loader fullPage />;
  if (!user)   return <Navigate to="/login" replace />;

  return <Outlet />;
}
