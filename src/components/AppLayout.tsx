import { NavLink, useNavigate } from 'react-router-dom';
import { BarChart3, CalendarDays, ClipboardList, Settings, Plus, LogOut, User } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const navItems = [
  { to: '/dashboard', icon: BarChart3, label: 'Dashboard' },
  { to: '/calendar', icon: CalendarDays, label: 'Calendar' },
  { to: '/trades', icon: ClipboardList, label: 'Trades' },
  { to: '/settings', icon: Settings, label: 'Settings' },
  { to: '/profile', icon: User, label: 'Profile' },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { signOut } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar - hidden on mobile */}
      <aside className="hidden md:flex w-60 flex-col border-r border-border bg-card p-4">
        <div className="mb-8">
          <h1 className="text-lg font-bold text-primary font-mono tracking-tight">TradeLog</h1>
          <p className="text-xs text-muted-foreground">R-Multiple Journal</p>
        </div>

        <Button onClick={() => navigate('/trades/new')} className="mb-6 w-full gap-2">
          <Plus className="h-4 w-4" /> Log Trade
        </Button>

        <nav className="flex flex-col gap-1 flex-1">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                  isActive ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
                )
              }
            >
              <Icon className="h-4 w-4" /> {label}
            </NavLink>
          ))}
        </nav>

        <button onClick={signOut} className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <LogOut className="h-4 w-4" /> Sign Out
        </button>
      </aside>

      {/* Mobile top bar */}
      <div className="flex flex-1 flex-col">
        <header className="md:hidden flex items-center justify-between border-b border-border bg-card px-4 py-3">
          <h1 className="text-lg font-bold text-primary font-mono">TradeLog</h1>
          <Button size="sm" onClick={() => navigate('/trades/new')} className="gap-1">
            <Plus className="h-4 w-4" /> Log
          </Button>
        </header>

        <main className="flex-1 overflow-auto p-4 md:p-6">{children}</main>

        {/* Mobile bottom nav */}
        <nav className="md:hidden flex border-t border-border bg-card">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(
                  'flex flex-1 flex-col items-center gap-1 py-2 text-xs transition-colors',
                  isActive ? 'text-primary' : 'text-muted-foreground'
                )
              }
            >
              <Icon className="h-5 w-5" /> {label}
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  );
}
