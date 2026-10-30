import { useState, useEffect, useRef } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster as Sonner } from '@/components/ui/sonner';
import { AuthProvider } from '@/contexts/AuthContext';
import { ProfileProvider } from '@/contexts/ProfileContext';
import { useElectron } from '@/hooks/useElectron';
import TradeNew from '../pages/TradeNew';
import { BrowserRouter } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Pin, X } from 'lucide-react';
import { cn } from '@/lib/utils';

const queryClient = new QueryClient();

export default function QuickNoteWidget() {
  const [screenshotFile, setScreenshotFile] = useState<File | null>(null);
  const { screenshotBase64, clearScreenshot, isPinned, togglePin } = useElectron();
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (screenshotBase64) {
      fetch(screenshotBase64)
        .then(res => res.blob())
        .then(blob => {
          const file = new File([blob], 'screenshot.png', { type: 'image/png' });
          setScreenshotFile(file);
          clearScreenshot();
          requestAnimationFrame(() => {
            scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
          });
        });
    }
  }, [screenshotBase64, clearScreenshot]);

  const handleClose = () => {
    window.electronAPI?.hideWindow();
  };

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <ProfileProvider>
           <div className="flex flex-col h-screen w-screen bg-background text-foreground overflow-hidden">
              <div
                className="flex items-center justify-between px-4 py-2 border-b border-border bg-muted/80 shrink-0"
                style={{ WebkitAppRegion: 'drag' }}              >
                <div className="font-semibold text-sm">Log Trade</div>
                <div className="flex items-center gap-1" style={{ WebkitAppRegion: 'no-drag' }}>                  <Button
                    variant="ghost"
                    size="icon"
                    className={cn('h-7 w-7', isPinned && 'bg-accent')}
                    onClick={togglePin}
                  >
                    <Pin className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleClose}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto p-4">
                <TradeNew asWidget initialFile={screenshotFile} />
              </div>
            </div>
            <Sonner />
          </ProfileProvider>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
