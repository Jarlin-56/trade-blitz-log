import { NavLink, useNavigate } from 'react-router-dom';
import { BarChart3, CalendarDays, ClipboardList, Settings, Plus, LogOut, User, ChevronDown, UserPlus, TrendingUp, Brain, StickyNote, GitCompare } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useProfile } from '@/contexts/ProfileContext';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import QuickNoteFab from './QuickNoteFab';

const navItems = [
  { to: '/dashboard', icon: BarChart3, label: 'Dashboard' },
  { to: '/calendar', icon: CalendarDays, label: 'Calendar' },
  { to: '/trades', icon: ClipboardList, label: 'Trades' },
  { to: '/notes', icon: StickyNote, label: 'Notes' },
  { to: '/compare', icon: GitCompare, label: 'Compare' },
  { to: '/recap-quiz', icon: Brain, label: 'Quiz' },
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
        <button className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm hover:bg-white/[0.04] transition-all duration-200 w-full text-left group">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/15 text-primary text-xs font-bold shrink-0 group-hover:bg-primary/20 transition-colors">
            {(activeProfile?.display_name ?? '?')[0].toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <span className="block truncate font-medium text-foreground text-sm">
              {activeProfile?.display_name ?? 'Profile'}
            </span>
            <span className="block text-[10px] text-muted-foreground">Active Profile</span>
          </div>
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0 group-hover:text-foreground transition-colors" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56 glass-card">
        {profiles.map(p => (
          <DropdownMenuItem
            key={p.id}
            onClick={() => switchProfile(p.id)}
            className={cn('rounded-lg', p.id === activeProfile?.id && 'bg-primary/10')}
          >
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/15 text-primary text-xs font-bold mr-2.5">
              {(p.display_name ?? '?')[0].toUpperCase()}
            </div>
            <span className="truncate">{p.display_name ?? 'Unnamed'}</span>
            {p.id === activeProfile?.id && <span className="ml-auto text-xs text-primary">✓</span>}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator className="bg-white/5" />
        <DropdownMenuItem onClick={createNewProfile} className="rounded-lg">
          <UserPlus className="h-4 w-4 mr-2 text-primary" />
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
      {/* Sidebar */}
      <aside className="hidden md:flex w-60 flex-col sidebar-glass p-4">
        {/* Logo */}
        <div className="mb-5 px-1">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/15">
              <TrendingUp className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-base font-bold text-gradient-primary font-mono tracking-tight">TradeLog</h1>
              <p className="text-[10px] text-muted-foreground tracking-wide">R-MULTIPLE JOURNAL</p>
            </div>
          </div>
        </div>

        <div className="mb-4">
          <ProfileSwitcher />
        </div>

        <Button onClick={() => navigate('/trades/new')} className="mb-6 w-full gap-2 h-10 rounded-xl font-semibold shadow-lg shadow-primary/20 hover:shadow-primary/30 transition-shadow">
          <Plus className="h-4 w-4" /> Log Trade
        </Button>

        <nav className="flex flex-col gap-1 flex-1">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all duration-200',
                  isActive ? 'nav-item-active text-primary font-medium' : 'text-muted-foreground hover:bg-white/[0.04] hover:text-foreground'
                )
              }
            >
              <Icon className="h-4 w-4" /> {label}
            </NavLink>
          ))}
        </nav>

        <div className="section-divider mb-2" />
        <button onClick={signOut} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-muted-foreground hover:text-foreground hover:bg-white/[0.04] transition-all duration-200">
          <LogOut className="h-4 w-4" /> Sign Out
        </button>
      </aside>

      {/* Mobile top bar */}
      <div className="flex flex-1 flex-col min-w-0">
        <header className="md:hidden sticky top-0 z-40 flex items-center justify-between border-b border-white/5 bg-background/90 backdrop-blur-lg px-3 py-2">
          <ProfileSwitcher />
          <Button size="sm" onClick={() => navigate('/trades/new')} className="gap-1.5 shrink-0 rounded-xl shadow-lg shadow-primary/20">
            <Plus className="h-4 w-4" /> Log
          </Button>
        </header>

        <main className="flex-1 p-4 md:p-6 pb-[calc(4.5rem+env(safe-area-inset-bottom))] md:pb-6">{children}</main>

        {/* Mobile bottom nav */}
        <nav
          className="md:hidden fixed bottom-0 left-0 right-0 z-40 flex border-t border-white/5 bg-background/90 backdrop-blur-lg"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(
                  'flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[10px] transition-colors',
                  isActive ? 'text-primary' : 'text-muted-foreground'
                )
              }
            >
              <Icon className="h-5 w-5" /> {label}
            </NavLink>
          ))}
        </nav>

      </div>
      <QuickNoteFab />
    </div>
  );
}
