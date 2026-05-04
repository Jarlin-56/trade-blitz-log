import { NavLink, useNavigate } from 'react-router-dom';
import { BarChart3, CalendarDays, ClipboardList, Settings, Plus, LogOut, User, ChevronDown, UserPlus } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useProfile } from '@/contexts/ProfileContext';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

const navItems = [
  { to: '/dashboard', icon: BarChart3, label: 'Dashboard' },
  { to: '/calendar', icon: CalendarDays, label: 'Calendar' },
  { to: '/trades', icon: ClipboardList, label: 'Trades' },
  { to: '/settings', icon: Settings, label: 'Settings' },
  { to: '/profile', icon: User, label: 'Profile' },
];

function ProfileSwitcher() {
  const { profiles, activeProfile, switchProfile, refreshProfiles } = useProfile();
  const { user } = useAuth();
  const { toast } = useToast();

  const createNewProfile = async () => {
    if (!user) return;
    const name = `Profile ${profiles.length + 1}`;
    await supabase.from('profiles').update({ is_active: false } as any).eq('user_id', user.id);
    await supabase.from('profiles').insert({ user_id: user.id, display_name: name, is_active: true } as any);
    await refreshProfiles();
    toast({ title: 'สร้างโปรไฟล์ใหม่แล้ว', description: name });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-accent/50 transition-colors w-full text-left">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/20 text-primary text-xs font-bold shrink-0">
            {(activeProfile?.display_name ?? '?')[0].toUpperCase()}
          </div>
          <span className="truncate font-medium text-foreground flex-1">
            {activeProfile?.display_name ?? 'Profile'}
          </span>
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        {profiles.map(p => (
          <DropdownMenuItem
            key={p.id}
            onClick={() => switchProfile(p.id)}
            className={cn(p.id === activeProfile?.id && 'bg-accent')}
          >
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/20 text-primary text-xs font-bold mr-2">
              {(p.display_name ?? '?')[0].toUpperCase()}
            </div>
            <span className="truncate">{p.display_name ?? 'Unnamed'}</span>
            {p.id === activeProfile?.id && <span className="ml-auto text-xs text-primary">✓</span>}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={createNewProfile}>
          <UserPlus className="h-4 w-4 mr-2" />
          สร้างโปรไฟล์ใหม่
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { signOut } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar - hidden on mobile */}
      <aside className="hidden md:flex w-60 flex-col border-r border-border bg-card p-4">
        <div className="mb-4">
          <h1 className="text-lg font-bold text-primary font-mono tracking-tight">TradeLog</h1>
          <p className="text-xs text-muted-foreground">R-Multiple Journal</p>
        </div>

        <div className="mb-4">
          <ProfileSwitcher />
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
          <ProfileSwitcher />
          <Button size="sm" onClick={() => navigate('/trades/new')} className="gap-1 shrink-0">
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
