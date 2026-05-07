import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useProfile } from '@/contexts/ProfileContext';
import { useFilters } from '@/contexts/FilterContext';
import { CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Check, ChevronsUpDown, X } from 'lucide-react';
import DateRangeFilter from '@/components/DateRangeFilter';
import EmptyState from '@/components/EmptyState';

export default function Trades() {
  const { user } = useAuth();
  const { activeProfile } = useProfile();
  const { dateRange, setDateRange } = useFilters();
  const [searchParams, setSearchParams] = useSearchParams();
  const filterResult = searchParams.get('result') || 'all';

  const selectedConditions = useMemo(() => {
    const raw = searchParams.get('conditions');
    return raw ? raw.split(',').filter(Boolean) : [];
  }, [searchParams]);

  const selectedTags = useMemo(() => {
    const raw = searchParams.get('tags');
    return raw ? raw.split(',').filter(Boolean) : [];
  }, [searchParams]);

  const legacyCondition = searchParams.get('condition') || '';

  const [conditionsOpen, setConditionsOpen] = useState(false);
  const [tagsOpen, setTagsOpen] = useState(false);

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
    queryKey: ['trades', user?.id, activeProfile?.id],
    queryFn: async () => {
      let q = supabase.from('trades').select('*').order('entry_date', { ascending: false });
      if (activeProfile?.id) q = q.eq('profile_id', activeProfile.id);
      const { data } = await q;
      return data ?? [];
    },
    enabled: !!user && !!activeProfile,
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

  const activeConditionNames = useMemo(() => {
    const set = new Set(selectedConditions);
    if (legacyCondition) set.add(legacyCondition);
    return Array.from(set);
  }, [selectedConditions, legacyCondition]);

  const updateParam = (key: string, values: string[]) => {
    const p = new URLSearchParams(searchParams);
    if (values.length === 0) { p.delete(key); } else { p.set(key, values.join(',')); }
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

  const removeCondition = (name: string) => updateParam('conditions', activeConditionNames.filter(c => c !== name));
  const removeTag = (name: string) => updateParam('tags', selectedTags.filter(t => t !== name));

  const filtered = trades.filter(t => {
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

  const formatDuration = (mins: number | null) => {
    if (mins == null) return null;
    if (mins < 60) return `${mins}m`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  };

  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3 animate-fade-up">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Trade History</h1>
          <p className="text-xs text-muted-foreground mt-0.5">All recorded trades</p>
        </div>
        <DateRangeFilter value={dateRange} onChange={setDateRange} />
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap items-center">
        <Select value={filterResult} onValueChange={v => { const p = new URLSearchParams(searchParams); p.set('result', v); setSearchParams(p); }}>
          <SelectTrigger className="w-[130px] h-9 text-xs rounded-lg border-white/10 bg-white/[0.03]">
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

        <Popover open={conditionsOpen} onOpenChange={setConditionsOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-9 text-xs gap-1 font-normal rounded-lg border-white/10 bg-white/[0.03]">
              Conditions <ChevronsUpDown className="h-3 w-3 opacity-50" />
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

        <Popover open={tagsOpen} onOpenChange={setTagsOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-9 text-xs gap-1 font-normal rounded-lg border-white/10 bg-white/[0.03]">
              Tags <ChevronsUpDown className="h-3 w-3 opacity-50" />
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
            <Badge key={c} variant="outline" className="gap-1 text-xs cursor-pointer rounded-lg border-primary/20 bg-primary/5 text-primary" onClick={() => removeCondition(c)}>
              {c} <X className="h-3 w-3" />
            </Badge>
          ))}
          {selectedTags.map(t => (
            <Badge key={t} variant="secondary" className="gap-1 text-xs cursor-pointer rounded-lg" onClick={() => removeTag(t)}>
              #{t} <X className="h-3 w-3" />
            </Badge>
          ))}
        </div>
      )}

      {/* Summary Stats */}
      {(() => {
        const executed = filtered.filter(t => !['Missed', 'Canceled'].includes(t.result));
        const canceledCount = filtered.filter(t => t.result === 'Canceled').length;
        const missedCount = filtered.filter(t => t.result === 'Missed').length;
        const totalR = executed.reduce((s, t) => s + Number(t.earned_r), 0);
        const wins = executed.filter(t => t.result === 'Win').length;
        const wr = executed.length > 0 ? ((wins / executed.length) * 100).toFixed(1) : '0';
        return (
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Trades', value: executed.length.toString(), sub: (canceledCount > 0 || missedCount > 0) ? `${missedCount > 0 ? `M:${missedCount}` : ''} ${canceledCount > 0 ? `C:${canceledCount}` : ''}`.trim() : undefined },
              { label: 'Win Rate', value: `${wr}%` },
              { label: 'Total R', value: `${totalR >= 0 ? '+' : ''}${totalR.toFixed(2)}R`, color: totalR >= 0 ? 'text-win' : 'text-loss' },
            ].map((m, i) => (
              <div key={i} className="metric-card p-3 text-center">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{m.label}</p>
                <p className={cn('text-xl font-bold font-mono', m.color)}>{m.value}</p>
                {m.sub && <p className="text-[9px] text-muted-foreground mt-1">{m.sub}</p>}
              </div>
            ))}
          </div>
        );
      })()}

      {/* Trade list */}
      {filtered.length === 0 ? (
        <p className="text-muted-foreground text-center py-12">No trades found</p>
      ) : (
        <div className="space-y-2">
          {filtered.map((trade, i) => (
            <Link to={`/trades/${trade.id}`} key={trade.id}>
              <div className="trade-card" style={{ animationDelay: `${i * 30}ms` }}>
                <CardContent className="flex items-center justify-between py-3 px-4">
                  <div className="flex items-center gap-3">
                    <div>
                      <span className="font-mono font-semibold text-sm">{trade.asset}</span>
                      <span className={cn('ml-2 text-[10px] px-1.5 py-0.5 rounded-md font-medium', trade.direction === 'Long' ? 'bg-win/10 text-win' : 'bg-loss/10 text-loss')}>
                        {trade.direction}
                      </span>
                    </div>
                    <div className="hidden sm:flex gap-1">
                      {getConditions(trade.id).map((c: string) => (
                        <Badge key={c} variant="outline" className="text-[10px] border-white/10 rounded-md">{c}</Badge>
                      ))}
                      {getTags(trade.id).map((t: string) => (
                        <Badge key={t} variant="secondary" className="text-[10px] rounded-md">#{t}</Badge>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    {trade.duration_minutes != null && (
                      <span className="text-muted-foreground text-[10px]">⏱️ {formatDuration(trade.duration_minutes)}</span>
                    )}
                    <span className="text-muted-foreground text-[10px]">
                      {new Date(trade.entry_date).toLocaleDateString()}
                    </span>
                    <span className={cn('font-mono font-bold text-sm', resultColor(trade.result))}>
                      {Number(trade.earned_r) >= 0 ? '+' : ''}{Number(trade.earned_r).toFixed(1)}R
                    </span>
                  </div>
                </CardContent>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
