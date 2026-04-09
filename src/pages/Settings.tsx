import { NavLink, Outlet } from 'react-router-dom';
import { cn } from '@/lib/utils';

const settingsNav = [
  { to: '/settings/conditions', label: 'Conditions' },
  { to: '/settings/tags', label: 'Tags' },
];

export default function Settings() {
  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">Settings</h1>
      <div className="flex gap-2 border-b border-border pb-2">
        {settingsNav.map(({ to, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn('px-4 py-2 text-sm rounded-t-md transition-colors', isActive ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground')
            }
          >
            {label}
          </NavLink>
        ))}
      </div>
      <Outlet />
    </div>
  );
}
