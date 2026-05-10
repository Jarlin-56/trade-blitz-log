import { CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { chartGridStroke, chartTickFill } from './RTooltip';

interface Props {
  data: Array<{ name: string; winRate: number; trades: number }>;
}

export default function ConditionPerfChart({ data }: Props) {
  return (
    <div className="chart-card">
      <CardHeader><CardTitle className="text-sm font-medium">Condition Performance</CardTitle></CardHeader>
      <CardContent>
        {data.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data} layout="vertical" margin={{ left: 60 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={chartGridStroke} horizontal={false} />
              <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11, fill: chartTickFill }} tickFormatter={(v) => `${v}%`} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: chartTickFill }} width={55} />
              <Tooltip
                contentStyle={{ background: 'hsl(228 18% 12%)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, color: '#fafafa' }}
                labelStyle={{ color: '#fafafa' }}
                formatter={(value: number, _name: string, props: any) => [`${value}% (${props.payload.trades} trades)`, 'Win Rate']}
              />
              <Bar dataKey="winRate" radius={[0, 6, 6, 0]}>
                {data.map((_, i) => (
                  <Cell key={i} fill="hsl(142 70% 45%)" fillOpacity={0.8} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-muted-foreground text-sm py-8 text-center">No condition data available.</p>
        )}
      </CardContent>
    </div>
  );
}
