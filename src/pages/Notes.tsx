import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useProfile } from '@/contexts/ProfileContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { StickyNote, Pencil, Trash2, ArrowRight, ExternalLink } from 'lucide-react';
import StorageImage from '@/components/StorageImage';
import { removeStorageImages } from '@/lib/storage';

type Note = {
  id: string;
  asset: string | null;
  direction: string | null;
  note: string | null;
  image_url: string | null;
  converted_trade_id: string | null;
  created_at: string;
};

export default function Notes() {
  const { user } = useAuth();
  const { activeProfile } = useProfile();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [editing, setEditing] = useState<Note | null>(null);
  const [editAsset, setEditAsset] = useState('');
  const [editDirection, setEditDirection] = useState<string | null>(null);
  const [editNote, setEditNote] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data: notes = [], isLoading } = useQuery({
    queryKey: ['quick_notes', user?.id, activeProfile?.id],
    queryFn: async () => {
      if (!user || !activeProfile) return [];
      const { data, error } = await supabase
        .from('quick_notes' as any)
        .select('*')
        .eq('user_id', user.id)
        .eq('profile_id', activeProfile.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return ((data as any[]) ?? []) as Note[];
    },
    enabled: !!user && !!activeProfile,
  });

  const pending = notes.filter(n => !n.converted_trade_id);
  const converted = notes.filter(n => n.converted_trade_id);

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!editing) return;
      const { error } = await supabase.from('quick_notes' as any).update({
        asset: editAsset ? editAsset.toUpperCase() : null,
        direction: editDirection,
        note: editNote || null,
      }).eq('id', editing.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('บันทึกการแก้ไขแล้ว');
      setEditing(null);
      qc.invalidateQueries({ queryKey: ['quick_notes'] });
    },
    onError: (e: any) => toast.error(e.message || 'บันทึกไม่สำเร็จ'),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { data: row } = await supabase.from('quick_notes' as any).select('image_url').eq('id', id).maybeSingle();
      const { error } = await supabase.from('quick_notes' as any).delete().eq('id', id);
      if (error) throw error;
      await removeStorageImages([(row as any)?.image_url]);
    },
    onSuccess: () => {
      toast.success('ลบโน้ตแล้ว');
      setDeleteId(null);
      qc.invalidateQueries({ queryKey: ['quick_notes'] });
    },
    onError: (e: any) => toast.error(e.message || 'ลบไม่สำเร็จ'),
  });

  const openEdit = (n: Note) => {
    setEditing(n);
    setEditAsset(n.asset ?? '');
    setEditDirection(n.direction ?? null);
    setEditNote(n.note ?? '');
  };

  const convert = (n: Note) => {
    navigate('/trades/new', {
      state: {
        prefill: {
          asset: n.asset ?? undefined,
          direction: n.direction ?? undefined,
          note: n.note ?? undefined,
          image_url: n.image_url ?? undefined,
        },
        quickNoteId: n.id,
      },
    });
  };

  const NoteCard = ({ n }: { n: Note }) => (
    <div className="glass-card rounded-2xl p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          {n.asset && <Badge variant="outline" className="font-mono rounded-lg border-primary/20 bg-primary/5 text-primary">{n.asset}</Badge>}
          {n.direction && (
            <span className={cn('text-[10px] px-1.5 py-0.5 rounded-md font-medium', n.direction === 'Long' ? 'bg-win/10 text-win' : 'bg-loss/10 text-loss')}>
              {n.direction}
            </span>
          )}
        </div>
        <span className="text-[10px] text-muted-foreground shrink-0">
          {new Date(n.created_at).toLocaleString('th-TH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>

      {n.note && <p className="text-sm whitespace-pre-wrap break-words">{n.note}</p>}
      {n.image_url && (
        <StorageImage source={n.image_url} alt="Quick note chart" className="rounded-lg w-full max-h-64 object-contain bg-black/40" />
      )}

      <div className="flex gap-2 flex-wrap">
        {n.converted_trade_id ? (
          <Button size="sm" variant="outline" className="gap-1.5 rounded-lg" onClick={() => navigate(`/trades/${n.converted_trade_id}`)}>
            <ExternalLink className="h-3.5 w-3.5" /> ดูไม้ที่บันทึก
          </Button>
        ) : (
          <Button size="sm" className="gap-1.5 rounded-lg" onClick={() => convert(n)}>
            <ArrowRight className="h-3.5 w-3.5" /> แปลงเป็นไม้
          </Button>
        )}
        <Button size="sm" variant="outline" className="gap-1.5 rounded-lg" onClick={() => openEdit(n)}>
          <Pencil className="h-3.5 w-3.5" /> แก้ไข
        </Button>
        <Button size="sm" variant="ghost" className="gap-1.5 rounded-lg text-loss hover:text-loss" onClick={() => setDeleteId(n.id)}>
          <Trash2 className="h-3.5 w-3.5" /> ลบ
        </Button>
      </div>
    </div>
  );

  const List = ({ items, empty }: { items: Note[]; empty: string }) =>
    items.length === 0 ? (
      <p className="text-sm text-muted-foreground text-center py-12">{empty}</p>
    ) : (
      <div className="space-y-3">{items.map(n => <NoteCard key={n.id} n={n} />)}</div>
    );

  return (
    <div className="space-y-5 max-w-3xl mx-auto">
      <div className="flex items-center gap-2.5 animate-fade-up">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15">
          <StickyNote className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Quick Notes</h1>
          <p className="text-xs text-muted-foreground mt-0.5">โน้ตที่จดไว้ระหว่างเทรด รอแปลงเป็นไม้</p>
        </div>
      </div>

      <Tabs defaultValue="pending">
        <TabsList className="w-full">
          <TabsTrigger value="pending" className="flex-1">รอแปลง ({pending.length})</TabsTrigger>
          <TabsTrigger value="converted" className="flex-1">แปลงแล้ว ({converted.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="pending" className="mt-4">
          {isLoading ? <p className="text-sm text-muted-foreground text-center py-12">Loading…</p> : <List items={pending} empty="ยังไม่มีโน้ตที่รอแปลง" />}
        </TabsContent>
        <TabsContent value="converted" className="mt-4">
          {isLoading ? <p className="text-sm text-muted-foreground text-center py-12">Loading…</p> : <List items={converted} empty="ยังไม่มีโน้ตที่แปลงเป็นไม้แล้ว" />}
        </TabsContent>
      </Tabs>

      {/* Edit dialog */}
      <Dialog open={!!editing} onOpenChange={v => !v && setEditing(null)}>
        <DialogContent className="glass-card">
          <DialogHeader><DialogTitle>แก้ไขโน้ต</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Asset</Label>
                <Input value={editAsset} onChange={e => setEditAsset(e.target.value)} placeholder="XAUUSD" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">ทิศ</Label>
                <div className="flex gap-1.5">
                  {(['Long', 'Short'] as const).map(d => (
                    <Button
                      key={d}
                      type="button"
                      size="sm"
                      variant={editDirection === d ? 'default' : 'outline'}
                      className={cn('flex-1',
                        editDirection === d && d === 'Long' && 'bg-win hover:bg-win/90 text-primary-foreground',
                        editDirection === d && d === 'Short' && 'bg-loss hover:bg-loss/90 text-white',
                      )}
                      onClick={() => setEditDirection(editDirection === d ? null : d)}
                    >
                      {d}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">โน้ต</Label>
              <Textarea rows={5} value={editNote} onChange={e => setEditNote(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>ยกเลิก</Button>
            <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
              {saveMut.isPending ? 'กำลังบันทึก…' : 'บันทึก'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteId} onOpenChange={v => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ลบโน้ตนี้?</AlertDialogTitle>
            <AlertDialogDescription>โน้ตจะถูกลบถาวร ไม่สามารถกู้คืนได้</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteId && deleteMut.mutate(deleteId)}>ลบ</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
