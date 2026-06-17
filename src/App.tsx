import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/layout/ProtectedRoute';
import AppLayout from './components/layout/AppLayout';
import { ToastContainer } from './components/ui/Toast';

import Login from './pages/auth/Login';
import Register from './pages/auth/Register';
import Dashboard from './pages/dashboard/Dashboard';
import Devices from './pages/devices/Devices';
import AddDevice from './pages/devices/AddDevice';
import DeviceDetails from './pages/devices/DeviceDetails';
import Members from './pages/members/Members';
import DexBot from './pages/dexbot/DexBot';
import Analytics from './pages/analytics/Analytics';
import Settings from './pages/settings/Settings';
import { useAuth } from './context/AuthContext';
import Loader from './components/ui/Loader';

/**
 * GuestRoute — prevents already-authenticated users from accessing
 * /login and /register. If logged in, redirects to /dashboard.
 * Shows loader while auth state is being determined.
 */
function GuestRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <Loader fullPage />;
  if (user)    return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <ToastContainer />
        <Routes>
          {/* Guest-only routes — redirect to dashboard if already logged in */}
          <Route
            path="/login"
            element={
              <GuestRoute>
                <Login />
              </GuestRoute>
            }
          />
          <Route
            path="/register"
            element={
              <GuestRoute>
                <Register />
              </GuestRoute>
            }
          />

          {/* Protected routes — redirect to login if not authenticated */}
          <Route element={<ProtectedRoute />}>
            <Route element={<AppLayout />}>
              <Route path="/dashboard"    element={<Dashboard />} />
              <Route path="/devices"      element={<Devices />} />
              <Route path="/devices/add"  element={<AddDevice />} />
              <Route path="/devices/:id"  element={<DeviceDetails />} />
              <Route path="/members"      element={<Members />} />
              <Route path="/dexbot"       element={<DexBot />} />
              <Route path="/analytics"    element={<Analytics />} />
              <Route path="/settings"     element={<Settings />} />
            </Route>
          </Route>

          {/* Root redirect — goes to dashboard (ProtectedRoute handles auth check) */}
          <Route path="/"   element={<Navigate to="/dashboard" replace />} />

          {/* 404 — unknown paths go to dashboard (which will redirect to login if needed) */}
          <Route path="*"   element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
