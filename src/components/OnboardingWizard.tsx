import { errorMessage } from "@/lib/errors";
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useProfile } from '@/contexts/ProfileContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Check, Sparkles, X } from 'lucide-react';
import { toast } from 'sonner';

const PRESETS = [
  'Trend ตรงกับ HTF',
  'มี Liquidity Sweep',
  'BOS / CHoCH ยืนยัน',
  'เข้าที่โซน Premium/Discount',
  'มี Confluence อย่างน้อย 2 อย่าง',
  'ไม่ได้เทรดช่วงข่าวแรง',
  'RR อย่างน้อย 1:2',
];

export default function OnboardingWizard() {
  const { user } = useAuth();
  const { activeProfile, refreshProfiles } = useProfile();
  const qc = useQueryClient();
  const [step, setStep] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const [selected, setSelected] = useState<string[]>(PRESETS.slice(0, 5));
  const [custom, setCustom] = useState('');
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  const { data: conditions, isLoading } = useQuery({
    queryKey: ['conditions', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('conditions').select('*').eq('user_id', user?.id ?? '').order('name');
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user,
  });

  const open = !dismissed && !isLoading && !!user && (conditions?.length ?? 0) === 0;

  const toggle = (c: string) =>
    setSelected(s => (s.includes(c) ? s.filter(x => x !== c) : [...s, c]));

  const addCustom = () => {
    const v = custom.trim();
    if (!v) return;
    if (!selected.includes(v)) setSelected(s => [...s, v]);
    setCustom('');
  };

  const finish = async () => {
    if (!user) return;
    setSaving(true);
    try {
      if (selected.length) {
        const { error } = await supabase
          .from('conditions')
          .insert(selected.map(n => ({ name: n, user_id: user.id })));
        if (error) throw error;
      }
      const display = name.trim();
      if (display && activeProfile) {
        await supabase.from('profiles').update({ display_name: display }).eq('id', activeProfile.id);
        await refreshProfiles();
      }
      qc.invalidateQueries({ queryKey: ['conditions'] });
      toast.success('ตั้งค่าเริ่มต้นเรียบร้อย');
      setDismissed(true);
    } catch (e: unknown) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && setDismissed(true)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="text-left">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-primary" />
            ตั้งค่าเริ่มต้น ({step + 1}/2)
          </DialogTitle>
          <DialogDescription>
            {step === 0
              ? 'เลือก Checklist ที่คุณใช้ตัดสินใจเข้าไม้ (แก้ทีหลังได้ที่ Settings)'
              : 'ตั้งชื่อโปรไฟล์เทรดของคุณ'}
          </DialogDescription>
        </DialogHeader>

        {step === 0 ? (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {Array.from(new Set([...PRESETS, ...selected])).map(c => {
                const on = selected.includes(c);
                return (
                  <button
                    key={c}
                    onClick={() => toggle(c)}
                    className={`rounded-lg border px-2.5 py-1.5 text-xs transition-colors ${
                      on
                        ? 'border-primary/50 bg-primary/15 text-primary'
                        : 'border-white/10 text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <span className="flex items-center gap-1.5">
                      {on ? <Check className="h-3 w-3" /> : <X className="h-3 w-3 opacity-40" />}
                      {c}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="flex gap-2">
              <Input
                value={custom}
                onChange={e => setCustom(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addCustom())}
                placeholder="เพิ่มเงื่อนไขของคุณเอง"
                className="h-9"
              />
              <Button variant="outline" size="sm" onClick={addCustom}>เพิ่ม</Button>
            </div>
          </div>
        ) : (
          <Input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder={activeProfile?.display_name ?? 'เช่น Main Account'}
          />
        )}

        <div className="flex justify-between gap-2 pt-1">
          <Button variant="ghost" size="sm" onClick={() => setDismissed(true)}>ข้ามไปก่อน</Button>
          <div className="flex gap-2">
            {step === 1 && (
              <Button variant="outline" size="sm" onClick={() => setStep(0)}>ย้อนกลับ</Button>
            )}
            {step === 0 ? (
              <Button size="sm" onClick={() => setStep(1)} disabled={selected.length === 0}>
                ถัดไป
              </Button>
            ) : (
              <Button size="sm" onClick={finish} disabled={saving}>
                {saving ? 'กำลังบันทึก…' : 'เริ่มใช้งาน'}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
