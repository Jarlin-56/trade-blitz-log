import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import DateRangeFilter, { type DateRangeValue } from '@/components/DateRangeFilter';


export default function Dashboard() {
  const { user } = useAuth();
  
  const [dateRange, setDateRange] = useState<DateRangeValue>(null);

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
  const totalR = executedTrades.reduce((sum, t) => sum + Number(t.earned_r), 0);
  const winCount = executedTrades.filter(t => t.result === 'Win').length;
  const winRate = executedTrades.length > 0 ? ((winCount / executedTrades.length) * 100).toFixed(1) : '0';

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

  // Session Performance data (local timezone)
  const sessionData = useMemo(() => {
    const sessions: Record<string, number> = { 'Asian': 0, 'London': 0, 'New York': 0 };
    for (const t of executedTrades) {
      const hour = new Date(t.entry_date).getHours();
      let session: string;
      if (hour >= 6 && hour <= 13) session = 'Asian';
      else if (hour >= 14 && hour <= 18) session = 'London';
      else session = 'New York';
      sessions[session] += Number(t.earned_r);
    }
    return [
      { name: 'Asian', r: parseFloat(sessions['Asian'].toFixed(2)) },
      { name: 'London', r: parseFloat(sessions['London'].toFixed(2)) },
      { name: 'New York', r: parseFloat(sessions['New York'].toFixed(2)) },
    ];
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
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
          <CardContent><span className="text-3xl font-bold font-mono">{dateTrades.length}</span></CardContent>
        </Card>
      </div>

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
                <Tooltip contentStyle={{ background: 'hsl(220 18% 12%)', border: '1px solid hsl(220 13% 18%)', borderRadius: 8, color: 'hsl(210 20% 92%)' }} />
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
                  contentStyle={{ background: 'hsl(220 18% 12%)', border: '1px solid hsl(220 13% 18%)', borderRadius: 8, color: 'hsl(210 20% 92%)' }}
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

      {/* Session Performance Chart */}
      <Card>
        <CardHeader><CardTitle>Performance by Session</CardTitle></CardHeader>
        <CardContent>
          {executedTrades.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={sessionData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 13% 18%)" />
                <XAxis dataKey="name" tick={{ fontSize: 12, fill: 'hsl(215 15% 55%)' }} />
                <YAxis tick={{ fontSize: 12, fill: 'hsl(215 15% 55%)' }} />
                <Tooltip
                  contentStyle={{ background: 'hsl(220 18% 12%)', border: '1px solid hsl(220 13% 18%)', borderRadius: 8, color: 'hsl(210 20% 92%)' }}
                  formatter={(value: number) => [`${value >= 0 ? '+' : ''}${value}R`, 'Total R']}
                />
                <Bar dataKey="r" fill="hsl(142 70% 45%)" radius={[4, 4, 0, 0]} />
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
                  contentStyle={{ background: 'hsl(220 18% 12%)', border: '1px solid hsl(220 13% 18%)', borderRadius: 8, color: 'hsl(210 20% 92%)' }}
                  formatter={(value: number) => [`${value >= 0 ? '+' : ''}${value}R`, 'Total R']}
                />
                <Bar dataKey="r" fill="hsl(217 91% 60%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-muted-foreground text-sm py-8 text-center">No trade data available.</p>
          )}
        </CardContent>
      </Card>

    </div>
  );
}