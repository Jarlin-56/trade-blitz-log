import { CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { RTooltipContent, chartGridStroke, chartTickFill } from './RTooltip';

interface Props {
  title: string;
  data: Array<{ name: string; r: number }>;
  emptyText?: string;
  xInterval?: number;
  xFontSize?: number;
  barRadius?: [number, number, number, number];
  hasData: boolean;
}

export default function RBarChart({ title, data, emptyText = 'No trade data available.', xInterval = 0, xFontSize = 11, barRadius = [6, 6, 0, 0], hasData }: Props) {
  return (
    <div className="chart-card">
      <CardHeader><CardTitle className="text-sm font-medium">{title}</CardTitle></CardHeader>
      <CardContent>
        {hasData ? (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke={chartGridStroke} />
              <XAxis dataKey="name" tick={{ fontSize: xFontSize, fill: chartTickFill }} interval={xInterval} />
              <YAxis tick={{ fontSize: 11, fill: chartTickFill }} />
              <Tooltip cursor={{ fill: 'rgba(255,255,255,0.03)' }} content={<RTooltipContent />} />
              <Bar dataKey="r" radius={barRadius}>
                {data.map((entry, i) => (
                  <Cell key={i} fill={entry.r < 0 ? 'hsl(0 72% 51%)' : 'hsl(142 70% 45%)'} fillOpacity={0.8} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-muted-foreground text-sm py-8 text-center">{emptyText}</p>
        )}
      </CardContent>
    </div>
  );
}
