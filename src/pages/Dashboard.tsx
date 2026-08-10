import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useProfile } from '@/contexts/ProfileContext';
import { useFilters } from '@/contexts/FilterContext';
import { TrendingUp, Target, BarChart3, Percent, Scale, Lightbulb } from 'lucide-react';
import DateRangeFilter from '@/components/DateRangeFilter';
import EmptyState from '@/components/EmptyState';
import MetricCard, { Metric } from '@/components/dashboard/MetricCard';
import HoldingTimeCard from '@/components/dashboard/HoldingTimeCard';
import CumulativeRChart from '@/components/dashboard/CumulativeRChart';

import RDistributionChart from '@/components/dashboard/RDistributionChart';
import RBarChart from '@/components/dashboard/RBarChart';
import PerformanceTable from '@/components/dashboard/PerformanceTable';
import { Button } from '@/components/ui/button';
import InsightsCard, { Insight } from '@/components/dashboard/InsightsCard';
import StreakCard from '@/components/dashboard/StreakCard';
import OnboardingWizard from '@/components/OnboardingWizard';
import MetricsAnalysisCard from '@/components/dashboard/MetricsAnalysisCard';
import { computeMetricStats, metricInsights, MetricDef, MetricValueRow } from '@/lib/metrics';

export default function Dashboard() {
  const { user } = useAuth();
  const { activeProfile } = useProfile();
  const { dateRange, setDateRange } = useFilters();
  const [insightsOpen, setInsightsOpen] = useState(false);

  const { data: trades = [] } = useQuery({
    queryKey: ['trades', user?.id, activeProfile?.id],
    queryFn: async () => {
      if (!user || !activeProfile) return [];
      const { data, error } = await supabase.from('trades').select('*')
        .eq('user_id', user.id).eq('profile_id', activeProfile.id).order('entry_date', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user && !!activeProfile,
  });

  const { data: tradeConditions = [] } = useQuery({
    queryKey: ['trade_conditions_dashboard', user?.id, activeProfile?.id],
    queryFn: async () => {
      if (!user || !activeProfile) return [];
      const ids = trades.map(trade => trade.id);
      if (ids.length === 0) return [];
      const { data, error } = await supabase.from('trade_conditions').select('trade_id, condition_id, conditions(name)').in('trade_id', ids);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user && !!activeProfile && trades.length > 0,
  });

  const { data: tradeTags = [] } = useQuery({
    queryKey: ['trade_tags_dashboard', user?.id, activeProfile?.id],
    queryFn: async () => {
      if (!user || !activeProfile) return [];
      const ids = trades.map(trade => trade.id);
      if (ids.length === 0) return [];
      const { data, error } = await supabase.from('trade_tags').select('trade_id, tag_id, tags(name)').in('trade_id', ids);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user && !!activeProfile && trades.length > 0,
  });

  const { data: customMetrics = [] } = useQuery({
    queryKey: ['trade-metrics', user?.id, activeProfile?.id],
    queryFn: async () => {
      if (!activeProfile) return [];
      const { data, error } = await supabase.from('trade_metrics').select('*')
        .eq('user_id', user?.id ?? '').eq('profile_id', activeProfile.id).order('sort_order');
      if (error) throw error;
      return (data ?? []) as MetricDef[];
    },
    enabled: !!user && !!activeProfile,
  });

  const { data: metricValues = [] } = useQuery({
    queryKey: ['trade-metric-values', user?.id, activeProfile?.id],
    queryFn: async () => {
      if (!user || !activeProfile) return [];
      const { data: profileTrades, error: tradeError } = await supabase.from('trades').select('id')
        .eq('user_id', user.id).eq('profile_id', activeProfile.id);
      if (tradeError) throw tradeError;
      const ids = (profileTrades ?? []).map(t => t.id);
      if (ids.length === 0) return [];
      const { data, error } = await supabase.from('trade_metric_values').select('trade_id, metric_id, value')
        .in('trade_id', ids).eq('user_id', user.id);
      if (error) throw error;
      return (data ?? []) as MetricValueRow[];
    },
    enabled: !!user && !!activeProfile,
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

    const sessionLabel = (d: Date) => {
      const h = d.getHours();
      if (h >= 6 && h < 12) return 'ช่วงเช้า';
      if (h >= 12 && h < 18) return 'ช่วงบ่าย';
      if (h >= 18 && h < 24) return 'ช่วงค่ำ';
      return 'ช่วงดึก';
    };

    // Map trade -> its conditions (checklist items)
    const condByTrade = new Map<string, string[]>();
    for (const tc of tradeConditions) {
      const name = (tc.conditions as any)?.name;
      if (!name) continue;
      const arr = condByTrade.get(tc.trade_id) ?? [];
      arr.push(name);
      condByTrade.set(tc.trade_id, arr);
    }

    // ---- 1. Best condition by avg R ----
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

    // ---- 2. Cross-dimension: condition × session ----
    const comboMap = new Map<string, { r: number; n: number; wins: number }>();
    for (const t of executedTrades) {
      const conds = condByTrade.get(t.id) ?? [];
      const sess = sessionLabel(new Date(t.entry_date));
      for (const c of conds) {
        const key = `${c} + ${sess}`;
        const e = comboMap.get(key) ?? { r: 0, n: 0, wins: 0 };
        e.r += Number(t.earned_r);
        e.n++;
        if (t.result === 'Win') e.wins++;
        comboMap.set(key, e);
      }
    }
    const combos = Array.from(comboMap.entries())
      .map(([k, e]) => ({ k, avg: e.r / e.n, n: e.n, wr: Math.round((e.wins / e.n) * 100) }))
      .filter(c => c.n >= 3)
      .sort((a, b) => b.avg - a.avg);
    if (combos.length > 0) {
      const top = combos[0];
      if (top.avg > 0.1) {
        out.push({
          text: `คอมโบที่ดีสุด: "${top.k}" ให้ R เฉลี่ย +${top.avg.toFixed(1)}R (Win rate ${top.wr}%, ${top.n} เทรด)`,
          tone: 'positive',
        });
      }
      const bottom = combos[combos.length - 1];
      if (combos.length > 1 && bottom.avg < -0.1) {
        out.push({
          text: `คอมโบที่ควรเลี่ยง: "${bottom.k}" ให้ R เฉลี่ย ${bottom.avg.toFixed(1)}R (Win rate ${bottom.wr}%, ${bottom.n} เทรด)`,
          tone: 'negative',
        });
      }
    }

    // ---- 3. Time-of-day session performance ----
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

    // ---- 4. Best/worst day of week ----
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

    // ---- 5. Checklist completeness vs result ----
    const counts = executedTrades.map(t => ({ t, c: (condByTrade.get(t.id) ?? []).length }));
    const hasAnyCond = counts.some(x => x.c > 0);
    if (hasAnyCond) {
      const avgCount = counts.reduce((s, x) => s + x.c, 0) / counts.length;
      const threshold = Math.max(1, Math.ceil(avgCount));
      const hi = counts.filter(x => x.c >= threshold);
      const lo = counts.filter(x => x.c < threshold);
      const wrOf = (arr: typeof counts) =>
        arr.length > 0 ? Math.round((arr.filter(x => x.t.result === 'Win').length / arr.length) * 100) : 0;
      if (hi.length >= 3 && lo.length >= 3) {
        const wrHi = wrOf(hi);
        const wrLo = wrOf(lo);
        if (wrHi >= wrLo + 10) {
          out.push({
            text: `วินัย checklist ได้ผล: เทรดที่เช็คเงื่อนไขครบกว่า (≥${threshold} ข้อ) ให้ Win rate ${wrHi}% เทียบ ${wrLo}% เมื่อเช็คน้อย`,
            tone: 'positive',
          });
        } else if (wrLo >= wrHi + 10) {
          out.push({
            text: `น่าสังเกต: เทรดที่เช็คเงื่อนไขน้อย (<${threshold} ข้อ) กลับให้ Win rate ${wrLo}% เทียบ ${wrHi}% — ลองทบทวนเงื่อนไขที่ใช้`,
            tone: 'neutral',
          });
        }
      }
    }

    // ---- 6. Trend / improvement over time ----
    if (executedTrades.length >= 8) {
      const half = Math.floor(executedTrades.length / 2);
      const n = Math.min(15, half);
      const recent = executedTrades.slice(-n);
      const prev = executedTrades.slice(-n * 2, -n);
      if (prev.length >= 3) {
        const avgOf = (arr: typeof recent) => arr.reduce((s, t) => s + Number(t.earned_r), 0) / arr.length;
        const avgRecent = avgOf(recent);
        const avgPrev = avgOf(prev);
        const diff = avgRecent - avgPrev;
        if (diff > 0.2) {
          out.push({
            text: `ฟอร์มกำลังดีขึ้น: ${n} เทรดล่าสุด R เฉลี่ย ${avgRecent >= 0 ? '+' : ''}${avgRecent.toFixed(1)}R ดีกว่าช่วงก่อนหน้า (${avgPrev >= 0 ? '+' : ''}${avgPrev.toFixed(1)}R)`,
            tone: 'positive',
          });
        } else if (diff < -0.2) {
          out.push({
            text: `ฟอร์มกำลังถดถอย: ${n} เทรดล่าสุด R เฉลี่ย ${avgRecent >= 0 ? '+' : ''}${avgRecent.toFixed(1)}R แย่ลงจากช่วงก่อน (${avgPrev >= 0 ? '+' : ''}${avgPrev.toFixed(1)}R) — ชะลอและทบทวน`,
            tone: 'negative',
          });
        }
      }
    }

    // ---- 7. Risky behavior: revenge trading after a loss ----
    const overallWr = executedTrades.length > 0
      ? Math.round((executedTrades.filter(t => t.result === 'Win').length / executedTrades.length) * 100)
      : 0;
    const revenge: typeof executedTrades = [];
    for (let i = 1; i < executedTrades.length; i++) {
      if (executedTrades[i - 1].result !== 'Loss') continue;
      const gap = (new Date(executedTrades[i].entry_date).getTime() - new Date(executedTrades[i - 1].entry_date).getTime()) / 60000;
      if (gap >= 0 && gap <= 60) revenge.push(executedTrades[i]);
    }
    if (revenge.length >= 3) {
      const revWr = Math.round((revenge.filter(t => t.result === 'Win').length / revenge.length) * 100);
      if (revWr <= overallWr - 10) {
        out.push({
          text: `ระวัง revenge trading: เทรดที่เปิดภายใน 1 ชม. หลังขาดทุน Win rate เหลือ ${revWr}% (เฉลี่ยรวม ${overallWr}%) — ${revenge.length} ครั้ง`,
          tone: 'negative',
        });
      }
    }

    // ---- 8. Risky behavior: loss streak ----
    let curStreak = 0;
    let maxStreak = 0;
    for (const t of executedTrades) {
      if (t.result === 'Loss') {
        curStreak++;
        maxStreak = Math.max(maxStreak, curStreak);
      } else if (t.result === 'Win') {
        curStreak = 0;
      }
    }
    if (maxStreak >= 4) {
      out.push({
        text: `เคยขาดทุนติดกันสูงสุด ${maxStreak} ไม้ — ควรมีกฎหยุดเทรดเมื่อแพ้ติดต่อกัน`,
        tone: 'negative',
      });
    }

    // ---- 9. Holding time win vs loss ----
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
  }, [executedTrades, conditionPerfTableData, dayData, tradeConditions]);

  const metricStats = useMemo(
    () => computeMetricStats(customMetrics.filter(m => m.is_active !== false), metricValues, dateTrades as any),
    [customMetrics, metricValues, dateTrades]
  );

  const allInsights = useMemo<Insight[]>(
    () => [...insights, ...metricInsights(metricStats).map(text => ({ text, tone: 'neutral' as const }))],
    [insights, metricStats]
  );

  const metrics: Metric[] = [
    { label: 'Total R', value: `${totalR >= 0 ? '+' : ''}${totalR.toFixed(2)}R`, color: totalR >= 0 ? 'text-win' : 'text-loss', icon: TrendingUp, glow: totalR >= 0 },
    { label: 'Win Rate', value: `${winRate}%`, color: 'text-foreground', icon: Target },
    { label: 'Total Trades', value: executedTrades.length.toString(), color: 'text-foreground', icon: BarChart3, sub: (canceledCount > 0 || missedCount > 0) ? `${missedCount > 0 ? `Missed: ${missedCount}` : ''}${canceledCount > 0 ? ` Canceled: ${canceledCount}` : ''}`.trim() : undefined },
    { label: 'Profit Factor', value: profitFactor, color: 'text-foreground', icon: Percent },
    { label: 'Avg R:R', value: avgRR, color: 'text-foreground', icon: Scale, small: true },
  ];

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <OnboardingWizard />
      <div className="flex items-center justify-between flex-wrap gap-3 animate-fade-up">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Performance overview</p>
        </div>
        {trades.length > 0 && (
          <div className="flex items-center gap-2">
            {allInsights.length > 0 && (
              <InsightsCard insights={allInsights} open={insightsOpen} onOpenChange={setInsightsOpen}>
                <Button variant="outline" size="sm" className="gap-1.5">
                  <Lightbulb className="h-4 w-4 text-primary" />
                  <span className="hidden sm:inline">Insights</span>
                </Button>
              </InsightsCard>
            )}
            <DateRangeFilter value={dateRange} onChange={setDateRange} />
          </div>
        )}
      </div>

      {trades.length === 0 ? (
        <EmptyState variant="dashboard" />
      ) : (
        <>

          <StreakCard
            trades={trades as any}
            tradeConditions={tradeConditions as any}
            allTradeIds={trades.map(t => t.id)}
          />

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 animate-fade-up-delay-1">
            {metrics.map((m, i) => <MetricCard key={i} metric={m} />)}
          </div>

          <MetricsAnalysisCard stats={metricStats} />

          <HoldingTimeCard {...holdingTime} />

          <CumulativeRChart data={cumulativeData} />
          
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
