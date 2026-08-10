import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useProfile } from '@/contexts/ProfileContext';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Upload, FileWarning } from 'lucide-react';
import { toast } from 'sonner';
import { parseCsv } from '@/lib/csv';
import { useQuery } from '@tanstack/react-query';
import type { MetricDef } from '@/lib/metrics';
import { validateMetricValue } from '@/lib/metric-validation';

type ParsedTrade = {
  asset: string;
  direction: 'Long' | 'Short';
  result: 'Win' | 'Loss' | 'Break-even' | 'Missed' | 'Canceled';
  entry_date: string;
  earned_r: number;
  missed_r: number;
  duration_minutes: number | null;
  recap_text: string | null;
  metrics?: Record<string, number>;
};

const DIRECTIONS = ['Long', 'Short'] as const;
const RESULTS = ['Win', 'Loss', 'Break-even', 'Missed', 'Canceled'] as const;

const norm = (s: string) => s.trim().toLowerCase().replace(/[\s_-]+/g, '');

function findIdx(headers: string[], candidates: string[]) {
  const h = headers.map(norm);
  for (const c of candidates) {
    const i = h.indexOf(norm(c));
    if (i !== -1) return i;
  }
  return -1;
}

export default function ImportTradesDialog({
  open, onOpenChange, onImported,
}: { open: boolean; onOpenChange: (v: boolean) => void; onImported: () => void }) {
  const { user } = useAuth();
  const { activeProfile } = useProfile();
  const [rows, setRows] = useState<ParsedTrade[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);

  const { data: customMetrics = [] } = useQuery({
    queryKey: ['trade-metrics', user?.id, activeProfile?.id],
    queryFn: async () => {
      if (!user || !activeProfile) return [];
      const { data, error } = await supabase.from('trade_metrics').select('*')
        .eq('user_id', user.id).eq('profile_id', activeProfile.id).eq('is_active', true).order('sort_order');
      if (error) throw error;
      return (data ?? []) as MetricDef[];
    },
    enabled: !!user && !!activeProfile,
  });

  const reset = () => { setRows([]); setErrors([]); };

  const handleFile = async (file: File) => {
    reset();
    const table = parseCsv(await file.text());
    if (table.length < 2) { setErrors(['ไฟล์ว่างหรืออ่านไม่ได้']); return; }
    const headers = table[0];
    const idx = {
      date: findIdx(headers, ['Date', 'entry_date', 'วันที่', 'datetime']),
      asset: findIdx(headers, ['Asset', 'symbol', 'pair', 'สินทรัพย์']),
      direction: findIdx(headers, ['Direction', 'side', 'ทิศทาง']),
      result: findIdx(headers, ['Result', 'outcome', 'ผลลัพธ์']),
      earned: findIdx(headers, ['Earned R', 'R', 'earned_r']),
      missed: findIdx(headers, ['Missed R', 'missed_r']),
      duration: findIdx(headers, ['Duration (min)', 'duration_minutes', 'duration']),
      recap: findIdx(headers, ['Recap', 'recap_text', 'note', 'บันทึก']),
    };
    if (idx.asset === -1 || idx.result === -1) {
      setErrors(['ไม่พบคอลัมน์ที่จำเป็น: Asset และ Result']);
      return;
    }

    const metricIdx = customMetrics.map((m: any) => ({
      id: m.id,
      i: findIdx(headers, [m.unit ? `${m.name} (${m.unit})` : m.name, m.name]),
    })).filter(x => x.i !== -1);

    const parsed: ParsedTrade[] = [];
    const errs: string[] = [];
    table.slice(1).forEach((r, n) => {
      const line = n + 2;
      const asset = (r[idx.asset] ?? '').trim().toUpperCase();
      if (!asset) { errs.push(`บรรทัด ${line}: ไม่มี asset`); return; }

      const dirRaw = (r[idx.direction] ?? 'Long').trim().toLowerCase();
      const direction = DIRECTIONS.find(d => d.toLowerCase() === dirRaw) ?? (dirRaw === 'buy' ? 'Long' : dirRaw === 'sell' ? 'Short' : null);
      if (!direction) { errs.push(`บรรทัด ${line}: direction ไม่ถูกต้อง (${r[idx.direction]})`); return; }

      const resRaw = (r[idx.result] ?? '').trim().toLowerCase().replace(/\s+/g, '-');
      const result = RESULTS.find(x => x.toLowerCase() === resRaw || x.toLowerCase().replace('-', '') === resRaw.replace('-', ''));
      if (!result) { errs.push(`บรรทัด ${line}: result ไม่ถูกต้อง (${r[idx.result]})`); return; }

      const dateRaw = idx.date === -1 ? '' : (r[idx.date] ?? '').trim();
      const parsedDate = dateRaw ? new Date(dateRaw) : new Date();
      if (isNaN(parsedDate.getTime())) { errs.push(`บรรทัด ${line}: วันที่อ่านไม่ออก (${dateRaw})`); return; }

      const parseNumber = (i: number) => {
        if (i === -1 || (r[i] ?? '').trim() === '') return null;
        const raw = (r[i] ?? '').trim();
        const cleaned = raw.replace(/,/g, '').replace(/[^0-9.eE+-]/g, '');
        if (!cleaned) return Number.NaN;
        const value = Number(cleaned);
        return Number.isFinite(value) ? value : Number.NaN;
      };
      const earnedRaw = parseNumber(idx.earned);
      const missedRaw = parseNumber(idx.missed);
      if (Number.isNaN(earnedRaw) || Number.isNaN(missedRaw)) { errs.push(`บรรทัด ${line}: ค่า R ต้องเป็นตัวเลข`); return; }
      if (result === 'Win' && (earnedRaw == null || earnedRaw <= 0)) { errs.push(`บรรทัด ${line}: Win ต้องมี Earned R มากกว่า 0`); return; }
      if (result === 'Missed' && (missedRaw == null || missedRaw <= 0)) { errs.push(`บรรทัด ${line}: Missed ต้องมี Missed R มากกว่า 0`); return; }
      const durRaw = idx.duration === -1 ? '' : (r[idx.duration] ?? '').trim();
      const duration = durRaw ? Number(durRaw) : null;
      if (duration != null && (!Number.isInteger(duration) || duration < 0)) { errs.push(`บรรทัด ${line}: Duration ต้องเป็นจำนวนนาทีที่ไม่ติดลบ`); return; }

      const metrics: Record<string, number> = {};
      for (const { id, i } of metricIdx) {
        const metric = customMetrics.find(m => m.id === id);
        if (!metric) continue;
        const raw = (r[i] ?? '').trim();
        if (!raw) continue;
        const cleaned = raw.replace(/,/g, '').replace(/[^0-9.eE+-]/g, '');
        const validation = validateMetricValue(cleaned, metric);
        if (!cleaned || validation?.ok === false) {
          errs.push(`บรรทัด ${line}: ${validation?.ok === false ? validation.error : `${metric.name} ต้องเป็นตัวเลข`}`);
          return;
        }
        if (validation?.ok === true) metrics[id] = validation.value;
      }

      parsed.push({
        asset,
        direction,
        result,
        entry_date: parsedDate.toISOString(),
        earned_r: result === 'Loss' ? -1 : result === 'Win' ? earnedRaw ?? 0 : 0,
        missed_r: result === 'Missed' ? Math.abs(missedRaw ?? 0) : 0,
        duration_minutes: duration,
        recap_text: idx.recap === -1 ? null : (r[idx.recap] ?? '').trim() || null,
        metrics,
      });
    });

    setRows(parsed);
    setErrors(errs);
    if (parsed.length === 0 && errs.length === 0) setErrors(['ไม่พบข้อมูลที่นำเข้าได้']);
  };

  const doImport = async () => {
    if (!user || !activeProfile || rows.length === 0) return;
    setImporting(true);
    try {
      const payload = rows.map(({ metrics, ...r }) => ({ ...r, user_id: user.id, profile_id: activeProfile.id }));
      const { data: inserted, error } = await supabase.from('trades').insert(payload as any).select('id');
      if (error) throw error;
      if (!inserted || inserted.length !== rows.length) throw new Error('นำเข้าข้อมูลได้ไม่ครบทุกแถว');

      const mvRows = inserted.flatMap((t: any, i: number) =>
        Object.entries(rows[i]?.metrics ?? {}).map(([metric_id, value]) => ({
          user_id: user.id, trade_id: t.id, metric_id, value,
        }))
      );
      if (mvRows.length > 0) {
        const { error: metricError } = await supabase.from('trade_metric_values').insert(mvRows);
        if (metricError) throw metricError;
      }
      toast.success(`นำเข้า ${rows.length} ไม้แล้ว`);
      reset();
      onOpenChange(false);
      onImported();
    } catch (error: any) {
      toast.error(`นำเข้าไม่สำเร็จ: ${error.message}`);
    } finally {
      setImporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>นำเข้าไม้จากไฟล์ CSV</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            คอลัมน์ที่รองรับ: Date, Asset, Direction, Result, Earned R, Missed R, Duration (min), Recap
            <br />ไฟล์ที่ Export จากแอปนี้นำเข้ากลับได้ทันที
          </p>

          <label className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/15 bg-white/[0.02] py-6 cursor-pointer">
            <Upload className="h-5 w-5 text-primary" />
            <span className="text-xs text-muted-foreground">เลือกไฟล์ CSV</span>
            <input
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }}
            />
          </label>

          {errors.length > 0 && (
            <div className="rounded-lg border border-loss/30 bg-loss/5 p-2.5 text-xs text-loss space-y-1">
              <div className="flex items-center gap-1.5 font-medium"><FileWarning className="h-3.5 w-3.5" /> ข้ามไป {errors.length} บรรทัด</div>
              <ScrollArea className="max-h-24">
                {errors.slice(0, 20).map((e, i) => <div key={i}>{e}</div>)}
              </ScrollArea>
            </div>
          )}

          {rows.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-xs text-muted-foreground">พรีวิว {rows.length} ไม้ (เข้าโปรไฟล์ {activeProfile?.display_name ?? '-'})</div>
              <ScrollArea className="max-h-48 rounded-lg border border-white/10">
                <table className="w-full text-[11px]">
                  <tbody>
                    {rows.slice(0, 50).map((r, i) => (
                      <tr key={i} className="border-b border-white/5 last:border-0">
                        <td className="px-2 py-1 text-muted-foreground">{new Date(r.entry_date).toLocaleDateString('th-TH')}</td>
                        <td className="px-2 py-1 font-mono">{r.asset}</td>
                        <td className="px-2 py-1">{r.direction}</td>
                        <td className="px-2 py-1">{r.result}</td>
                        <td className="px-2 py-1 font-mono text-right">{r.earned_r}R</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ScrollArea>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>ยกเลิก</Button>
          <Button onClick={doImport} disabled={rows.length === 0 || importing}>
            {importing ? 'กำลังนำเข้า…' : `นำเข้า ${rows.length || ''} ไม้`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
