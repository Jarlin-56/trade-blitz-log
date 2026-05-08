import { CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { chartGridStroke, chartTickFill } from './RTooltip';

interface Props {
  data: Array<{ name: string; count: number }>;
}

export default function RDistributionChart({ data }: Props) {
  return (
    <div className="chart-card">
      <CardHeader><CardTitle className="text-sm font-medium">R-Distribution (Wins & Break-even)</CardTitle></CardHeader>
      <CardContent>
        {data.some(b => b.count > 0) ? (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke={chartGridStroke} />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: chartTickFill }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: chartTickFill }} />
              <Tooltip
                cursor={{ fill: 'rgba(255,255,255,0.03)' }}
                contentStyle={{ background: 'hsl(228 18% 12%)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, color: '#fafafa' }}
                formatter={(value: number) => [`${value} trades`, 'Count']}
              />
              <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                {data.map((entry, i) => (
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
  );
}
