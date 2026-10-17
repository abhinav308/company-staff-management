import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './MapView.css';

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
  rawPunchInAt?: string;
  rawLastUpdate?: string;
  accuracy?: number;
  duration?: string | number;
  onClick?: () => void;
}

interface MapViewProps {
  markers: MapMarker[];
  path?: [number, number][];
  height?: number | string;
  className?: string;
  selectedId?: string | number | null;
  onSelect?: (id: string | number) => void;
  showOfficersList?: boolean;
  showControls?: boolean;
  showLegend?: boolean;
  showSearch?: boolean;
  theme?: 'light' | 'dark';
}

function getInitials(name: string): string {
  if (!name) return '??';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function formatRelativeTime(dateStr?: string): string {
  if (!dateStr) return 'Unknown';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const now = new Date();
  const diffSec = Math.max(0, Math.floor((now.getTime() - d.getTime()) / 1000));
  if (diffSec < 15) return 'Just now';
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  return `${diffHours}h ago`;
}

function getAccuracySignal(accuracy?: number): { label: string; bars: number; color: string } {
  if (accuracy == null || isNaN(accuracy)) return { label: 'Good GPS', bars: 4, color: 'bg-emerald-500' };
  if (accuracy <= 10) return { label: 'High (±' + Math.round(accuracy) + 'm)', bars: 5, color: 'bg-emerald-500' };
  if (accuracy <= 25) return { label: 'Good (±' + Math.round(accuracy) + 'm)', bars: 4, color: 'bg-emerald-500' };
  if (accuracy <= 50) return { label: 'Moderate (±' + Math.round(accuracy) + 'm)', bars: 3, color: 'bg-amber-500' };
  if (accuracy <= 100) return { label: 'Fair (±' + Math.round(accuracy) + 'm)', bars: 2, color: 'bg-amber-500' };
  return { label: 'Low (±' + Math.round(accuracy) + 'm)', bars: 1, color: 'bg-rose-500' };
}

export default function MapView({
  markers,
  path,
  height = '65vh',
  className = '',
  selectedId,
  onSelect,
  showOfficersList = true,
  showControls = true,
  showLegend = true,
  showSearch = true,
  theme: initialTheme = 'light',
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);

  // Map instance references
  const mapLibreRef = useRef<maplibregl.Map | null>(null);
  const leafletMapRef = useRef<L.Map | null>(null);
  const leafletLayerRef = useRef<L.LayerGroup | null>(null);
  const isMapLibreSupported = useRef<boolean>(true);

  // Marker storage for in-place position updates
  const activeMarkersRef = useRef<Map<string | number, {
    marker: maplibregl.Marker | L.Marker;
    currentCoords: [number, number];
    targetCoords: [number, number];
    animFrame?: number;
  }>>(new Map());

  // UI state
  const [currentTheme, setCurrentTheme] = useState<'light' | 'dark'>(initialTheme);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'UNAVAILABLE' | 'OFFLINE'>('ALL');
  const [listCollapsed, setListCollapsed] = useState(false);
  const [selectedMarkerId, setSelectedMarkerId] = useState<string | number | null>(selectedId ?? null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showRouteLayer, setShowRouteLayer] = useState(true);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [noticeDismissed, setNoticeDismissed] = useState(false);
  const [lastUpdateSec, setLastUpdateSec] = useState(0);

  const apiKey = import.meta.env.VITE_MAP_API_KEY || '';
  const stylePreset = import.meta.env.VITE_MAP_STYLE || '';

  // Timer for relative update ticker
  useEffect(() => {
    const timer = setInterval(() => {
      setLastUpdateSec((prev) => (prev >= 60 ? 1 : prev + 1));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Filtered and sorted markers
  const filteredMarkers = useMemo(() => {
    let result = markers.filter((m) => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesName = m.label.toLowerCase().includes(q);
        const matchesStatus = m.status?.toLowerCase().includes(q);
        if (!matchesName && !matchesStatus) return false;
      }

      if (statusFilter === 'ACTIVE') return m.status === 'ACTIVE';
      if (statusFilter === 'UNAVAILABLE') {
        return m.status === 'LOCATION_UNAVAILABLE' || m.status === 'PERMISSION_DENIED';
      }
      if (statusFilter === 'OFFLINE') {
        return m.status === 'OFFLINE' || m.status === 'PAUSED';
      }
      return true;
    });

    // Unavailable officers sorted to the top
    result.sort((a, b) => {
      const aUnavail = a.status === 'LOCATION_UNAVAILABLE' || a.status === 'PERMISSION_DENIED';
      const bUnavail = b.status === 'LOCATION_UNAVAILABLE' || b.status === 'PERMISSION_DENIED';
      if (aUnavail && !bUnavail) return -1;
      if (!aUnavail && bUnavail) return 1;
      return a.label.localeCompare(b.label);
    });

    return result;
  }, [markers, searchQuery, statusFilter]);

  // Counts for status chips
  const counts = useMemo(() => {
    const tracking = markers.filter((m) => m.status === 'ACTIVE').length;
    const unavailable = markers.filter(
      (m) => m.status === 'LOCATION_UNAVAILABLE' || m.status === 'PERMISSION_DENIED'
    ).length;
    const offline = markers.filter((m) => m.status === 'OFFLINE' || m.status === 'PAUSED').length;
    return {
      all: markers.length,
      tracking,
      unavailable,
      offline,
    };
  }, [markers]);

  // Handle Fullscreen Toggle
  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  // Center/Fit All Bounds
  const handleFitAll = () => {
    const pts = markers.filter((m) => !isNaN(m.lat) && !isNaN(m.lng));
    if (pts.length === 0) return;

    if (mapLibreRef.current) {
      const bounds = new maplibregl.LngLatBounds();
      pts.forEach((p) => bounds.extend([p.lng, p.lat]));
      mapLibreRef.current.fitBounds(bounds, { padding: 80, maxZoom: 16, duration: 1000 });
    } else if (leafletMapRef.current) {
      const latlngs: L.LatLngTuple[] = pts.map((p) => [p.lat, p.lng]);
      leafletMapRef.current.fitBounds(L.latLngBounds(latlngs), { padding: [60, 60], maxZoom: 16 });
    }
  };

  // Fly to specific marker
  const flyToMarker = (marker: MapMarker) => {
    setSelectedMarkerId(marker.id);
    onSelect?.(marker.id);

    if (mapLibreRef.current) {
      mapLibreRef.current.flyTo({
        center: [marker.lng, marker.lat],
        zoom: 16,
        essential: true,
        duration: 1200,
      });
    } else if (leafletMapRef.current) {
      leafletMapRef.current.flyTo([marker.lat, marker.lng], 16, { duration: 1 });
    }
  };

  // Helper to get MapLibre style JSON
  const getMapLibreStyle = (isDark: boolean): maplibregl.StyleSpecification | string => {
    if (apiKey) {
      if (stylePreset.startsWith('http')) return stylePreset;
      // Default to MapTiler vector styles if apiKey present
      const maptilerStyle = isDark ? 'dataviz-dark' : 'streets-v2';
      return `https://api.maptiler.com/maps/${stylePreset || maptilerStyle}/style.json?key=${apiKey}`;
    }

    // Clean Raster OpenStreetMap Fallback (No key, zero watermarks)
    return {
      version: 8,
      sources: {
        'osm-raster': {
          type: 'raster',
          tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
          tileSize: 256,
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors',
        },
      },
      layers: [
        {
          id: 'osm-raster-layer',
          type: 'raster',
          source: 'osm-raster',
          minzoom: 0,
          maxzoom: 19,
        },
      ],
    };
  };

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    let destroyed = false;

    // Check WebGL support for MapLibre
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      isMapLibreSupported.current = !!gl;
    } catch {
      isMapLibreSupported.current = false;
    }

    if (isMapLibreSupported.current) {
      try {
        const isDark = currentTheme === 'dark';
        const style = getMapLibreStyle(isDark);

        const m = new maplibregl.Map({
          container: mapContainerRef.current,
          style: style as any,
          center: [72.8311, 21.1702], // Default Surat / Gujarat central coords
          zoom: 12,
          attributionControl: false,
        });

        // Clean custom attribution
        m.addControl(
          new maplibregl.AttributionControl({
            compact: true,
            customAttribution: '&copy; OpenStreetMap contributors',
          }),
          'bottom-right'
        );

        m.on('load', () => {
          if (destroyed) return;
          mapLibreRef.current = m;
          setMapLoaded(true);
          m.resize();
        });

        mapLibreRef.current = m;
      } catch (err) {
        console.warn('MapLibre init failed, falling back to Leaflet:', err);
        isMapLibreSupported.current = false;
      }
    }

    // Fallback: Leaflet if WebGL not supported or MapLibre init failed
    if (!isMapLibreSupported.current) {
      const lm = L.map(mapContainerRef.current, {
        zoomControl: false,
        attributionControl: true,
      }).setView([21.1702, 72.8311], 12);

      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 19,
        referrerPolicy: 'origin',
      }).addTo(lm);

      leafletLayerRef.current = L.layerGroup().addTo(lm);
      leafletMapRef.current = lm;
      setMapLoaded(true);
    }

    // ResizeObserver for sidebar collapse/expand & window resize
    const ro = new ResizeObserver(() => {
      if (mapLibreRef.current) {
        mapLibreRef.current.resize();
      }
      if (leafletMapRef.current) {
        leafletMapRef.current.invalidateSize();
      }
    });

    if (containerRef.current) ro.observe(containerRef.current);

    return () => {
      destroyed = true;
      ro.disconnect();
      if (mapLibreRef.current) {
        mapLibreRef.current.remove();
        mapLibreRef.current = null;
      }
      if (leafletMapRef.current) {
        leafletMapRef.current.remove();
        leafletMapRef.current = null;
      }
      activeMarkersRef.current.clear();
    };
  }, []);

  // Handle Theme Switching (Light / Dark)
  useEffect(() => {
    if (!mapLoaded) return;
    const isDark = currentTheme === 'dark';

    if (mapLibreRef.current) {
      const newStyle = getMapLibreStyle(isDark);
      mapLibreRef.current.setStyle(newStyle as any);
    }
  }, [currentTheme, mapLoaded]);

  // Update Markers (In-Place Position Animation & Smooth Interpolation)
  useEffect(() => {
    if (!mapLoaded) return;

    const existingMap = activeMarkersRef.current;
    const currentMarkerIds = new Set(markers.map((m) => String(m.id)));

    // Remove markers that are no longer present
    existingMap.forEach((entry, id) => {
      if (!currentMarkerIds.has(String(id))) {
        if (entry.animFrame) cancelAnimationFrame(entry.animFrame);
        if ('remove' in entry.marker) entry.marker.remove();
        existingMap.delete(id);
      }
    });

    // Create or update markers
    markers.forEach((m) => {
      if (m.lat == null || m.lng == null || isNaN(m.lat) || isNaN(m.lng)) return;
      const idKey = String(m.id);
      const isSelected = selectedMarkerId === m.id;
      const targetCoords: [number, number] = [m.lng, m.lat];

      const statusClass =
        m.status === 'ACTIVE'
          ? 'status-active'
          : m.status === 'LOCATION_UNAVAILABLE' || m.status === 'PERMISSION_DENIED'
          ? 'status-unavailable'
          : 'status-paused';

      const accuracyInfo = getAccuracySignal(m.accuracy);
      const initials = getInitials(m.label);
      const relativeTime = formatRelativeTime(m.rawLastUpdate || m.lastUpdate);

      // Popup Content Card HTML
      const popupHtml = `
        <div class="p-3.5 font-sans min-w-[240px] max-w-[280px] text-slate-800 space-y-2.5">
          <div class="flex items-start gap-2.5">
            <div class="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm shrink-0 border-2 ${
              m.status === 'ACTIVE'
                ? 'bg-emerald-50 text-emerald-700 border-emerald-400'
                : m.status === 'LOCATION_UNAVAILABLE' || m.status === 'PERMISSION_DENIED'
                ? 'bg-rose-50 text-rose-700 border-rose-400'
                : 'bg-amber-50 text-amber-700 border-amber-400'
            }">
              ${initials}
            </div>
            <div class="flex-1 min-w-0">
              <h4 class="font-bold text-sm text-slate-900 truncate leading-tight">${m.label}</h4>
              <div class="flex items-center gap-1.5 mt-0.5">
                <span class="inline-block w-2 h-2 rounded-full ${
                  m.status === 'ACTIVE'
                    ? 'bg-emerald-500 animate-pulse'
                    : m.status === 'LOCATION_UNAVAILABLE' || m.status === 'PERMISSION_DENIED'
                    ? 'bg-rose-500'
                    : 'bg-amber-500'
                }"></span>
                <span class="text-[11px] font-semibold text-slate-600 uppercase tracking-wider">
                  ${m.status || 'Active'}
                </span>
              </div>
            </div>
          </div>

          <div class="bg-slate-50 rounded-lg p-2 text-xs space-y-1 border border-slate-100">
            ${
              m.punchInAt
                ? `<div class="flex justify-between text-slate-500">
                    <span>Punch In:</span>
                    <strong class="text-slate-800">${m.punchInAt}</strong>
                  </div>`
                : ''
            }
            <div class="flex justify-between text-slate-500">
              <span>Last GPS Ping:</span>
              <strong class="text-slate-800">${relativeTime}</strong>
            </div>
            <div class="flex justify-between items-center text-slate-500 pt-0.5">
              <span>Signal Precision:</span>
              <div class="flex items-center gap-1">
                <span class="text-[10px] text-slate-600">${accuracyInfo.label}</span>
                <div class="flex gap-0.5">
                  ${[1, 2, 3, 4, 5]
                    .map(
                      (b) =>
                        `<span class="w-1 h-2.5 rounded-sm ${
                          b <= accuracyInfo.bars ? accuracyInfo.color : 'bg-slate-200'
                        }"></span>`
                    )
                    .join('')}
                </div>
              </div>
            </div>
          </div>

          <div class="flex items-center gap-2 pt-1 border-t border-slate-100">
            ${
              m.userId
                ? `<a href="/admin/users/${m.userId}" class="flex-1 text-center py-1.5 px-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold text-xs transition-colors shadow-sm">
                    View Profile
                  </a>`
                : ''
            }
            <button
              type="button"
              onclick="window.dispatchEvent(new CustomEvent('map-show-route', { detail: { id: '${m.id}', userId: ${m.userId || 0} } }))"
              class="flex-1 text-center py-1.5 px-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-semibold text-xs transition-colors border border-slate-200"
            >
              Show Route
            </button>
          </div>
        </div>
      `;

      if (existingMap.has(idKey)) {
        // In-place update existing marker with smooth interpolation
        const entry = existingMap.get(idKey)!;
        const [startLng, startLat] = entry.currentCoords;
        const [endLng, endLat] = targetCoords;

        if (startLng !== endLng || startLat !== endLat) {
          if (entry.animFrame) cancelAnimationFrame(entry.animFrame);
          const startTime = performance.now();
          const duration = 500; // 500ms smooth interpolation

          const animate = (now: number) => {
            const elapsed = now - startTime;
            const progress = Math.min(1, elapsed / duration);
            // Ease-out cubic
            const ease = 1 - Math.pow(1 - progress, 3);
            const curLng = startLng + (endLng - startLng) * ease;
            const curLat = startLat + (endLat - startLat) * ease;

            entry.currentCoords = [curLng, curLat];
            if (mapLibreRef.current && 'setLngLat' in entry.marker) {
              (entry.marker as maplibregl.Marker).setLngLat([curLng, curLat]);
            } else if (leafletMapRef.current && 'setLatLng' in entry.marker) {
              (entry.marker as L.Marker).setLatLng([curLat, curLng]);
            }

            if (progress < 1) {
              entry.animFrame = requestAnimationFrame(animate);
            }
          };
          entry.animFrame = requestAnimationFrame(animate);
        }

        // Update popup content
        if (mapLibreRef.current && 'getPopup' in entry.marker) {
          const popup = (entry.marker as maplibregl.Marker).getPopup();
          if (popup) popup.setHTML(popupHtml);
        }
      } else {
        // Create new interactive marker
        const el = document.createElement('div');
        el.className = `officer-map-marker ${isSelected ? 'selected' : ''}`;
        el.setAttribute('role', 'button');
        el.setAttribute('tabindex', '0');
        el.setAttribute('aria-label', `Officer ${m.label}, Status: ${m.status}`);

        const avatar = document.createElement('div');
        avatar.className = `officer-avatar-circle ${statusClass}`;
        avatar.textContent = initials;
        el.appendChild(avatar);

        if (mapLibreRef.current) {
          const popup = new maplibregl.Popup({
            offset: 25,
            closeButton: true,
            className: 'modern-map-popup',
          }).setHTML(popupHtml);

          const marker = new maplibregl.Marker({ element: el })
            .setLngLat(targetCoords)
            .setPopup(popup)
            .addTo(mapLibreRef.current);

          el.addEventListener('click', () => {
            setSelectedMarkerId(m.id);
            onSelect?.(m.id);
            m.onClick?.();
          });

          el.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              setSelectedMarkerId(m.id);
              onSelect?.(m.id);
              marker.togglePopup();
            }
          });

          existingMap.set(idKey, {
            marker,
            currentCoords: targetCoords,
            targetCoords,
          });
        } else if (leafletMapRef.current && leafletLayerRef.current) {
          const customIcon = L.divIcon({
            html: el,
            className: 'officer-leaflet-custom',
            iconSize: [44, 44],
            iconAnchor: [22, 22],
          });

          const marker = L.marker([m.lat, m.lng], { icon: customIcon })
            .bindPopup(popupHtml)
            .addTo(leafletLayerRef.current);

          marker.on('click', () => {
            setSelectedMarkerId(m.id);
            onSelect?.(m.id);
            m.onClick?.();
          });

          existingMap.set(idKey, {
            marker,
            currentCoords: targetCoords,
            targetCoords,
          });
        }
      }
    });
  }, [markers, mapLoaded, selectedMarkerId]);

  // Route Path Rendering (Gradient polyline with start/end flags)
  useEffect(() => {
    if (!mapLoaded || !showRouteLayer) return;

    if (mapLibreRef.current) {
      const m = mapLibreRef.current;
      const sourceId = 'officer-route-source';
      const layerId = 'officer-route-line';
      const casingId = 'officer-route-casing';

      if (path && path.length > 1) {
        const coordinates = path.map(([lat, lng]) => [lng, lat]);
        const geojson: GeoJSON.Feature<GeoJSON.LineString> = {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates,
          },
        };

        if (m.getSource(sourceId)) {
          (m.getSource(sourceId) as maplibregl.GeoJSONSource).setData(geojson);
        } else {
          m.addSource(sourceId, { type: 'geojson', data: geojson });

          m.addLayer({
            id: casingId,
            type: 'line',
            source: sourceId,
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: {
              'line-color': '#ffffff',
              'line-width': 7,
              'line-opacity': 0.8,
            },
          });

          m.addLayer({
            id: layerId,
            type: 'line',
            source: sourceId,
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: {
              'line-color': '#2563eb',
              'line-width': 4,
              'line-opacity': 0.9,
            },
          });
        }
      } else {
        if (m.getLayer(layerId)) m.removeLayer(layerId);
        if (m.getLayer(casingId)) m.removeLayer(casingId);
        if (m.getSource(sourceId)) m.removeSource(sourceId);
      }
    }
  }, [path, mapLoaded, showRouteLayer]);

  const heightStyle = typeof height === 'number' ? `${height}px` : height;

  return (
    <div
      ref={containerRef}
      style={{ height: heightStyle, minHeight: '480px' }}
      className={`relative w-full rounded-2xl overflow-hidden border border-slate-200/80 shadow-lg bg-slate-100 flex flex-col ${
        currentTheme === 'dark' ? 'dark-map' : ''
      } ${className}`}
    >
      {/* Map Rendering Div */}
      <div
        ref={mapContainerRef}
        className={`w-full h-full relative z-0 ${
          currentTheme === 'dark' && !apiKey ? 'dark-map-tiles' : ''
        }`}
      />

      {/* Demo Tile Notice Banner (Bottom Center) */}
      {!apiKey && !noticeDismissed && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-900/85 backdrop-blur-md text-white text-[11px] shadow-lg border border-slate-700/60 max-w-[90%] sm:max-w-md">
          <svg className="w-3.5 h-3.5 text-amber-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="truncate flex-1">Using demo map tiles. Set VITE_MAP_API_KEY in .env for production vector tiles.</span>
          <button
            type="button"
            onClick={() => setNoticeDismissed(true)}
            className="text-slate-400 hover:text-white font-bold ml-1"
            title="Dismiss notice"
          >
            &times;
          </button>
        </div>
      )}

      {/* Top Left Floating Search & Filter Bar */}
      {showSearch && (
        <div className="absolute top-3.5 left-3.5 z-20 flex flex-col gap-2 max-w-[calc(100%-4rem)] sm:max-w-md">
          {/* Glass Search Input */}
          <div className="relative flex items-center">
            <input
              type="text"
              placeholder="Search officer by name or status..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-white/90 dark:bg-slate-900/90 backdrop-blur-md text-slate-800 dark:text-slate-100 placeholder-slate-400 text-xs rounded-xl pl-9 pr-8 py-2 border border-slate-200/80 dark:border-slate-700/80 shadow-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <svg
              className="w-4 h-4 text-slate-400 absolute left-2.5 pointer-events-none"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xs"
              >
                &times;
              </button>
            )}
          </div>

          {/* Filter Status Chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5 whitespace-nowrap">
            <button
              type="button"
              onClick={() => setStatusFilter('ALL')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all backdrop-blur-md shadow-sm ${
                statusFilter === 'ALL'
                  ? 'bg-blue-600 text-white shadow-blue-500/20'
                  : 'bg-white/85 dark:bg-slate-800/85 text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800'
              }`}
            >
              All ({counts.all})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('ACTIVE')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all backdrop-blur-md shadow-sm flex items-center gap-1 ${
                statusFilter === 'ACTIVE'
                  ? 'bg-emerald-600 text-white shadow-emerald-500/20'
                  : 'bg-white/85 dark:bg-slate-800/85 text-emerald-700 dark:text-emerald-400 hover:bg-white dark:hover:bg-slate-800'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
              Tracking ({counts.tracking})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('UNAVAILABLE')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all backdrop-blur-md shadow-sm flex items-center gap-1 ${
                statusFilter === 'UNAVAILABLE'
                  ? 'bg-rose-600 text-white shadow-rose-500/20'
                  : 'bg-white/85 dark:bg-slate-800/85 text-rose-700 dark:text-rose-400 hover:bg-white dark:hover:bg-slate-800'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-rose-400"></span>
              Unavailable ({counts.unavailable})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('OFFLINE')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all backdrop-blur-md shadow-sm flex items-center gap-1 ${
                statusFilter === 'OFFLINE'
                  ? 'bg-amber-600 text-white shadow-amber-500/20'
                  : 'bg-white/85 dark:bg-slate-800/85 text-amber-700 dark:text-amber-400 hover:bg-white dark:hover:bg-slate-800'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
              Offline ({counts.offline})
            </button>
          </div>
        </div>
      )}

      {/* Right Side Collapsible Officers on Duty Drawer */}
      {showOfficersList && markers.length > 0 && (
        <div
          className={`absolute top-3.5 right-3.5 z-20 flex flex-col transition-all duration-300 max-h-[calc(100%-2rem)] ${
            listCollapsed ? 'w-10' : 'w-64 sm:w-72'
          }`}
        >
          <div className="bg-white/90 dark:bg-slate-900/90 backdrop-blur-md rounded-2xl border border-slate-200/80 dark:border-slate-700/80 shadow-xl overflow-hidden flex flex-col">
            {/* Drawer Header */}
            <div className="px-3 py-2.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
              {!listCollapsed && (
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0"></span>
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">
                    Officers on Duty ({filteredMarkers.length})
                  </span>
                </div>
              )}
              <button
                type="button"
                onClick={() => setListCollapsed(!listCollapsed)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors ml-auto"
                title={listCollapsed ? 'Expand officers list' : 'Collapse list'}
              >
                <svg
                  className={`w-4 h-4 transition-transform ${listCollapsed ? 'rotate-180' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>

            {/* Officer List Items */}
            {!listCollapsed && (
              <div className="overflow-y-auto max-h-72 divide-y divide-slate-100 dark:divide-slate-800/60 p-1">
                {filteredMarkers.length === 0 ? (
                  <div className="py-6 text-center text-xs text-slate-400">
                    No matching officers found
                  </div>
                ) : (
                  filteredMarkers.map((m) => {
                    const initials = getInitials(m.label);
                    const isSelected = selectedMarkerId === m.id;
                    const isUnavail =
                      m.status === 'LOCATION_UNAVAILABLE' || m.status === 'PERMISSION_DENIED';

                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => flyToMarker(m)}
                        className={`w-full flex items-center gap-2.5 p-2 rounded-xl text-left transition-all group ${
                          isSelected
                            ? 'bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800'
                            : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                        }`}
                      >
                        <div
                          className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs shrink-0 border ${
                            m.status === 'ACTIVE'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-400'
                              : isUnavail
                              ? 'bg-rose-50 text-rose-700 border-rose-400'
                              : 'bg-amber-50 text-amber-700 border-amber-400'
                          }`}
                        >
                          {initials}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-xs text-slate-900 dark:text-slate-100 truncate">
                            {m.label}
                          </p>
                          <div className="flex items-center gap-1.5 text-[10px] text-slate-500 dark:text-slate-400">
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${
                                m.status === 'ACTIVE'
                                  ? 'bg-emerald-500'
                                  : isUnavail
                                  ? 'bg-rose-500'
                                  : 'bg-amber-500'
                              }`}
                            ></span>
                            <span className="truncate">{m.status || 'Active'}</span>
                            <span>·</span>
                            <span className="truncate">{formatRelativeTime(m.rawLastUpdate || m.lastUpdate)}</span>
                          </div>
                        </div>
                        <svg
                          className="w-3.5 h-3.5 text-slate-300 group-hover:text-blue-500 transition-colors shrink-0"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </button>
                    );
                  })
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Floating Controls Cluster (Bottom Right) */}
      {showControls && (
        <div className="absolute bottom-6 right-3.5 z-20 flex flex-col gap-1.5">
          <div className="bg-white/90 dark:bg-slate-900/90 backdrop-blur-md rounded-xl border border-slate-200/80 dark:border-slate-700/80 shadow-lg p-1 flex flex-col divide-y divide-slate-100 dark:divide-slate-800">
            {/* Zoom In */}
            <button
              type="button"
              onClick={() => {
                if (mapLibreRef.current) mapLibreRef.current.zoomIn();
                if (leafletMapRef.current) leafletMapRef.current.zoomIn();
              }}
              className="p-2 text-slate-600 dark:text-slate-300 hover:text-blue-600 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-colors"
              title="Zoom In"
              aria-label="Zoom In"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
            </button>

            {/* Zoom Out */}
            <button
              type="button"
              onClick={() => {
                if (mapLibreRef.current) mapLibreRef.current.zoomOut();
                if (leafletMapRef.current) leafletMapRef.current.zoomOut();
              }}
              className="p-2 text-slate-600 dark:text-slate-300 hover:text-blue-600 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-colors"
              title="Zoom Out"
              aria-label="Zoom Out"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
              </svg>
            </button>

            {/* Fit All Bounds */}
            <button
              type="button"
              onClick={handleFitAll}
              className="p-2 text-slate-600 dark:text-slate-300 hover:text-blue-600 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-colors"
              title="Fit all markers in view"
              aria-label="Fit all markers"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-5h-4m4 0v4m0 0l-5-5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
              </svg>
            </button>

            {/* Fullscreen Toggle */}
            <button
              type="button"
              onClick={toggleFullscreen}
              className="p-2 text-slate-600 dark:text-slate-300 hover:text-blue-600 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-colors"
              title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
              aria-label="Toggle Fullscreen"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4h6M4 4v6M20 4h-6M20 4v6M4 20h6M4 20v-6M20 20h-6M20 20v-6" />
              </svg>
            </button>

            {/* Theme Toggle (Light / Dark) */}
            <button
              type="button"
              onClick={() => setCurrentTheme(currentTheme === 'light' ? 'dark' : 'light')}
              className="p-2 text-slate-600 dark:text-slate-300 hover:text-amber-500 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-colors"
              title={currentTheme === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode'}
              aria-label="Toggle map theme"
            >
              {currentTheme === 'light' ? (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              )}
            </button>

            {/* Route / Trail Toggle */}
            {path && path.length > 0 && (
              <button
                type="button"
                onClick={() => setShowRouteLayer(!showRouteLayer)}
                className={`p-2 rounded-lg transition-colors ${
                  showRouteLayer
                    ? 'text-blue-600 bg-blue-50 dark:bg-blue-950/60'
                    : 'text-slate-400 hover:text-slate-600'
                }`}
                title="Toggle Route Path"
                aria-label="Toggle Route Path"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Bottom Left Legend & Live Status */}
      {showLegend && (
        <div className="absolute bottom-3.5 left-3.5 z-20 flex flex-wrap items-center gap-2">
          {/* Legend Panel */}
          <div className="bg-white/90 dark:bg-slate-900/90 backdrop-blur-md rounded-xl px-3 py-1.5 border border-slate-200/80 dark:border-slate-700/80 shadow-md flex items-center gap-3 text-[11px] font-medium text-slate-700 dark:text-slate-300">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-sm"></span>
              <span>Tracking</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shadow-sm"></span>
              <span>Paused / Off</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500 shadow-sm"></span>
              <span>Unavailable</span>
            </span>
          </div>

          {/* Live Status Pill */}
          <div className="bg-white/90 dark:bg-slate-900/90 backdrop-blur-md rounded-xl px-3 py-1.5 border border-slate-200/80 dark:border-slate-700/80 shadow-md flex items-center gap-1.5 text-[11px] font-semibold text-slate-800 dark:text-slate-200">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span>Live Stream</span>
            <span className="text-slate-400 font-normal">·</span>
            <span className="text-[10px] text-slate-500 dark:text-slate-400 font-normal">
              {lastUpdateSec === 0 ? 'Just now' : `${lastUpdateSec}s ago`}
            </span>
          </div>
        </div>
      )}

      {/* Empty State Overlay when no officers on duty */}
      {markers.length === 0 && mapLoaded && (
        <div className="absolute inset-0 z-10 flex items-center justify-center p-6 bg-slate-900/20 backdrop-blur-[2px] pointer-events-none">
          <div className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-md rounded-2xl p-6 max-w-sm text-center shadow-2xl border border-slate-200/80 dark:border-slate-700/80 pointer-events-auto space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 mx-auto flex items-center justify-center shadow-inner">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <div>
              <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">No Officers Currently in Field</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                All staff accounts are currently off-duty or have finished their shifts. Live location pings will appear here instantly when officers punch in.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
