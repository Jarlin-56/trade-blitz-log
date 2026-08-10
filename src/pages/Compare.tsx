import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useProfile } from '@/contexts/ProfileContext';
import { useFilters } from '@/contexts/FilterContext';
import DateRangeFilter from '@/components/DateRangeFilter';
import { cn } from '@/lib/utils';

export default function Compare() {
  const { user } = useAuth();
  const { profiles, activeProfile, switchProfile } = useProfile();
  const { dateRange, setDateRange } = useFilters();

  const { data: trades = [] } = useQuery({
    queryKey: ['trades-all-profiles', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from('trades')
        .select('id, profile_id, result, earned_r, missed_r, entry_date')
        .eq('user_id', user.id).order('entry_date', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user,
  });

  const rows = useMemo(() => {
    const inRange = trades.filter(t => {
      if (!dateRange) return true;
      const d = new Date(t.entry_date);
      return d >= dateRange.from && d <= dateRange.to;
    });

    return profiles.map(p => {
      const list = inRange.filter(t => t.profile_id === p.id);
      const executed = list.filter(t => !['Missed', 'Canceled'].includes(t.result));
      const wins = executed.filter(t => t.result === 'Win').length;
      const totalR = executed.reduce((s, t) => s + Number(t.earned_r), 0);
      const missedR = list.reduce((s, t) => s + Number(t.missed_r), 0);
      return {
        id: p.id,
        name: p.display_name ?? 'Unnamed',
        count: executed.length,
        winRate: executed.length ? (wins / executed.length) * 100 : 0,
        totalR,
        avgR: executed.length ? totalR / executed.length : 0,
        missedR,
      };
    });
  }, [trades, profiles, dateRange]);

  const maxAbsR = Math.max(1, ...rows.map(r => Math.abs(r.totalR)));

  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3 animate-fade-up">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Profile Comparison</h1>
          <p className="text-xs text-muted-foreground mt-0.5">เทียบผลงานทุกโปรไฟล์</p>
        </div>
        <DateRangeFilter value={dateRange} onChange={setDateRange} />
      </div>

      <div className="space-y-2">
        {rows.map(r => (
          <button
            key={r.id}
            onClick={() => switchProfile(r.id)}
            className={cn(
              'w-full text-left glass-card p-4 transition-colors',
              r.id === activeProfile?.id && 'ring-1 ring-primary/40'
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 text-primary text-xs font-bold shrink-0">
                  {r.name[0]?.toUpperCase() ?? '?'}
                </div>
                <span className="font-medium truncate">{r.name}</span>
                {r.id === activeProfile?.id && <span className="text-[10px] text-primary">Active</span>}
              </div>
              <span className={cn('font-mono font-bold', r.totalR >= 0 ? 'text-win' : 'text-loss')}>
                {r.totalR >= 0 ? '+' : ''}{r.totalR.toFixed(2)}R
              </span>
            </div>

            <div className="mt-3 h-1.5 rounded-full bg-white/[0.05] overflow-hidden">
              <div
                className={cn('h-full rounded-full', r.totalR >= 0 ? 'bg-win' : 'bg-loss')}
                style={{ width: `${(Math.abs(r.totalR) / maxAbsR) * 100}%` }}
              />
            </div>

            <div className="grid grid-cols-4 gap-2 mt-3">
              {[
                { label: 'Trades', value: r.count.toString() },
                { label: 'Win Rate', value: `${r.winRate.toFixed(1)}%` },
                { label: 'Avg R', value: `${r.avgR >= 0 ? '+' : ''}${r.avgR.toFixed(2)}` },
                { label: 'Missed R', value: r.missedR.toFixed(1) },
              ].map(m => (
                <div key={m.label} className="text-center">
                  <p className="text-[9px] uppercase tracking-wider text-muted-foreground">{m.label}</p>
                  <p className="text-sm font-mono font-semibold break-all">{m.value}</p>
                </div>
              ))}
            </div>
          </button>
        ))}
        {rows.length === 0 && (
          <p className="text-muted-foreground text-center py-12">ยังไม่มีโปรไฟล์</p>
        )}
      </div>
    </div>
  );
}
