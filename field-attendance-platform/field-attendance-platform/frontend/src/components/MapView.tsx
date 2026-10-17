import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useRef } from 'react';

// Fix Leaflet default marker icons in bundlers
delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

export interface MapMarker {
  id: string | number;
  lat: number;
  lng: number;
  label: string;
  color?: string;
  status?: string;
  userId?: number;
  punchInAt?: string;
  lastUpdate?: string;
  onClick?: () => void;
}

interface MapViewProps {
  markers: MapMarker[];
  path?: [number, number][];
  height?: number | string;
  className?: string;
}

export default function MapView({
  markers,
  path,
  height = '60vh',
  className = '',
}: MapViewProps) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const initialFitDone = useRef(false);

  // Initialize Map
  useEffect(() => {
    if (!el.current) return;

    const m = L.map(el.current, {
      zoomControl: true,
      attributionControl: true,
      minZoom: 3,
      maxZoom: 19,
    }).setView([21.1702, 72.8311], 12); // Default to Surat / Gujarat central coords

    // Fast, reliable CARTO Voyager tiles with origin referrer policy
    const cartoLayer = L.tileLayer(
      'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
      {
        attribution: '&copy; <a href="https://carto.com/">CARTO</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        subdomains: 'abcd',
        maxZoom: 19,
        referrerPolicy: 'origin',
      }
    ).addTo(m);

    // Fallback error handler if CARTO is unreachable
    cartoLayer.on('tileerror', () => {
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 19,
        referrerPolicy: 'origin',
      }).addTo(m);
    });

    layer.current = L.layerGroup().addTo(m);
    map.current = m;

    // Call invalidateSize after DOM settles
    const t1 = setTimeout(() => m.invalidateSize(), 100);
    const t2 = setTimeout(() => m.invalidateSize(), 500);

    // ResizeObserver ensures map never gets stuck in zero-size grey container
    const ro = new ResizeObserver(() => {
      if (map.current) {
        map.current.invalidateSize();
      }
    });
    ro.observe(el.current);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      ro.disconnect();
      m.remove();
      map.current = null;
    };
  }, []);

  // Update Markers & Path
  useEffect(() => {
    const g = layer.current;
    const m = map.current;
    if (!g || !m) return;

    g.clearLayers();
    const pts: L.LatLngTuple[] = [];

    // Draw route path if present
    if (path && path.length > 1) {
      L.polyline(path, {
        color: '#2563eb',
        weight: 4,
        opacity: 0.8,
        lineCap: 'round',
        lineJoin: 'round',
      }).addTo(g);
      path.forEach((p) => pts.push(p));
    }

    // Add markers
    markers.forEach((mk) => {
      if (mk.lat == null || mk.lng == null || isNaN(mk.lat) || isNaN(mk.lng)) return;

      const c = mk.color ?? (mk.status === 'ACTIVE' ? '#10b981' : mk.status === 'OFFLINE' ? '#6b7280' : '#ef4444');

      // Create pulse circle marker
      const cm = L.circleMarker([mk.lat, mk.lng], {
        radius: 10,
        color: '#ffffff',
        weight: 2.5,
        fillColor: c,
        fillOpacity: 0.95,
      }).addTo(g);

      // Create rich HTML popup
      const popupDiv = document.createElement('div');
      popupDiv.className = 'p-1 font-sans text-xs text-slate-800 space-y-1.5 min-w-[180px]';

      let statusBadge = `<span class="inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
        mk.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
      }">${mk.status || 'ACTIVE'}</span>`;

      let popupHtml = `
        <div class="flex items-center justify-between gap-2 border-b border-slate-100 pb-1">
          <strong class="text-sm font-bold text-slate-900">${mk.label}</strong>
          ${statusBadge}
        </div>
      `;

      if (mk.punchInAt) {
        popupHtml += `<div class="text-[11px] text-slate-500">Punch In: <span class="text-slate-700 font-medium">${mk.punchInAt}</span></div>`;
      }
      if (mk.lastUpdate) {
        popupHtml += `<div class="text-[11px] text-slate-500">Last GPS: <span class="text-slate-700 font-medium">${mk.lastUpdate}</span></div>`;
      }
      if (mk.userId) {
        popupHtml += `
          <div class="pt-1.5 border-t border-slate-100">
            <a href="/admin/users/${mk.userId}" class="inline-flex items-center text-blue-600 hover:text-blue-800 font-semibold text-xs">
              View User Profile & Route &rarr;
            </a>
          </div>
        `;
      }

      popupDiv.innerHTML = popupHtml;
      cm.bindPopup(popupDiv);

      if (mk.onClick) {
        cm.on('click', mk.onClick);
      }

      pts.push([mk.lat, mk.lng]);
    });

    // Fit bounds on first load with markers, never on every subsequent live tick
    if (pts.length > 0 && !initialFitDone.current) {
      initialFitDone.current = true;
      m.fitBounds(L.latLngBounds(pts), { padding: [50, 50], maxZoom: 15 });
    }
  }, [markers, path]);

  const heightStyle = typeof height === 'number' ? `${height}px` : height;

  return (
    <div
      ref={el}
      style={{ height: heightStyle, minHeight: '420px' }}
      className={`w-full rounded-xl border border-slate-200 z-0 shadow-inner bg-slate-100 relative ${className}`}
    />
  );
}
