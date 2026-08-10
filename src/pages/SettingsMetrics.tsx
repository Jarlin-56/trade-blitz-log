import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useProfile } from '@/contexts/ProfileContext';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { Trash2, Plus, ArrowUp, ArrowDown } from 'lucide-react';
import { validateMetricDefinition } from '@/lib/metric-validation';

export interface TradeMetric {
  id: string;
  name: string;
  unit: string | null;
  decimals: number;
  min_value: number | null;
  max_value: number | null;
  sort_order: number;
  is_active: boolean;
}

export default function SettingsMetrics() {
  const { user } = useAuth();
  const { activeProfile } = useProfile();
  const qc = useQueryClient();

  const [name, setName] = useState('');
  const [unit, setUnit] = useState('');
  const [decimals, setDecimals] = useState('2');
  const [minValue, setMinValue] = useState('');
  const [maxValue, setMaxValue] = useState('');

  const { data: metrics = [] } = useQuery({
    queryKey: ['trade-metrics', user?.id, activeProfile?.id],
    queryFn: async () => {
      if (!user || !activeProfile) return [];
      const { data, error } = await supabase.from('trade_metrics').select('*')
        .eq('user_id', user.id).eq('profile_id', activeProfile.id).order('sort_order').order('created_at');
      if (error) throw error;
      return (data ?? []) as TradeMetric[];
    },
    enabled: !!user && !!activeProfile,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['trade-metrics'] });
    qc.invalidateQueries({ queryKey: ['trade-metric-values'] });
  };

  const addMutation = useMutation({
    mutationFn: async () => {
      if (!user || !activeProfile) throw new Error('กรุณาเลือกโปรไฟล์ก่อนเพิ่มฟิลด์');
      const validationError = validateMetricDefinition({ name, decimals, minValue, maxValue });
      if (validationError) throw new Error(validationError);
      const normalizedName = name.trim().toLowerCase();
      if (metrics.some(metric => metric.name.trim().toLowerCase() === normalizedName)) {
        throw new Error('มีชื่อฟิลด์นี้ในโปรไฟล์แล้ว');
      }
      const { error } = await supabase.from('trade_metrics').insert({
        user_id: user.id,
        profile_id: activeProfile.id,
        name: name.trim(),
        unit: unit.trim() || null,
        decimals: Number(decimals),
        min_value: minValue === '' ? null : Number(minValue),
        max_value: maxValue === '' ? null : Number(maxValue),
        sort_order: metrics.length,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      setName(''); setUnit(''); setDecimals('2'); setMinValue(''); setMaxValue('');
      toast.success('เพิ่มฟิลด์แล้ว');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<TradeMetric> }) => {
      if (!user || !activeProfile) throw new Error('กรุณาเลือกโปรไฟล์ก่อน');
      const { error } = await supabase.from('trade_metrics').update(patch as any)
        .eq('id', id).eq('user_id', user.id).eq('profile_id', activeProfile.id);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!user || !activeProfile) throw new Error('กรุณาเลือกโปรไฟล์ก่อน');
      const { error } = await supabase.from('trade_metrics').delete()
        .eq('id', id).eq('user_id', user.id).eq('profile_id', activeProfile.id);
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); toast.success('ลบแล้ว'); },
    onError: (e: any) => toast.error(e.message),
  });

  const move = async (index: number, dir: -1 | 1) => {
    if (!user || !activeProfile) return;
    const target = index + dir;
    if (target < 0 || target >= metrics.length) return;
    const a = metrics[index];
    const b = metrics[target];
    const filters = (id: string) => supabase.from('trade_metrics').update({ sort_order: id === a.id ? target : index } as any)
      .eq('id', id).eq('user_id', user.id).eq('profile_id', activeProfile.id);
    const results = await Promise.all([filters(a.id), filters(b.id)]);
    const failed = results.find(result => result.error);
    if (failed?.error) { toast.error(failed.error.message); return; }
    invalidate();
  };

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        สร้างฟิลด์ตัวเลขของคุณเอง เช่น Fibo level หรือจำนวนจุดที่ราคาวิ่ง เพื่อกรอกตอนบันทึกไม้ แล้วนำไปหาค่าเฉลี่ยใน Dashboard
      </p>

      <form
        onSubmit={e => { e.preventDefault(); addMutation.mutate(); }}
        className="space-y-3 rounded-lg border border-border p-4"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>ชื่อฟิลด์</Label>
            <Input placeholder="เช่น Fibo, Points" value={name} onChange={e => setName(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label>หน่วย (ไม่บังคับ)</Label>
            <Input placeholder="pts, %, R" value={unit} onChange={e => setUnit(e.target.value)} />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label>ทศนิยม</Label>
            <Input type="number" min="0" max="6" inputMode="numeric" value={decimals} onChange={e => setDecimals(e.target.value)} className="font-mono" />
          </div>
          <div className="space-y-1.5">
            <Label>ต่ำสุด</Label>
            <Input type="number" step="any" inputMode="decimal" placeholder="-" value={minValue} onChange={e => setMinValue(e.target.value)} className="font-mono" />
          </div>
          <div className="space-y-1.5">
            <Label>สูงสุด</Label>
            <Input type="number" step="any" inputMode="decimal" placeholder="-" value={maxValue} onChange={e => setMaxValue(e.target.value)} className="font-mono" />
          </div>
        </div>
        <Button type="submit" size="sm" className="gap-1"><Plus className="h-4 w-4" /> Add metric</Button>
      </form>

      <div className="space-y-1">
        {metrics.map((m, i) => (
          <div key={m.id} className="flex items-center gap-3 py-2 px-3 rounded-md hover:bg-accent/50">
            <div className="flex flex-col">
              <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="text-muted-foreground hover:text-foreground disabled:opacity-30">
                <ArrowUp className="h-3.5 w-3.5" />
              </button>
              <button type="button" onClick={() => move(i, 1)} disabled={i === metrics.length - 1} className="text-muted-foreground hover:text-foreground disabled:opacity-30">
                <ArrowDown className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm truncate">{m.name}{m.unit ? <span className="text-muted-foreground"> ({m.unit})</span> : null}</p>
              <p className="text-xs text-muted-foreground font-mono">
                {m.decimals} dp
                {m.min_value != null || m.max_value != null ? ` · ${m.min_value ?? '-'} → ${m.max_value ?? '-'}` : ''}
              </p>
            </div>
            <Switch
              checked={m.is_active}
              onCheckedChange={v => updateMutation.mutate({ id: m.id, patch: { is_active: v } })}
            />
            <button onClick={() => deleteMutation.mutate(m.id)} className="text-muted-foreground hover:text-loss transition-colors">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
        {metrics.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">ยังไม่มีฟิลด์ตัวเลข</p>}
      </div>
    </div>
  );
}
