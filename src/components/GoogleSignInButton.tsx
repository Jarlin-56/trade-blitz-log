import { errorMessage } from "@/lib/errors";
import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

export default function GoogleSignInButton({
  label = 'เข้าสู่ระบบด้วย Google',
  next,
}: { label?: string; next?: string | null }) {
  const [loading, setLoading] = useState(false);

  const signIn = async () => {
    setLoading(true);
    const safeNext = next && next.startsWith('/') && !next.startsWith('//') ? next : '';

    // If running inside Electron, use the deep linking flow
    if (window.electronAPI) {
      try {
        const { data, error } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: {
            redirectTo: 'trade-blitz-log://auth-callback',
            skipBrowserRedirect: true,
          },
        });

        if (error) {
          toast.error(error.message || 'เข้าสู่ระบบด้วย Google ไม่สำเร็จ');
          setLoading(false);
          return;
        }

        if (data?.url) {
          window.electronAPI.openExternalUrl(data.url);
        } else {
          toast.error('ไม่ได้รับลิงก์สำหรับเข้าสู่ระบบ');
        }
      } catch (err: unknown) {
        toast.error(errorMessage(err) || 'เกิดข้อผิดพลาดในการเปิดระบบล็อกอิน');
      } finally {
        setLoading(false);
      }
      return;
    }

    // Standard web flow directly via Supabase Auth
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}${safeNext}`,
        },
      });

      if (error) {
        toast.error(error.message || 'เข้าสู่ระบบด้วย Google ไม่สำเร็จ');
      }
    } catch (err: unknown) {
      toast.error(errorMessage(err) || 'เกิดข้อผิดพลาดในการเข้าสู่ระบบด้วย Google');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      type="button"
      variant="outline"
      className="w-full h-11 gap-2 text-sm font-medium border-white/10 bg-background/50"
      onClick={signIn}
      disabled={loading}
    >
      <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.76h3.57c2.08-1.92 3.27-4.74 3.27-8.09Z" />
        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.76c-.99.66-2.26 1.06-3.71 1.06-2.86 0-5.29-1.93-6.15-4.53H2.18v2.84A11 11 0 0 0 12 23Z" />
        <path fill="#FBBC05" d="M5.85 14.11a6.6 6.6 0 0 1 0-4.22V7.05H2.18a11 11 0 0 0 0 9.9l3.67-2.84Z" />
        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.05l3.67 2.84C6.71 7.29 9.14 5.38 12 5.38Z" />
      </svg>
      {loading ? 'กำลังเปิด Google…' : label}
    </Button>
  );
}
