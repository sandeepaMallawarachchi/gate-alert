import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Bell, BellRing, Loader2, RefreshCw } from 'lucide-react';
import PageShell from '@/components/PageShell';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';

type Alert = Database['public']['Tables']['gate_alert_history']['Row'];
const officeDay = () => new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);

export default function AlertHistory() {
  const { user, loading } = useAuth();
  const [day, setDay] = useState(officeDay);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState(false);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => setDay(officeDay()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setAlerts([]);
    setBusy(true);
    const fetchAlerts = async () => {
      const start = new Date(`${day}T00:00:00+05:30`);
      const end = new Date(start.getTime() + 86_400_000);
      const { data, error: queryError } = await supabase.from('gate_alert_history')
        .select('*').gte('created_at', start.toISOString()).lt('created_at', end.toISOString())
        .order('created_at', { ascending: false });
      if (cancelled) return;
      setError(!!queryError);
      setAlerts(data ?? []);
      setBusy(false);
    };
    const channel = supabase.channel('today-gate-alert-history')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'gate_alert_history' }, fetchAlerts)
      .subscribe((status) => { if (status === 'SUBSCRIBED') void fetchAlerts(); });
    void fetchAlerts();
    const poll = window.setInterval(fetchAlerts, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(poll);
      void supabase.removeChannel(channel);
    };
  }, [user, day, refresh]);

  if (loading) return null;
  if (!user) return <Navigate to="/auth" replace />;

  return (
    <PageShell title="Alert History">
      <div className="space-y-5">
        <section className="liquid-card rounded-3xl p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-widest text-primary">Gate access requests</p>
              <h2 className="mt-2 text-2xl font-semibold">Today’s alerts</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {new Date(`${day}T12:00:00+05:30`).toLocaleDateString(undefined, { timeZone: 'Asia/Colombo', month: 'long', day: 'numeric', year: 'numeric' })}
              </p>
            </div>
            <BellRing className="h-8 w-8 text-primary" strokeWidth={1.8} />
          </div>
          <div className="mt-5 flex items-center justify-between border-t border-border pt-4">
            <p className="text-sm text-muted-foreground">{busy || error ? 'Today only' : `${alerts.length} ${alerts.length === 1 ? 'request' : 'requests'}`} · Sri Lanka time</p>
            <Button variant="ghost" size="icon" className="apple-icon-button" aria-label="Refresh alerts" disabled={busy} onClick={() => setRefresh((value) => value + 1)}>
              <RefreshCw className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </section>

        <div aria-live="polite">
          {busy ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" aria-label="Loading alerts" /></div>
          ) : error ? (
            <div role="alert" className="liquid-card rounded-3xl p-6 text-center">
              <p>Couldn’t load today’s alerts.</p>
              <Button variant="ghost" className="mt-2 text-primary" onClick={() => setRefresh((value) => value + 1)}>Try again</Button>
            </div>
          ) : alerts.length === 0 ? (
            <div className="liquid-card rounded-3xl px-6 py-12 text-center">
              <Bell className="mx-auto mb-4 h-8 w-8 text-primary" strokeWidth={1.8} />
              <h3 className="font-medium">No alerts today</h3>
              <p className="mt-2 text-sm text-muted-foreground">New gate access requests will appear here.</p>
            </div>
          ) : (
            <ol className="liquid-card divide-y divide-border overflow-hidden rounded-3xl">
              {alerts.map((alert) => (
                <li key={alert.id} className="flex items-center gap-3 p-4">
                  <Avatar className="h-11 w-11 shrink-0 border border-white/10">
                    <AvatarImage src={alert.sender_avatar || undefined} />
                    <AvatarFallback className="bg-primary/15 text-primary">{alert.sender_name.trim().slice(0, 1).toUpperCase() || 'U'}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{alert.sender_name}{alert.sender_id === user.id && <span className="ml-1 text-xs text-muted-foreground">(you)</span>}</p>
                    <p className="mt-1 text-xs text-muted-foreground">Requested gate access</p>
                  </div>
                  <time dateTime={alert.created_at} className="shrink-0 text-xs tabular-nums text-primary">
                    {new Date(alert.created_at).toLocaleTimeString(undefined, { timeZone: 'Asia/Colombo', hour: '2-digit', minute: '2-digit' })}
                  </time>
                </li>
              ))}
            </ol>
          )}
        </div>
        <p className="text-center text-xs text-muted-foreground">Only today’s requests are shown. History resets at midnight.</p>
      </div>
    </PageShell>
  );
}
