import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Check, ChevronsUpDown, X, FlaskConical } from 'lucide-react';

interface Trade {
  id: string;
  result: string;
  earned_r: number;
  entry_date: string;
}

interface TradeCondition {
  trade_id: string;
  condition_id: string;
  conditions: { name: string } | null;
}

interface Props {
  trades: Trade[];
  tradeConditions: TradeCondition[];
}

export default function SetupAnalyzer({ trades, tradeConditions }: Props) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);

  const { data: allConditions = [] } = useQuery({
    queryKey: ['conditions', user?.id],
    queryFn: async () => {
      const { data } = await supabase.from('conditions').select('id, name').order('name');
      return data ?? [];
    },
    enabled: !!user,
  });

  const toggle = (name: string) => {
    setSelected(prev => prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]);
  };

  const remove = (name: string) => setSelected(prev => prev.filter(n => n !== name));

  // Build map: trade_id -> condition names
  const tradeCondMap = useMemo(() => {
    const map = new Map<string, Set<string>>();
    tradeConditions.forEach((tc: any) => {
      const name = tc.conditions?.name;
      if (!name) return;
      if (!map.has(tc.trade_id)) map.set(tc.trade_id, new Set());
      map.get(tc.trade_id)!.add(name);
    });
    return map;
  }, [tradeConditions]);

  // Filter trades that have AT LEAST all selected conditions
  const matchedTrades = useMemo(() => {
    if (selected.length === 0) return [];
    return trades.filter(t => {
      if (['Missed', 'Canceled'].includes(t.result)) return false;
      const conds = tradeCondMap.get(t.id);
      if (!conds) return false;
      return selected.every(s => conds.has(s));
    });
  }, [trades, selected, tradeCondMap]);

  const totalTrades = matchedTrades.length;
  const wins = matchedTrades.filter(t => t.result === 'Win').length;
  const winRate = totalTrades > 0 ? ((wins / totalTrades) * 100).toFixed(1) : '0';
  const totalR = matchedTrades.reduce((s, t) => s + Number(t.earned_r), 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FlaskConical className="h-5 w-5 text-primary" />
          Setup Analyzer
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Multi-select combobox */}
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="w-full justify-between h-9 text-xs font-normal">
              {selected.length > 0 ? `${selected.length} selected` : 'Select conditions to analyze...'}
              <ChevronsUpDown className="h-3.5 w-3.5 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[280px] p-0" align="start">
            <Command>
              <CommandInput placeholder="Search conditions..." className="h-8 text-xs" />
              <CommandList>
                <CommandEmpty>No conditions found.</CommandEmpty>
                <CommandGroup>
                  {allConditions.map(c => (
                    <CommandItem key={c.id} onSelect={() => toggle(c.name)} className="text-xs">
                      <Check className={cn('mr-2 h-3.5 w-3.5', selected.includes(c.name) ? 'opacity-100' : 'opacity-0')} />
                      {c.name}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>

        {/* Active chips */}
        {selected.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {selected.map(name => (
              <Badge key={name} variant="secondary" className="text-xs gap-1 pr-1">
                {name}
                <button onClick={() => remove(name)} className="ml-0.5 hover:text-destructive">
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}

        {/* Results */}
        {selected.length === 0 ? (
          <p className="text-muted-foreground text-sm text-center py-4">เลือก Conditions เพื่อวิเคราะห์ Setup</p>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg border p-3 text-center">
              <p className="text-[11px] text-muted-foreground mb-1">Trades</p>
              <p className="text-xl font-bold font-mono">{totalTrades}</p>
            </div>
            <div className="rounded-lg border p-3 text-center">
              <p className="text-[11px] text-muted-foreground mb-1">Win Rate</p>
              <p className="text-xl font-bold font-mono">{winRate}%</p>
            </div>
            <div className="rounded-lg border p-3 text-center">
              <p className="text-[11px] text-muted-foreground mb-1">Total R</p>
              <p className={cn('text-xl font-bold font-mono', totalR >= 0 ? 'text-win' : 'text-loss')}>
                {totalR >= 0 ? '+' : ''}{totalR.toFixed(2)}
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
