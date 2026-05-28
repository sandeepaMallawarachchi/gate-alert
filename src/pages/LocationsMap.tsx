import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { ArrowLeft, MapPin, Radio, Loader2, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface SharedLocation {
  user_id: string;
  latitude: number;
  longitude: number;
  is_live: boolean;
  updated_at: string;
  full_name?: string;
  avatar_url?: string | null;
}

const GMAPS_KEY = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY;
const TRACKING_ID = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_TRACKING_ID;

// Load google maps script once
let mapsLoader: Promise<void> | null = null;
const loadGoogleMaps = () => {
  if (mapsLoader) return mapsLoader;
  mapsLoader = new Promise<void>((resolve, reject) => {
    if ((window as any).google?.maps) return resolve();
    (window as any).__initGMaps = () => resolve();
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GMAPS_KEY}&loading=async&callback=__initGMaps&channel=${TRACKING_ID || ''}`;
    script.async = true;
    script.defer = true;
    script.onerror = () => reject(new Error('Failed to load Google Maps'));
    document.head.appendChild(script);
  });
  return mapsLoader;
};

const LocationsMap: React.FC = () => {
  const { user, profile, loading } = useAuth();
  const navigate = useNavigate();
  const mapDivRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const overlaysRef = useRef<Record<string, any>>({});
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

  // Init map
  useEffect(() => {
    if (!user) return;
    if (!GMAPS_KEY) {
      toast.error('Google Maps key missing');
      return;
    }
    loadGoogleMaps()
      .then(() => {
        if (!mapDivRef.current) return;
        const g = (window as any).google;
        mapRef.current = new g.maps.Map(mapDivRef.current, {
          center: { lat: 0, lng: 0 },
          zoom: 2,
          disableDefaultUI: false,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
        });
        setMapReady(true);
      })
      .catch((e) => toast.error(e.message));
  }, [user]);

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

  // Render/update avatar markers
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const g = (window as any).google;
    const map = mapRef.current;
    const seen = new Set<string>();
    const bounds = new g.maps.LatLngBounds();
    let hasPoints = false;

    locations.forEach((loc) => {
      seen.add(loc.user_id);
      const p = profiles[loc.user_id];
      const name = p?.full_name || 'Member';
      const avatarUrl = p?.avatar_url;
      const pos = new g.maps.LatLng(Number(loc.latitude), Number(loc.longitude));
      hasPoints = true;
      bounds.extend(pos);

      if (overlaysRef.current[loc.user_id]) {
        overlaysRef.current[loc.user_id].setPosition(pos);
      } else {
        const overlay = new g.maps.OverlayView();
        (overlay as any).position_ = pos;

        overlay.onAdd = function () {
          const div = document.createElement('div');
          div.style.cssText = 'position:absolute;cursor:pointer;transform:translate(-50%,-100%);z-index:1;';

          const size = 44;
          const circle = document.createElement('div');
          circle.style.cssText = `width:${size}px;height:${size}px;border-radius:50%;overflow:hidden;border:2.5px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.35);display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;color:#fff;font-family:system-ui,sans-serif;position:relative;`;

          if (avatarUrl) {
            circle.style.backgroundImage = `url(${avatarUrl})`;
            circle.style.backgroundSize = 'cover';
            circle.style.backgroundPosition = 'center';
          } else {
            const hue = name.split('').reduce((a, b) => a + b.charCodeAt(0), 0) % 360;
            circle.style.backgroundColor = `hsl(${hue}, 55%, 45%)`;
            const initials = name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase();
            circle.textContent = initials;
          }

          div.appendChild(circle);

          if (loc.is_live) {
            const dot = document.createElement('div');
            dot.style.cssText = 'position:absolute;bottom:1px;right:1px;width:14px;height:14px;border-radius:50%;background:#ef4444;border:2.5px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,0.3);';
            circle.appendChild(dot);
          }

          const hue = name.split('').reduce((a: number, b: string) => a + b.charCodeAt(0), 0) % 360;
          const initials = name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase();
          const avatarHtml = avatarUrl
            ? `<img src="${avatarUrl}" alt="${name}" style="width:64px;height:64px;border-radius:50%;object-fit:cover;border:2px solid #e5e7eb;" />`
            : `<div style="width:64px;height:64px;border-radius:50%;background:hsl(${hue},55%,45%);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:20px;font-family:system-ui,sans-serif;border:2px solid #e5e7eb;">${initials}</div>`;
          const infoContent = `<div style="color:#000;font-family:system-ui;font-size:13px;padding:6px 4px;display:flex;align-items:center;gap:10px;min-width:180px;">${avatarHtml}<div><strong style="font-size:14px;">${name}</strong><br/>${loc.is_live ? '<span style="color:#ef4444;">● Live sharing</span>' : 'Shared once'}<br/><small style="color:#666;">${new Date(loc.updated_at).toLocaleTimeString()}</small></div></div>`;
          const infoWindow = new g.maps.InfoWindow({ content: infoContent });
          div.addEventListener('click', () => {
            infoWindow.setPosition((overlay as any).position_);
            infoWindow.open({ map, shouldFocus: false });
          });

          (overlay as any).div_ = div;
          this.getPanes().overlayMouseTarget.appendChild(div);
        };

        overlay.draw = function () {
          const projection = this.getProjection();
          if (!projection) return;
          const point = projection.fromLatLngToDivPixel((overlay as any).position_);
          if (point && (overlay as any).div_) {
            (overlay as any).div_.style.left = point.x + 'px';
            (overlay as any).div_.style.top = point.y + 'px';
          }
        };

        overlay.onRemove = function () {
          if ((overlay as any).div_?.parentNode) {
            (overlay as any).div_.parentNode.removeChild((overlay as any).div_);
          }
        };

        (overlay as any).setPosition = function (newPos: any) {
          (overlay as any).position_ = newPos;
          overlay.draw();
        };

        overlay.setMap(map);
        overlaysRef.current[loc.user_id] = overlay;
      }
    });

    // Cleanup removed overlays
    Object.keys(overlaysRef.current).forEach((uid) => {
      if (!seen.has(uid)) {
        overlaysRef.current[uid].setMap(null);
        delete overlaysRef.current[uid];
      }
    });

    if (hasPoints) {
      map.fitBounds(bounds, 80);
      if (locations.length === 1) {
        setTimeout(() => mapRef.current?.setZoom(15), 200);
      }
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

  const startLive = async () => {
    if (!navigator.geolocation) {
      toast.error('Geolocation not supported');
      return;
    }
    setBusy(true);
    let notified = false;
    watchIdRef.current = navigator.geolocation.watchPosition(
      async (pos) => {
        await upsertMyLocation(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy, true);
        setIsLive(true);
        setBusy(false);
        if (!notified) {
          notified = true;
          try {
            await supabase.functions.invoke('send-push-notification', {
              body: { type: 'location_share', title: '📍 Live location', body: 'is sharing live location' },
            });
          } catch (e) {
            console.error('Push notify failed:', e);
          }
        }
      },
      (err) => {
        toast.error(err.message || 'Location error');
        setBusy(false);
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
    );
    toast.success('Live sharing started');
  };

  const stopLive = async () => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (user) {
      await supabase.from('shared_locations').delete().eq('user_id', user.id);
    }
    setIsLive(false);
    toast.success('Live sharing stopped');
  };

  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
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
      <header className="flex items-center justify-between p-4 border-b border-border">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
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

      <main className="flex-1 relative">
        <div ref={mapDivRef} className="absolute inset-0" />
        {!mapReady && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/60">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        )}
      </main>

      <footer className="px-4 py-2 border-t border-border text-xs text-muted-foreground">
        {locations.length} member{locations.length === 1 ? '' : 's'} sharing
        {isLive && <span className="ml-2 text-destructive font-medium">● You are live</span>}
      </footer>
    </div>
  );
};

export default LocationsMap;
