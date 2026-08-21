import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Cpu,
  Users,
  Bot,
  BarChart2,
  Settings,
  LogOut,
  X,
} from 'lucide-react';
import { logout } from '../../services/authService';
import { useAuth } from '../../context/AuthContext';

const navItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/devices',   icon: Cpu,             label: 'Devices'   },
  { to: '/members',   icon: Users,           label: 'Members'   },
  { to: '/dexbot',    icon: Bot,             label: 'Dex Bot'   },
  { to: '/analytics', icon: BarChart2,       label: 'Analytics' },
  { to: '/settings',  icon: Settings,        label: 'Settings'  },
];

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

export default function Sidebar({ open, onClose }: SidebarProps) {
  const navigate = useNavigate();
  const { userData } = useAuth();

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  const initials = userData?.name
    ? userData.name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)
    : 'U';

  return (
    <>
      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 bg-black/20 backdrop-blur-sm z-20 lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={`fixed top-0 left-0 h-full w-64 z-30 flex flex-col transition-all duration-300 lg:translate-x-0 lg:static lg:z-auto ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
        style={{
          background: 'var(--bg-primary)',
          boxShadow: '6px 0 24px var(--shadow-sm)',
        }}
      >
        {/* ── Logo ── */}
        <div
          className="flex items-center justify-between px-5 h-[68px] flex-shrink-0"
          style={{ borderBottom: '1px solid var(--border-color)' }}
        >
          <div className="flex items-center gap-3">
            {/* A5X Logo — responsive sizing */}
            <img
              src="/logo.png"
              alt="A5X Home Logo"
              className="flex-shrink-0 object-contain"
              style={{
                width: 'clamp(32px, 5vw, 44px)',
                height: 'clamp(32px, 5vw, 44px)',
              }}
            />
            <div>
              <span className="font-bold text-base tracking-tight leading-none" style={{ color: 'var(--text-primary)' }}>A5X Home</span>
              <p className="text-[10px] font-medium leading-none mt-0.5" style={{ color: 'var(--text-tertiary)' }}>Smart Home</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="lg:hidden p-1.5 rounded-xl transition-all duration-200 hover:opacity-80"
            style={{ 
              background: 'var(--bg-secondary)', 
              boxShadow: 'var(--neo-shadow)',
              color: 'var(--text-secondary)',
            }}
          >
            <X size={15} />
          </button>
        </div>

        {/* ── Nav ── */}
        <nav className="flex-1 px-3.5 py-5 space-y-1 overflow-y-auto">
          <p className="text-[10px] font-bold uppercase tracking-widest px-3.5 mb-3" style={{ color: 'var(--text-tertiary)' }}>Navigation</p>
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              onClick={onClose}
              className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
            >
              <Icon size={17} />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* ── User footer ── */}
        <div
          className="px-3.5 py-4 flex-shrink-0 space-y-2"
          style={{ borderTop: '1px solid var(--border-color)' }}
        >
          {userData && (
            <div
              className="flex items-center gap-3 px-3 py-3 rounded-2xl mb-1"
              style={{
                background: 'var(--bg-secondary)',
                boxShadow: 'var(--neo-inset)',
              }}
            >
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                style={{
                  background: 'linear-gradient(135deg, #2563eb 0%, #3b82f6 100%)',
                  boxShadow: '2px 2px 6px rgba(37,99,235,0.3)',
                }}
              >
                <span className="text-xs font-bold text-white">{initials}</span>
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{userData.name}</p>
                <p className="text-[10px] truncate" style={{ color: 'var(--text-tertiary)' }}>{userData.userId}</p>
              </div>
            </div>
          )}
          <button
            onClick={handleLogout}
            className="sidebar-link w-full text-left"
            style={{ color: '#ef4444' }}
          >
            <LogOut size={17} />
            Logout
          </button>
        </div>
      </aside>
    </>
  );
}
