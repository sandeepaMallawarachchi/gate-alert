import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { ArrowLeft, MapPin, Radio, Loader2, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import L from 'leaflet';
import { addMapTiles } from '@/lib/maps';

interface SharedLocation {
  user_id: string;
  latitude: number;
  longitude: number;
  is_live: boolean;
  updated_at: string;
  full_name?: string;
  avatar_url?: string | null;
}

const LocationsMap: React.FC = () => {
  const { user, profile, loading } = useAuth();
  const navigate = useNavigate();
  const mapDivRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const overlaysRef = useRef<Record<string, L.Marker>>({});
  const framedRef = useRef(false);
  const watchIdRef = useRef<number | null>(null);
  const wakeLockRef = useRef<any>(null);
  const lastPosRef = useRef<{ lat: number; lng: number; acc: number } | null>(null);
  const keepAliveRef = useRef<number | null>(null);
  const [locations, setLocations] = useState<SharedLocation[]>([]);
  const [profiles, setProfiles] = useState<Record<string, { full_name: string; avatar_url: string | null }>>({});
  const [isLive, setIsLive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [mapReady, setMapReady] = useState(false);

  // Load profiles map
  const refreshProfiles = useCallback(async () => {
    const { data } = await supabase.from('profiles').select('user_id, full_name, avatar_url');
    if (data) {
      const m: Record<string, any> = {};
      data.forEach((p: any) => { m[p.user_id] = { full_name: p.full_name, avatar_url: p.avatar_url }; });
      setProfiles(m);
    }
  }, []);

  // Fetch all locations
  const fetchLocations = useCallback(async () => {
    const { data } = await supabase.from('shared_locations').select('*');
    if (data) setLocations(data as any);
  }, []);

  // Leaflet needs its visible container, so wait for authentication to finish.
  useEffect(() => {
    if (loading || !user || !mapDivRef.current) return;
    const map = L.map(mapDivRef.current).setView([7.8731, 80.7718], 7);
    addMapTiles(map);
    mapRef.current = map;
    framedRef.current = false;
    setMapReady(true);
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(mapDivRef.current);
    return () => {
      observer.disconnect();
      map.remove();
      mapRef.current = null;
      overlaysRef.current = {};
      setMapReady(false);
    };
  }, [user, loading]);

  // Initial data + realtime
  useEffect(() => {
    if (!user) return;
    refreshProfiles();
    fetchLocations();

    // Detect if I'm already live
    supabase
      .from('shared_locations')
      .select('is_live')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }) => { if (data?.is_live) setIsLive(true); });

    const channel = supabase
      .channel('shared-locations-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shared_locations' }, () => {
        fetchLocations();
      })
      .subscribe();

    // Fallback periodic refresh to catch background deletions (e.g. cron cleanup)
    const interval = setInterval(fetchLocations, 30000);

    return () => { supabase.removeChannel(channel); clearInterval(interval); };
  }, [user, fetchLocations, refreshProfiles]);

  // Build marker and popup content with DOM nodes so profile text remains plain text.
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const map = mapRef.current;
    const seen = new Set<string>();
    const bounds = L.latLngBounds([]);
    for (const loc of locations) {
      const lat = Number(loc.latitude);
      const lng = Number(loc.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      seen.add(loc.user_id);
      const name = profiles[loc.user_id]?.full_name || 'Member';
      const avatar = profiles[loc.user_id]?.avatar_url;
      const circle = document.createElement('div');
      circle.className = 'member-map-avatar';
      circle.textContent = name.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase();
      if (avatar) {
        const img = document.createElement('img');
        img.src = avatar;
        img.alt = name;
        img.addEventListener('error', () => img.remove());
        circle.appendChild(img);
      }
      if (loc.is_live) {
        const dot = document.createElement('span');
        dot.className = 'member-map-live';
        circle.appendChild(dot);
      }
      const icon = L.divIcon({ className: 'member-map-marker', html: circle, iconSize: [44, 44], iconAnchor: [22, 22] });
      const content = document.createElement('div');
      const title = document.createElement('strong');
      title.textContent = name;
      const status = document.createElement('p');
      status.textContent = loc.is_live ? '● Live sharing' : 'Shared once';
      const time = document.createElement('small');
      time.textContent = 'Updated ' + new Date(loc.updated_at).toLocaleTimeString();
      content.append(title, status, time);
      const existing = overlaysRef.current[loc.user_id];
      if (existing) {
        existing.setLatLng([lat, lng]).setIcon(icon);
        existing.getPopup()?.setContent(content);
      } else {
        overlaysRef.current[loc.user_id] = L.marker([lat, lng], { icon, title: name })
          .addTo(map).bindPopup(content);
      }
      bounds.extend([lat, lng]);
    }
    for (const uid of Object.keys(overlaysRef.current)) {
      if (!seen.has(uid)) {
        overlaysRef.current[uid].remove();
        delete overlaysRef.current[uid];
      }
    }
    // Frame once; later realtime updates respect the user's pan/zoom.
    if (bounds.isValid() && !framedRef.current) {
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
      framedRef.current = true;
    }
  }, [locations, profiles, mapReady]);

  const upsertMyLocation = async (lat: number, lng: number, accuracy: number, live: boolean) => {
    if (!user) return;
    await supabase.from('shared_locations').upsert(
      { user_id: user.id, latitude: lat, longitude: lng, accuracy, is_live: live, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' }
    );
  };

  const shareOnce = async () => {
    if (!navigator.geolocation) {
      toast.error('Geolocation not supported');
      return;
    }
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        await upsertMyLocation(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy, false);
        try {
          await supabase.functions.invoke('send-push-notification', { body: { type: 'location_share' } });
        } catch (e) {
          console.error('Push notify failed:', e);
        }
        toast.success('Location shared');
        setBusy(false);
      },
      (err) => {
        toast.error(err.message || 'Could not get location');
        setBusy(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const acquireWakeLock = async () => {
    try {
      if ('wakeLock' in navigator) {
        wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
        wakeLockRef.current.addEventListener?.('release', () => {
          // released by browser (tab hidden); will re-acquire on visibility change
        });
      }
    } catch (e) {
      console.warn('Wake lock failed:', e);
    }
  };

  const releaseWakeLock = async () => {
    try { await wakeLockRef.current?.release?.(); } catch {}
    wakeLockRef.current = null;
  };

  const startWatch = () => {
    if (watchIdRef.current !== null) return;
    watchIdRef.current = navigator.geolocation.watchPosition(
      async (pos) => {
        lastPosRef.current = { lat: pos.coords.latitude, lng: pos.coords.longitude, acc: pos.coords.accuracy };
        await upsertMyLocation(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy, true);
        setIsLive(true);
        setBusy(false);
      },
      (err) => {
        console.warn('watch error', err);
        setBusy(false);
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 30000 }
    );
  };

  const startLive = async () => {
    if (!navigator.geolocation) {
      toast.error('Geolocation not supported');
      return;
    }
    setBusy(true);
    startWatch();
    await acquireWakeLock();

    // Keep-alive: re-upsert last known position every 20s so updated_at stays fresh
    // even if the browser throttles watchPosition in the background.
    if (keepAliveRef.current === null) {
      keepAliveRef.current = window.setInterval(() => {
        if (lastPosRef.current) {
          const { lat, lng, acc } = lastPosRef.current;
          upsertMyLocation(lat, lng, acc, true);
        }
      }, 20000);
    }

    try {
      await supabase.functions.invoke('send-push-notification', {
        body: { type: 'location_share', title: '📍 Live location', body: 'is sharing live location' },
      });
    } catch (e) {
      console.error('Push notify failed:', e);
    }
    toast.success('Live sharing started — keep this tab open');
  };

  const stopLive = async () => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (keepAliveRef.current !== null) {
      clearInterval(keepAliveRef.current);
      keepAliveRef.current = null;
    }
    await releaseWakeLock();
    lastPosRef.current = null;
    if (user) {
      await supabase.from('shared_locations').delete().eq('user_id', user.id);
    }
    setIsLive(false);
    toast.success('Live sharing stopped');
  };

  // Re-acquire wake lock and restart watch when tab becomes visible again
  useEffect(() => {
    const onVisible = async () => {
      if (document.visibilityState === 'visible' && isLive) {
        if (!wakeLockRef.current) await acquireWakeLock();
        // Re-prime the watch in case the browser stopped delivering updates
        if (watchIdRef.current !== null) {
          navigator.geolocation.clearWatch(watchIdRef.current);
          watchIdRef.current = null;
        }
        startWatch();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [isLive]);

  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
      if (keepAliveRef.current !== null) clearInterval(keepAliveRef.current);
      releaseWakeLock();
    };
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }
  if (!user) return <Navigate to="/auth" replace />;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="sticky top-3 z-30 mx-3 mt-3 flex flex-wrap gap-2 items-center justify-between px-3 py-2 glass rounded-3xl">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="apple-icon-button" onClick={() => navigate('/')}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-lg font-semibold">Live Locations</h1>
        </div>
        <div className="flex items-center gap-2">
          {!isLive ? (
            <>
              <Button size="sm" variant="outline" onClick={shareOnce} disabled={busy}>
                <MapPin className="w-4 h-4 mr-1" /> Share once
              </Button>
              <Button size="sm" onClick={startLive} disabled={busy}>
                <Radio className="w-4 h-4 mr-1" /> Go live
              </Button>
            </>
          ) : (
            <Button size="sm" variant="destructive" onClick={stopLive}>
              <Square className="w-4 h-4 mr-1" /> Stop live
            </Button>
          )}
        </div>
      </header>

      <main className="flex-1 relative min-h-[55vh] mt-3 isolate">
        <div ref={mapDivRef} className="absolute inset-0 z-0" />
        {!mapReady && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/60">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        )}
      </main>

      <footer className="px-4 pt-2 pb-24 lg:pb-3 border-t border-border text-xs text-muted-foreground">
        {locations.length} member{locations.length === 1 ? '' : 's'} sharing
        {isLive && <span className="ml-2 text-destructive font-medium">● You are live</span>}
      </footer>
    </div>
  );
};

export default LocationsMap;
