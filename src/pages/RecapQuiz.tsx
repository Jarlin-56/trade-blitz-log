import { useState, useMemo, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useProfile } from '@/contexts/ProfileContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  Brain, Calendar, Clock, TrendingUp, TrendingDown, Check, X,
  ArrowRight, RotateCcw, Target, Trophy,
} from 'lucide-react';
import EmptyState from '@/components/EmptyState';

type Trade = {
  id: string;
  asset: string;
  direction: 'Long' | 'Short';
  entry_date: string;
  result: string;
  earned_r: number;
  missed_r: number;
  recap_text: string | null;
  image_url: string | null;
};

type Phase = 'idle' | 'answering' | 'revealed';

const EXECUTED = ['Win', 'Loss', 'Break-even'];

export default function RecapQuiz() {
  const { user } = useAuth();
  const { activeProfile } = useProfile();
  const queryClient = useQueryClient();

  const [phase, setPhase] = useState<Phase>('idle');
  const [current, setCurrent] = useState<Trade | null>(null);
  const [seenIds, setSeenIds] = useState<string[]>([]);
  const [guessEnter, setGuessEnter] = useState<boolean | null>(null);
  const [guessDir, setGuessDir] = useState<'Long' | 'Short' | null>(null);
  const [guessConds, setGuessConds] = useState<string[]>([]);
  const [tradeConds, setTradeConds] = useState<string[]>([]);

  const { data: allConditions = [] } = useQuery({
    queryKey: ['quiz-conditions', user?.id],
    queryFn: async () => {
      const { data } = await supabase.from('conditions').select('id, name').order('name');
      return (data ?? []) as { id: string; name: string }[];
    },
    enabled: !!user,
  });

  const { data: trades = [] } = useQuery({
    queryKey: ['quiz-trades', user?.id, activeProfile?.id],
    queryFn: async () => {
      let q = supabase
        .from('trades')
        .select('id, asset, direction, entry_date, result, earned_r, missed_r, recap_text, image_url');
      if (activeProfile?.id) q = q.eq('profile_id', activeProfile.id);
      const { data } = await q;
      return (data ?? []) as Trade[];
    },
    enabled: !!user && !!activeProfile,
  });

  const { data: stats = [] } = useQuery({
    queryKey: ['quiz-stats', user?.id, activeProfile?.id],
    queryFn: async () => {
      let q = supabase.from('recap_quiz_attempts').select('direction_correct, enter_correct, score');
      if (activeProfile?.id) q = q.eq('profile_id', activeProfile.id);
      const { data } = await q;
      return data ?? [];
    },
    enabled: !!user && !!activeProfile,
  });

  const eligible = useMemo(() => trades.filter(t => EXECUTED.includes(t.result)), [trades]);

  const summary = useMemo(() => {
    const total = stats.length;
    const dirCorrect = stats.filter((s: any) => s.direction_correct).length;
    const enterCorrect = stats.filter((s: any) => s.enter_correct).length;
    const totalScore = stats.reduce((s: number, a: any) => s + (a.score ?? 0), 0);
    return {
      total,
      dirAcc: total ? Math.round((dirCorrect / total) * 100) : 0,
      enterAcc: total ? Math.round((enterCorrect / total) * 100) : 0,
      totalScore,
    };
  }, [stats]);

  const pickNext = useCallback(() => {
    const pool = eligible.filter(t => !seenIds.includes(t.id));
    const source = pool.length > 0 ? pool : eligible;
    if (source.length === 0) return;
    const next = source[Math.floor(Math.random() * source.length)];
    if (pool.length === 0) setSeenIds([next.id]);
    else setSeenIds(prev => [...prev, next.id]);
    setCurrent(next);
    setGuessEnter(null);
    setGuessDir(null);
    setGuessConds([]);
    setTradeConds([]);
    setPhase('answering');
  }, [eligible, seenIds]);

  const reveal = async () => {
    if (!current || !user || guessEnter === null) return;
    const dirCorrect = guessEnter === true && guessDir === current.direction;
    // "เข้า" ถูก = ไม้นี้ผลเป็น Win/Break-even ถือว่าน่าเข้า; เทียบกับการตัดสินใจเข้า
    const wasGood = current.result === 'Win';
    const enterCorrect = (guessEnter === true && wasGood) || (guessEnter === false && !wasGood);
    const score = (dirCorrect ? 1 : 0) + (enterCorrect ? 1 : 0);

    setPhase('revealed');

    const { data: condData } = await supabase
      .from('trade_conditions')
      .select('conditions(name)')
      .eq('trade_id', current.id);
    setTradeConds((condData ?? []).map((d: any) => d.conditions?.name).filter(Boolean));

    await supabase.from('recap_quiz_attempts').insert({
      user_id: user.id,
      profile_id: activeProfile?.id ?? null,
      trade_id: current.id,
      guess_enter: guessEnter,
      guess_direction: guessDir,
      direction_correct: dirCorrect,
      enter_correct: enterCorrect,
      score,
    } as any);
    queryClient.invalidateQueries({ queryKey: ['quiz-stats'] });
  };

  const dirCorrect = current && guessEnter === true && guessDir === current.direction;
  const enterCorrect = current && ((guessEnter === true && current.result === 'Win') || (guessEnter === false && current.result !== 'Win'));
  const toggleCond = (name: string) =>
    setGuessConds(prev => prev.includes(name) ? prev.filter(c => c !== name) : [...prev, name]);

  const resultColor = (r: string) =>
    r === 'Win' ? 'text-win' : r === 'Loss' ? 'text-loss' : 'text-breakeven';

  return (
    <div className="space-y-5 max-w-2xl mx-auto">
      <div className="animate-fade-up">
        <div className="flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15">
            <Brain className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Recap Quiz</h1>
            <p className="text-xs text-muted-foreground mt-0.5">สุ่มไม้เก่ามาทดสอบความ consistency ของคุณ</p>
          </div>
        </div>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-3 gap-3 animate-fade-up">
        {[
          { label: 'ทำไปแล้ว', value: summary.total.toString(), icon: Target },
          { label: 'อ่านทิศทางแม่น', value: `${summary.dirAcc}%`, icon: TrendingUp },
          { label: 'คะแนนรวม', value: summary.totalScore.toString(), icon: Trophy },
        ].map((m, i) => (
          <div key={i} className="metric-card p-3 text-center">
            <m.icon className="h-4 w-4 text-primary mx-auto mb-1.5" />
            <p className="text-xl font-bold font-mono">{m.value}</p>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">{m.label}</p>
          </div>
        ))}
      </div>

      {eligible.length === 0 ? (
        <EmptyState variant="trades" />
      ) : phase === 'idle' ? (
        <div className="glass-card rounded-2xl p-8 text-center space-y-4 animate-fade-up">
          <p className="text-sm text-muted-foreground">
            ระบบจะสุ่มไม้ที่คุณเคยเทรด (เฉพาะที่ execute แล้ว) โดยโชว์แค่ <span className="text-foreground font-medium">วันที่ เวลา และ asset</span>
            <br />แล้วให้คุณจำลองว่ายังจะเข้าเหมือนเดิมไหม
          </p>
          <Button onClick={pickNext} size="lg" className="gap-2 rounded-xl shadow-lg shadow-primary/20">
            <Brain className="h-4 w-4" /> เริ่มทำ Quiz
          </Button>
        </div>
      ) : current ? (
        <div className="glass-card rounded-2xl p-6 space-y-5 animate-fade-up">
          {/* Question header */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Badge variant="outline" className="font-mono text-sm rounded-lg border-primary/20 bg-primary/5 text-primary px-3 py-1">
                {current.asset}
              </Badge>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">คำถาม</span>
            </div>
            <div className="flex flex-wrap gap-4 text-sm">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <Calendar className="h-4 w-4 text-primary" />
                {new Date(current.entry_date).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })}
              </span>
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <Clock className="h-4 w-4 text-primary" />
                {new Date(current.entry_date).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          </div>

          <div className="section-divider" />

          {/* Answer: enter? */}
          <div className="space-y-2.5">
            <p className="text-sm font-medium">1. ถ้าย้อนกลับไปวันนั้น คุณจะเข้าไม้นี้ไหม?</p>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                disabled={phase === 'revealed'}
                onClick={() => setGuessEnter(true)}
                className={cn(
                  'rounded-xl border py-3 text-sm font-medium transition-all',
                  guessEnter === true ? 'border-primary bg-primary/15 text-primary' : 'border-white/10 bg-white/[0.03] text-muted-foreground hover:border-white/20',
                )}
              >
                เข้า ✋
              </button>
              <button
                disabled={phase === 'revealed'}
                onClick={() => { setGuessEnter(false); setGuessDir(null); }}
                className={cn(
                  'rounded-xl border py-3 text-sm font-medium transition-all',
                  guessEnter === false ? 'border-loss bg-loss/15 text-loss' : 'border-white/10 bg-white/[0.03] text-muted-foreground hover:border-white/20',
                )}
              >
                ไม่เข้า 🚫
              </button>
            </div>
          </div>

          {/* Answer: direction */}
          {guessEnter === true && (
            <div className="space-y-2.5">
              <p className="text-sm font-medium">2. ทิศทางไหน?</p>
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  disabled={phase === 'revealed'}
                  onClick={() => setGuessDir('Long')}
                  className={cn(
                    'rounded-xl border py-3 text-sm font-medium transition-all flex items-center justify-center gap-1.5',
                    guessDir === 'Long' ? 'border-win bg-win/15 text-win' : 'border-white/10 bg-white/[0.03] text-muted-foreground hover:border-white/20',
                  )}
                >
                  <TrendingUp className="h-4 w-4" /> Long
                </button>
                <button
                  disabled={phase === 'revealed'}
                  onClick={() => setGuessDir('Short')}
                  className={cn(
                    'rounded-xl border py-3 text-sm font-medium transition-all flex items-center justify-center gap-1.5',
                    guessDir === 'Short' ? 'border-loss bg-loss/15 text-loss' : 'border-white/10 bg-white/[0.03] text-muted-foreground hover:border-white/20',
                  )}
                >
                  <TrendingDown className="h-4 w-4" /> Short
                </button>
              </div>
            </div>
          )}

          {/* Answer: conditions */}
          {guessEnter === true && allConditions.length > 0 && (
            <div className="space-y-2.5">
              <p className="text-sm font-medium">3. เข้าด้วย condition ไหน? (เลือกได้หลายอัน)</p>
              <div className="flex flex-wrap gap-1.5">
                {allConditions.map((c) => {
                  const active = guessConds.includes(c.name);
                  return (
                    <button
                      key={c.id}
                      disabled={phase === 'revealed'}
                      onClick={() => toggleCond(c.name)}
                      className={cn(
                        'rounded-lg border px-3 py-1.5 text-xs font-medium transition-all',
                        active ? 'border-primary bg-primary/15 text-primary' : 'border-white/10 bg-white/[0.03] text-muted-foreground hover:border-white/20',
                      )}
                    >
                      {c.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}


          {/* Submit */}
          {phase === 'answering' && (
            <Button
              onClick={reveal}
              disabled={guessEnter === null || (guessEnter === true && guessDir === null)}
              className="w-full gap-2 rounded-xl"
            >
              เฉลย <ArrowRight className="h-4 w-4" />
            </Button>
          )}

          {/* Reveal */}
          {phase === 'revealed' && (
            <div className="space-y-4 animate-fade-up">
              <div className="section-divider" />
              <div className="grid grid-cols-2 gap-3">
                <div className={cn('rounded-xl border p-3 text-center', dirCorrect ? 'border-win/30 bg-win/5' : 'border-loss/30 bg-loss/5')}>
                  <div className="flex items-center justify-center gap-1.5 mb-1">
                    {dirCorrect ? <Check className="h-4 w-4 text-win" /> : <X className="h-4 w-4 text-loss" />}
                    <span className="text-xs text-muted-foreground">ทิศทางจริง</span>
                  </div>
                  <p className={cn('font-bold', current.direction === 'Long' ? 'text-win' : 'text-loss')}>{current.direction}</p>
                </div>
                <div className={cn('rounded-xl border p-3 text-center', enterCorrect ? 'border-win/30 bg-win/5' : 'border-loss/30 bg-loss/5')}>
                  <div className="flex items-center justify-center gap-1.5 mb-1">
                    {enterCorrect ? <Check className="h-4 w-4 text-win" /> : <X className="h-4 w-4 text-loss" />}
                    <span className="text-xs text-muted-foreground">ผลจริง</span>
                  </div>
                  <p className={cn('font-bold font-mono', resultColor(current.result))}>
                    {current.result} · {Number(current.earned_r) >= 0 ? '+' : ''}{Number(current.earned_r).toFixed(1)}R
                  </p>
                </div>
              </div>

              {(tradeConds.length > 0 || guessConds.length > 0) && (
                <div className="rounded-xl bg-white/[0.03] border border-white/10 p-3 space-y-3">
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">คุณเลือก</p>
                    <div className="flex flex-wrap gap-1.5">
                      {guessConds.length === 0 ? (
                        <span className="text-xs text-muted-foreground">— ไม่ได้เลือก —</span>
                      ) : guessConds.map((c) => {
                        const hit = tradeConds.includes(c);
                        return (
                          <Badge key={c} variant="outline" className={cn(
                            'text-xs rounded-lg gap-1',
                            hit ? 'border-win/30 bg-win/5 text-win' : 'border-loss/30 bg-loss/5 text-loss',
                          )}>
                            {hit ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}{c}
                          </Badge>
                        );
                      })}
                    </div>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Conditions จริง</p>
                    <div className="flex flex-wrap gap-1.5">
                      {tradeConds.length === 0 ? (
                        <span className="text-xs text-muted-foreground">— ไม่มีบันทึก —</span>
                      ) : tradeConds.map((c) => {
                        const missed = !guessConds.includes(c);
                        return (
                          <Badge key={c} variant="outline" className={cn(
                            'text-xs rounded-lg',
                            missed ? 'border-amber-500/30 bg-amber-500/5 text-amber-500' : 'border-primary/20 bg-primary/5 text-primary',
                          )}>
                            {c}{missed ? ' (พลาด)' : ''}
                          </Badge>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {current.recap_text && (
                <div className="rounded-xl bg-white/[0.03] border border-white/10 p-3">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Recap เดิม</p>
                  <p className="text-sm text-foreground/90 whitespace-pre-wrap">{current.recap_text}</p>
                </div>
              )}

              {current.image_url && (
                <img src={current.image_url} alt="Trade chart" className="rounded-xl w-full border border-white/10" />
              )}

              <Button onClick={pickNext} className="w-full gap-2 rounded-xl">
                <RotateCcw className="h-4 w-4" /> ไม้ถัดไป
              </Button>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
