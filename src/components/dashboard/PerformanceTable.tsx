import { CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface Row {
  name: string;
  trades: number;
  winRate: number;
  totalR: number;
}

interface Props {
  title: string;
  rows: Row[];
  emptyText: string;
}

export default function PerformanceTable({ title, rows, emptyText }: Props) {
  return (
    <div className="chart-card">
      <CardHeader><CardTitle className="text-sm font-medium">{title}</CardTitle></CardHeader>
      <CardContent>
        {rows.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-muted-foreground border-b border-white/5">
                  <th className="text-left font-medium py-2.5 pr-2">Name</th>
                  <th className="text-right font-medium py-2.5 px-2">Trades</th>
                  <th className="text-right font-medium py-2.5 px-2">Win Rate</th>
                  <th className="text-right font-medium py-2.5 pl-2">Total R</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.name} className="border-b border-white/[0.03] last:border-0 hover:bg-white/[0.02] transition-colors">
                    <td className="py-2.5 pr-2 truncate max-w-[180px]">{r.name}</td>
                    <td className="py-2.5 px-2 text-right font-mono text-muted-foreground">{r.trades}</td>
                    <td className="py-2.5 px-2 text-right font-mono">{r.winRate}%</td>
                    <td className={`py-2.5 pl-2 text-right font-mono font-semibold ${r.totalR > 0 ? 'text-win' : r.totalR < 0 ? 'text-loss' : 'text-muted-foreground'}`}>
                      {r.totalR >= 0 ? '+' : ''}{r.totalR.toFixed(2)}R
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-muted-foreground text-sm py-8 text-center">{emptyText}</p>
        )}
      </CardContent>
    </div>
  );
}
