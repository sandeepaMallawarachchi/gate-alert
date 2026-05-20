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
  const markersRef = useRef<Record<string, any>>({});
  const watchIdRef = useRef<number | null>(null);
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

    return () => { supabase.removeChannel(channel); };
  }, [user, fetchLocations, refreshProfiles]);

  // Render/update markers
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const g = (window as any).google;
    const seen = new Set<string>();
    const bounds = new g.maps.LatLngBounds();
    let hasPoints = false;

    locations.forEach((loc) => {
      seen.add(loc.user_id);
      const p = profiles[loc.user_id];
      const name = p?.full_name || 'Member';
      const pos = { lat: Number(loc.latitude), lng: Number(loc.longitude) };
      hasPoints = true;
      bounds.extend(pos);

      if (markersRef.current[loc.user_id]) {
        markersRef.current[loc.user_id].setPosition(pos);
        markersRef.current[loc.user_id].setTitle(`${name}${loc.is_live ? ' (live)' : ''}`);
      } else {
        const marker = new g.maps.Marker({
          position: pos,
          map: mapRef.current,
          title: `${name}${loc.is_live ? ' (live)' : ''}`,
          label: loc.is_live
            ? { text: '●', color: '#ef4444', fontSize: '20px', fontWeight: 'bold' }
            : undefined,
        });
        const info = new g.maps.InfoWindow({
          content: `<div style="color:#000;font-family:system-ui;font-size:13px"><strong>${name}</strong><br/>${loc.is_live ? 'Live sharing' : 'Shared once'}<br/><small>${new Date(loc.updated_at).toLocaleTimeString()}</small></div>`,
        });
        marker.addListener('click', () => info.open({ map: mapRef.current, anchor: marker }));
        markersRef.current[loc.user_id] = marker;
      }
    });

    // Cleanup removed markers
    Object.keys(markersRef.current).forEach((uid) => {
      if (!seen.has(uid)) {
        markersRef.current[uid].setMap(null);
        delete markersRef.current[uid];
      }
    });

    if (hasPoints) {
      mapRef.current.fitBounds(bounds, 80);
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
    watchIdRef.current = navigator.geolocation.watchPosition(
      async (pos) => {
        await upsertMyLocation(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy, true);
        setIsLive(true);
        setBusy(false);
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
