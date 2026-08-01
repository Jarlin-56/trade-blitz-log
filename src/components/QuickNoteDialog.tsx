import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useProfile } from '@/contexts/ProfileContext';
import { useIsMobile } from '@/hooks/use-mobile';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Image as ImageIcon, ClipboardPaste, Trash2, ArrowRight, X } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import StorageImage from '@/components/StorageImage';
import { uploadImage, removeStorageImages } from '@/lib/storage';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

type Direction = 'Long' | 'Short' | null;

export default function QuickNoteDialog({ open, onOpenChange }: Props) {
  const { user } = useAuth();
  const { activeProfile } = useProfile();
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [tab, setTab] = useState('new');
  const [asset, setAsset] = useState('');
  const [direction, setDirection] = useState<Direction>(null);
  const [note, setNote] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const { data: notes = [] } = useQuery({
    queryKey: ['quick_notes', user?.id, activeProfile?.id],
    queryFn: async () => {
      let q = supabase
        .from('quick_notes' as any)
        .select('*')
        .is('converted_trade_id', null)
        .order('created_at', { ascending: false });
      if (activeProfile?.id) q = q.eq('profile_id', activeProfile.id);
      const { data } = await q;
      return (data as any[]) ?? [];
    },
    enabled: !!user,
  });

  useEffect(() => {
    if (!imageFile) { setImagePreview(null); return; }
    const url = URL.createObjectURL(imageFile);
    setImagePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [imageFile]);

  // Paste handler
  useEffect(() => {
    if (!open) return;
    const handler = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const it of Array.from(items)) {
        if (it.type.startsWith('image/')) {
          const f = it.getAsFile();
          if (f) {
            setImageFile(f);
            toast.success('วางรูปจาก clipboard แล้ว');
          }
          break;
        }
      }
    };
    window.addEventListener('paste', handler);
    return () => window.removeEventListener('paste', handler);
  }, [open]);

  const resetForm = () => {
    setAsset(''); setDirection(null); setNote(''); setImageFile(null);
  };

  const save = async () => {
    if (!user) return;
    if (!note && !imageFile && !asset) {
      toast.error('กรอกอย่างน้อยหนึ่งอย่าง (โน้ต, รูป, หรือ asset)');
      return;
    }
    setSaving(true);
    try {
      let image_url: string | null = null;
      if (imageFile) {
        image_url = await uploadImage(imageFile, user.id, 'quick-notes');
      }
      const { error } = await supabase.from('quick_notes' as any).insert({
        user_id: user.id,
        profile_id: activeProfile?.id ?? null,
        asset: asset ? asset.toUpperCase() : null,
        direction,
        note: note || null,
        image_url,
      });
      if (error) throw error;
      toast.success('บันทึกโน้ตแล้ว');
      resetForm();
      qc.invalidateQueries({ queryKey: ['quick_notes'] });
      setTab('list');
    } catch (err: any) {
      toast.error(err.message || 'บันทึกไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  };

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { data: row } = await supabase.from('quick_notes' as any).select('image_url').eq('id', id).maybeSingle();
      const { error } = await supabase.from('quick_notes' as any).delete().eq('id', id);
      if (error) throw error;
      await removeStorageImages([(row as any)?.image_url]);
    },
    onSuccess: () => {
      toast.success('ลบโน้ตแล้ว');
      qc.invalidateQueries({ queryKey: ['quick_notes'] });
    },
    onError: (e: any) => toast.error(e.message || 'ลบไม่สำเร็จ'),
  });

  const convertToTrade = (n: any) => {
    onOpenChange(false);
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

  const body = (
    <div ref={containerRef} className="flex flex-col h-full min-h-0">
      <Tabs value={tab} onValueChange={setTab} className="flex flex-col flex-1 min-h-0">
        <TabsList className="w-full">
          <TabsTrigger value="new" className="flex-1">โน้ตใหม่</TabsTrigger>
          <TabsTrigger value="list" className="flex-1">รายการ ({notes.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="new" className="flex-1 min-h-0 mt-3">
          <ScrollArea className="h-full pr-2">
            <div className="space-y-3 pb-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Asset</Label>
                  <Input placeholder="XAUUSD" value={asset} onChange={e => setAsset(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">ทิศ</Label>
                  <div className="flex gap-1.5">
                    {(['Long', 'Short'] as const).map(d => (
                      <Button
                        key={d}
                        type="button"
                        size="sm"
                        variant={direction === d ? 'default' : 'outline'}
                        className={cn('flex-1',
                          direction === d && d === 'Long' && 'bg-win hover:bg-win/90 text-primary-foreground',
                          direction === d && d === 'Short' && 'bg-loss hover:bg-loss/90 text-white',
                        )}
                        onClick={() => setDirection(direction === d ? null : d)}
                      >
                        {d}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">โน้ต</Label>
                <Textarea rows={4} placeholder="ไอเดีย / setup / เหตุผลที่จะเข้า..." value={note} onChange={e => setNote(e.target.value)} />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">รูปกราฟ</Label>
                {imagePreview ? (
                  <div className="relative rounded-lg overflow-hidden border border-border">
                    <img src={imagePreview} alt="preview" className="w-full max-h-56 object-contain bg-black/40" />
                    <Button
                      type="button" size="icon" variant="secondary"
                      className="absolute top-1.5 right-1.5 h-7 w-7"
                      onClick={() => setImageFile(null)}
                    ><X className="h-3.5 w-3.5" /></Button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" size="sm" className="flex-1 gap-1.5" onClick={() => fileRef.current?.click()}>
                      <ImageIcon className="h-4 w-4" /> เลือก/ถ่ายรูป
                    </Button>
                    <Button type="button" variant="outline" size="sm" className="flex-1 gap-1.5" onClick={async () => {
                      try {
                        const items = await (navigator.clipboard as any).read?.();
                        if (!items) throw new Error('เบราว์เซอร์ไม่รองรับ');
                        for (const item of items) {
                          const type = item.types.find((t: string) => t.startsWith('image/'));
                          if (type) {
                            const blob = await item.getType(type);
                            const ext = type.split('/')[1] || 'png';
                            setImageFile(new File([blob], `pasted.${ext}`, { type }));
                            toast.success('วางรูปแล้ว');
                            return;
                          }
                        }
                        toast.error('ไม่พบรูปใน clipboard');
                      } catch {
                        toast.info('กด Ctrl/Cmd+V เพื่อวางรูปแทน');
                      }
                    }}>
                      <ClipboardPaste className="h-4 w-4" /> วางรูป
                    </Button>
                  </div>
                )}
                <input
                  ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) setImageFile(f); }}
                />
                <p className="text-[10px] text-muted-foreground">เคล็ดลับ: กด Ctrl/Cmd+V เพื่อวางภาพจาก clipboard ได้ทันที</p>
              </div>

              <Button className="w-full" onClick={save} disabled={saving}>
                {saving ? 'กำลังบันทึก…' : 'บันทึกโน้ต'}
              </Button>
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="list" className="flex-1 min-h-0 mt-3">
          <ScrollArea className="h-full pr-2">
            {notes.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">ยังไม่มีโน้ตค้างอยู่</p>
            ) : (
              <div className="space-y-2 pb-4">
                {notes.map(n => (
                  <div key={n.id} className="glass-card rounded-lg p-3 space-y-2">
                    <div className="flex items-start gap-2">
                      {n.image_url && (
                        <img src={n.image_url} alt="" className="h-14 w-14 rounded object-cover shrink-0 bg-black/30" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap text-xs">
                          {n.asset && <span className="font-mono font-semibold">{n.asset}</span>}
                          {n.direction && (
                            <span className={cn('px-1.5 py-0.5 rounded text-[10px] font-medium',
                              n.direction === 'Long' ? 'bg-win/20 text-win' : 'bg-loss/20 text-loss')}>
                              {n.direction}
                            </span>
                          )}
                          <span className="text-muted-foreground">
                            {new Date(n.created_at).toLocaleString('th-TH', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        {n.note && <p className="text-xs mt-1 line-clamp-3 whitespace-pre-wrap">{n.note}</p>}
                      </div>
                    </div>
                    <div className="flex gap-1.5">
                      <Button size="sm" className="flex-1 h-8 gap-1" onClick={() => convertToTrade(n)}>
                        <ArrowRight className="h-3.5 w-3.5" /> สร้างเทรด
                      </Button>
                      <Button size="sm" variant="outline" className="h-8 w-8 p-0" onClick={() => deleteMut.mutate(n.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  );

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="h-[85vh] flex flex-col">
          <SheetHeader className="text-left">
            <SheetTitle>Quick Note</SheetTitle>
          </SheetHeader>
          <div className="flex-1 min-h-0 mt-2">{body}</div>
        </SheetContent>
      </Sheet>
    );
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Quick Note</DialogTitle>
        </DialogHeader>
        <div className="flex-1 min-h-0">{body}</div>
      </DialogContent>
    </Dialog>
  );
}
