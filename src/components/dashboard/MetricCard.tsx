import { LucideIcon } from 'lucide-react';

export interface Metric {
  label: string;
  value: string;
  color: string;
  icon: LucideIcon;
  glow?: boolean;
  small?: boolean;
  sub?: string;
}

export default function MetricCard({ metric }: { metric: Metric }) {
  const { icon: Icon, glow, small, color, label, value, sub } = metric;
  return (
    <div className={`metric-card p-4 ${glow ? 'glow-primary' : ''}`}>
      <div className="flex items-center gap-2 mb-2">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">{label}</span>
      </div>
      <span className={`${small ? 'text-base' : 'text-2xl'} font-bold font-mono ${color}`}>
        {value}
      </span>
      {sub && (
        <div className="flex gap-2 mt-1.5">
          <span className="text-[10px] text-muted-foreground">{sub}</span>
        </div>
      )}
    </div>
  );
}
