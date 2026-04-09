import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import DateRangeFilter, { type DateRangeValue } from '@/components/DateRangeFilter';
import SetupAnalyzer from '@/components/SetupAnalyzer';

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
    queryKey: ['trade-conditions-all', user?.id],
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

  // Condition performance
  const conditionMap = new Map<string, { wins: number; total: number; totalR: number; name: string }>();
  const dateTradeIds = new Set(dateTrades.map(t => t.id));
  tradeConditions.forEach((tc: any) => {
    const name = tc.conditions?.name ?? '';
    if (!name) return;
    if (!dateTradeIds.has(tc.trade_id)) return;
    if (!conditionMap.has(name)) conditionMap.set(name, { wins: 0, total: 0, totalR: 0, name });
    const entry = conditionMap.get(name)!;
    const trade = dateTrades.find(t => t.id === tc.trade_id);
    if (trade) {
      entry.total++;
      if (trade.result === 'Win') entry.wins++;
      entry.totalR += Number(trade.earned_r);
    }
  });
  const conditionPerf = Array.from(conditionMap.values()).map(c => ({
    name: c.name,
    winRate: c.total > 0 ? Math.round((c.wins / c.total) * 100) : 0,
    avgR: c.total > 0 ? +(c.totalR / c.total).toFixed(2) : 0,
    trades: c.total,
  }));

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

      {/* Setup Analyzer */}
      <SetupAnalyzer trades={dateTrades} tradeConditions={tradeConditions} />
    </div>
  );
}
