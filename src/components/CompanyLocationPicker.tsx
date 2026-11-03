import React, { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, MapPin, Crosshair } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import L from 'leaflet';
import { addMapTiles, officePin } from '@/lib/maps';
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
  latitude: 6.9271,
  longitude: 79.8612,
  radius_meters: 100,
};

const CompanyLocationPicker: React.FC<Props> = ({ open, onOpenChange }) => {
  const { user } = useAuth();
  const mapDivRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const circleRef = useRef<L.Circle | null>(null);
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
        setLoc(DEFAULT);
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

  // Initialize after the dialog content is mounted; dispose on close/reopen.
  useEffect(() => {
    if (!open || loading || !mapDivRef.current) return;
    const map = L.map(mapDivRef.current).setView([loc.latitude, loc.longitude], loc.id ? 17 : 13);
    addMapTiles(map);
    const marker = L.marker([loc.latitude, loc.longitude], { draggable: true, icon: officePin() }).addTo(map);
    const circle = L.circle([loc.latitude, loc.longitude], {
      radius: loc.radius_meters, color: '#1976e8', fillColor: '#1976e8', fillOpacity: 0.15, weight: 2,
    }).addTo(map);
    mapRef.current = map;
    markerRef.current = marker;
    circleRef.current = circle;
    const select = (lat: number, lng: number) => {
      marker.setLatLng([lat, lng]);
      circle.setLatLng([lat, lng]);
      setLoc((value) => ({ ...value, latitude: lat, longitude: lng }));
    };
    marker.on('dragend', () => { const point = marker.getLatLng(); select(point.lat, point.lng); });
    map.on('click', (event: L.LeafletMouseEvent) => select(event.latlng.lat, event.latlng.lng));
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(mapDivRef.current);
    const frame = requestAnimationFrame(() => map.invalidateSize());
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
      circleRef.current = null;
    };
    // Coordinates and radius are updated separately, without rebuilding the map.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, loading]);

  useEffect(() => {
    markerRef.current?.setLatLng([loc.latitude, loc.longitude]);
    circleRef.current?.setLatLng([loc.latitude, loc.longitude]);
    mapRef.current?.panTo([loc.latitude, loc.longitude]);
  }, [loc.latitude, loc.longitude]);

  // Update circle radius when changed
  useEffect(() => {
    if (circleRef.current) circleRef.current.setRadius(loc.radius_meters);
  }, [loc.radius_meters]);

  const useMyLocation = () => {
    if (!('geolocation' in navigator)) { toast.error('Location is not supported on this device'); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const lat = p.coords.latitude;
        const lng = p.coords.longitude;
        if (mapRef.current) {
          mapRef.current.setView([lat, lng], 17);
          markerRef.current?.setLatLng([lat, lng]);
          circleRef.current?.setLatLng([lat, lng]);
        }
        setLoc((l) => ({ ...l, latitude: lat, longitude: lng }));
      },
      () => toast.error('Could not get current location'),
    );
  };

  const save = async () => {
    if (!Number.isFinite(loc.latitude) || !Number.isFinite(loc.longitude)) {
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
      <DialogContent className="bg-card border-border max-w-2xl max-h-[90dvh] overflow-y-auto">
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
            <Label className="text-foreground">Office address (optional)</Label>
            <Input
              value={loc.address || ''}
              onChange={(event) => setLoc({ ...loc, address: event.target.value })}
              placeholder="Enter the office address"
              className="bg-input border-border"
            />
          </div>
          <div
            ref={mapDivRef}
            className="w-full h-72 rounded-2xl overflow-hidden border border-border bg-secondary isolate z-0"
          >
            {loading && <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />}
          </div>
          <p className="text-xs text-muted-foreground">
            Tap the map or drag the blue pin to set the office. Members can only check in inside this circle.
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={useMyLocation} className="flex-1">
              <Crosshair className="w-4 h-4 mr-2" /> Use my current location
            </Button>
            <Button onClick={save} disabled={saving || loading} className="flex-1">
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
