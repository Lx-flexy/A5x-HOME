import { Bell, Menu } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

interface HeaderProps {
  onMenuToggle: () => void;
}

export default function Header({ onMenuToggle }: HeaderProps) {
  const { userData, user } = useAuth();

  const name = userData?.name || user?.displayName || 'User';
  const initials = name
    .split(' ')
    .map((n: string) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good Morning' : hour < 17 ? 'Good Afternoon' : 'Good Evening';

  return (
    <header
      className="h-[68px] flex items-center justify-between px-5 flex-shrink-0"
      style={{
        background: '#F4F7FB',
        borderBottom: '1px solid rgba(166,180,200,0.25)',
        boxShadow: '0 2px 12px rgba(166,180,200,0.2)',
      }}
    >
      {/* Left */}
      <div className="flex items-center gap-4">
        <button
          onClick={onMenuToggle}
          className="lg:hidden p-2 rounded-xl text-neutral-500 transition-all"
          style={{
            background: '#EEF2F7',
            boxShadow: '2px 2px 6px rgba(166,180,200,0.4), -2px -2px 6px rgba(255,255,255,0.8)',
          }}
        >
          <Menu size={18} />
        </button>
        <div>
          <h1 className="font-semibold text-neutral-900 text-sm leading-tight">
            {greeting}, {name.split(' ')[0]} 👋
          </h1>
          <p className="text-[11px] text-neutral-400 leading-tight mt-0.5">
            Here's what's happening in your home today.
          </p>
        </div>
      </div>

      {/* Right */}
      <div className="flex items-center gap-2.5">
        {/* Notification bell */}
        <button
          className="relative p-2 rounded-xl text-neutral-500 transition-all hover:text-neutral-700"
          style={{
            background: '#F4F7FB',
            boxShadow: '3px 3px 7px rgba(166,180,200,0.4), -3px -3px 7px rgba(255,255,255,0.8)',
          }}
        >
          <Bell size={17} />
          <span
            className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full border-2 border-[#F4F7FB]"
            style={{ background: '#2563eb' }}
          />
        </button>

        {/* Avatar */}
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center cursor-pointer"
          style={{
            background: 'linear-gradient(135deg, #2563eb 0%, #3b82f6 100%)',
            boxShadow: '3px 3px 8px rgba(37,99,235,0.3), -1px -1px 4px rgba(255,255,255,0.3)',
          }}
        >
          <span className="text-xs font-bold text-white">{initials}</span>
        </div>
      </div>
    </header>
  );
}
