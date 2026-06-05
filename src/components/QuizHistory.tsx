import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useProfile } from '@/contexts/ProfileContext';
import { cn } from '@/lib/utils';
import { Target, TrendingUp, AlertTriangle, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import EmptyState from '@/components/EmptyState';

type Row = { condition_name: string; guessed: boolean; actual: boolean };

type Stat = {
  name: string;
  actualCount: number;   // จริงๆ มี condition นี้กี่ครั้ง
  hits: number;          // จริงมี + เราเลือกถูก
  misses: number;        // จริงมี + เราพลาด
  falsePos: number;      // เราเลือกแต่จริงไม่มี
  recall: number;        // hits / actualCount (%)
};

export default function QuizHistory() {
  const { user } = useAuth();
  const { activeProfile } = useProfile();

  const queryClient = useQueryClient();
  const [showResetDialog, setShowResetDialog] = useState(false);

  const { data: rows = [] } = useQuery({
    queryKey: ['quiz-cond-stats', user?.id, activeProfile?.id],
    queryFn: async () => {
      let q = supabase
        .from('recap_quiz_condition_results')
        .select('condition_name, guessed, actual');
      if (activeProfile?.id) q = q.eq('profile_id', activeProfile.id);
      const { data } = await q;
      return (data ?? []) as Row[];
    },
    enabled: !!user && !!activeProfile,
  });

  const resetMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('กรุณาเข้าสู่ระบบก่อน');
      // ลบ condition_results ก่อน (FK reference)
      let condQ = supabase.from('recap_quiz_condition_results').delete();
      if (activeProfile?.id) condQ = condQ.eq('profile_id', activeProfile.id);
      else condQ = condQ.eq('user_id', user.id);
      const { error: condError } = await condQ;
      if (condError) throw condError;

      // ลบ attempts
      let attemptQ = supabase.from('recap_quiz_attempts').delete();
      if (activeProfile?.id) attemptQ = attemptQ.eq('profile_id', activeProfile.id);
      else attemptQ = attemptQ.eq('user_id', user.id);
      const { error: attemptError } = await attemptQ;
      if (attemptError) throw attemptError;
    },
    onSuccess: () => {
      queryClient.setQueryData(['quiz-cond-stats', user?.id, activeProfile?.id], []);
      queryClient.setQueryData(['quiz-stats', user?.id, activeProfile?.id], []);
      queryClient.invalidateQueries({ queryKey: ['quiz-cond-stats', user?.id, activeProfile?.id] });
      queryClient.invalidateQueries({ queryKey: ['quiz-stats', user?.id, activeProfile?.id] });
      setShowResetDialog(false);
    },
  });

  const stats = useMemo<Stat[]>(() => {
    const map = new Map<string, Stat>();
    for (const r of rows) {
      const s = map.get(r.condition_name) ?? {
        name: r.condition_name, actualCount: 0, hits: 0, misses: 0, falsePos: 0, recall: 0,
      };
      if (r.actual) {
        s.actualCount += 1;
        if (r.guessed) s.hits += 1; else s.misses += 1;
      } else if (r.guessed) {
        s.falsePos += 1;
      }
      map.set(r.condition_name, s);
    }
    const arr = Array.from(map.values()).map(s => ({
      ...s,
      recall: s.actualCount ? Math.round((s.hits / s.actualCount) * 100) : 0,
    }));
    // เรียงตามความแม่น (recall) มากไปน้อย
    return arr.sort((a, b) => b.recall - a.recall || b.actualCount - a.actualCount);
  }, [rows]);

  const best = useMemo(() => stats.filter(s => s.actualCount >= 1).slice(0, 1)[0], [stats]);
  const worst = useMemo(() => {
    const withData = stats.filter(s => s.actualCount >= 1);
    return withData.length ? withData[withData.length - 1] : undefined;
  }, [stats]);

  if (rows.length === 0) {
    return (
      <div className="glass-card rounded-2xl p-8 text-center space-y-2 animate-fade-up">
        <p className="text-sm text-muted-foreground">
          ยังไม่มีข้อมูล condition จาก Quiz
          <br />ลองเล่น Quiz แล้วเลือก condition ดูก่อนนะ
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fade-up">
      {/* Best / Worst highlight */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="metric-card p-4">
          <div className="flex items-center gap-1.5 mb-1.5">
            <TrendingUp className="h-4 w-4 text-win" />
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">แม่นสุด</span>
          </div>
          {best ? (
            <>
              <p className="font-bold text-win">{best.name}</p>
              <p className="text-xs text-muted-foreground mt-0.5 font-mono">{best.recall}% · {best.hits}/{best.actualCount} ครั้ง</p>
            </>
          ) : <p className="text-sm text-muted-foreground">—</p>}
        </div>
        <div className="metric-card p-4">
          <div className="flex items-center gap-1.5 mb-1.5">
            <AlertTriangle className="h-4 w-4 text-loss" />
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">พลาดบ่อยสุด</span>
          </div>
          {worst ? (
            <>
              <p className="font-bold text-loss">{worst.name}</p>
              <p className="text-xs text-muted-foreground mt-0.5 font-mono">พลาด {worst.misses} ครั้ง · แม่น {worst.recall}%</p>
            </>
          ) : <p className="text-sm text-muted-foreground">—</p>}
        </div>
      </div>

      {/* Per-condition table */}
      <div className="glass-card rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Target className="h-4 w-4 text-primary" />
            <p className="text-sm font-medium">ความแม่นแยกตาม Condition</p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowResetDialog(true)}
            className="text-loss hover:text-loss hover:bg-loss/10 gap-1"
          >
            <Trash2 className="h-3.5 w-3.5" />
            รีเซ็ตสถิติ
          </Button>
        </div>
        <div className="space-y-2.5">
          {stats.map((s) => (
            <div key={s.name} className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">{s.name}</span>
                <span className="font-mono text-xs text-muted-foreground">
                  {s.recall}% · {s.hits}/{s.actualCount}
                  {s.falsePos > 0 && <span className="text-amber-500"> · เกิน {s.falsePos}</span>}
                </span>
              </div>
              <div className="h-2 rounded-full bg-white/[0.05] overflow-hidden">
                <div
                  className={cn(
                    'h-full rounded-full transition-all',
                    s.recall >= 70 ? 'bg-win' : s.recall >= 40 ? 'bg-breakeven' : 'bg-loss',
                  )}
                  style={{ width: `${s.recall}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      <Dialog open={showResetDialog} onOpenChange={setShowResetDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>รีเซ็ตสถิติ Quiz</DialogTitle>
            <DialogDescription>
              การกระทำนี้จะลบประวัติ Quiz และสถิติ Condition ทั้งหมดของ Profile นี้
              <br />ข้อมูลจะไม่สามารถกู้คืนได้
            </DialogDescription>
          </DialogHeader>
          {resetMutation.isError && (
            <p className="text-sm text-loss">
              ลบไม่สำเร็จ: {(resetMutation.error as Error).message}
            </p>
          )}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setShowResetDialog(false)}>
              ยกเลิก
            </Button>
            <Button
              variant="destructive"
              onClick={() => resetMutation.mutate()}
              disabled={resetMutation.isPending}
            >
              {resetMutation.isPending ? 'กำลังลบ...' : 'ลบข้อมูล'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
