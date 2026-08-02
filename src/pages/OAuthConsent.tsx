import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ShieldCheck } from "lucide-react";

export default function OAuthConsent() {
  const [params] = useSearchParams();
  const authorizationId = params.get("authorization_id") ?? "";
  const [details, setDetails] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!authorizationId) {
        setError("Missing authorization_id");
        return;
      }
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) {
        const next = window.location.pathname + window.location.search;
        window.location.href = "/login?next=" + encodeURIComponent(next);
        return;
      }
      const { data, error } = await (supabase.auth as any).oauth.getAuthorizationDetails(authorizationId);
      if (!active) return;
      if (error) {
        setError(error.message);
        return;
      }
      const immediate = data?.redirect_url ?? data?.redirect_to;
      if (immediate && !data?.client) {
        window.location.href = immediate;
        return;
      }
      setDetails(data);
    })();
    return () => {
      active = false;
    };
  }, [authorizationId]);

  async function decide(approve: boolean) {
    setBusy(true);
    const api = (supabase.auth as any).oauth;
    const { data, error } = approve
      ? await api.approveAuthorization(authorizationId)
      : await api.denyAuthorization(authorizationId);
    if (error) {
      setBusy(false);
      setError(error.message);
      return;
    }
    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) {
      setBusy(false);
      setError("No redirect returned by the authorization server.");
      return;
    }
    window.location.href = target;
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="glass-card w-full max-w-md rounded-2xl p-6 space-y-4">
        {error ? (
          <>
            <h1 className="text-lg font-bold">เชื่อมต่อไม่สำเร็จ</h1>
            <p className="text-sm text-muted-foreground">{error}</p>
          </>
        ) : !details ? (
          <div className="flex items-center gap-3 text-muted-foreground text-sm">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            กำลังโหลด…
          </div>
        ) : (
          <>
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/15">
              <ShieldCheck className="h-6 w-6 text-primary" />
            </div>
            <h1 className="text-xl font-bold">
              เชื่อม {details.client?.name ?? "แอปภายนอก"} กับบัญชีของคุณ
            </h1>
            <p className="text-sm text-muted-foreground">
              {details.client?.name ?? "แอปนี้"} จะเข้าถึงข้อมูล R-Squared Journal ของคุณ (ไม้เทรด, สถิติ, โน้ต)
              ในนามของคุณ อนุญาตหรือไม่?
            </p>
            <div className="flex gap-2 pt-2">
              <Button disabled={busy} onClick={() => decide(true)} className="flex-1">
                อนุญาต
              </Button>
              <Button disabled={busy} variant="outline" onClick={() => decide(false)} className="flex-1">
                ปฏิเสธ
              </Button>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
