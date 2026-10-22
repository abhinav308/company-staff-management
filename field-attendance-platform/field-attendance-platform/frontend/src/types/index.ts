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
  company?: string;
  agency?: string;
  office?: string;
  zone?: string;
  district?: string;
  work_location?: string;
  reporting_manager?: number | null;
  reporting_manager_name?: string | null;
  joining_date?: string | null;
  employment_type?: string;
  shift_timing?: string;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  emergency_contact_relation?: string;
  photo_url?: string | null;
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
  accuracy?: number | null;
}

export interface AdminSummary {
  total_users: number;
  active_users: number;
  currently_tracking: number;
  location_unavailable: number;
  paused_offline?: number;
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

export interface LeaveType {
  id: number;
  code: string;
  name: string;
  description: string;
  default_days_per_year: number;
  requires_approval: boolean;
  is_active: boolean;
}

export interface LeaveBalance {
  id: number;
  leave_type: number;
  leave_type_code: string;
  leave_type_name: string;
  year: number;
  total_days: number;
  used_days: number;
  available_days: number;
}

export interface LeaveRequest {
  id: number;
  user: number;
  employee_name: string;
  leave_type: string;
  leave_type_ref?: number | null;
  leave_type_name: string;
  start_date: string;
  end_date: string;
  days_count: number;
  is_half_day: boolean;
  half_day_period?: 'FIRST_HALF' | 'SECOND_HALF' | '' | null;
  reason: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  reviewer?: number | null;
  reviewer_name?: string | null;
  reviewer_notes?: string;
  reviewed_at?: string | null;
  created_at: string;
  attachment_url?: string | null;
}

export interface Holiday {
  id: number;
  date: string;
  name: string;
  holiday_type: 'NATIONAL' | 'STATE' | 'OPTIONAL';
  description?: string;
  is_optional: boolean;
}

export interface Note {
  id: number;
  title: string;
  content: string;
  created_at: string;
  updated_at: string;
}

export interface EmployeeDocument {
  id: number;
  user: number;
  user_full_name: string;
  employee_id: string;
  doc_type: string;
  doc_type_display: string;
  file_name: string;
  file_size: number;
  mime_type: string;
  status: 'PENDING' | 'VERIFIED' | 'REJECTED';
  reviewer_notes?: string;
  verified_at?: string | null;
  download_url: string;
  created_at: string;
}

export interface Announcement {
  id: number;
  title: string;
  content: string;
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
  target_role: string;
  author_name: string;
  created_at: string;
  is_read: boolean;
  read_count?: number;
}

export interface ProfileChangeRequest {
  id: number;
  user: number;
  user_name: string;
  user_id: number;
  employee_id?: string;
  requested_phone?: string;
  requested_emergency_name?: string;
  requested_emergency_phone?: string;
  requested_emergency_relation?: string;
  reason: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  reviewer_notes?: string;
  reviewed_at?: string | null;
  created_at: string;
}

export interface AttendanceCalendarDay {
  date: string;
  day: number;
  day_name: string;
  day_name_short: string;
  status: 'PRESENT' | 'ABSENT' | 'LEAVE' | 'HOLIDAY' | 'WEEKLY_OFF' | 'PENDING_DUTY' | 'UPCOMING' | 'SCHEDULED';
  is_today: boolean;
  is_past: boolean;
  is_future: boolean;
  holiday?: { name: string; type: string } | null;
  leave?: { type: string; is_half_day: boolean } | null;
  session?: {
    id: number;
    punch_in_at: string;
    punch_out_at: string | null;
    duration_seconds: number;
    tracking_status: TrackingStatus;
    status: string;
    interruptions_count: number;
  } | null;
}

export interface AttendanceCalendarResponse {
  year: number;
  month: number;
  month_name: string;
  days: AttendanceCalendarDay[];
  summary: {
    total_days: number;
    present_days: number;
    absent_days: number;
    leave_days: number;
    holiday_days: number;
    weekly_off_days: number;
    total_hours: string;
    total_seconds: number;
  };
}

export interface MyStats {
  days_present_month: number;
  leave_balance_total: number;
  last_punch: {
    punch_in_at: string;
    punch_out_at: string | null;
    status: string;
    tracking_status: string;
    duration_seconds: number;
  } | null;
}

