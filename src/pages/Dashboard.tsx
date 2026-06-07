import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useProfile } from '@/contexts/ProfileContext';
import { useFilters } from '@/contexts/FilterContext';
import { TrendingUp, Target, BarChart3, Percent, Scale } from 'lucide-react';
import DateRangeFilter from '@/components/DateRangeFilter';
import EmptyState from '@/components/EmptyState';
import MetricCard, { Metric } from '@/components/dashboard/MetricCard';
import HoldingTimeCard from '@/components/dashboard/HoldingTimeCard';
import CumulativeRChart from '@/components/dashboard/CumulativeRChart';
import ConditionPerfChart from '@/components/dashboard/ConditionPerfChart';
import RDistributionChart from '@/components/dashboard/RDistributionChart';
import RBarChart from '@/components/dashboard/RBarChart';
import PerformanceTable from '@/components/dashboard/PerformanceTable';

export default function Dashboard() {
  const { user } = useAuth();
  const { activeProfile } = useProfile();
  const { dateRange, setDateRange } = useFilters();

  const { data: trades = [] } = useQuery({
    queryKey: ['trades', user?.id, activeProfile?.id],
    queryFn: async () => {
      let q = supabase.from('trades').select('*').order('entry_date', { ascending: true });
      if (activeProfile?.id) q = q.eq('profile_id', activeProfile.id);
      const { data } = await q;
      return data ?? [];
    },
    enabled: !!user && !!activeProfile,
  });

  const { data: tradeConditions = [] } = useQuery({
    queryKey: ['trade_conditions_dashboard', user?.id],
    queryFn: async () => {
      const { data } = await supabase.from('trade_conditions').select('trade_id, condition_id, conditions(name)');
      return data ?? [];
    },
    enabled: !!user,
  });

  const { data: tradeTags = [] } = useQuery({
    queryKey: ['trade_tags_dashboard', user?.id],
    queryFn: async () => {
      const { data } = await supabase.from('trade_tags').select('trade_id, tag_id, tags(name)');
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
    for (let i = 0; i <= maxR; i++) buckets.push({ name: i === 0 ? '0R' : `+${i}R`, count: 0 });
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

  const insights = useMemo(() => {
    const out: Insight[] = [];
    if (executedTrades.length < 3) return out;

    // 1. Best condition by avg R
    const condAvg = conditionPerfTableData
      .filter(c => c.trades >= 2)
      .map(c => ({ ...c, avg: c.totalR / c.trades }))
      .sort((a, b) => b.avg - a.avg);
    if (condAvg.length > 0) {
      const best = condAvg[0];
      out.push({
        text: `Condition "${best.name}" ให้ R เฉลี่ยสูงสุด (${best.avg >= 0 ? '+' : ''}${best.avg.toFixed(1)}R จาก ${best.trades} เทรด)`,
        tone: 'positive',
      });
      const worst = condAvg[condAvg.length - 1];
      if (condAvg.length > 1 && worst.avg < 0) {
        out.push({
          text: `Condition "${worst.name}" ทำผลงานแย่สุด (${worst.avg.toFixed(1)}R เฉลี่ย) — ควรทบทวน`,
          tone: 'negative',
        });
      }
    }

    // 2. Time-of-day session performance
    const sessions = [
      { name: 'ช่วงเช้า (06:00–12:00)', from: 6, to: 12 },
      { name: 'ช่วงบ่าย (12:00–18:00)', from: 12, to: 18 },
      { name: 'ช่วงค่ำ (18:00–24:00)', from: 18, to: 24 },
      { name: 'ช่วงดึก (00:00–06:00)', from: 0, to: 6 },
    ].map(s => {
      const ts = executedTrades.filter(t => {
        const h = new Date(t.entry_date).getHours();
        return h >= s.from && h < s.to;
      });
      const wins = ts.filter(t => t.result === 'Win').length;
      return {
        name: s.name,
        count: ts.length,
        winRate: ts.length > 0 ? Math.round((wins / ts.length) * 100) : 0,
        r: ts.reduce((sum, t) => sum + Number(t.earned_r), 0),
      };
    }).filter(s => s.count >= 2);
    if (sessions.length > 0) {
      const worstSession = [...sessions].sort((a, b) => a.r - b.r)[0];
      if (worstSession.r < 0) {
        out.push({
          text: `คุณมักแพ้${worstSession.name} (Win rate ${worstSession.winRate}%, รวม ${worstSession.r.toFixed(1)}R)`,
          tone: 'negative',
        });
      }
      const bestSession = [...sessions].sort((a, b) => b.r - a.r)[0];
      if (bestSession.r > 0 && bestSession.name !== worstSession.name) {
        out.push({
          text: `${bestSession.name} คือช่วงที่คุณทำกำไรดีสุด (Win rate ${bestSession.winRate}%, รวม +${bestSession.r.toFixed(1)}R)`,
          tone: 'positive',
        });
      }
    }

    // 3. Best/worst day of week
    const daysWithData = dayData.filter(d => Math.abs(d.r) > 0.01);
    if (daysWithData.length >= 2) {
      const bestDay = [...daysWithData].sort((a, b) => b.r - a.r)[0];
      const worstDay = [...daysWithData].sort((a, b) => a.r - b.r)[0];
      if (bestDay.r > 0) {
        out.push({ text: `วัน${bestDay.name} เป็นวันที่ทำกำไรดีที่สุด (+${bestDay.r.toFixed(1)}R)`, tone: 'positive' });
      }
      if (worstDay.r < 0 && worstDay.name !== bestDay.name) {
        out.push({ text: `วัน${worstDay.name} เป็นวันที่ขาดทุนมากสุด (${worstDay.r.toFixed(1)}R)`, tone: 'negative' });
      }
    }

    // 4. Holding time win vs loss
    const withDur = executedTrades.filter(t => (t as any).duration_minutes != null);
    const winDur = withDur.filter(t => t.result === 'Win');
    const lossDur = withDur.filter(t => t.result === 'Loss');
    if (winDur.length >= 2 && lossDur.length >= 2) {
      const avgWin = winDur.reduce((s, t) => s + Number((t as any).duration_minutes), 0) / winDur.length;
      const avgLoss = lossDur.reduce((s, t) => s + Number((t as any).duration_minutes), 0) / lossDur.length;
      const fmt = (m: number) => (m < 60 ? `${Math.round(m)} นาที` : `${(m / 60).toFixed(1)} ชม.`);
      if (avgLoss > avgWin * 1.3) {
        out.push({
          text: `เทรดที่ขาดทุนมักถือนานกว่า (เฉลี่ย ${fmt(avgLoss)} เทียบกับ ${fmt(avgWin)} ตอนชนะ) — ระวังการถือไม้ขาดทุนนาน`,
          tone: 'negative',
        });
      }
    }

    return out;
  }, [executedTrades, conditionPerfTableData, dayData]);

  const metrics: Metric[] = [
    { label: 'Total R', value: `${totalR >= 0 ? '+' : ''}${totalR.toFixed(2)}R`, color: totalR >= 0 ? 'text-win' : 'text-loss', icon: TrendingUp, glow: totalR >= 0 },
    { label: 'Win Rate', value: `${winRate}%`, color: 'text-foreground', icon: Target },
    { label: 'Total Trades', value: executedTrades.length.toString(), color: 'text-foreground', icon: BarChart3, sub: (canceledCount > 0 || missedCount > 0) ? `${missedCount > 0 ? `Missed: ${missedCount}` : ''}${canceledCount > 0 ? ` Canceled: ${canceledCount}` : ''}`.trim() : undefined },
    { label: 'Profit Factor', value: profitFactor, color: 'text-foreground', icon: Percent },
    { label: 'Avg R:R', value: avgRR, color: 'text-foreground', icon: Scale, small: true },
  ];

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
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
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 animate-fade-up-delay-1">
            {metrics.map((m, i) => <MetricCard key={i} metric={m} />)}
          </div>

          <HoldingTimeCard {...holdingTime} />

          <CumulativeRChart data={cumulativeData} />
          <ConditionPerfChart data={conditionPerfData} />
          <RDistributionChart data={rDistData} />
          <RBarChart title="Performance by Hour" data={hourlyData} hasData={executedTrades.length > 0} xInterval={1} xFontSize={10} barRadius={[4, 4, 0, 0]} />
          <RBarChart title="Performance by Day" data={dayData} hasData={executedTrades.length > 0} />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <PerformanceTable title="Performance by Tag" rows={tagPerfData} emptyText="No tag data available." />
            <PerformanceTable title="Performance by Condition" rows={conditionPerfTableData} emptyText="No condition data available." />
          </div>
        </>
      )}
    </div>
  );
}
