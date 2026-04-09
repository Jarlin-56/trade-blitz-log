import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import type { Database } from '@/integrations/supabase/types';

type TradeResult = Database['public']['Enums']['trade_result'];
type TradeDirection = Database['public']['Enums']['trade_direction'];

export default function TradeNew() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [asset, setAsset] = useState('');
  const [direction, setDirection] = useState<TradeDirection>('Long');
  const [entryDate, setEntryDate] = useState(() => new Date().toISOString().slice(0, 16));
  const [result, setResult] = useState<TradeResult | null>(null);
  const [earnedR, setEarnedR] = useState('');
  const [missedR, setMissedR] = useState('');
  const [selectedConditions, setSelectedConditions] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [recap, setRecap] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const { data: conditions = [] } = useQuery({
    queryKey: ['conditions', user?.id],
    queryFn: async () => {
      const { data } = await supabase.from('conditions').select('*').order('name');
      return data ?? [];
    },
    enabled: !!user,
  });

  const { data: tags = [] } = useQuery({
    queryKey: ['tags', user?.id],
    queryFn: async () => {
      const { data } = await supabase.from('tags').select('*').order('name');
      return data ?? [];
    },
    enabled: !!user,
  });

  const getEarnedRValue = (): number => {
    if (result === 'Loss') return -1;
    if (result === 'Break-even' || result === 'Missed' || result === 'Canceled') return 0;
    return parseFloat(earnedR) || 0;
  };

  const getMissedRValue = (): number => {
    if (result === 'Missed') return parseFloat(missedR) || 0;
    return 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !result || !asset) return;
    if (result === 'Win' && (!earnedR || parseFloat(earnedR) <= 0)) {
      toast.error('Please enter a positive R value for wins');
      return;
    }
    if (result === 'Missed' && (!missedR || parseFloat(missedR) <= 0)) {
      toast.error('Please enter a positive Missed R value');
      return;
    }

    setSubmitting(true);
    try {
      let imageUrl: string | null = null;
      if (imageFile) {
        const ext = imageFile.name.split('.').pop();
        const path = `${user.id}/${Date.now()}.${ext}`;
        const { error: uploadErr } = await supabase.storage.from('trade-images').upload(path, imageFile);
        if (uploadErr) throw uploadErr;
        const { data: urlData } = supabase.storage.from('trade-images').getPublicUrl(path);
        imageUrl = urlData.publicUrl;
      }

      const { data: trade, error } = await supabase
        .from('trades')
        .insert({
          user_id: user.id,
          asset: asset.toUpperCase(),
          direction,
          entry_date: new Date(entryDate).toISOString(),
          result,
          earned_r: getEarnedRValue(),
          missed_r: getMissedRValue(),
          recap_text: recap || null,
          image_url: imageUrl,
        })
        .select()
        .single();

      if (error) throw error;

      // Insert conditions
      if (selectedConditions.length > 0) {
        await supabase.from('trade_conditions').insert(
          selectedConditions.map(cid => ({ trade_id: trade.id, condition_id: cid }))
        );
      }

      // Insert tags
      if (selectedTags.length > 0) {
        await supabase.from('trade_tags').insert(
          selectedTags.map(tid => ({ trade_id: trade.id, tag_id: tid }))
        );
      }

      toast.success('Trade logged!');
      navigate('/trades');
    } catch (err: any) {
      toast.error(err.message || 'Failed to save trade');
    } finally {
      setSubmitting(false);
    }
  };

  const toggleCondition = (id: string) =>
    setSelectedConditions(prev => prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]);

  const toggleTag = (id: string) =>
    setSelectedTags(prev => prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]);

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">Log Trade</h1>

      {/* Trade Identity */}
      <Card>
        <CardHeader><CardTitle className="text-base">Trade Identity</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Date & Time</Label>
              <Input type="datetime-local" value={entryDate} onChange={e => setEntryDate(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>Asset</Label>
              <Input placeholder="e.g. XAUUSD" value={asset} onChange={e => setAsset(e.target.value)} required />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Direction</Label>
            <div className="flex gap-2">
              {(['Long', 'Short'] as TradeDirection[]).map(d => (
                <Button
                  key={d}
                  type="button"
                  variant={direction === d ? 'default' : 'outline'}
                  className={cn('flex-1', direction === d && d === 'Long' && 'bg-win hover:bg-win/90 text-primary-foreground', direction === d && d === 'Short' && 'bg-loss hover:bg-loss/90 text-white')}
                  onClick={() => setDirection(d)}
                >
                  {d}
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Outcome & R */}
      <Card>
        <CardHeader><CardTitle className="text-base">Outcome & R-Multiple</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Result</Label>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
              {([
                { v: 'Win' as TradeResult, color: 'bg-win hover:bg-win/90 text-primary-foreground' },
                { v: 'Loss' as TradeResult, color: 'bg-loss hover:bg-loss/90 text-white' },
                { v: 'Break-even' as TradeResult, color: 'bg-breakeven hover:bg-breakeven/90 text-primary-foreground' },
                { v: 'Missed' as TradeResult, color: 'bg-orange-500 hover:bg-orange-500/90 text-white' },
                { v: 'Canceled' as TradeResult, color: 'bg-muted hover:bg-muted/90 text-muted-foreground' },
              ]).map(({ v, color }) => (
                <Button
                  key={v}
                  type="button"
                  variant={result === v ? 'default' : 'outline'}
                  className={cn('text-sm', result === v && color)}
                  onClick={() => { setResult(v); if (v !== 'Win') setEarnedR(''); if (v !== 'Missed') setMissedR(''); }}
                >
                  {v}
                </Button>
              ))}
            </div>
          </div>

          {/* Earned R - shown for Win, Loss, Break-even */}
          {result && !['Missed', 'Canceled'].includes(result) && (
            <div className="space-y-2">
              <Label>Earned R</Label>
              {result === 'Loss' ? (
                <Input value="-1" disabled className="font-mono text-loss" />
              ) : result === 'Break-even' ? (
                <Input value="0" disabled className="font-mono text-breakeven" />
              ) : (
                <Input
                  type="number"
                  step="0.1"
                  min="0.1"
                  placeholder="e.g. 2.5"
                  value={earnedR}
                  onChange={e => setEarnedR(e.target.value)}
                  className="font-mono"
                  required={result === 'Win'}
                />
              )}
            </div>
          )}

          {/* Missed R - shown only for Missed */}
          {result === 'Missed' && (
            <div className="space-y-2">
              <Label>Missed R (Potential R)</Label>
              <Input
                type="number"
                step="0.1"
                min="0.1"
                placeholder="e.g. 3.0"
                value={missedR}
                onChange={e => setMissedR(e.target.value)}
                className="font-mono text-orange-400"
                required
              />
            </div>
          )}
          </div>
        </CardContent>
      </Card>

      {/* Conditions Checklist */}
      {conditions.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Conditions</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {conditions.map(c => (
                <label key={c.id} className="flex items-center gap-2 cursor-pointer">
                  <Checkbox checked={selectedConditions.includes(c.id)} onCheckedChange={() => toggleCondition(c.id)} />
                  <span className="text-sm">{c.name}</span>
                </label>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Review & Media */}
      <Card>
        <CardHeader><CardTitle className="text-base">Review & Media</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Trade Recap & Lessons</Label>
            <Textarea rows={5} placeholder="What did you learn from this trade?" value={recap} onChange={e => setRecap(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Chart Image</Label>
            <div
              className="border-2 border-dashed border-border rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => document.getElementById('chart-upload')?.click()}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) setImageFile(f); }}
            >
              {imageFile ? (
                <p className="text-sm text-foreground">{imageFile.name}</p>
              ) : (
                <p className="text-sm text-muted-foreground">Drag & drop or click to upload</p>
              )}
            </div>
            <input id="chart-upload" type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) setImageFile(f); }} />
          </div>

          {/* Tags */}
          {tags.length > 0 && (
            <div className="space-y-2">
              <Label>Tags</Label>
              <div className="flex flex-wrap gap-2">
                {tags.map(t => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => toggleTag(t.id)}
                    className={cn(
                      'px-3 py-1 rounded-full text-xs border transition-colors',
                      selectedTags.includes(t.id)
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'border-border text-muted-foreground hover:border-primary/50'
                    )}
                  >
                    #{t.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Button type="submit" className="w-full" size="lg" disabled={submitting || !result || !asset}>
        {submitting ? 'Saving…' : 'Save Trade'}
      </Button>
    </form>
  );
}
