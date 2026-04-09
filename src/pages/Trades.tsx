import { useQuery } from '@tanstack/react-query';
import { useSearchParams, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';

export default function Trades() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const filterResult = searchParams.get('result') || 'all';
  const filterCondition = searchParams.get('condition') || '';

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

  const filtered = trades.filter(t => {
    if (filterResult !== 'all' && t.result !== filterResult) return false;
    if (filterCondition) {
      const hasCondition = tradeConditions.some(
        (tc: any) => tc.trade_id === t.id && tc.conditions?.name === filterCondition
      );
      if (!hasCondition) return false;
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
    return 'text-breakeven';
  };

  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Trade History</h1>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <Select value={filterResult} onValueChange={v => { const p = new URLSearchParams(searchParams); p.set('result', v); setSearchParams(p); }}>
          <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Results</SelectItem>
            <SelectItem value="Win">Win</SelectItem>
            <SelectItem value="Loss">Loss</SelectItem>
            <SelectItem value="Break-even">Break-even</SelectItem>
          </SelectContent>
        </Select>
        {filterCondition && (
          <Badge variant="secondary" className="gap-1 cursor-pointer" onClick={() => { const p = new URLSearchParams(searchParams); p.delete('condition'); setSearchParams(p); }}>
            {filterCondition} ✕
          </Badge>
        )}
      </div>

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
