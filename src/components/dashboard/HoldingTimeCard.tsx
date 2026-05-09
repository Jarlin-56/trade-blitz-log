import { Clock } from 'lucide-react';

interface Props {
  overall: string;
  win: string;
  loss: string;
}

export default function HoldingTimeCard({ overall, win, loss }: Props) {
  return (
    <div className="metric-card p-4 animate-fade-up-delay-2">
      <div className="flex items-center gap-2 mb-3">
        <Clock className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs uppercase tracking-widest text-muted-foreground font-medium font-body">Holding Time Analysis</span>
      </div>
      <div className="grid grid-cols-3 gap-4 text-center">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1 font-body">Overall</p>
          <span className="text-xl font-light tabular-nums tracking-display">{overall}</span>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1 font-body">Win Avg</p>
          <span className="text-xl font-light tabular-nums tracking-display text-win">{win}</span>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1 font-body">Loss Avg</p>
          <span className="text-xl font-light tabular-nums tracking-display text-loss">{loss}</span>
        </div>
      </div>
    </div>
  );
}
