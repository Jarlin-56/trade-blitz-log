import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useProfile } from '@/contexts/ProfileContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { X } from 'lucide-react';
import type { Database } from '@/integrations/supabase/types';
import StorageImage from '@/components/StorageImage';
import { getSignedUrl, uploadImage, removeStorageImages } from '@/lib/storage';
import type { MetricDef } from '@/lib/metrics';
import { validateMetricValue } from '@/lib/metric-validation';

type TradeResult = Database['public']['Enums']['trade_result'];
type TradeDirection = Database['public']['Enums']['trade_direction'];

const toLocalInput = (iso: string) => {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export default function TradeForm({ tradeId, asWidget, initialFile }: { tradeId?: string; asWidget?: boolean; initialFile?: File | null }) {
  const isEdit = !!tradeId;
  const { user } = useAuth();
  const { activeProfile } = useProfile();
  const navigate = useNavigate();
  const location = useLocation();
  const qc = useQueryClient();

  const prefill = (location.state as any)?.prefill as
    | { asset?: string; direction?: TradeDirection; note?: string; image_url?: string }
    | undefined;
  const quickNoteId = (location.state as any)?.quickNoteId as string | undefined;

  const [asset, setAsset] = useState(() => prefill?.asset || localStorage.getItem('lastTradingPair') || 'XAUUSD');
  const [direction, setDirection] = useState<TradeDirection>(prefill?.direction || 'Long');
  const [entryDate, setEntryDate] = useState(() => toLocalInput(new Date().toISOString()));
  const [result, setResult] = useState<TradeResult | null>(null);
  const [earnedR, setEarnedR] = useState('');
  const [missedR, setMissedR] = useState('');
  const [selectedConditions, setSelectedConditions] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [durationHours, setDurationHours] = useState('');
  const [durationMins, setDurationMins] = useState('');
  const [recap, setRecap] = useState(prefill?.note || '');
  const [metricValues, setMetricValues] = useState<Record<string, string>>({});
  const [imageFile, setImageFile] = useState<File | null>(initialFile ?? null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [existingImageUrl, setExistingImageUrl] = useState<string | null>(null);
  const [prefillImageUrl] = useState<string | null>(prefill?.image_url || null);
  const [submitting, setSubmitting] = useState(false);
  const [loaded, setLoaded] = useState(!isEdit);

  // Sync screenshot / file from widget hotkey captures after mount
  useEffect(() => {
    if (initialFile) setImageFile(initialFile);
  }, [initialFile]);

  useEffect(() => {
    if (!imageFile) {
      setImagePreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(imageFile);
    setImagePreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [imageFile]);

  // Turn a quick-note image into a File so it gets uploaded with the trade
  useEffect(() => {
    if (!prefillImageUrl) return;
    (async () => {
      try {
        const signed = await getSignedUrl(prefillImageUrl);
        if (!signed) return;
        const res = await fetch(signed);
        const blob = await res.blob();
        const ext = (blob.type.split('/')[1] || 'png').split('+')[0];
        setImageFile(new File([blob], `quicknote.${ext}`, { type: blob.type || 'image/png' }));
      } catch { /* ignore */ }
    })();
  }, [prefillImageUrl]);

  const { data: conditions = [] } = useQuery({
    queryKey: ['conditions', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('conditions').select('*').eq('user_id', user?.id ?? '').order('name');
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user,
  });

  const { data: tags = [] } = useQuery({
    queryKey: ['tags', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('tags').select('*').eq('user_id', user?.id ?? '').order('name');
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user,
  });

  const { data: customMetrics = [] } = useQuery({
    queryKey: ['trade-metrics', user?.id, activeProfile?.id],
    queryFn: async () => {
      if (!activeProfile) return [];
      const { data, error } = await supabase
        .from('trade_metrics')
        .select('*')
        .eq('user_id', user?.id ?? '')
        .eq('profile_id', activeProfile.id)
        .eq('is_active', true)
        .order('sort_order');
      if (error) throw error;
      return (data ?? []) as MetricDef[];
    },
    enabled: !!user && !!activeProfile,
  });

  // Load existing trade for edit mode
  useEffect(() => {
    if (!isEdit || !user) return;
    (async () => {
      const { data: trade, error } = await supabase.from('trades').select('*').eq('id', tradeId!).single();
      if (error || !trade) { toast.error('ไม่พบไม้นี้'); navigate('/trades'); return; }
      setAsset(trade.asset);
      setDirection(trade.direction);
      setEntryDate(toLocalInput(trade.entry_date));
      setResult(trade.result);
      setEarnedR(trade.result === 'Win' ? String(Number(trade.earned_r)) : '');
      setMissedR(trade.result === 'Missed' ? String(Number(trade.missed_r)) : '');
      setRecap(trade.recap_text ?? '');
      setExistingImageUrl(trade.image_url ?? null);
      if (trade.duration_minutes != null) {
        setDurationHours(String(Math.floor(trade.duration_minutes / 60) || ''));
        setDurationMins(String(trade.duration_minutes % 60 || ''));
      }
      const [{ data: tc }, { data: tt }, { data: tmv }] = await Promise.all([
        supabase.from('trade_conditions').select('condition_id').eq('trade_id', tradeId!),
        supabase.from('trade_tags').select('tag_id').eq('trade_id', tradeId!),
        supabase.from('trade_metric_values').select('metric_id, value').eq('trade_id', tradeId!),
      ]);
      setSelectedConditions((tc ?? []).map((r: any) => r.condition_id));
      setSelectedTags((tt ?? []).map((r: any) => r.tag_id));
      setMetricValues(
        Object.fromEntries((tmv ?? []).filter((r: any) => r.value != null).map((r: any) => [r.metric_id, String(Number(r.value))]))
      );
      setLoaded(true);
    })();
  }, [isEdit, tradeId, user, navigate]);

  const getEarnedRValue = (): number => {
    if (result === 'Loss') return -1;
    if (result === 'Break-even' || result === 'Missed' || result === 'Canceled') return 0;
    return parseFloat(earnedR) || 0;
  };

  const getMissedRValue = (): number => (result === 'Missed' ? parseFloat(missedR) || 0 : 0);

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
      let imageUrl: string | null = existingImageUrl;
      if (imageFile) {
        imageUrl = await uploadImage(imageFile, user.id, 'trades');
        // clean up the replaced image
        if (existingImageUrl && existingImageUrl !== imageUrl) {
          await removeStorageImages([existingImageUrl]);
        }
      }

      const payload = {
        asset: asset.toUpperCase(),
        direction,
        entry_date: new Date(entryDate).toISOString(),
        result,
        earned_r: getEarnedRValue(),
        missed_r: getMissedRValue(),
        duration_minutes:
          ['Win', 'Loss', 'Break-even'].includes(result) && (durationHours || durationMins)
            ? (parseInt(durationHours || '0') * 60 + parseInt(durationMins || '0')) || null
            : null,
        recap_text: recap || null,
        image_url: imageUrl,
      };

      let savedId = tradeId;

      if (isEdit) {
        const { error } = await supabase.from('trades').update(payload as any).eq('id', tradeId!);
        if (error) throw error;
        await supabase.from('trade_conditions').delete().eq('trade_id', tradeId!);
        await supabase.from('trade_tags').delete().eq('trade_id', tradeId!);
      } else {
        const { data: trade, error } = await supabase
          .from('trades')
          .insert({ ...payload, user_id: user.id, profile_id: activeProfile?.id ?? null } as any)
          .select()
          .single();
        if (error) throw error;
        savedId = trade.id;
      }

      if (selectedConditions.length > 0) {
        await supabase.from('trade_conditions').insert(
          selectedConditions.map(cid => ({ trade_id: savedId!, condition_id: cid }))
        );
      }
      if (selectedTags.length > 0) {
        await supabase.from('trade_tags').insert(
          selectedTags.map(tid => ({ trade_id: savedId!, tag_id: tid }))
        );
      }

      // Custom metric values — replace the full set for this trade
      await supabase.from('trade_metric_values').delete().eq('trade_id', savedId!);
      const metricRows = customMetrics
        .filter(m => metricValues[m.id] !== undefined && metricValues[m.id] !== '')
        .map(m => ({ user_id: user.id, trade_id: savedId!, metric_id: m.id, value: Number(metricValues[m.id]) }))
        .filter(r => Number.isFinite(r.value));
      if (metricRows.length > 0) {
        const { error: mvErr } = await supabase.from('trade_metric_values').insert(metricRows);
        if (mvErr) throw mvErr;
      }

      localStorage.setItem('lastTradingPair', asset.toUpperCase());
      if (quickNoteId) {
        await supabase.from('quick_notes' as any).update({ converted_trade_id: savedId }).eq('id', quickNoteId);
      }

      qc.invalidateQueries({ queryKey: ['trades'] });
      qc.invalidateQueries({ queryKey: ['trade', tradeId] });
      qc.invalidateQueries({ queryKey: ['trade-conditions'] });
      qc.invalidateQueries({ queryKey: ['trade-tags'] });
      qc.invalidateQueries({ queryKey: ['trade-conditions-all'] });
      qc.invalidateQueries({ queryKey: ['trade-tags-all'] });
      qc.invalidateQueries({ queryKey: ['trade-metric-values'] });

      toast.success(isEdit ? 'อัปเดตไม้แล้ว' : 'Trade logged!');
      if (asWidget) {
        window.electronAPI?.hideWindow();      } else {
        navigate(isEdit ? `/trades/${tradeId}` : '/trades');
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to save trade');
    } finally {
      setSubmitting(false);
    }
  };

  const toggleCondition = (id: string) =>
    setSelectedConditions(prev => (prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]));

  const toggleTag = (id: string) =>
    setSelectedTags(prev => (prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]));

  if (!loaded) return <p className="text-center text-muted-foreground py-12">Loading…</p>;


  return (
    <form onSubmit={handleSubmit} className={cn('max-w-2xl mx-auto space-y-6', asWidget && 'max-w-none pb-2')}>
      {!asWidget && (
        <h1 className="text-2xl font-bold">{isEdit ? 'Edit Trade' : 'Log Trade'}</h1>
      )}

      {asWidget && imagePreviewUrl && (
        <div className="rounded-lg overflow-hidden border border-primary/30 bg-primary/5">
          <div className="flex items-center justify-between px-3 py-1.5 border-b border-primary/20">
            <span className="text-xs font-medium text-primary">Screenshot attached</span>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-6 w-6"
              onClick={() => setImageFile(null)}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
          <img src={imagePreviewUrl} alt="Screenshot" className="w-full max-h-40 object-contain bg-black/40" />
        </div>
      )}

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
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">             {([
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
                  onClick={() => setResult(v)}
                >
                  {v}
                </Button>
              ))}
            </div>
          </div>

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

          {result && ['Win', 'Loss', 'Break-even'].includes(result) && (
            <div className="space-y-2">
              <Label>Duration</Label>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5">
                  <Input type="number" min="0" placeholder="0" value={durationHours} onChange={e => setDurationHours(e.target.value)} className="font-mono w-20" />
                  <span className="text-sm text-muted-foreground">h</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Input type="number" min="0" max="59" placeholder="0" value={durationMins} onChange={e => setDurationMins(e.target.value)} className="font-mono w-20" />
                  <span className="text-sm text-muted-foreground">m</span>
                </div>
              </div>
            </div>
          )}

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

      {/* Custom Metrics */}
      {customMetrics.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Metrics</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {customMetrics.map(m => (
                <div key={m.id} className="space-y-2">
                  <Label>
                    {m.name}
                    {m.unit ? <span className="text-muted-foreground font-normal"> ({m.unit})</span> : null}
                  </Label>
                  <Input
                    type="number"
                    step="any"
                    inputMode="decimal"
                    min={m.min_value ?? undefined}
                    max={m.max_value ?? undefined}
                    placeholder="-"
                    value={metricValues[m.id] ?? ''}
                    onChange={e => setMetricValues(prev => ({ ...prev, [m.id]: e.target.value }))}
                    className="font-mono"
                  />
                </div>
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
            {existingImageUrl && !imageFile && (
              <div className="relative rounded-lg overflow-hidden border border-border">
                <StorageImage source={existingImageUrl} alt="Current chart" className="w-full max-h-56 object-contain bg-black/40" />
                <Button
                  type="button" size="icon" variant="secondary"
                  className="absolute top-1.5 right-1.5 h-7 w-7"
                  onClick={() => setExistingImageUrl(null)}
                ><X className="h-3.5 w-3.5" /></Button>
              </div>
            )}
            {imagePreviewUrl ? (
              <div className="relative rounded-lg overflow-hidden border border-border">
                <img src={imagePreviewUrl} alt="Chart preview" className="w-full max-h-56 object-contain bg-black/40" />
                <Button
                  type="button" size="icon" variant="secondary"
                  className="absolute top-1.5 right-1.5 h-7 w-7"
                  onClick={() => setImageFile(null)}
                ><X className="h-3.5 w-3.5" /></Button>
              </div>
            ) : (
              <div
                className="border-2 border-dashed border-border rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
                onClick={() => document.getElementById('chart-upload')?.click()}
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) setImageFile(f); }}
              >
                <p className="text-sm text-muted-foreground">
                  {existingImageUrl ? 'Drag & drop or click to replace' : 'Drag & drop or click to upload'}
                </p>
                <input id="chart-upload" type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) setImageFile(f); }} />
              </div>
            )}
          </div>

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

      <div className="flex gap-2">
        {isEdit && (
          <Button type="button" variant="outline" className="flex-1" size="lg" onClick={() => navigate(`/trades/${tradeId}`)}>
            Cancel
          </Button>
        )}
        <Button type="submit" className="flex-1" size="lg" disabled={submitting || !result || !asset}>
          {submitting ? 'Saving…' : isEdit ? 'Save Changes' : 'Save Trade'}
        </Button>
      </div>
    </form>
  );
}
