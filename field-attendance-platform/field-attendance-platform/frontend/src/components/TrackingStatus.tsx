import type { TrackingStatus as TS } from '../types';

const LABEL: Record<TS, [string, string]> = {
  ACTIVE: ['🟢', 'Location tracking active'],
  PAUSED: ['🟡', 'Tracking paused'],
  LOCATION_UNAVAILABLE: ['🔴', 'Location unavailable — turn location back on'],
  PERMISSION_DENIED: ['🔴', 'Location permission denied — tracking is required for an active session'],
  OFFLINE: ['⚪', 'Offline — updates will resume when you are back online'],
  PUNCHED_OUT: ['⚪', 'Punched out'],
};

export default function TrackingStatus({ status, lastUpdate }: { status: TS; lastUpdate: string }) {
  const [icon, text] = LABEL[status];
  return (
    <div className="space-y-1">
      <p className="font-medium">{icon} {text}</p>
      <p className="text-sm text-slate-500">Last location update: {lastUpdate}</p>
      {status === 'ACTIVE' && (
        <p className="rounded-lg bg-green-50 p-2 text-xs text-green-800">
          Your location is being shared with the authorized administrator while your session is active.
          Keep this page open for best results. Tracking stops when you punch out.
        </p>
      )}
    </div>
  );
}
