import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Bell, Loader2 } from "lucide-react";

type OAuthNamespace = {
  getAuthorizationDetails: (id: string) => Promise<{ data: any; error: any }>;
  approveAuthorization: (id: string) => Promise<{ data: any; error: any }>;
  denyAuthorization: (id: string) => Promise<{ data: any; error: any }>;
};

const oauth = () => (supabase.auth as unknown as { oauth: OAuthNamespace }).oauth;

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
        window.location.href = "/auth?next=" + encodeURIComponent(next);
        return;
      }
      const { data, error } = await oauth().getAuthorizationDetails(authorizationId);
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
    const { data, error } = approve
      ? await oauth().approveAuthorization(authorizationId)
      : await oauth().denyAuthorization(authorizationId);
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
    <main className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="items-center text-center">
          <div className="w-14 h-14 rounded-full bg-primary/20 flex items-center justify-center mb-2">
            <Bell className="w-7 h-7 text-primary" />
          </div>
          {error ? (
            <>
              <CardTitle>Authorization failed</CardTitle>
              <CardDescription>{error}</CardDescription>
            </>
          ) : !details ? (
            <>
              <CardTitle>Loading…</CardTitle>
              <CardDescription>Checking this authorization request</CardDescription>
            </>
          ) : (
            <>
              <CardTitle>Connect {details.client?.name ?? "an app"} to Gate Alert</CardTitle>
              <CardDescription>
                This lets {details.client?.name ?? "the client"} read your profile, attendance and team locations, and
                send alerts as you.
              </CardDescription>
            </>
          )}
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {!error && !details && (
            <div className="flex justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          )}
          {details && !error && (
            <>
              <Button disabled={busy} onClick={() => decide(true)} className="w-full">
                {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                Approve
              </Button>
              <Button disabled={busy} variant="outline" onClick={() => decide(false)} className="w-full">
                Deny
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
