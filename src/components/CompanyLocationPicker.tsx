import React, { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, MapPin, Crosshair } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { loadGoogleMaps } from '@/lib/googleMaps';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

interface Loc {
  id?: string;
  name: string;
  address: string | null;
  latitude: number;
  longitude: number;
  radius_meters: number;
}

const DEFAULT: Loc = {
  name: 'Office',
  address: '',
  latitude: 0,
  longitude: 0,
  radius_meters: 100,
};

const CompanyLocationPicker: React.FC<Props> = ({ open, onOpenChange }) => {
  const { user } = useAuth();
  const mapDivRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const circleRef = useRef<any>(null);
  const [loc, setLoc] = useState<Loc>(DEFAULT);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Load existing
  useEffect(() => {
    if (!open) return;
    (async () => {
      setLoading(true);
      const { data } = await supabase.from('company_location').select('*').limit(1).maybeSingle();
      if (data) {
        setLoc({
          id: data.id,
          name: data.name,
          address: data.address,
          latitude: data.latitude,
          longitude: data.longitude,
          radius_meters: data.radius_meters,
        });
      } else {
        // Try to prefill with device location
        if ('geolocation' in navigator) {
          navigator.geolocation.getCurrentPosition(
            (p) =>
              setLoc((l) => ({ ...l, latitude: p.coords.latitude, longitude: p.coords.longitude })),
            () => {},
          );
        }
      }
      setLoading(false);
    })();
  }, [open]);

  // Init map when open + loaded
  useEffect(() => {
    if (!open || loading) return;
    let cancelled = false;
    loadGoogleMaps()
      .then(() => {
        if (cancelled || !mapDivRef.current) return;
        const g = (window as any).google;
        const center = { lat: loc.latitude || 0, lng: loc.longitude || 0 };
        mapRef.current = new g.maps.Map(mapDivRef.current, {
          center,
          zoom: loc.latitude ? 17 : 3,
          disableDefaultUI: true,
          zoomControl: true,
        });
        markerRef.current = new g.maps.Marker({
          map: mapRef.current,
          position: center,
          draggable: true,
        });
        circleRef.current = new g.maps.Circle({
          map: mapRef.current,
          center,
          radius: loc.radius_meters,
          fillColor: '#f59e0b',
          fillOpacity: 0.15,
          strokeColor: '#f59e0b',
          strokeOpacity: 0.9,
          strokeWeight: 2,
        });
        markerRef.current.addListener('dragend', () => {
          const p = markerRef.current.getPosition();
          const lat = p.lat();
          const lng = p.lng();
          circleRef.current.setCenter({ lat, lng });
          setLoc((l) => ({ ...l, latitude: lat, longitude: lng }));
        });
        mapRef.current.addListener('click', (e: any) => {
          const lat = e.latLng.lat();
          const lng = e.latLng.lng();
          markerRef.current.setPosition({ lat, lng });
          circleRef.current.setCenter({ lat, lng });
          setLoc((l) => ({ ...l, latitude: lat, longitude: lng }));
        });

        // Places autocomplete
        if (searchInputRef.current && g.maps.places?.Autocomplete) {
          const ac = new g.maps.places.Autocomplete(searchInputRef.current, {
            fields: ['geometry', 'formatted_address', 'name'],
          });
          ac.bindTo('bounds', mapRef.current);
          ac.addListener('place_changed', () => {
            const place = ac.getPlace();
            if (!place.geometry?.location) return;
            const lat = place.geometry.location.lat();
            const lng = place.geometry.location.lng();
            mapRef.current.setCenter({ lat, lng });
            mapRef.current.setZoom(17);
            markerRef.current.setPosition({ lat, lng });
            circleRef.current.setCenter({ lat, lng });
            setLoc((l) => ({
              ...l,
              latitude: lat,
              longitude: lng,
              address: place.formatted_address || l.address,
              name: place.name || l.name,
            }));
          });
        }
      })
      .catch((e) => toast.error(e.message));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, loading]);

  // Update circle radius when changed
  useEffect(() => {
    if (circleRef.current) circleRef.current.setRadius(loc.radius_meters);
  }, [loc.radius_meters]);

  const useMyLocation = () => {
    if (!('geolocation' in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const lat = p.coords.latitude;
        const lng = p.coords.longitude;
        if (mapRef.current) {
          mapRef.current.setCenter({ lat, lng });
          mapRef.current.setZoom(17);
          markerRef.current?.setPosition({ lat, lng });
          circleRef.current?.setCenter({ lat, lng });
        }
        setLoc((l) => ({ ...l, latitude: lat, longitude: lng }));
      },
      () => toast.error('Could not get current location'),
    );
  };

  const save = async () => {
    if (!loc.latitude || !loc.longitude) {
      toast.error('Please pick a location on the map');
      return;
    }
    setSaving(true);
    const payload = {
      name: loc.name || 'Office',
      address: loc.address,
      latitude: loc.latitude,
      longitude: loc.longitude,
      radius_meters: loc.radius_meters,
      updated_by: user?.id,
    };
    const { error } = loc.id
      ? await supabase.from('company_location').update(payload).eq('id', loc.id)
      : await supabase.from('company_location').insert(payload);
    setSaving(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success('Company location saved');
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-foreground flex items-center gap-2">
            <MapPin className="w-5 h-5 text-primary" /> Company Location
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label className="text-foreground">Name</Label>
              <Input
                value={loc.name}
                onChange={(e) => setLoc({ ...loc, name: e.target.value })}
                className="bg-input border-border"
              />
            </div>
            <div>
              <Label className="text-foreground">Allowed radius (m)</Label>
              <Input
                type="number"
                min={20}
                max={2000}
                value={loc.radius_meters}
                onChange={(e) =>
                  setLoc({ ...loc, radius_meters: Math.max(20, Number(e.target.value) || 100) })
                }
                className="bg-input border-border"
              />
            </div>
          </div>
          <div>
            <Label className="text-foreground">Search address</Label>
            <Input
              ref={searchInputRef}
              placeholder="Search for an address or place"
              className="bg-input border-border"
            />
          </div>
          <div
            ref={mapDivRef}
            className="w-full h-72 rounded-md overflow-hidden border border-border bg-secondary flex items-center justify-center"
          >
            {loading && <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />}
          </div>
          <p className="text-xs text-muted-foreground">
            Tap on the map or drag the marker. Members can only check in inside this circle.
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={useMyLocation} className="flex-1">
              <Crosshair className="w-4 h-4 mr-2" /> Use my current location
            </Button>
            <Button onClick={save} disabled={saving} className="flex-1">
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Save location
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CompanyLocationPicker;
