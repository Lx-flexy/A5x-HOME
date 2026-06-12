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
    <header className="h-16 bg-white border-b border-neutral-200 flex items-center justify-between px-5 flex-shrink-0">
      <div className="flex items-center gap-4">
        <button
          onClick={onMenuToggle}
          className="lg:hidden p-2 rounded-lg hover:bg-neutral-100 text-neutral-500"
        >
          <Menu size={20} />
        </button>
        <div>
          <h1 className="font-semibold text-neutral-900 text-sm">
            {greeting}, {name.split(' ')[0]}
          </h1>
          <p className="text-xs text-neutral-400">Here's what's happening in your home today.</p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button className="relative p-2 rounded-lg hover:bg-neutral-100 text-neutral-500 transition-colors">
          <Bell size={18} />
          <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-primary-600 rounded-full" />
        </button>

        <div className="w-8 h-8 bg-primary-600 rounded-full flex items-center justify-center">
          <span className="text-xs font-semibold text-white">{initials}</span>
        </div>
      </div>
    </header>
  );
}
