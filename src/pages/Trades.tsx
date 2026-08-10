import { useState, useMemo, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useProfile } from '@/contexts/ProfileContext';
import { useFilters } from '@/contexts/FilterContext';
import { CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import { Check, ChevronsUpDown, X, Download, Upload, Search, Trash2, TagIcon, CheckSquare } from 'lucide-react';
import DateRangeFilter from '@/components/DateRangeFilter';
import EmptyState from '@/components/EmptyState';
import { downloadCsv } from '@/lib/csv';
import ImportTradesDialog from '@/components/ImportTradesDialog';
import { removeStorageImages } from '@/lib/storage';
import { useToast } from '@/hooks/use-toast';

const PAGE_SIZE = 25;

type SortKey = 'date-desc' | 'date-asc' | 'r-desc' | 'r-asc';

export default function Trades() {
  const { user } = useAuth();
  const { activeProfile } = useProfile();
  const { dateRange, setDateRange } = useFilters();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const filterResult = searchParams.get('result') || 'all';

  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortKey>('date-desc');
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [bulkTagOpen, setBulkTagOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

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
      const { data, error } = await supabase.from('conditions').select('id, name').eq('user_id', user?.id ?? '').order('name');
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user,
  });

  const { data: allTags = [] } = useQuery({
    queryKey: ['tags', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('tags').select('id, name').eq('user_id', user?.id ?? '').order('name');
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user,
  });

  const { data: customMetrics = [] } = useQuery({
    queryKey: ['trade-metrics', user?.id, activeProfile?.id],
    queryFn: async () => {
      if (!activeProfile) return [];
      const { data, error } = await supabase.from('trade_metrics').select('*')
        .eq('user_id', user?.id ?? '').eq('profile_id', activeProfile.id).order('sort_order');
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user && !!activeProfile,
  });

  const { data: metricValues = [] } = useQuery({
    queryKey: ['trade-metric-values', user?.id, activeProfile?.id],
    queryFn: async () => {
      if (!user || !activeProfile) return [];
      const { data: profileTrades, error: tradeError } = await supabase.from('trades').select('id')
        .eq('user_id', user.id).eq('profile_id', activeProfile.id);
      if (tradeError) throw tradeError;
      const ids = (profileTrades ?? []).map(t => t.id);
      if (ids.length === 0) return [];
      const { data, error } = await supabase.from('trade_metric_values').select('trade_id, metric_id, value').in('trade_id', ids).eq('user_id', user.id);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user && !!activeProfile,
  });

  const { data: trades = [] } = useQuery({
    queryKey: ['trades', user?.id, activeProfile?.id],
    queryFn: async () => {
      if (!user || !activeProfile) return [];
      const { data, error } = await supabase.from('trades').select('*')
        .eq('user_id', user.id).eq('profile_id', activeProfile.id).order('entry_date', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user && !!activeProfile,
  });

  const { data: tradeConditions = [] } = useQuery({
    queryKey: ['trade-conditions-all', user?.id, activeProfile?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('trade_conditions').select('trade_id, condition_id, conditions(name)');
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user && !!activeProfile,
  });

  const { data: tradeTags = [] } = useQuery({
    queryKey: ['trade-tags-all', user?.id, activeProfile?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('trade_tags').select('trade_id, tag_id, tags(name)');
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user && !!activeProfile,
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

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const list = trades.filter(t => {
      if (dateRange) {
        const d = new Date(t.entry_date);
        if (d < dateRange.from || d > dateRange.to) return false;
      }
      if (filterResult !== 'all' && t.result !== filterResult) return false;
      if (term) {
        const hay = `${t.asset} ${t.recap_text ?? ''}`.toLowerCase();
        if (!hay.includes(term)) return false;
      }
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

    const sorted = [...list].sort((a, b) => {
      switch (sort) {
        case 'date-asc': return +new Date(a.entry_date) - +new Date(b.entry_date);
        case 'r-desc': return Number(b.earned_r) - Number(a.earned_r);
        case 'r-asc': return Number(a.earned_r) - Number(b.earned_r);
        default: return +new Date(b.entry_date) - +new Date(a.entry_date);
      }
    });
    return sorted;
  }, [trades, dateRange, filterResult, search, activeConditionNames, selectedTags, tradeConditions, tradeTags, sort]);

  useEffect(() => { setVisible(PAGE_SIZE); }, [search, sort, filterResult, dateRange, activeConditionNames.length, selectedTags.length]);

  const paged = filtered.slice(0, visible);

  const getConditions = (tradeId: string) =>
    tradeConditions.filter((tc: any) => tc.trade_id === tradeId).map((tc: any) => tc.conditions?.name).filter(Boolean);

  const getTags = (tradeId: string) =>
    tradeTags.filter((tt: any) => tt.trade_id === tradeId).map((tt: any) => tt.tags?.name).filter(Boolean);

  const metricValueOf = (tradeId: string, metricId: string) => {
    const row = metricValues.find((v: any) => v.trade_id === tradeId && v.metric_id === metricId);
    return row?.value != null ? Number(row.value) : '';
  };

  const handleExport = () => {
    if (filtered.length === 0) return;
    downloadCsv(
      `trades-${new Date().toISOString().slice(0, 10)}.csv`,
      ['Date', 'Asset', 'Direction', 'Result', 'Earned R', 'Missed R', 'Duration (min)', 'Conditions', 'Tags', 'Recap', ...customMetrics.map((m: any) => m.unit ? `${m.name} (${m.unit})` : m.name)],
      filtered.map(t => [
        new Date(t.entry_date).toLocaleString(),
        t.asset,
        t.direction,
        t.result,
        Number(t.earned_r),
        Number(t.missed_r),
        t.duration_minutes ?? '',
        getConditions(t.id).join(' | '),
        getTags(t.id).join(' | '),
        t.recap_text ?? '',
        ...customMetrics.map((m: any) => metricValueOf(t.id, m.id)),
      ]),
    );
  };

  const toggleSelected = (id: string) =>
    setSelected(s => (s.includes(id) ? s.filter(x => x !== id) : [...s, id]));

  const exitSelectMode = () => { setSelectMode(false); setSelected([]); };

  const refreshAll = () => {
    queryClient.invalidateQueries({ queryKey: ['trades'] });
    queryClient.invalidateQueries({ queryKey: ['trade-tags-all'] });
    queryClient.invalidateQueries({ queryKey: ['trade-conditions-all'] });
  };

  const bulkDelete = async () => {
    if (!user || !activeProfile || selected.length === 0) return;
    setBusy(true);
    const { data: rows } = await supabase.from('trades').select('image_url')
      .eq('user_id', user.id).eq('profile_id', activeProfile.id).in('id', selected);
    const { error } = await supabase.from('trades').delete()
      .eq('user_id', user.id).eq('profile_id', activeProfile.id).in('id', selected);
    setBusy(false);
    setConfirmDelete(false);
    if (error) {
      toast({ title: 'ลบไม่สำเร็จ', description: error.message, variant: 'destructive' });
      return;
    }
    await removeStorageImages((rows ?? []).map((r: any) => r.image_url));
    toast({ title: `ลบ ${selected.length} ไม้แล้ว` });
    exitSelectMode();
    refreshAll();
  };

  const bulkAddTag = async (tagId: string, tagName: string) => {
    if (!user || !activeProfile) return;
    setBusy(true);
    const existing = new Set(
      tradeTags.filter((tt: any) => tt.tag_id === tagId).map((tt: any) => tt.trade_id),
    );
    const rows = selected.filter(id => !existing.has(id)).map(id => ({ trade_id: id, tag_id: tagId }));
    if (rows.length > 0) {
      const { error } = await supabase.from('trade_tags').insert(rows);
      if (error) {
        setBusy(false);
        toast({ title: 'เพิ่ม tag ไม่สำเร็จ', description: error.message, variant: 'destructive' });
        return;
      }
    }
    setBusy(false);
    setBulkTagOpen(false);
    toast({ title: `เพิ่ม #${tagName} ให้ ${rows.length} ไม้แล้ว` });
    exitSelectMode();
    refreshAll();
  };

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

  const renderCard = (trade: any, i: number) => {
    const conds = getConditions(trade.id);
    const tgs = getTags(trade.id);
    const isSelected = selected.includes(trade.id);
    const inner = (
      <div className={cn('trade-card', isSelected && 'ring-1 ring-primary/50')} style={{ animationDelay: `${Math.min(i, 15) * 30}ms` }}>
        <CardContent className="py-3 px-3 sm:px-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex items-center gap-2 flex-wrap">
              {selectMode && <Checkbox checked={isSelected} className="mr-0.5" />}
              <span className="font-mono font-semibold text-sm">{trade.asset}</span>
              <span className={cn('text-[10px] px-1.5 py-0.5 rounded-md font-medium', trade.direction === 'Long' ? 'bg-win/10 text-win' : 'bg-loss/10 text-loss')}>
                {trade.direction}
              </span>
            </div>
            <span className={cn('font-mono font-bold text-sm shrink-0', resultColor(trade.result))}>
              {Number(trade.earned_r) >= 0 ? '+' : ''}{Number(trade.earned_r).toFixed(1)}R
            </span>
          </div>

          {(conds.length > 0 || tgs.length > 0) && (
            <div className="flex gap-1 flex-wrap mt-2">
              {conds.map((c: string) => (
                <Badge key={c} variant="outline" className="text-[10px] border-white/10 rounded-md">{c}</Badge>
              ))}
              {tgs.map((t: string) => (
                <Badge key={t} variant="secondary" className="text-[10px] rounded-md">#{t}</Badge>
              ))}
            </div>
          )}

          <div className="flex items-center gap-3 mt-2 text-[10px] text-muted-foreground">
            <span>{new Date(trade.entry_date).toLocaleDateString()}</span>
            {trade.duration_minutes != null && <span>⏱️ {formatDuration(trade.duration_minutes)}</span>}
          </div>
        </CardContent>
      </div>
    );

    if (selectMode) {
      return (
        <div key={trade.id} role="button" tabIndex={0} onClick={() => toggleSelected(trade.id)}
          onKeyDown={e => { if (e.key === 'Enter') toggleSelected(trade.id); }} className="cursor-pointer">
          {inner}
        </div>
      );
    }
    return <Link to={`/trades/${trade.id}`} key={trade.id}>{inner}</Link>;
  };

  return (
    <div className="space-y-4 max-w-5xl mx-auto pb-20">
      <div className="flex items-center justify-between flex-wrap gap-3 animate-fade-up">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Trade History</h1>
          <p className="text-xs text-muted-foreground mt-0.5">All recorded trades</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <DateRangeFilter value={dateRange} onChange={setDateRange} />
          <Button
            variant="outline"
            size="sm"
            onClick={() => (selectMode ? exitSelectMode() : setSelectMode(true))}
            className="h-9 text-xs gap-1.5 rounded-lg border-white/10 bg-white/[0.03]"
          >
            <CheckSquare className="h-3.5 w-3.5" /> {selectMode ? 'Cancel' : 'Select'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            disabled={filtered.length === 0}
            className="h-9 text-xs gap-1.5 rounded-lg border-white/10 bg-white/[0.03]"
          >
            <Download className="h-3.5 w-3.5" /> Export CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setImportOpen(true)}
            className="h-9 text-xs gap-1.5 rounded-lg border-white/10 bg-white/[0.03]"
          >
            <Upload className="h-3.5 w-3.5" /> Import CSV
          </Button>
          <ImportTradesDialog open={importOpen} onOpenChange={setImportOpen} onImported={refreshAll} />
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="ค้นหา asset หรือข้อความใน recap..."
          className="pl-9 h-9 text-xs rounded-lg border-white/10 bg-white/[0.03]"
        />
        {search && (
          <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap items-center">
        <Select value={filterResult} onValueChange={v => { const p = new URLSearchParams(searchParams); p.set('result', v); setSearchParams(p); }}>
          <SelectTrigger className="flex-1 min-w-[120px] sm:flex-none sm:w-[130px] h-9 text-xs rounded-lg border-white/10 bg-white/[0.03]">
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

        <Select value={sort} onValueChange={v => setSort(v as SortKey)}>
          <SelectTrigger className="flex-1 min-w-[120px] sm:flex-none sm:w-[150px] h-9 text-xs rounded-lg border-white/10 bg-white/[0.03]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="date-desc">ล่าสุดก่อน</SelectItem>
            <SelectItem value="date-asc">เก่าสุดก่อน</SelectItem>
            <SelectItem value="r-desc">R มากสุด</SelectItem>
            <SelectItem value="r-asc">R น้อยสุด</SelectItem>
          </SelectContent>
        </Select>

        <Popover open={conditionsOpen} onOpenChange={setConditionsOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="flex-1 sm:flex-none h-9 text-xs gap-1 font-normal rounded-lg border-white/10 bg-white/[0.03]">
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
            <Button variant="outline" size="sm" className="flex-1 sm:flex-none h-9 text-xs gap-1 font-normal rounded-lg border-white/10 bg-white/[0.03]">
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
                <p className={cn('text-base sm:text-xl font-bold font-mono break-all', m.color)}>{m.value}</p>
                {m.sub && <p className="text-[9px] text-muted-foreground mt-1">{m.sub}</p>}
              </div>
            ))}
          </div>
        );
      })()}

      {/* Select-all bar */}
      {selectMode && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Button
            variant="ghost" size="sm" className="h-7 text-xs"
            onClick={() => setSelected(selected.length === paged.length ? [] : paged.map(t => t.id))}
          >
            {selected.length === paged.length && paged.length > 0 ? 'ยกเลิกทั้งหมด' : 'เลือกทั้งหมดที่แสดง'}
          </Button>
          <span>เลือกแล้ว {selected.length}</span>
        </div>
      )}

      {/* Trade list */}
      {trades.length === 0 ? (
        <EmptyState variant="trades" />
      ) : filtered.length === 0 ? (
        <p className="text-muted-foreground text-center py-12">No trades found</p>
      ) : (
        <>
          <div className="space-y-2">{paged.map(renderCard)}</div>
          {visible < filtered.length && (
            <Button
              variant="outline"
              onClick={() => setVisible(v => v + PAGE_SIZE)}
              className="w-full h-10 text-xs rounded-lg border-white/10 bg-white/[0.03]"
            >
              โหลดเพิ่ม ({filtered.length - visible} เหลือ)
            </Button>
          )}
        </>
      )}

      {/* Bulk action bar */}
      {selectMode && selected.length > 0 && (
        <div className="fixed inset-x-0 bottom-16 md:bottom-4 z-50 px-4">
          <div className="mx-auto max-w-md glass-card p-2 flex items-center gap-2">
            <span className="text-xs pl-2 flex-1">{selected.length} ไม้</span>
            <Popover open={bulkTagOpen} onOpenChange={setBulkTagOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" disabled={busy} className="h-8 text-xs gap-1.5 rounded-lg border-white/10 bg-white/[0.03]">
                  <TagIcon className="h-3.5 w-3.5" /> เพิ่ม Tag
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[200px] p-0" align="end">
                <Command>
                  <CommandInput placeholder="เลือก tag..." className="h-8 text-xs" />
                  <CommandList>
                    <CommandEmpty className="text-xs py-3 text-center">ยังไม่มี tag</CommandEmpty>
                    <CommandGroup>
                      {allTags.map((t: any) => (
                        <CommandItem key={t.id} value={t.name} onSelect={() => bulkAddTag(t.id, t.name)} className="text-xs">
                          #{t.name}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            <Button variant="destructive" size="sm" disabled={busy} onClick={() => setConfirmDelete(true)} className="h-8 text-xs gap-1.5 rounded-lg">
              <Trash2 className="h-3.5 w-3.5" /> ลบ
            </Button>
          </div>
        </div>
      )}

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent className="glass-card">
          <AlertDialogHeader>
            <AlertDialogTitle>ลบ {selected.length} ไม้?</AlertDialogTitle>
            <AlertDialogDescription>การลบไม่สามารถย้อนกลับได้</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
            <AlertDialogAction onClick={bulkDelete} disabled={busy}>ลบ</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
