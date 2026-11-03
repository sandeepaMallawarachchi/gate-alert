import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Public OSM tiles: normal interactive viewing only; browser caching is retained.
// Keep attribution visible and do not precache/prefetch these tiles in the PWA.
export function addMapTiles(map: L.Map) {
  return L.tileLayer(import.meta.env.VITE_MAP_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: import.meta.env.VITE_MAP_ATTRIBUTION || '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',
    maxZoom: 19,
  }).addTo(map);
}

export function officePin() {
  return L.divIcon({
    className: 'office-map-pin',
    html: '<span></span>',
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
}

// Haversine distance in meters between two coords
export const distanceMeters = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number => {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
};
