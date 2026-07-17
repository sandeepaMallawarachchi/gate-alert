import React, { useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { ArrowLeft, Clock, LogIn, LogOut, MapPin, Loader2, ShieldAlert, Users, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useGeofence, CompanyLocation } from '@/hooks/useGeofence';
import { toast } from 'sonner';
import CompanyLocationPicker from '@/components/CompanyLocationPicker';
import * as XLSX from 'xlsx';

interface AttendanceRow {
  id: string;
  user_id: string;
  date: string;
  check_in_at: string | null;
  check_out_at: string | null;
  full_name?: string;
  avatar_url?: string | null;
}

const todayISO = () => new Date().toISOString().slice(0, 10);

const fmtTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—';
const fmtDate = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

const Attendance: React.FC = () => {
  const { user, isAdmin, loading } = useAuth();
  const navigate = useNavigate();
  const [company, setCompany] = useState<CompanyLocation | null>(null);
  const [companyLoading, setCompanyLoading] = useState(true);
  const [today, setToday] = useState<AttendanceRow | null>(null);
  const [history, setHistory] = useState<AttendanceRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(new Date());
  const [viewAll, setViewAll] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportScope, setExportScope] = useState<'mine' | 'all' | 'selected'>('mine');
  const [employees, setEmployees] = useState<Array<{ user_id: string; full_name: string; email?: string | null }>>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState(false);

  const geo = useGeofence(company);
  const prevInRange = React.useRef<boolean | null>(null);

  // Fire a real FCM push to self (works when app is closed/backgrounded)
  // Deduped server-side to one push per (user, day, tag).
  const notifySelf = async (title: string, body: string, tag: string) => {
    try {
      await supabase.functions.invoke('send-push-notification', {
        body: { target: 'self', type: 'attendance', title, body, tag, url: '/attendance', dedupe_per_day: true },
      });
    } catch (e) {
      console.warn('notifySelf failed', e);
    }
  };

  // Geofence transition -> push check-in / check-out reminder
  useEffect(() => {
    if (!company || geo.requesting || geo.distance === null) return;
    const now = geo.inRange;
    const prev = prevInRange.current;
    if (prev === null) {
      prevInRange.current = now;
      return;
    }
    if (prev !== now) {
      if (now && !today?.check_in_at) {
        notifySelf(
          '📍 You arrived at the office',
          'Tap to check in for today.',
          'attendance-checkin',
        );
      }
      if (!now && today?.check_in_at && !today?.check_out_at) {
        notifySelf(
          '👋 You left the office',
          "Don't forget to check out for today.",
          'attendance-checkout',
        );
      }
      prevInRange.current = now;
    }
  }, [geo.inRange, geo.requesting, geo.distance, company, today?.check_in_at, today?.check_out_at]);

  // clock tick
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // load company location
  const loadCompany = async () => {
    setCompanyLoading(true);
    const { data } = await supabase
      .from('company_location')
      .select('latitude, longitude, radius_meters')
      .limit(1)
      .maybeSingle();
    setCompany(data ?? null);
    setCompanyLoading(false);
  };
  useEffect(() => {
    if (user) loadCompany();
  }, [user]);

  // load today + history
  const loadRecords = async () => {
    if (!user) return;
    const date = todayISO();
    const { data: todayRow } = await supabase
      .from('attendance')
      .select('*')
      .eq('user_id', user.id)
      .eq('date', date)
      .maybeSingle();
    setToday((todayRow as any) ?? null);

    const q = supabase
      .from('attendance')
      .select('*')
      .order('date', { ascending: false })
      .limit(60);
    const { data: hist } = viewAll && isAdmin ? await q : await q.eq('user_id', user.id);

    // fetch profiles for names when admin view
    let profiles: Record<string, { full_name: string; avatar_url: string | null }> = {};
    if (hist && viewAll && isAdmin) {
      const ids = Array.from(new Set(hist.map((r: any) => r.user_id)));
      if (ids.length) {
        const { data: p } = await supabase.from('profiles').select('user_id, full_name, avatar_url').in('user_id', ids);
        p?.forEach((row: any) => (profiles[row.user_id] = { full_name: row.full_name, avatar_url: row.avatar_url }));
      }
    }
    setHistory(
      (hist as any[])?.map((r) => ({ ...r, ...(profiles[r.user_id] || {}) })) ?? [],
    );
  };
  useEffect(() => {
    if (user) loadRecords();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, viewAll, isAdmin]);

  const loadEmployees = async () => {
    const { data } = await supabase
      .from('profiles')
      .select('user_id, full_name, email')
      .order('full_name', { ascending: true });
    setEmployees((data as any) ?? []);
  };

  const openExportDialog = async () => {
    if (!isAdmin) {
      // non-admin: export mine only, no dialog
      await runExport('mine', null);
      return;
    }
    if (employees.length === 0) await loadEmployees();
    setExportScope('mine');
    setSelectedIds(new Set());
    setExportOpen(true);
  };

  const runExport = async (scope: 'mine' | 'all' | 'selected', ids: string[] | null) => {
    if (!user) return;
    setExporting(true);
    try {
      let query = supabase
        .from('attendance')
        .select('user_id, date, check_in_at, check_out_at')
        .order('date', { ascending: false });
      if (scope === 'mine') query = query.eq('user_id', user.id);
      else if (scope === 'selected' && ids && ids.length) query = query.in('user_id', ids);
      const { data, error } = await query;
      if (error) throw error;
      const rows = data ?? [];

      let nameMap: Record<string, string> = {};
      if (scope !== 'mine' && rows.length) {
        const uids = Array.from(new Set(rows.map((r: any) => r.user_id)));
        const { data: profs } = await supabase
          .from('profiles')
          .select('user_id, full_name, email')
          .in('user_id', uids);
        (profs ?? []).forEach((p: any) => {
          nameMap[p.user_id] = p.full_name || p.email || p.user_id;
        });
      }

      const sheetRows = rows.map((r: any) => ({
        Member: scope === 'mine' ? 'Me' : (nameMap[r.user_id] || r.user_id),
        Date: r.date,
        'Check In': r.check_in_at ? new Date(r.check_in_at).toLocaleString() : '',
        'Check Out': r.check_out_at ? new Date(r.check_out_at).toLocaleString() : '',
      }));

      const ws = XLSX.utils.json_to_sheet(sheetRows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Attendance');
      const stamp = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(wb, `attendance-${scope}-${stamp}.xlsx`);
      toast.success('Exported');
      setExportOpen(false);
    } catch (e: any) {
      toast.error(e.message || 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  const handleExportConfirm = () => {
    if (exportScope === 'selected' && selectedIds.size === 0) {
      toast.error('Select at least one employee');
      return;
    }
    runExport(exportScope, exportScope === 'selected' ? Array.from(selectedIds) : null);
  };

  const toggleEmployee = (id: string) => {
    setSelectedIds((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      return s;
    });
  };


  const handleCheckIn = async () => {
    if (!user || !geo.position) return;
    setBusy(true);
    const { error } = await supabase.from('attendance').insert({
      user_id: user.id,
      check_in_lat: geo.position.lat,
      check_in_lng: geo.position.lng,
    });
    setBusy(false);
    if (error) {
      toast.error(error.message.replace(/^.*: /, ''));
    } else {
      toast.success('Checked in');
      loadRecords();
    }
  };

  const handleCheckOut = async () => {
    if (!user || !geo.position || !today) return;
    setBusy(true);
    const { error } = await supabase
      .from('attendance')
      .update({
        check_out_lat: geo.position.lat,
        check_out_lng: geo.position.lng,
      })
      .eq('id', today.id);
    setBusy(false);
    if (error) {
      toast.error(error.message.replace(/^.*: /, ''));
    } else {
      toast.success('Checked out');
      loadRecords();
    }
  };

  const statusPill = useMemo(() => {
    if (companyLoading) return null;
    if (!company) {
      return (
        <div className="flex items-center gap-2 text-sm text-amber-400">
          <ShieldAlert className="w-4 h-4" />
          {isAdmin ? 'Set the company location to enable attendance.' : 'Ask an admin to set the company location.'}
        </div>
      );
    }
    if (geo.requesting) {
      return (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> Getting your location…
        </div>
      );
    }
    if (geo.error) {
      return (
        <div className="flex items-center gap-2 text-sm text-destructive">
          <ShieldAlert className="w-4 h-4" /> {geo.error}
        </div>
      );
    }
    if (geo.distance === null) return null;
    const meters = Math.round(geo.distance);
    return geo.inRange ? (
      <div className="flex items-center gap-2 text-sm text-emerald-400">
        <MapPin className="w-4 h-4" /> Within range — {meters} m from office
      </div>
    ) : (
      <div className="flex items-center gap-2 text-sm text-destructive">
        <MapPin className="w-4 h-4" /> Out of range — {meters} m from office
      </div>
    );
  }, [company, companyLoading, geo, isAdmin]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }
  if (!user) return <Navigate to="/auth" replace />;

  const canCheckIn = geo.inRange && !today?.check_in_at && !busy;
  const canCheckOut = geo.inRange && !!today?.check_in_at && !today?.check_out_at && !busy;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="flex items-center justify-between p-4 border-b border-border">
        <Button variant="ghost" size="icon" onClick={() => navigate('/')} title="Back">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h1 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <Clock className="w-5 h-5 text-primary" /> Attendance
        </h1>
        {isAdmin ? (
          <Button variant="ghost" size="icon" onClick={() => setShowPicker(true)} title="Set company location">
            <MapPin className="w-5 h-5" />
          </Button>
        ) : (
          <div className="w-9" />
        )}
      </header>

      <main className="flex-1 p-4 space-y-4 max-w-2xl w-full mx-auto pb-24 lg:pb-6">
        {/* Today card */}
        <Card className="p-5 bg-card border-border">
          <div className="flex items-baseline justify-between mb-2">
            <div>
              <p className="text-sm text-muted-foreground">
                {now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
              </p>
              <p className="text-3xl font-mono font-semibold text-foreground tabular-nums">
                {now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </p>
            </div>
          </div>
          <div className="mt-2 mb-4">{statusPill}</div>

          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="rounded-md border border-border p-3 bg-secondary/40">
              <p className="text-xs text-muted-foreground">Check In</p>
              <p className="text-lg font-semibold text-foreground tabular-nums">{fmtTime(today?.check_in_at ?? null)}</p>
            </div>
            <div className="rounded-md border border-border p-3 bg-secondary/40">
              <p className="text-xs text-muted-foreground">Check Out</p>
              <p className="text-lg font-semibold text-foreground tabular-nums">{fmtTime(today?.check_out_at ?? null)}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Button onClick={handleCheckIn} disabled={!canCheckIn} className="h-12">
              {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <LogIn className="w-4 h-4 mr-2" />}
              Check In
            </Button>
            <Button
              onClick={handleCheckOut}
              disabled={!canCheckOut}
              variant="secondary"
              className="h-12"
            >
              {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <LogOut className="w-4 h-4 mr-2" />}
              Check Out
            </Button>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Date and time are set automatically and cannot be edited.
          </p>
        </Card>

        {/* History */}
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">
            {viewAll && isAdmin ? 'All members' : 'Your history'}
          </h2>
          <div className="flex items-center gap-1">
            {isAdmin && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90">
                    <Download className="w-4 h-4 mr-2" />
                    Export
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => exportXlsx('mine')}>Download mine</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => exportXlsx('all')}>Download all</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            {isAdmin && (
              <Button
                size="sm"
                onClick={() => setViewAll((v) => !v)}
                className="bg-primary text-primary-foreground hover:bg-primary/90"
              >
                <Users className="w-4 h-4 mr-2" />
                {viewAll ? 'Show mine' : 'View all'}
              </Button>
            )}
          </div>
        </div>

        <Card className="bg-card border-border divide-y divide-border">
          {history.length === 0 && (
            <p className="p-4 text-sm text-muted-foreground text-center">No records yet.</p>
          )}
          {history.map((r) => (
            <div key={r.id} className="flex items-center justify-between p-3 text-sm">
              <div>
                <p className="text-foreground font-medium">{fmtDate(r.date)}</p>
                {viewAll && isAdmin && (
                  <p className="text-xs text-muted-foreground">{r.full_name || r.user_id.slice(0, 8)}</p>
                )}
              </div>
              <div className="text-right tabular-nums">
                <p className="text-foreground">
                  <span className="text-emerald-400">In</span> {fmtTime(r.check_in_at)}
                  <span className="mx-2 text-muted-foreground">·</span>
                  <span className="text-amber-400">Out</span> {fmtTime(r.check_out_at)}
                </p>
              </div>
            </div>
          ))}
        </Card>
      </main>

      <CompanyLocationPicker open={showPicker} onOpenChange={(v) => { setShowPicker(v); if (!v) loadCompany(); }} />
    </div>
  );
};

export default Attendance;
