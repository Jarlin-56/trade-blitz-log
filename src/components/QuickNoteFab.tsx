import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useProfile } from '@/contexts/ProfileContext';
import { NotebookPen } from 'lucide-react';
import QuickNoteDialog from './QuickNoteDialog';
import { useElectron } from '@/hooks/useElectron';

const HIDE_ON = ['/trades/new', '/login', '/register'];

export default function QuickNoteFab() {
  const [open, setOpen] = useState(false);
  const [screenshotFile, setScreenshotFile] = useState<File | null>(null);
  const { user } = useAuth();
  const { activeProfile } = useProfile();
  const loc = useLocation();
  const { screenshotBase64, clearScreenshot } = useElectron();

  useEffect(() => {
    if (screenshotBase64) {
      fetch(screenshotBase64)
        .then(res => res.blob())
        .then(blob => {
          const file = new File([blob], 'screenshot.png', { type: 'image/png' });
          setScreenshotFile(file);
          setOpen(true);
          clearScreenshot();
        });
    }
  }, [screenshotBase64, clearScreenshot]);

  const { data: count = 0 } = useQuery({
    queryKey: ['quick_notes_count', user?.id, activeProfile?.id],
    queryFn: async () => {
      let q = supabase.from('quick_notes').select('id', { count: 'exact', head: true }).is('converted_trade_id', null);
      if (activeProfile?.id) q = q.eq('profile_id', activeProfile.id);
      const { count } = await q;
      return count ?? 0;
    },
    enabled: !!user,
  });

  if (!user || HIDE_ON.some(p => loc.pathname.startsWith(p))) return null;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Quick Note"
        className="fixed z-50 bottom-20 md:bottom-6 right-4 md:right-6 h-14 w-14 rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/40 hover:shadow-primary/60 hover:scale-105 active:scale-95 transition-all flex items-center justify-center"
      >
        <NotebookPen className="h-6 w-6" />
        {count > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[22px] h-[22px] px-1.5 rounded-full bg-loss text-white text-[11px] font-bold flex items-center justify-center border-2 border-background">
            {count}
          </span>
        )}
      </button>
      <QuickNoteDialog open={open} onOpenChange={setOpen} initialFile={screenshotFile} />
    </>
  );
}
