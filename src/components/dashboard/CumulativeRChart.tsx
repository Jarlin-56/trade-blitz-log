import { CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { RTooltipContent, chartGridStroke, chartTickFill } from './RTooltip';

interface Props {
  data: Array<{ date: string; r: number }>;
}

export default function CumulativeRChart({ data }: Props) {
  return (
    <div className="chart-card animate-fade-up-delay-3">
      <CardHeader><CardTitle className="text-sm font-medium">Cumulative R</CardTitle></CardHeader>
      <CardContent>
        {data.length > 0 ? (
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={data}>
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
  );
}
