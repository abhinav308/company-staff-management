export type UserRole = 'ADMIN' | 'USER';

export interface User {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  phone?: string;
  role: UserRole;
  profile?: EmployeeProfile;
}

export interface EmployeeProfile {
  id?: number;
  employee_id: string;
  department: string;
  designation: string;
  office: string;
  zone: string;
  district?: string;
  work_location?: string;
  reporting_manager_name?: string;
  photo_url?: string;
}

export type SessionStatus = 'ACTIVE' | 'CLOSED';
export type TrackingStatus = 'ACTIVE' | 'PAUSED' | 'OFFLINE';

export interface AttendanceSession {
  id: number;
  user: number | User;
  punch_in_at: string;
  punch_out_at?: string | null;
  status: SessionStatus;
  tracking_status: TrackingStatus;
  last_latitude?: number | null;
  last_longitude?: number | null;
  last_accuracy?: number | null;
  last_location_at?: string | null;
  selfie_url?: string;
}

export type AppTrackingStatus = 'OFF_DUTY' | 'ON_DUTY' | 'LOCATION_LOST' | 'OFFLINE';

export interface LocationPoint {
  latitude: number;
  longitude: number;
  accuracy?: number | null;
  client_ts: string;
  session_id?: number;
}

export interface TrackingConfig {
  interval_seconds: number;
  min_distance_meters: number;
  high_accuracy: boolean;
}

export interface ConsentState {
  has_consented: boolean;
  policy_version: string;
  accepted_at?: string | null;
}

export interface AuthTokens {
  access: string;
  refresh: string;
}

export interface LoginResponse {
  access: string;
  refresh: string;
  user: User;
}
