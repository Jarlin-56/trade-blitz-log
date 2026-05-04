import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useProfile } from '@/contexts/ProfileContext';
import { useFilters } from '@/contexts/FilterContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from 'recharts';
import { Clock } from 'lucide-react';
import DateRangeFilter from '@/components/DateRangeFilter';

const RTooltipContent = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  const value = payload[0].value as number;
  const color = value > 0 ? '#22c55e' : value < 0 ? '#ef4444' : '#fafafa';
  return (
    <div style={{ background: '#27272a', border: '1px solid #3f3f46', borderRadius: 8, padding: '8px 12px', color: '#fafafa' }}>
      <div style={{ fontSize: 12, color: '#e4e4e7', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 600, color }}>
        Total R: {value >= 0 ? '+' : ''}{value}R
      </div>
    </div>
  );
};


export default function Dashboard() {
  const { user } = useAuth();
  const { dateRange, setDateRange } = useFilters();

  const { data: trades = [] } = useQuery({
    queryKey: ['trades', user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('trades')
        .select('*')
        .order('entry_date', { ascending: true });
      return data ?? [];
    },
    enabled: !!user,
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

  // Apply date filter
  const dateTrades = useMemo(() => {
    if (!dateRange) return trades;
    return trades.filter(t => {
      const d = new Date(t.entry_date);
      return d >= dateRange.from && d <= dateRange.to;
    });
  }, [trades, dateRange]);

  // Exclude Missed & Canceled from PnL calculations
  const executedTrades = dateTrades.filter(t => !['Missed', 'Canceled'].includes(t.result));
  const canceledCount = dateTrades.filter(t => t.result === 'Canceled').length;
  const missedCount = dateTrades.filter(t => t.result === 'Missed').length;
  const totalR = executedTrades.reduce((sum, t) => sum + Number(t.earned_r), 0);
  const winCount = executedTrades.filter(t => t.result === 'Win').length;
  const winRate = executedTrades.length > 0 ? ((winCount / executedTrades.length) * 100).toFixed(1) : '0';

  // Professional Metrics
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

  // Holding Time Analysis
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

  // R-Distribution data (wins & break-even only)
  const rDistData = useMemo(() => {
    // Find max R among non-negative trades to build dynamic buckets
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

  // Cumulative R data (only executed trades)
  const cumulativeData = executedTrades.map((t, i) => ({
    date: new Date(t.entry_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    r: executedTrades.slice(0, i + 1).reduce((s, tr) => s + Number(tr.earned_r), 0),
  }));

  // Condition Performance data
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
      .map(([name, { total, wins }]) => ({
        name,
        winRate: Math.round((wins / total) * 100),
        trades: total,
      }))
      .sort((a, b) => b.winRate - a.winRate);
  }, [dateTrades, executedTrades, tradeConditions]);

  // Performance by Tag / Condition (Total R, Win Rate, Trade Count)
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
        name,
        trades: total,
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

  // R-Distribution histogram buckets: -3R, -2R, -1R, 0R, +1R, +2R, +3R, +4R+

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

  // Day of Week Performance data (local timezone)
  const dayData = useMemo(() => {
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
    const dayMap: Record<string, number> = {};
    days.forEach(d => dayMap[d] = 0);
    for (const t of executedTrades) {
      const jsDay = new Date(t.entry_date).getDay(); // 0=Sun
      const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][jsDay];
      if (dayMap[dayName] !== undefined) dayMap[dayName] += Number(t.earned_r);
    }
    return days.map(d => ({ name: d, r: parseFloat(dayMap[d].toFixed(2)) }));
  }, [executedTrades]);

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <DateRangeFilter value={dateRange} onChange={setDateRange} />
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Total R</CardTitle></CardHeader>
          <CardContent>
            <span className={`text-3xl font-bold font-mono ${totalR >= 0 ? 'text-win' : 'text-loss'}`}>
              {totalR >= 0 ? '+' : ''}{totalR.toFixed(2)}R
            </span>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Win Rate</CardTitle></CardHeader>
          <CardContent><span className="text-3xl font-bold font-mono">{winRate}%</span></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Total Trades</CardTitle></CardHeader>
          <CardContent>
            <span className="text-3xl font-bold font-mono">{executedTrades.length}</span>
            {(canceledCount > 0 || missedCount > 0) && (
              <div className="flex gap-2 mt-1.5">
                {missedCount > 0 && <span className="text-[11px] text-orange-400">Missed: {missedCount}</span>}
                {canceledCount > 0 && <span className="text-[11px] text-muted-foreground">Canceled: {canceledCount}</span>}
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Profit Factor</CardTitle></CardHeader>
          <CardContent><span className="text-2xl font-bold font-mono">{profitFactor}</span></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Avg R:R</CardTitle></CardHeader>
          <CardContent><span className="text-lg font-bold font-mono">{avgRR}</span></CardContent>
        </Card>
      </div>

      {/* Holding Time Analysis */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2"><Clock className="h-4 w-4" /> Holding Time Analysis</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Overall Avg</p>
              <span className="text-xl font-bold font-mono">{holdingTime.overall}</span>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Win Avg</p>
              <span className="text-xl font-bold font-mono text-win">{holdingTime.win}</span>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Loss Avg</p>
              <span className="text-xl font-bold font-mono text-loss">{holdingTime.loss}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Cumulative R Chart */}
      <Card>
        <CardHeader><CardTitle>Cumulative R</CardTitle></CardHeader>
        <CardContent>
          {cumulativeData.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={cumulativeData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 13% 18%)" />
                <XAxis dataKey="date" tick={{ fontSize: 12, fill: 'hsl(215 15% 55%)' }} />
                <YAxis tick={{ fontSize: 12, fill: 'hsl(215 15% 55%)' }} />
                <Tooltip
                  contentStyle={{ background: '#27272a', border: '1px solid #3f3f46', borderRadius: 8, color: '#fafafa' }}
                  labelStyle={{ color: '#fafafa' }}
                  itemStyle={{ color: '#fafafa' }}
                  content={<RTooltipContent />}
                />
                <Line type="monotone" dataKey="r" stroke="hsl(142 70% 45%)" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-muted-foreground text-sm py-8 text-center">No trades yet. Log your first trade!</p>
          )}
        </CardContent>
      </Card>

      {/* Condition Performance Bar Chart */}
      <Card>
        <CardHeader><CardTitle>Condition Performance</CardTitle></CardHeader>
        <CardContent>
          {conditionPerfData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={conditionPerfData} layout="vertical" margin={{ left: 60 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 13% 18%)" horizontal={false} />
                <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 12, fill: 'hsl(215 15% 55%)' }} tickFormatter={(v) => `${v}%`} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: 'hsl(215 15% 55%)' }} width={55} />
                <Tooltip
                  contentStyle={{ background: '#27272a', border: '1px solid #3f3f46', borderRadius: 8, color: '#fafafa' }}
                  labelStyle={{ color: '#fafafa' }}
                  itemStyle={{ color: '#fafafa' }}
                  formatter={(value: number, _name: string, props: any) => [`${value}% (${props.payload.trades} trades)`, 'Win Rate']}
                />
                <Bar dataKey="winRate" fill="hsl(142 70% 45%)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-muted-foreground text-sm py-8 text-center">No condition data available.</p>
          )}
        </CardContent>
      </Card>

      {/* R-Distribution (Wins & Break-even) */}
      <Card>
        <CardHeader><CardTitle>R-Distribution (Wins & Break-even)</CardTitle></CardHeader>
        <CardContent>
          {rDistData.some(b => b.count > 0) ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={rDistData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 13% 18%)" />
                <XAxis dataKey="name" tick={{ fontSize: 12, fill: 'hsl(215 15% 55%)' }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: 'hsl(215 15% 55%)' }} />
                <Tooltip
                  cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                  contentStyle={{ background: '#27272a', border: '1px solid #3f3f46', borderRadius: 8, color: '#fafafa' }}
                  labelStyle={{ color: '#fafafa' }}
                  itemStyle={{ color: '#fafafa' }}
                  formatter={(value: number) => [`${value} trades`, 'Count']}
                />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {rDistData.map((entry, i) => (
                    <Cell key={i} fill={entry.name === '0R' ? '#a1a1aa' : '#22c55e'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-muted-foreground text-sm py-8 text-center">No winning/break-even trade data.</p>
          )}
        </CardContent>
      </Card>

      {/* Hourly Performance Chart */}
      <Card>
        <CardHeader><CardTitle>Performance by Hour</CardTitle></CardHeader>
        <CardContent>
          {executedTrades.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={hourlyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 13% 18%)" />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'hsl(215 15% 55%)' }} interval={1} />
                <YAxis tick={{ fontSize: 12, fill: 'hsl(215 15% 55%)' }} />
                <Tooltip
                  cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                  content={<RTooltipContent />}
                />
                <Bar dataKey="r" radius={[4, 4, 0, 0]}>
                  {hourlyData.map((entry, i) => (
                    <Cell key={i} fill={entry.r < 0 ? '#ef4444' : '#22c55e'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-muted-foreground text-sm py-8 text-center">No trade data available.</p>
          )}
        </CardContent>
      </Card>

      {/* Day of Week Performance Chart */}
      <Card>
        <CardHeader><CardTitle>Performance by Day</CardTitle></CardHeader>
        <CardContent>
          {executedTrades.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={dayData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 13% 18%)" />
                <XAxis dataKey="name" tick={{ fontSize: 12, fill: 'hsl(215 15% 55%)' }} />
                <YAxis tick={{ fontSize: 12, fill: 'hsl(215 15% 55%)' }} />
                <Tooltip
                  cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                  content={<RTooltipContent />}
                />
                <Bar dataKey="r" radius={[4, 4, 0, 0]}>
                  {dayData.map((entry, i) => (
                    <Cell key={i} fill={entry.r < 0 ? '#ef4444' : '#22c55e'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-muted-foreground text-sm py-8 text-center">No trade data available.</p>
          )}
        </CardContent>
      </Card>

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
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
      <CardContent>
        {rows.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground border-b border-border">
                  <th className="text-left font-medium py-2 pr-2">Name</th>
                  <th className="text-right font-medium py-2 px-2">Trades</th>
                  <th className="text-right font-medium py-2 px-2">Win Rate</th>
                  <th className="text-right font-medium py-2 pl-2">Total R</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.name} className="border-b border-border/40 last:border-0">
                    <td className="py-2 pr-2 truncate max-w-[180px]">{r.name}</td>
                    <td className="py-2 px-2 text-right font-mono">{r.trades}</td>
                    <td className="py-2 px-2 text-right font-mono">{r.winRate}%</td>
                    <td className={`py-2 pl-2 text-right font-mono font-semibold ${r.totalR > 0 ? 'text-win' : r.totalR < 0 ? 'text-loss' : 'text-muted-foreground'}`}>
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
    </Card>
  );
}