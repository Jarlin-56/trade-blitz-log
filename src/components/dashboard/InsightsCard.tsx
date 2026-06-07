import { Lightbulb } from 'lucide-react';

export interface Insight {
  text: string;
  tone: 'positive' | 'negative' | 'neutral';
}

export default function InsightsCard({ insights }: { insights: Insight[] }) {
  if (insights.length === 0) return null;

  return (
    <div className="rounded-xl border border-border bg-card p-4 sm:p-5 animate-fade-up">
      <div className="flex items-center gap-2 mb-3">
        <Lightbulb className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold tracking-tight">Auto Insights</h2>
      </div>
      <ul className="space-y-2">
        {insights.map((ins, i) => (
          <li key={i} className="flex items-start gap-2 text-sm leading-relaxed">
            <span
              className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                ins.tone === 'positive'
                  ? 'bg-win'
                  : ins.tone === 'negative'
                  ? 'bg-loss'
                  : 'bg-muted-foreground'
              }`}
            />
            <span className="text-foreground/90">{ins.text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
