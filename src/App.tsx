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

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <ToastContainer />
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />

          <Route element={<ProtectedRoute />}>
            <Route element={<AppLayout />}>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/devices" element={<Devices />} />
              <Route path="/devices/add" element={<AddDevice />} />
              <Route path="/devices/:id" element={<DeviceDetails />} />
              <Route path="/members" element={<Members />} />
              <Route path="/dexbot" element={<DexBot />} />
              <Route path="/analytics" element={<Analytics />} />
              <Route path="/settings" element={<Settings />} />
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
