import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MetricStats, formatMetric } from '@/lib/metrics';
import { cn } from '@/lib/utils';

export default function MetricsAnalysisCard({ stats }: { stats: MetricStats[] }) {
  if (stats.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Custom Metrics</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {stats.map(s => (
          <div key={s.metric.id} className="space-y-3">
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-sm font-semibold truncate">
                {s.metric.name}
                {s.metric.unit ? <span className="text-muted-foreground font-normal"> ({s.metric.unit})</span> : null}
              </p>
              <span className="text-xs text-muted-foreground shrink-0">{s.count} ไม้</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
              {[
                { label: 'เฉลี่ย', value: s.avg },
                { label: 'มัธยฐาน', value: s.median },
                { label: 'ต่ำสุด', value: s.min },
                { label: 'สูงสุด', value: s.max },
              ].map(x => (
                <div key={x.label} className="rounded-md bg-accent/40 py-2">
                  <p className="text-[11px] text-muted-foreground">{x.label}</p>
                  <p className="font-mono text-sm">{x.value.toFixed(s.metric.decimals)}</p>
                </div>
              ))}
            </div>

            {(s.avgWin != null || s.avgLoss != null) && (
              <div className="flex flex-wrap gap-2 text-xs">
                {s.avgWin != null && (
                  <span className="rounded-full border border-win/40 text-win px-2.5 py-1 font-mono">
                    Win ~ {formatMetric(s.avgWin, s.metric)}
                  </span>
                )}
                {s.avgLoss != null && (
                  <span className="rounded-full border border-loss/40 text-loss px-2.5 py-1 font-mono">
                    Loss ~ {formatMetric(s.avgLoss, s.metric)}
                  </span>
                )}
              </div>
            )}

            {s.buckets.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">ผลงานตามช่วงค่า</p>
                <div className="space-y-1">
                  {s.buckets.map(b => (
                    <div key={b.label} className="flex items-center justify-between gap-2 text-xs rounded-md px-2.5 py-1.5 bg-accent/30">
                      <span className="font-mono truncate">{b.label}</span>
                      <span className="flex items-center gap-3 shrink-0">
                        <span className="text-muted-foreground">{b.count} ไม้</span>
                        <span className="text-muted-foreground">{b.winRate.toFixed(0)}% WR</span>
                        <span className={cn('font-mono font-semibold', b.avgR >= 0 ? 'text-win' : 'text-loss')}>
                          {b.avgR >= 0 ? '+' : ''}{b.avgR.toFixed(2)}R
                        </span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
