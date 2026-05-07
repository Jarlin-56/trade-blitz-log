import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useProfile } from '@/contexts/ProfileContext';
import { useFilters } from '@/contexts/FilterContext';
import { CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell, Area, AreaChart } from 'recharts';
import { Clock, TrendingUp, Target, BarChart3, Percent, Scale } from 'lucide-react';
import DateRangeFilter from '@/components/DateRangeFilter';
import EmptyState from '@/components/EmptyState';

const RTooltipContent = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  const value = payload[0].value as number;
  const color = value > 0 ? 'hsl(142 70% 45%)' : value < 0 ? 'hsl(0 72% 51%)' : '#fafafa';
  return (
    <div className="glass-card rounded-lg px-3 py-2 shadow-xl">
      <div className="text-[11px] text-muted-foreground mb-1">{label}</div>
      <div className="text-sm font-bold font-mono" style={{ color }}>
        {value >= 0 ? '+' : ''}{value}R
      </div>
    </div>
  );
};

export default function Dashboard() {
  const { user } = useAuth();
  const { activeProfile } = useProfile();
  const { dateRange, setDateRange } = useFilters();

  const { data: trades = [] } = useQuery({
    queryKey: ['trades', user?.id, activeProfile?.id],
    queryFn: async () => {
      let q = supabase
        .from('trades')
        .select('*')
        .order('entry_date', { ascending: true });
      if (activeProfile?.id) q = q.eq('profile_id', activeProfile.id);
      const { data } = await q;
      return data ?? [];
    },
    enabled: !!user && !!activeProfile,
  });

  const { data: tradeConditions = [] } = useQuery({
    queryKey: ['trade_conditions_dashboard', user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('trade_conditions')
        .select('trade_id, condition_id, conditions(name)');
      return data ?? [];
    },
    enabled: !!user,
  });

  const { data: tradeTags = [] } = useQuery({
    queryKey: ['trade_tags_dashboard', user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('trade_tags')
        .select('trade_id, tag_id, tags(name)');
      return data ?? [];
    },
    enabled: !!user,
  });

  const dateTrades = useMemo(() => {
    if (!dateRange) return trades;
    return trades.filter(t => {
      const d = new Date(t.entry_date);
      return d >= dateRange.from && d <= dateRange.to;
    });
  }, [trades, dateRange]);

  const executedTrades = dateTrades.filter(t => !['Missed', 'Canceled'].includes(t.result));
  const canceledCount = dateTrades.filter(t => t.result === 'Canceled').length;
  const missedCount = dateTrades.filter(t => t.result === 'Missed').length;
  const totalR = executedTrades.reduce((sum, t) => sum + Number(t.earned_r), 0);
  const winCount = executedTrades.filter(t => t.result === 'Win').length;
  const winRate = executedTrades.length > 0 ? ((winCount / executedTrades.length) * 100).toFixed(1) : '0';

  const profitFactor = useMemo(() => {
    const grossWin = executedTrades.filter(t => t.result === 'Win').reduce((s, t) => s + Math.abs(Number(t.earned_r)), 0);
    const grossLoss = executedTrades.filter(t => t.result === 'Loss').reduce((s, t) => s + Math.abs(Number(t.earned_r)), 0);
    if (grossLoss === 0) return grossWin > 0 ? '∞' : 'N/A';
    return (grossWin / grossLoss).toFixed(2);
  }, [executedTrades]);

  const avgRR = useMemo(() => {
    const wins = executedTrades.filter(t => t.result === 'Win');
    const losses = executedTrades.filter(t => t.result === 'Loss');
    const avgWin = wins.length > 0 ? (wins.reduce((s, t) => s + Number(t.earned_r), 0) / wins.length) : 0;
    const avgLoss = losses.length > 0 ? (losses.reduce((s, t) => s + Number(t.earned_r), 0) / losses.length) : 0;
    if (wins.length === 0 && losses.length === 0) return 'N/A';
    return `${avgWin >= 0 ? '+' : ''}${avgWin.toFixed(1)}R : ${avgLoss.toFixed(1)}R`;
  }, [executedTrades]);

  const holdingTime = useMemo(() => {
    const fmt = (mins: number) => {
      if (mins < 60) return `${Math.round(mins)}m`;
      const h = Math.floor(mins / 60);
      const m = Math.round(mins % 60);
      return m > 0 ? `${h}h ${m}m` : `${h}h`;
    };
    const withDuration = executedTrades.filter(t => (t as any).duration_minutes != null);
    const wins = withDuration.filter(t => t.result === 'Win');
    const losses = withDuration.filter(t => t.result === 'Loss');
    const avg = (arr: typeof withDuration) => arr.length > 0 ? arr.reduce((s, t) => s + Number((t as any).duration_minutes), 0) / arr.length : null;
    const overall = avg(withDuration);
    const avgWin = avg(wins);
    const avgLoss = avg(losses);
    return {
      overall: overall != null ? fmt(overall) : 'N/A',
      win: avgWin != null ? fmt(avgWin) : 'N/A',
      loss: avgLoss != null ? fmt(avgLoss) : 'N/A',
    };
  }, [executedTrades]);

  const rDistData = useMemo(() => {
    let maxR = 3;
    for (const t of executedTrades) {
      const r = Number(t.earned_r);
      if (r >= 0) maxR = Math.max(maxR, Math.floor(r));
    }
    const buckets: { name: string; count: number }[] = [];
    for (let i = 0; i <= maxR; i++) {
      buckets.push({ name: i === 0 ? '0R' : `+${i}R`, count: 0 });
    }
    for (const t of executedTrades) {
      const r = Number(t.earned_r);
      if (r < 0) continue;
      const idx = Math.min(Math.round(r), maxR);
      buckets[idx].count++;
    }
    return buckets.filter(b => b.count > 0);
  }, [executedTrades]);

  const cumulativeData = executedTrades.map((t, i) => ({
    date: new Date(t.entry_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    r: parseFloat(executedTrades.slice(0, i + 1).reduce((s, tr) => s + Number(tr.earned_r), 0).toFixed(2)),
  }));

  const conditionPerfData = useMemo(() => {
    const dateTradeIds = new Set(dateTrades.map(t => t.id));
    const executedIds = new Set(executedTrades.map(t => t.id));
    const winIds = new Set(executedTrades.filter(t => t.result === 'Win').map(t => t.id));
    const condMap = new Map<string, { total: number; wins: number }>();
    for (const tc of tradeConditions) {
      if (!dateTradeIds.has(tc.trade_id) || !executedIds.has(tc.trade_id)) continue;
      const name = (tc.conditions as any)?.name;
      if (!name) continue;
      const entry = condMap.get(name) ?? { total: 0, wins: 0 };
      entry.total++;
      if (winIds.has(tc.trade_id)) entry.wins++;
      condMap.set(name, entry);
    }
    return Array.from(condMap.entries())
      .map(([name, { total, wins }]) => ({ name, winRate: Math.round((wins / total) * 100), trades: total }))
      .sort((a, b) => b.winRate - a.winRate);
  }, [dateTrades, executedTrades, tradeConditions]);

  const buildPerf = (joins: Array<{ trade_id: string; name: string | undefined }>) => {
    const executedMap = new Map(executedTrades.map(t => [t.id, t]));
    const map = new Map<string, { total: number; wins: number; r: number }>();
    for (const j of joins) {
      if (!j.name) continue;
      const trade = executedMap.get(j.trade_id);
      if (!trade) continue;
      const entry = map.get(j.name) ?? { total: 0, wins: 0, r: 0 };
      entry.total++;
      entry.r += Number(trade.earned_r);
      if (trade.result === 'Win') entry.wins++;
      map.set(j.name, entry);
    }
    return Array.from(map.entries())
      .map(([name, { total, wins, r }]) => ({
        name, trades: total,
        winRate: total > 0 ? Math.round((wins / total) * 100) : 0,
        totalR: parseFloat(r.toFixed(2)),
      }))
      .sort((a, b) => b.totalR - a.totalR);
  };

  const tagPerfData = useMemo(
    () => buildPerf(tradeTags.map(t => ({ trade_id: t.trade_id, name: (t.tags as any)?.name }))),
    [tradeTags, executedTrades]
  );

  const conditionPerfTableData = useMemo(
    () => buildPerf(tradeConditions.map(t => ({ trade_id: t.trade_id, name: (t.conditions as any)?.name }))),
    [tradeConditions, executedTrades]
  );

  const hourlyData = useMemo(() => {
    const hourMap: Record<number, number> = {};
    for (let h = 0; h < 24; h++) hourMap[h] = 0;
    for (const t of executedTrades) {
      const hour = new Date(t.entry_date).getHours();
      hourMap[hour] += Number(t.earned_r);
    }
    return Array.from({ length: 24 }, (_, h) => ({
      name: `${String(h).padStart(2, '0')}:00`,
      r: parseFloat(hourMap[h].toFixed(2)),
    }));
  }, [executedTrades]);

  const dayData = useMemo(() => {
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
    const dayMap: Record<string, number> = {};
    days.forEach(d => dayMap[d] = 0);
    for (const t of executedTrades) {
      const jsDay = new Date(t.entry_date).getDay();
      const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][jsDay];
      if (dayMap[dayName] !== undefined) dayMap[dayName] += Number(t.earned_r);
    }
    return days.map(d => ({ name: d, r: parseFloat(dayMap[d].toFixed(2)) }));
  }, [executedTrades]);

  const chartGridStroke = 'hsl(228 13% 15%)';
  const chartTickFill = 'hsl(215 15% 45%)';

  const metrics = [
    { label: 'Total R', value: `${totalR >= 0 ? '+' : ''}${totalR.toFixed(2)}R`, color: totalR >= 0 ? 'text-win' : 'text-loss', icon: TrendingUp, glow: totalR >= 0 },
    { label: 'Win Rate', value: `${winRate}%`, color: 'text-foreground', icon: Target },
    { label: 'Total Trades', value: executedTrades.length.toString(), color: 'text-foreground', icon: BarChart3, sub: (canceledCount > 0 || missedCount > 0) ? `${missedCount > 0 ? `Missed: ${missedCount}` : ''}${canceledCount > 0 ? ` Canceled: ${canceledCount}` : ''}`.trim() : undefined },
    { label: 'Profit Factor', value: profitFactor, color: 'text-foreground', icon: Percent },
    { label: 'Avg R:R', value: avgRR, color: 'text-foreground', icon: Scale, small: true },
  ];

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3 animate-fade-up">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Performance overview</p>
        </div>
        {trades.length > 0 && <DateRangeFilter value={dateRange} onChange={setDateRange} />}
      </div>

      {trades.length === 0 ? (
        <EmptyState variant="dashboard" />
      ) : (
      <>
      {/* Key Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 animate-fade-up-delay-1">
        {metrics.map((m, i) => (
          <div key={i} className={`metric-card p-4 ${m.glow ? 'glow-primary' : ''}`}>
            <div className="flex items-center gap-2 mb-2">
              <m.icon className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">{m.label}</span>
            </div>
            <span className={`${m.small ? 'text-base' : 'text-2xl'} font-bold font-mono ${m.color}`}>
              {m.value}
            </span>
            {m.sub && (
              <div className="flex gap-2 mt-1.5">
                <span className="text-[10px] text-muted-foreground">{m.sub}</span>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Holding Time Analysis */}
      <div className="metric-card p-4 animate-fade-up-delay-2">
        <div className="flex items-center gap-2 mb-3">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Holding Time Analysis</span>
        </div>
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Overall</p>
            <span className="text-xl font-bold font-mono">{holdingTime.overall}</span>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Win Avg</p>
            <span className="text-xl font-bold font-mono text-win">{holdingTime.win}</span>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Loss Avg</p>
            <span className="text-xl font-bold font-mono text-loss">{holdingTime.loss}</span>
          </div>
        </div>
      </div>

      {/* Cumulative R Chart — Area Chart with gradient */}
      <div className="chart-card animate-fade-up-delay-3">
        <CardHeader><CardTitle className="text-sm font-medium">Cumulative R</CardTitle></CardHeader>
        <CardContent>
          {cumulativeData.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={cumulativeData}>
                <defs>
                  <linearGradient id="gradientR" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(142 70% 45%)" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="hsl(142 70% 45%)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={chartGridStroke} />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: chartTickFill }} />
                <YAxis tick={{ fontSize: 11, fill: chartTickFill }} />
                <Tooltip content={<RTooltipContent />} />
                <Area type="monotone" dataKey="r" stroke="hsl(142 70% 45%)" strokeWidth={2} fill="url(#gradientR)" />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-muted-foreground text-sm py-8 text-center">No trades yet. Log your first trade!</p>
          )}
        </CardContent>
      </div>

      {/* Condition Performance Bar Chart */}
      <div className="chart-card">
        <CardHeader><CardTitle className="text-sm font-medium">Condition Performance</CardTitle></CardHeader>
        <CardContent>
          {conditionPerfData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={conditionPerfData} layout="vertical" margin={{ left: 60 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={chartGridStroke} horizontal={false} />
                <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11, fill: chartTickFill }} tickFormatter={(v) => `${v}%`} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: chartTickFill }} width={55} />
                <Tooltip
                  contentStyle={{ background: 'hsl(228 18% 12%)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, color: '#fafafa' }}
                  labelStyle={{ color: '#fafafa' }}
                  formatter={(value: number, _name: string, props: any) => [`${value}% (${props.payload.trades} trades)`, 'Win Rate']}
                />
                <Bar dataKey="winRate" radius={[0, 6, 6, 0]}>
                  {conditionPerfData.map((_, i) => (
                    <Cell key={i} fill="hsl(142 70% 45%)" fillOpacity={0.8} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-muted-foreground text-sm py-8 text-center">No condition data available.</p>
          )}
        </CardContent>
      </div>

      {/* R-Distribution */}
      <div className="chart-card">
        <CardHeader><CardTitle className="text-sm font-medium">R-Distribution (Wins & Break-even)</CardTitle></CardHeader>
        <CardContent>
          {rDistData.some(b => b.count > 0) ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={rDistData}>
                <CartesianGrid strokeDasharray="3 3" stroke={chartGridStroke} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: chartTickFill }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: chartTickFill }} />
                <Tooltip
                  cursor={{ fill: 'rgba(255,255,255,0.03)' }}
                  contentStyle={{ background: 'hsl(228 18% 12%)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, color: '#fafafa' }}
                  formatter={(value: number) => [`${value} trades`, 'Count']}
                />
                <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                  {rDistData.map((entry, i) => (
                    <Cell key={i} fill={entry.name === '0R' ? 'hsl(215 15% 45%)' : 'hsl(142 70% 45%)'} fillOpacity={0.8} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-muted-foreground text-sm py-8 text-center">No winning/break-even trade data.</p>
          )}
        </CardContent>
      </div>

      {/* Hourly Performance */}
      <div className="chart-card">
        <CardHeader><CardTitle className="text-sm font-medium">Performance by Hour</CardTitle></CardHeader>
        <CardContent>
          {executedTrades.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={hourlyData}>
                <CartesianGrid strokeDasharray="3 3" stroke={chartGridStroke} />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: chartTickFill }} interval={1} />
                <YAxis tick={{ fontSize: 11, fill: chartTickFill }} />
                <Tooltip cursor={{ fill: 'rgba(255,255,255,0.03)' }} content={<RTooltipContent />} />
                <Bar dataKey="r" radius={[4, 4, 0, 0]}>
                  {hourlyData.map((entry, i) => (
                    <Cell key={i} fill={entry.r < 0 ? 'hsl(0 72% 51%)' : 'hsl(142 70% 45%)'} fillOpacity={0.8} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-muted-foreground text-sm py-8 text-center">No trade data available.</p>
          )}
        </CardContent>
      </div>

      {/* Day of Week Performance */}
      <div className="chart-card">
        <CardHeader><CardTitle className="text-sm font-medium">Performance by Day</CardTitle></CardHeader>
        <CardContent>
          {executedTrades.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={dayData}>
                <CartesianGrid strokeDasharray="3 3" stroke={chartGridStroke} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: chartTickFill }} />
                <YAxis tick={{ fontSize: 11, fill: chartTickFill }} />
                <Tooltip cursor={{ fill: 'rgba(255,255,255,0.03)' }} content={<RTooltipContent />} />
                <Bar dataKey="r" radius={[6, 6, 0, 0]}>
                  {dayData.map((entry, i) => (
                    <Cell key={i} fill={entry.r < 0 ? 'hsl(0 72% 51%)' : 'hsl(142 70% 45%)'} fillOpacity={0.8} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-muted-foreground text-sm py-8 text-center">No trade data available.</p>
          )}
        </CardContent>
      </div>

      {/* Performance by Tag & Condition */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <PerfTable title="Performance by Tag" rows={tagPerfData} emptyText="No tag data available." />
        <PerfTable title="Performance by Condition" rows={conditionPerfTableData} emptyText="No condition data available." />
      </div>
    </div>
  );
}

function PerfTable({ title, rows, emptyText }: { title: string; rows: Array<{ name: string; trades: number; winRate: number; totalR: number }>; emptyText: string }) {
  return (
    <div className="chart-card">
      <CardHeader><CardTitle className="text-sm font-medium">{title}</CardTitle></CardHeader>
      <CardContent>
        {rows.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-muted-foreground border-b border-white/5">
                  <th className="text-left font-medium py-2.5 pr-2">Name</th>
                  <th className="text-right font-medium py-2.5 px-2">Trades</th>
                  <th className="text-right font-medium py-2.5 px-2">Win Rate</th>
                  <th className="text-right font-medium py-2.5 pl-2">Total R</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.name} className="border-b border-white/[0.03] last:border-0 hover:bg-white/[0.02] transition-colors">
                    <td className="py-2.5 pr-2 truncate max-w-[180px]">{r.name}</td>
                    <td className="py-2.5 px-2 text-right font-mono text-muted-foreground">{r.trades}</td>
                    <td className="py-2.5 px-2 text-right font-mono">{r.winRate}%</td>
                    <td className={`py-2.5 pl-2 text-right font-mono font-semibold ${r.totalR > 0 ? 'text-win' : r.totalR < 0 ? 'text-loss' : 'text-muted-foreground'}`}>
                      {r.totalR >= 0 ? '+' : ''}{r.totalR.toFixed(2)}R
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-muted-foreground text-sm py-8 text-center">{emptyText}</p>
        )}
      </CardContent>
    </div>
      </>
      )}
    </div>
  );
}
