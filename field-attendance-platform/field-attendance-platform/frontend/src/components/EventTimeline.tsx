import { fmtTime } from '../services/format';
import type { TrackingEvent } from '../types';

const LABEL: Record<string, string> = {
  PUNCH_IN: 'Punched in', SELFIE_UPLOADED: 'Selfie uploaded', LOCATION_PERMISSION_GRANTED: 'Location permission granted',
  TRACKING_STARTED: 'Tracking started', LOCATION_UPDATED: 'Location updated', LOCATION_UNAVAILABLE: 'Location unavailable',
  LOCATION_PERMISSION_DENIED: 'Location permission denied', TRACKING_RESUMED: 'Tracking resumed',
  VISIT_STARTED: 'Field visit started', VISIT_PHOTO_UPLOADED: 'Evidence photo uploaded', VISIT_COMPLETED: 'Field visit completed',
  PUNCH_OUT: 'Punched out', SESSION_COMPLETED: 'Session completed',
};
const BAD = new Set(['LOCATION_UNAVAILABLE', 'LOCATION_PERMISSION_DENIED']);

export default function EventTimeline({ events }: { events: TrackingEvent[] }) {
  return (
    <ol className="space-y-2 border-l-2 border-slate-200 pl-4 text-sm">
      {events.map((e) => (
        <li key={e.id}>
          <span className="text-slate-500">{fmtTime(e.timestamp)}</span>{' '}
          <span className={BAD.has(e.event_type) ? 'font-medium text-red-600' : ''}>{LABEL[e.event_type] ?? e.event_type}</span>
        </li>
      ))}
    </ol>
  );
}
