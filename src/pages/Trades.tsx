import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Check, ChevronsUpDown, X } from 'lucide-react';
import DateRangeFilter, { type DateRangeValue } from '@/components/DateRangeFilter';

export default function Trades() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const filterResult = searchParams.get('result') || 'all';
  const [dateRange, setDateRange] = useState<DateRangeValue>(null);

  // Parse multi-value params from URL
  const selectedConditions = useMemo(() => {
    const raw = searchParams.get('conditions');
    return raw ? raw.split(',').filter(Boolean) : [];
  }, [searchParams]);

  const selectedTags = useMemo(() => {
    const raw = searchParams.get('tags');
    return raw ? raw.split(',').filter(Boolean) : [];
  }, [searchParams]);

  // Also support legacy single "condition" param from dashboard drill-down
  const legacyCondition = searchParams.get('condition') || '';

  const [conditionsOpen, setConditionsOpen] = useState(false);
  const [tagsOpen, setTagsOpen] = useState(false);

  // Fetch master lists
  const { data: allConditions = [] } = useQuery({
    queryKey: ['conditions', user?.id],
    queryFn: async () => {
      const { data } = await supabase.from('conditions').select('id, name').order('name');
      return data ?? [];
    },
    enabled: !!user,
  });

  const { data: allTags = [] } = useQuery({
    queryKey: ['tags', user?.id],
    queryFn: async () => {
      const { data } = await supabase.from('tags').select('id, name').order('name');
      return data ?? [];
    },
    enabled: !!user,
  });

  const { data: trades = [] } = useQuery({
    queryKey: ['trades', user?.id],
    queryFn: async () => {
      const { data } = await supabase.from('trades').select('*').order('entry_date', { ascending: false });
      return data ?? [];
    },
    enabled: !!user,
  });

  const { data: tradeConditions = [] } = useQuery({
    queryKey: ['trade-conditions-all', user?.id],
    queryFn: async () => {
      const { data } = await supabase.from('trade_conditions').select('trade_id, condition_id, conditions(name)');
      return data ?? [];
    },
    enabled: !!user,
  });

  const { data: tradeTags = [] } = useQuery({
    queryKey: ['trade-tags-all', user?.id],
    queryFn: async () => {
      const { data } = await supabase.from('trade_tags').select('trade_id, tag_id, tags(name)');
      return data ?? [];
    },
    enabled: !!user,
  });

  // Combine legacy + multi conditions for filtering
  const activeConditionNames = useMemo(() => {
    const set = new Set(selectedConditions);
    if (legacyCondition) set.add(legacyCondition);
    return Array.from(set);
  }, [selectedConditions, legacyCondition]);

  const updateParam = (key: string, values: string[]) => {
    const p = new URLSearchParams(searchParams);
    if (values.length === 0) {
      p.delete(key);
    } else {
      p.set(key, values.join(','));
    }
    if (key === 'conditions') p.delete('condition');
    setSearchParams(p);
  };

  const toggleCondition = (name: string) => {
    const next = activeConditionNames.includes(name)
      ? activeConditionNames.filter(c => c !== name)
      : [...activeConditionNames, name];
    updateParam('conditions', next);
  };

  const toggleTag = (name: string) => {
    const next = selectedTags.includes(name)
      ? selectedTags.filter(t => t !== name)
      : [...selectedTags, name];
    updateParam('tags', next);
  };

  const removeCondition = (name: string) => {
    updateParam('conditions', activeConditionNames.filter(c => c !== name));
  };

  const removeTag = (name: string) => {
    updateParam('tags', selectedTags.filter(t => t !== name));
  };

  // Filter trades
  const filtered = trades.filter(t => {
    // Date range filter
    if (dateRange) {
      const d = new Date(t.entry_date);
      if (d < dateRange.from || d > dateRange.to) return false;
    }
    if (filterResult !== 'all' && t.result !== filterResult) return false;
    if (activeConditionNames.length > 0) {
      const tradeCondNames = tradeConditions
        .filter((tc: any) => tc.trade_id === t.id)
        .map((tc: any) => tc.conditions?.name)
        .filter(Boolean);
      if (!activeConditionNames.every(c => tradeCondNames.includes(c))) return false;
    }
    if (selectedTags.length > 0) {
      const tradeTagNames = tradeTags
        .filter((tt: any) => tt.trade_id === t.id)
        .map((tt: any) => tt.tags?.name)
        .filter(Boolean);
      if (!selectedTags.every(tag => tradeTagNames.includes(tag))) return false;
    }
    return true;
  });

  const getConditions = (tradeId: string) =>
    tradeConditions.filter((tc: any) => tc.trade_id === tradeId).map((tc: any) => tc.conditions?.name).filter(Boolean);

  const getTags = (tradeId: string) =>
    tradeTags.filter((tt: any) => tt.trade_id === tradeId).map((tt: any) => tt.tags?.name).filter(Boolean);

  const resultColor = (r: string) => {
    if (r === 'Win') return 'text-win';
    if (r === 'Loss') return 'text-loss';
    if (r === 'Missed') return 'text-orange-400';
    if (r === 'Canceled') return 'text-muted-foreground';
    return 'text-breakeven';
  };

  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold">Trade History</h1>
        <DateRangeFilter value={dateRange} onChange={setDateRange} />
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap items-center">
        {/* Result filter */}
        <Select value={filterResult} onValueChange={v => { const p = new URLSearchParams(searchParams); p.set('result', v); setSearchParams(p); }}>
          <SelectTrigger className="w-[130px] h-9 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Results</SelectItem>
            <SelectItem value="Win">Win</SelectItem>
            <SelectItem value="Loss">Loss</SelectItem>
            <SelectItem value="Break-even">Break-even</SelectItem>
            <SelectItem value="Missed">Missed</SelectItem>
            <SelectItem value="Canceled">Canceled</SelectItem>
          </SelectContent>
        </Select>

        {/* Conditions multi-select */}
        <Popover open={conditionsOpen} onOpenChange={setConditionsOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-9 text-xs gap-1 font-normal">
              Conditions
              <ChevronsUpDown className="h-3 w-3 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[200px] p-0" align="start">
            <Command>
              <CommandInput placeholder="Search conditions..." className="h-8 text-xs" />
              <CommandList>
                <CommandEmpty className="text-xs py-3 text-center">No conditions found</CommandEmpty>
                <CommandGroup>
                  {allConditions.map((c: any) => (
                    <CommandItem key={c.id} value={c.name} onSelect={() => toggleCondition(c.name)} className="text-xs">
                      <Check className={cn('mr-2 h-3 w-3', activeConditionNames.includes(c.name) ? 'opacity-100' : 'opacity-0')} />
                      {c.name}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>

        {/* Tags multi-select */}
        <Popover open={tagsOpen} onOpenChange={setTagsOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-9 text-xs gap-1 font-normal">
              Tags
              <ChevronsUpDown className="h-3 w-3 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[200px] p-0" align="start">
            <Command>
              <CommandInput placeholder="Search tags..." className="h-8 text-xs" />
              <CommandList>
                <CommandEmpty className="text-xs py-3 text-center">No tags found</CommandEmpty>
                <CommandGroup>
                  {allTags.map((t: any) => (
                    <CommandItem key={t.id} value={t.name} onSelect={() => toggleTag(t.name)} className="text-xs">
                      <Check className={cn('mr-2 h-3 w-3', selectedTags.includes(t.name) ? 'opacity-100' : 'opacity-0')} />
                      #{t.name}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>

      {/* Active filter chips */}
      {(activeConditionNames.length > 0 || selectedTags.length > 0) && (
        <div className="flex gap-1.5 flex-wrap">
          {activeConditionNames.map(c => (
            <Badge key={c} variant="outline" className="gap-1 text-xs cursor-pointer" onClick={() => removeCondition(c)}>
              {c} <X className="h-3 w-3" />
            </Badge>
          ))}
          {selectedTags.map(t => (
            <Badge key={t} variant="secondary" className="gap-1 text-xs cursor-pointer" onClick={() => removeTag(t)}>
              #{t} <X className="h-3 w-3" />
            </Badge>
          ))}
        </div>
      )}

      {/* Trade list */}
      {filtered.length === 0 ? (
        <p className="text-muted-foreground text-center py-12">No trades found</p>
      ) : (
        <div className="space-y-2">
          {filtered.map(trade => (
            <Link to={`/trades/${trade.id}`} key={trade.id}>
              <Card className="hover:bg-accent/50 transition-colors cursor-pointer">
                <CardContent className="flex items-center justify-between py-3 px-4">
                  <div className="flex items-center gap-4">
                    <div>
                      <span className="font-mono font-semibold text-sm">{trade.asset}</span>
                      <span className={cn('ml-2 text-xs', trade.direction === 'Long' ? 'text-win' : 'text-loss')}>
                        {trade.direction}
                      </span>
                    </div>
                    <div className="hidden sm:flex gap-1">
                      {getConditions(trade.id).map((c: string) => (
                        <Badge key={c} variant="outline" className="text-xs">{c}</Badge>
                      ))}
                      {getTags(trade.id).map((t: string) => (
                        <Badge key={t} variant="secondary" className="text-xs">#{t}</Badge>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-sm">
                    <span className="text-muted-foreground text-xs">
                      {new Date(trade.entry_date).toLocaleDateString()}
                    </span>
                    <span className={cn('font-mono font-bold', resultColor(trade.result))}>
                      {Number(trade.earned_r) >= 0 ? '+' : ''}{Number(trade.earned_r).toFixed(1)}R
                    </span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
