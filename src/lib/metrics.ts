export interface MetricDef {
  id: string;
  name: string;
  unit: string | null;
  decimals: number;
  min_value?: number | null;
  max_value?: number | null;
  sort_order?: number;
  is_active?: boolean;
}

export interface MetricValueRow {
  trade_id: string;
  metric_id: string;
  value: number | null;
}

export interface TradeLike {
  id: string;
  result: string;
  earned_r: number | string;
}

export interface Bucket {
  label: string;
  count: number;
  avgR: number;
  winRate: number;
}

export interface MetricStats {
  metric: MetricDef;
  count: number;
  avg: number;
  median: number;
  min: number;
  max: number;
  avgWin: number | null;
  avgLoss: number | null;
  buckets: Bucket[];
}

const median = (nums: number[]) => {
  if (!nums.length) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

const avg = (nums: number[]) => (nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0);

export function computeMetricStats(
  metrics: MetricDef[],
  values: MetricValueRow[],
  trades: TradeLike[]
): MetricStats[] {
  const tradeById = new Map(trades.map(t => [t.id, t]));

  return metrics
    .map(metric => {
      const pairs = values
        .filter(v => v.metric_id === metric.id && v.value != null && tradeById.has(v.trade_id))
        .map(v => ({ value: Number(v.value), trade: tradeById.get(v.trade_id)! }));

      if (pairs.length === 0) return null;

      const nums = pairs.map(p => p.value);
      const winVals = pairs.filter(p => p.trade.result === 'Win').map(p => p.value);
      const lossVals = pairs.filter(p => p.trade.result === 'Loss').map(p => p.value);

      // Split into low / mid / high buckets by value range
      const executed = pairs.filter(p => !['Missed', 'Canceled'].includes(p.trade.result));
      const min = Math.min(...nums);
      const max = Math.max(...nums);
      const step = (max - min) / 3;
      const buckets: Bucket[] = [];

      if (executed.length >= 3 && step > 0) {
        const ranges = [
          { label: `${min.toFixed(metric.decimals)}–${(min + step).toFixed(metric.decimals)}`, lo: min, hi: min + step },
          { label: `${(min + step).toFixed(metric.decimals)}–${(min + 2 * step).toFixed(metric.decimals)}`, lo: min + step, hi: min + 2 * step },
          { label: `${(min + 2 * step).toFixed(metric.decimals)}–${max.toFixed(metric.decimals)}`, lo: min + 2 * step, hi: max },
        ];
        ranges.forEach((r, i) => {
          const group = executed.filter(p => (i === 2 ? p.value >= r.lo : p.value >= r.lo && p.value < r.hi));
          if (!group.length) return;
          const rs = group.map(p => Number(p.trade.earned_r));
          const wins = group.filter(p => p.trade.result === 'Win').length;
          buckets.push({
            label: r.label,
            count: group.length,
            avgR: avg(rs),
            winRate: (wins / group.length) * 100,
          });
        });
      }

      return {
        metric,
        count: pairs.length,
        avg: avg(nums),
        median: median(nums),
        min,
        max,
        avgWin: winVals.length ? avg(winVals) : null,
        avgLoss: lossVals.length ? avg(lossVals) : null,
        buckets,
      } as MetricStats;
    })
    .filter((s): s is MetricStats => s !== null);
}

export function metricInsights(stats: MetricStats[]): string[] {
  const out: string[] = [];
  for (const s of stats) {
    const u = s.metric.unit ? ` ${s.metric.unit}` : '';
    const d = s.metric.decimals;
    if (s.avgWin != null && s.avgLoss != null && Math.abs(s.avgWin - s.avgLoss) > 1e-9) {
      out.push(
        `${s.metric.name}: ไม้ชนะเฉลี่ย ${s.avgWin.toFixed(d)}${u} · ไม้แพ้เฉลี่ย ${s.avgLoss.toFixed(d)}${u}`
      );
    }
    if (s.buckets.length >= 2) {
      const best = [...s.buckets].sort((a, b) => b.avgR - a.avgR)[0];
      if (best.avgR > 0) {
        out.push(
          `${s.metric.name} ช่วง ${best.label}${u} ให้ค่า R เฉลี่ยสูงสุด ${best.avgR.toFixed(2)}R (${best.count} ไม้)`
        );
      }
    }
  }
  return out;
}

export const formatMetric = (value: number, m: MetricDef) =>
  `${value.toFixed(m.decimals)}${m.unit ? ` ${m.unit}` : ''}`;
