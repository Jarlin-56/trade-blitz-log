import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useProfile } from '@/contexts/ProfileContext';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addMonths, subMonths, eachDayOfInterval, isSameMonth, isSameDay } from 'date-fns';
import { th } from 'date-fns/locale';
import { useNavigate } from 'react-router-dom';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

interface DaySummary {
  totalR: number;
  count: number;
}

export default function CalendarPage() {
  const { user } = useAuth();
  const { activeProfile } = useProfile();
  const navigate = useNavigate();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });

  const { data: trades = [] } = useQuery({
    queryKey: ['calendar-trades', user?.id, activeProfile?.id, format(monthStart, 'yyyy-MM')],
    queryFn: async () => {
      if (!user || !activeProfile) return [];
      const { data } = await supabase
        .from('trades')
        .select('id, entry_date, earned_r, result, asset, direction')
        .eq('profile_id', activeProfile.id)
        .gte('entry_date', calStart.toISOString())
        .lte('entry_date', calEnd.toISOString());
      return data || [];
    },
    enabled: !!user && !!activeProfile,
  });

  // Group trades by local day
  const dayMap = useMemo(() => {
    const map = new Map<string, DaySummary>();
    for (const t of trades) {
      const local = new Date(t.entry_date);
      const key = format(local, 'yyyy-MM-dd');
      const cur = map.get(key) || { totalR: 0, count: 0 };
      cur.totalR += Number(t.earned_r);
      cur.count += 1;
      map.set(key, cur);
    }
    return map;
  }, [trades]);

  const allDays = eachDayOfInterval({ start: calStart, end: calEnd });

  // Build weeks (rows)
  const weeks: Date[][] = [];
  for (let i = 0; i < allDays.length; i += 7) {
    weeks.push(allDays.slice(i, i + 7));
  }

  // Weekly summary (R + trade count)
  const weeklyStats = (week: Date[]) => {
    let total = 0;
    let count = 0;
    for (const d of week) {
      const s = dayMap.get(format(d, 'yyyy-MM-dd'));
      if (s) {
        total += s.totalR;
        count += s.count;
      }
    }
    return { total, count };
  };

  // Monthly total (only current month days)
  const monthlyTotal = useMemo(() => {
    let total = 0;
    for (const [key, s] of dayMap.entries()) {
      const d = new Date(key);
      if (isSameMonth(d, currentMonth)) total += s.totalR;
    }
    return total;
  }, [dayMap, currentMonth]);

  // Trades for selected day
  const selectedDayTrades = useMemo(() => {
    if (!selectedDay) return [];
    return trades.filter(t => isSameDay(new Date(t.entry_date), selectedDay));
  }, [selectedDay, trades]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-foreground">Calendar</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setCurrentMonth(m => subMonths(m, 1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium min-w-[140px] text-center">
            {format(currentMonth, 'MMMM yyyy')}
          </span>
          <Button variant="outline" size="icon" onClick={() => setCurrentMonth(m => addMonths(m, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Monthly Total Header */}
      <div className="flex justify-center">
        <div className="text-sm font-medium text-muted-foreground">
          Monthly Total R:{' '}
          <span className={`font-mono font-bold text-base ${monthlyTotal > 0 ? 'text-green-500' : monthlyTotal < 0 ? 'text-red-500' : 'text-foreground'}`}>
            {monthlyTotal >= 0 ? '+' : ''}{monthlyTotal.toFixed(1)}R
          </span>
        </div>
      </div>

      {/* Calendar Grid */}
      <Card className="overflow-hidden bg-card border-slate-500/60">
        {/* Header row */}
        <div className="grid grid-cols-[repeat(7,1fr)_80px] border-b border-slate-500/60 text-xs text-muted-foreground font-medium">
          {WEEKDAYS.map(d => (
            <div key={d} className="p-2 text-center border-r border-slate-500/60 last:border-r-0">{d}</div>
          ))}
          <div className="p-2 text-center hidden sm:block border-r border-slate-500/60">Sat</div>
          <div className="p-2 text-center bg-white/[0.03]">Week</div>
        </div>

        {/* Weeks */}
        {weeks.map((week, wi) => {
          const { total: wr, count: wcount } = weeklyStats(week);
          return (
            <div key={wi} className="grid grid-cols-[repeat(7,1fr)_80px] border-b border-slate-500/60 last:border-b-0">
              {week.map((day) => {
                const key = format(day, 'yyyy-MM-dd');
                const summary = dayMap.get(key);
                const isCurrentMonth = isSameMonth(day, currentMonth);
                const isToday = isSameDay(day, new Date());
                const isSelected = selectedDay && isSameDay(day, selectedDay);

                let bgClass = '';
                let textClass = 'text-muted-foreground';
                if (summary && summary.count > 0) {
                  if (summary.totalR > 0) {
                    bgClass = 'bg-green-500/10';
                    textClass = 'text-green-500';
                  } else if (summary.totalR < 0) {
                    bgClass = 'bg-red-500/10';
                    textClass = 'text-red-500';
                  }
                }

                return (
                  <div
                    key={key}
                    onClick={() => summary && summary.count > 0 ? setSelectedDay(day) : null}
                    className={`min-h-[60px] sm:min-h-[80px] p-1 sm:p-2 border-r border-slate-500/60 last:border-r-0 transition-colors ${bgClass} ${!isCurrentMonth ? 'opacity-30' : ''} ${isSelected ? 'ring-1 ring-primary' : ''} ${summary && summary.count > 0 ? 'cursor-pointer hover:brightness-125' : ''}`}
                  >
                    <div className={`text-xs font-medium ${isToday ? 'text-primary font-bold' : isCurrentMonth ? 'text-foreground' : 'text-muted-foreground'}`}>
                      {format(day, 'd')}
                    </div>
                    {summary && summary.count > 0 && (
                      <div className="mt-1">
                        <div className={`text-xs sm:text-sm font-mono font-bold ${textClass}`}>
                          {summary.totalR >= 0 ? '+' : ''}{summary.totalR.toFixed(1)}R
                        </div>
                        <div className="text-[10px] text-muted-foreground">
                          {summary.count} trade{summary.count > 1 ? 's' : ''}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              {/* Weekly summary - 3 line vertical */}
              <div className="min-h-[60px] sm:min-h-[80px] p-1 sm:p-2 bg-white/[0.03] flex flex-col items-center justify-center gap-0.5">
                <span className="text-xs text-gray-400">Week {wi + 1}</span>
                <span className={`text-sm sm:text-base font-mono font-bold ${wr > 0 ? 'text-green-500' : wr < 0 ? 'text-red-500' : 'text-foreground'}`}>
                  {wr !== 0 ? `${wr >= 0 ? '+' : ''}${wr.toFixed(1)}R` : '0R'}
                </span>
                <span className="text-[10px] text-gray-400">
                  {wcount} trade{wcount !== 1 ? 's' : ''}
                </span>
              </div>
            </div>
          );
        })}
      </Card>

      {/* Selected day detail */}
      {selectedDay && selectedDayTrades.length > 0 && (
        <Card className="p-4 bg-card border-white/5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-foreground">
              {format(selectedDay, 'd MMMM yyyy')}
            </h3>
            <Button variant="ghost" size="icon" onClick={() => setSelectedDay(null)} className="h-6 w-6">
              <X className="h-3 w-3" />
            </Button>
          </div>
          <div className="space-y-1.5">
            {selectedDayTrades.map(t => (
              <div
                key={t.id}
                onClick={() => navigate(`/trades/${t.id}`)}
                className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-white/[0.03] cursor-pointer hover:bg-white/[0.06] transition-colors"
              >
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-medium text-foreground">{t.asset}</span>
                  <span className={`text-[9px] leading-none px-1.5 py-1 rounded-md font-medium ${t.direction === 'Long' ? 'bg-green-500/15 text-green-500' : 'bg-red-500/15 text-red-500'}`}>
                    {t.direction}
                  </span>
                  <span className={`text-[9px] leading-none px-1.5 py-1 rounded-md font-medium ${t.result === 'Win' ? 'bg-green-500/15 text-green-500' : t.result === 'Loss' ? 'bg-red-500/15 text-red-500' : 'bg-muted/50 text-muted-foreground'}`}>
                    {t.result}
                  </span>
                </div>
                <span className={`text-sm font-mono font-bold ${Number(t.earned_r) >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                  {Number(t.earned_r) >= 0 ? '+' : ''}{Number(t.earned_r).toFixed(1)}R
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
