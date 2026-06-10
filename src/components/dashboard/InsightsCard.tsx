import React from 'react';
import { Lightbulb } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

export interface Insight {
  text: string;
  tone: 'positive' | 'negative' | 'neutral';
}

export default function InsightsCard({
  insights,
  open,
  onOpenChange,
  children,
}: {
  insights: Insight[];
  open: boolean;
  onOpenChange: (v: boolean) => void;
  children?: React.ReactNode;
}) {
  if (insights.length === 0) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {children && <DialogTrigger asChild>{children}</DialogTrigger>}
      <DialogContent className="sm:max-w-md gap-0 p-0 overflow-hidden">
        <DialogHeader className="p-4 pb-0 text-left">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Lightbulb className="h-4 w-4 text-primary" />
            Auto Insights
          </DialogTitle>
        </DialogHeader>
        <div className="p-4 pt-3 max-h-[70vh] overflow-y-auto">
          <ul className="space-y-2.5">
            {insights.map((ins, i) => (
              <li key={i} className="flex items-start gap-2.5 text-sm leading-relaxed">
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
      </DialogContent>
    </Dialog>
  );
}
