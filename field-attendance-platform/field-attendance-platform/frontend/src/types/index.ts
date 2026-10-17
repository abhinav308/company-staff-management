export type Role = 'USER' | 'ADMIN';

export type TrackingStatus =
  | 'ACTIVE'
  | 'PAUSED'
  | 'LOCATION_UNAVAILABLE'
  | 'PERMISSION_DENIED'
  | 'OFFLINE'
  | 'PUNCHED_OUT';

export interface EmployeeProfile {
  employee_id: string;
  esic_number: string | null;
  department: string;
  designation: string;
  status: string;
}

export interface User {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  full_name: string;
  phone: string;
  role: Role;
  is_active: boolean;
  profile?: EmployeeProfile;
}

export interface AdminUser extends User {
  has_active_session: boolean;
  date_joined: string;
}

export type VisitType =
  | 'SITE_INSPECTION'
  | 'CLIENT_MEETING'
  | 'TECHNICAL_VERIFICATION'
  | 'INFRASTRUCTURE_AUDIT'
  | 'OTHER';

export type VisitOutcome =
  | 'PENDING'
  | 'SATISFACTORY'
  | 'ACTION_REQUIRED'
  | 'FOLLOW_UP_NEEDED'
  | 'CANCELLED';

export interface VisitPhoto {
  id: number;
  visit: number;
  caption: string;
  latitude: number | null;
  longitude: number | null;
  captured_at: string;
  created_at: string;
  photo_url: string;
}

export interface Visit {
  id: number;
  user: number;
  session: number;
  site_name: string;
  project_name?: string;
  visit_type?: VisitType;
  location_name: string;
  latitude: number | null;
  longitude: number | null;
  end_location_name?: string;
  end_latitude?: number | null;
  end_longitude?: number | null;
  start_time: string;
  end_time: string | null;
  duration_minutes?: number | null;
  status: 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  outcome?: VisitOutcome;
  notes: string;
  outcome_notes?: string;
  created_at: string;
  employee_name: string;
  employee_id: string;
  department?: string;
  photos?: VisitPhoto[];
  photos_count?: number;
}

export interface Session {
  id: number;
  user: number;
  display_name: string;
  employee_id?: string;
  department?: string;
  status: 'ACTIVE' | 'COMPLETED';
  tracking_status: TrackingStatus;
  punch_in_at: string;
  punch_out_at: string | null;
  duration_seconds: number;
  interruptions: number;
  visits_count?: number;
  last_latitude: number | null;
  last_longitude: number | null;
  last_accuracy?: number | null;
  last_location_at: string | null;
}

export interface TrackingEvent {
  id: number;
  user?: number;
  username?: string;
  display_name?: string;
  employee_id?: string;
  session_id?: number;
  event_type: string;
  timestamp: string;
  metadata: Record<string, unknown>;
}

export interface LocationPoint {
  id: number;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  timestamp: string;
}

export interface LivePoint {
  session_id: number;
  user_id: number;
  display_name: string;
  status: 'ACTIVE' | 'COMPLETED';
  tracking_status: TrackingStatus;
  latitude: number | null;
  longitude: number | null;
  last_location_at: string | null;
  punch_in_at: string;
}

export interface AdminSummary {
  total_users: number;
  active_users: number;
  currently_tracking: number;
  location_unavailable: number;
  today_punch_ins: number;
  today_punch_outs: number;
  completed_sessions: number;
  today_visits: number;
}

export interface AdminVisitDetail {
  visit: Visit;
  events: TrackingEvent[];
  employee: {
    id: number;
    name: string;
    employee_id: string;
    department: string;
    designation: string;
    email: string;
    phone: string;
  };
}

export interface Page<T> {
  count: number;
  next?: string | null;
  previous?: string | null;
  results: T[];
}
