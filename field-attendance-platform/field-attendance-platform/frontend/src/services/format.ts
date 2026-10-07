export const fmtTime = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—';
export const fmtDate = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString() : '—');
export const fmtDuration = (sec: number) => {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
};
export const STATUS_COLOR: Record<string, string> = {
  ACTIVE: '#16a34a', PAUSED: '#ca8a04', LOCATION_UNAVAILABLE: '#dc2626',
  PERMISSION_DENIED: '#dc2626', OFFLINE: '#6b7280', PUNCHED_OUT: '#6b7280',
};
