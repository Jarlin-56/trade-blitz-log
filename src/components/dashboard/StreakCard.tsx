import { useMemo } from 'react';
import { Flame, CalendarCheck, ListChecks } from 'lucide-react';

interface StreakInput {
  trades: { entry_date: string; created_at?: string }[];
  tradeConditions: { trade_id: string }[];
  allTradeIds: string[];
}

function dayKey(d: Date) {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

export default function StreakCard({ trades, tradeConditions, allTradeIds }: StreakInput) {
  const { current, best, daysLogged, checklistPct } = useMemo(() => {
    const keys = new Set(trades.map(t => dayKey(new Date(t.created_at ?? t.entry_date))));
    const sorted = Array.from(keys)
      .map(k => {
        const [y, m, d] = k.split('-').map(Number);
        return new Date(y, m - 1, d).getTime();
      })
      .sort((a, b) => a - b);

    const DAY = 86400000;
    let best = 0;
    let run = 0;
    let prev: number | null = null;
    for (const t of sorted) {
      run = prev !== null && t - prev === DAY ? run + 1 : 1;
      prev = t;
      if (run > best) best = run;
    }

    // current streak: counting back from today (or yesterday)
    let current = 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const set = new Set(sorted);
    let cursor = today.getTime();
    if (!set.has(cursor)) cursor -= DAY;
    while (set.has(cursor)) {
      current += 1;
      cursor -= DAY;
    }

    const withCond = new Set(tradeConditions.map(tc => tc.trade_id));
    const checked = allTradeIds.filter(id => withCond.has(id)).length;
    const checklistPct = allTradeIds.length ? Math.round((checked / allTradeIds.length) * 100) : 0;

    return { current, best, daysLogged: sorted.length, checklistPct };
  }, [trades, tradeConditions, allTradeIds]);

  const items = [
    { icon: Flame, label: 'Streak ปัจจุบัน', value: `${current} วัน`, accent: current > 0 },
    { icon: CalendarCheck, label: 'Streak สูงสุด', value: `${best} วัน`, accent: false },
    { icon: ListChecks, label: 'ติ๊ก Checklist', value: `${checklistPct}%`, accent: checklistPct >= 80 },
    { icon: CalendarCheck, label: 'วันที่บันทึก', value: `${daysLogged} วัน`, accent: false },
  ];

  return (
    <div className="glass-card p-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
      {items.map((it, i) => (
        <div key={i} className="flex items-center gap-2.5 min-w-0">
          <it.icon className={`h-4 w-4 shrink-0 ${it.accent ? 'text-primary' : 'text-muted-foreground'}`} />
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground truncate">{it.label}</div>
            <div className={`text-sm font-bold font-mono ${it.accent ? 'text-primary' : 'text-foreground'}`}>{it.value}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
