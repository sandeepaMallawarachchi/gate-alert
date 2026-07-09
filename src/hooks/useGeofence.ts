import { useEffect, useRef, useState } from 'react';
import { distanceMeters } from '@/lib/googleMaps';

export interface CompanyLocation {
  latitude: number;
  longitude: number;
  radius_meters: number;
}

export interface GeofenceState {
  position: { lat: number; lng: number; accuracy: number } | null;
  distance: number | null;
  inRange: boolean;
  error: string | null;
  requesting: boolean;
}

export function useGeofence(company: CompanyLocation | null): GeofenceState {
  const [position, setPosition] = useState<GeofenceState['position']>(null);
  const [error, setError] = useState<string | null>(null);
  const [requesting, setRequesting] = useState(true);
  const watchRef = useRef<number | null>(null);

  useEffect(() => {
    if (!('geolocation' in navigator)) {
      setError('Location not supported on this device');
      setRequesting(false);
      return;
    }
    setRequesting(true);
    watchRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        setPosition({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        });
        setError(null);
        setRequesting(false);
      },
      (err) => {
        setError(err.message || 'Unable to get your location');
        setRequesting(false);
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
    );
    return () => {
      if (watchRef.current !== null) navigator.geolocation.clearWatch(watchRef.current);
    };
  }, []);

  const distance =
    position && company
      ? distanceMeters(position.lat, position.lng, company.latitude, company.longitude)
      : null;

  const inRange = distance !== null && company !== null && distance <= company.radius_meters;

  return { position, distance, inRange, error, requesting };
}
