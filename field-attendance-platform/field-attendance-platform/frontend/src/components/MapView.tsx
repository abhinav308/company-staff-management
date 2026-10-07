import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useRef } from 'react';

export interface MapMarker { id: string | number; lat: number; lng: number; label: string; color?: string; onClick?: () => void }

/**
 * Map provider abstraction: pages only use <MapView markers path />.
 * Currently Leaflet + OpenStreetMap tiles (no API key). To move to Mapbox / Google Maps, replace this file only.
 * Note: OSM's public tile server is for light/dev use; use a hosted tile provider in production.
 */
export default function MapView({ markers, path, height = 420 }: { markers: MapMarker[]; path?: [number, number][]; height?: number }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const fitKey = useRef('');

  useEffect(() => {
    const m = L.map(el.current!).setView([20.59, 78.96], 5);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors', maxZoom: 19,
    }).addTo(m);
    layer.current = L.layerGroup().addTo(m);
    map.current = m;
    return () => { m.remove(); map.current = null; };
  }, []);

  useEffect(() => {
    const g = layer.current, m = map.current;
    if (!g || !m) return;
    g.clearLayers();
    const pts: L.LatLngTuple[] = [];
    if (path && path.length > 1) {
      L.polyline(path, { color: '#2563eb', weight: 3 }).addTo(g);
      path.forEach((p) => pts.push(p));
    }
    markers.forEach((mk) => {
      const c = mk.color ?? '#16a34a';
      const cm = L.circleMarker([mk.lat, mk.lng], { radius: 9, color: '#fff', weight: 2, fillColor: c, fillOpacity: 1 }).addTo(g);
      const tip = document.createElement('div');
      tip.textContent = mk.label; // textContent: labels contain user-controlled names
      cm.bindPopup(tip);
      if (mk.onClick) cm.on('click', mk.onClick);
      pts.push([mk.lat, mk.lng]);
    });
    const key = `${markers.length}:${path?.length ?? 0}`;
    if (pts.length && key !== fitKey.current) {
      fitKey.current = key;
      m.fitBounds(L.latLngBounds(pts), { padding: [40, 40], maxZoom: 16 });
    }
  }, [markers, path]);

  return <div ref={el} style={{ height }} className="w-full rounded-xl border border-slate-200 z-0" />;
}
