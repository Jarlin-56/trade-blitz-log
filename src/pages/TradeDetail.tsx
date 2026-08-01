import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Trash2, ArrowLeft, Pencil } from 'lucide-react';
import StorageImage from '@/components/StorageImage';
import { removeStorageImages } from '@/lib/storage';

export default function TradeDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();

  const { data: trade } = useQuery({
    queryKey: ['trade', id],
    queryFn: async () => {
      const { data } = await supabase.from('trades').select('*').eq('id', id!).single();
      return data;
    },
    enabled: !!id && !!user,
  });

  const { data: conditions = [] } = useQuery({
    queryKey: ['trade-conditions', id],
    queryFn: async () => {
      const { data } = await supabase.from('trade_conditions').select('conditions(name)').eq('trade_id', id!);
      return data?.map((d: any) => d.conditions?.name).filter(Boolean) ?? [];
    },
    enabled: !!id,
  });

  const { data: tags = [] } = useQuery({
    queryKey: ['trade-tags', id],
    queryFn: async () => {
      const { data } = await supabase.from('trade_tags').select('tags(name)').eq('trade_id', id!);
      return data?.map((d: any) => d.tags?.name).filter(Boolean) ?? [];
    },
    enabled: !!id,
  });

  const handleDelete = async () => {
    if (!confirm('Delete this trade?')) return;
    const { error } = await supabase.from('trades').delete().eq('id', id!);
    if (error) toast.error(error.message);
    else { toast.success('Trade deleted'); navigate('/trades'); }
  };

  if (!trade) return <p className="text-center text-muted-foreground py-12">Loading…</p>;

  const resultColor = trade.result === 'Win' ? 'text-win' : trade.result === 'Loss' ? 'text-loss' : 'text-breakeven';

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => navigate('/trades')} className="gap-1">
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => navigate(`/trades/${id}/edit`)} className="gap-1">
            <Pencil className="h-4 w-4" /> Edit
          </Button>
          <Button variant="destructive" size="sm" onClick={handleDelete} className="gap-1">
            <Trash2 className="h-4 w-4" /> Delete
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="font-mono text-xl">{trade.asset}</CardTitle>
            <span className={cn('text-2xl font-bold font-mono', resultColor)}>
              {Number(trade.earned_r) >= 0 ? '+' : ''}{Number(trade.earned_r).toFixed(1)}R
            </span>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Direction</span>
              <p className={cn('font-semibold', trade.direction === 'Long' ? 'text-win' : 'text-loss')}>{trade.direction}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Result</span>
              <p className={cn('font-semibold', resultColor)}>{trade.result}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Date</span>
              <p>{new Date(trade.entry_date).toLocaleString()}</p>
            </div>
            {trade.duration_minutes != null && (
              <div>
                <span className="text-muted-foreground">Duration</span>
                <p>⏱️ {trade.duration_minutes < 60 ? `${trade.duration_minutes}m` : `${Math.floor(trade.duration_minutes / 60)}h ${trade.duration_minutes % 60 > 0 ? `${trade.duration_minutes % 60}m` : ''}`}</p>
              </div>
            )}
          </div>

          {conditions.length > 0 && (
            <div>
              <span className="text-sm text-muted-foreground">Conditions</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {conditions.map((c: string) => <Badge key={c} variant="outline">{c}</Badge>)}
              </div>
            </div>
          )}

          {tags.length > 0 && (
            <div>
              <span className="text-sm text-muted-foreground">Tags</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {tags.map((t: string) => <Badge key={t} variant="secondary">#{t}</Badge>)}
              </div>
            </div>
          )}

          {trade.recap_text && (
            <div>
              <span className="text-sm text-muted-foreground">Recap</span>
              <p className="mt-1 text-sm whitespace-pre-wrap">{trade.recap_text}</p>
            </div>
          )}

          {trade.image_url && (
            <div>
              <span className="text-sm text-muted-foreground">Chart</span>
              <StorageImage source={trade.image_url} alt="Trade chart" className="mt-2 rounded-lg w-full" />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
