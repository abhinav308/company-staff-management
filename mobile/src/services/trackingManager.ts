import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';
import { AppState, AppStateStatus } from 'react-native';
import api from './api';
import { enqueueLocation, flushOfflineQueue } from './offlineQueue';
import { AppTrackingStatus, LocationPoint, TrackingConfig } from '../types';
import { FEATURE_BACKGROUND_TRACKING } from '../config/env';

export const BACKGROUND_TRACKING_TASK = 'NCODE_BACKGROUND_LOCATION_TASK';

export type TrackingListener = (state: {
  status: AppTrackingStatus;
  lastPoint: LocationPoint | null;
  lastUpdateAt: Date | null;
  interruptionCount: number;
  queuedPointsCount: number;
}) => void;

class TrackingManager {
  private activeSessionId: number | null = null;
  private trackingConfig: TrackingConfig = {
    interval_seconds: 10,
    min_distance_meters: 10,
    high_accuracy: true,
  };
  private status: AppTrackingStatus = 'OFF_DUTY';
  private lastPoint: LocationPoint | null = null;
  private lastUpdateAt: Date | null = null;
  private interruptionCount = 0;
  private queuedPointsCount = 0;

  private locationSubscription: Location.LocationSubscription | null = null;
  private netInfoUnsubscribe: (() => void) | null = null;
  private appStateSubscription: { remove: () => void } | null = null;
  private healthCheckInterval: any = null;

  // Interruption deduplication flags (only log once per interruption)
  private hasReportedLocationUnavailable = false;
  private hasReportedPermissionDenied = false;

  private listeners: Set<TrackingListener> = new Set();
  private isOnline = true;

  constructor() {
    this.setupNetworkMonitoring();
  }

  public subscribe(listener: TrackingListener): () => void {
    this.listeners.add(listener);
    this.notify();
    return () => this.listeners.delete(listener);
  }

  private notify() {
    const payload = {
      status: this.status,
      lastPoint: this.lastPoint,
      lastUpdateAt: this.lastUpdateAt,
      interruptionCount: this.interruptionCount,
      queuedPointsCount: this.queuedPointsCount,
    };
    this.listeners.forEach(fn => {
      try {
        fn(payload);
      } catch (e) {
        console.error('Tracking listener error:', e);
      }
    });
  }

  private setStatus(newStatus: AppTrackingStatus) {
    if (this.status !== newStatus) {
      // If transitioning from ON_DUTY to an interrupted state, increment counter
      if (this.status === 'ON_DUTY' && (newStatus === 'LOCATION_LOST' || newStatus === 'OFFLINE')) {
        this.interruptionCount++;
      }
      this.status = newStatus;
      this.notify();
    }
  }

  private setupNetworkMonitoring() {
    this.netInfoUnsubscribe = NetInfo.addEventListener((state: NetInfoState) => {
      const online = Boolean(state.isConnected && state.isInternetReachable !== false);
      const wasOffline = !this.isOnline;
      this.isOnline = online;

      if (!online && this.activeSessionId) {
        this.setStatus('OFFLINE');
      } else if (online && wasOffline && this.activeSessionId) {
        // Network restored: flush queued points and resume
        this.onNetworkRestored();
      }
    });
  }

  private async onNetworkRestored() {
    if (!this.activeSessionId) return;
    try {
      const res = await flushOfflineQueue(this.activeSessionId);
      this.queuedPointsCount = res.remaining;
      // Re-check location health
      await this.checkLocationHealth();
    } catch (e) {
      console.warn('Network restore sync failed:', e);
    }
  }

  public async startTracking(sessionId: number): Promise<void> {
    this.stopTracking(); // clean any existing session
    this.activeSessionId = sessionId;
    this.interruptionCount = 0;
    this.hasReportedLocationUnavailable = false;
    this.hasReportedPermissionDenied = false;
    this.setStatus('ON_DUTY');

    // Fetch config from backend
    try {
      const configRes = await api.get<TrackingConfig>('/tracking/config/');
      if (configRes.data && configRes.data.interval_seconds) {
        this.trackingConfig = configRes.data;
      }
    } catch {
      // Use default config
    }

    // Start Foreground Location Watcher
    await this.startForegroundWatcher();

    // Start Health Check Poller
    this.healthCheckInterval = setInterval(() => {
      this.checkLocationHealth();
    }, 15000);

    // Monitor AppState changes to re-verify location permissions when user returns
    this.appStateSubscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (nextState === 'active' && this.activeSessionId) {
        this.checkLocationHealth();
      }
    });

    // Optional Background Tracking
    if (FEATURE_BACKGROUND_TRACKING) {
      this.startBackgroundWatcher();
    }
  }

  private async startForegroundWatcher() {
    try {
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status !== 'granted') {
        this.handlePermissionDenied();
        return;
      }

      const servicesEnabled = await Location.hasServicesEnabledAsync();
      if (!servicesEnabled) {
        this.handleLocationUnavailable('Location services disabled on device');
        return;
      }

      this.locationSubscription = await Location.watchPositionAsync(
        {
          accuracy: this.trackingConfig.high_accuracy
            ? Location.Accuracy.High
            : Location.Accuracy.Balanced,
          timeInterval: this.trackingConfig.interval_seconds * 1000,
          distanceInterval: this.trackingConfig.min_distance_meters,
        },
        (loc: Location.LocationObject) => {
          this.handleNewLocation({
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
            accuracy: loc.coords.accuracy,
            client_ts: new Date(loc.timestamp).toISOString(),
          });
        }
      );
    } catch (err) {
      this.handleLocationUnavailable(String(err));
    }
  }

  public async handleNewLocation(point: LocationPoint): Promise<void> {
    if (!this.activeSessionId) return;

    this.lastPoint = point;
    this.lastUpdateAt = new Date();

    // If we were in an error state, recover back to ON_DUTY
    if (this.status === 'LOCATION_LOST' || (this.isOnline && this.status === 'OFFLINE')) {
      this.hasReportedLocationUnavailable = false;
      this.hasReportedPermissionDenied = false;
      this.setStatus('ON_DUTY');
    }

    if (!this.isOnline) {
      // Enqueue to SQLite
      await enqueueLocation(this.activeSessionId, point);
      this.queuedPointsCount++;
      this.setStatus('OFFLINE');
      this.notify();
      return;
    }

    // Try posting point to /locations/
    try {
      await api.post('/locations/', {
        latitude: point.latitude,
        longitude: point.longitude,
        accuracy: point.accuracy,
      });
      this.notify();

      // If we have any backlog, attempt to flush it
      if (this.queuedPointsCount > 0) {
        const res = await flushOfflineQueue(this.activeSessionId);
        this.queuedPointsCount = res.remaining;
      }
    } catch (err: any) {
      // If network failure, queue to SQLite
      if (!err.response || err.code === 'ERR_NETWORK') {
        this.isOnline = false;
        await enqueueLocation(this.activeSessionId, point);
        this.queuedPointsCount++;
        this.setStatus('OFFLINE');
      }
    }
  }

  public async checkLocationHealth(): Promise<void> {
    if (!this.activeSessionId) return;

    try {
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status !== 'granted') {
        this.handlePermissionDenied();
        return;
      }

      const servicesEnabled = await Location.hasServicesEnabledAsync();
      if (!servicesEnabled) {
        this.handleLocationUnavailable('Location services disabled on device');
        return;
      }

      // If permissions and services are restored but we were in LOCATION_LOST
      if (this.status === 'LOCATION_LOST') {
        this.hasReportedLocationUnavailable = false;
        this.hasReportedPermissionDenied = false;
        this.setStatus(this.isOnline ? 'ON_DUTY' : 'OFFLINE');
        if (!this.locationSubscription) {
          await this.startForegroundWatcher();
        }
      }
    } catch (e) {
      this.handleLocationUnavailable(String(e));
    }
  }

  private handlePermissionDenied() {
    this.setStatus('LOCATION_LOST');
    if (!this.hasReportedPermissionDenied && this.activeSessionId && this.isOnline) {
      this.hasReportedPermissionDenied = true;
      api
        .post('/tracking/events/', {
          event_type: 'LOCATION_PERMISSION_DENIED',
          note: 'Foreground location permission revoked by user or system',
        })
        .catch(() => {});
    }
  }

  private handleLocationUnavailable(reason: string) {
    this.setStatus('LOCATION_LOST');
    if (!this.hasReportedLocationUnavailable && this.activeSessionId && this.isOnline) {
      this.hasReportedLocationUnavailable = true;
      api
        .post('/tracking/events/', {
          event_type: 'LOCATION_UNAVAILABLE',
          note: reason,
        })
        .catch(() => {});
    }
  }

  private async startBackgroundWatcher() {
    try {
      const isDefined = await TaskManager.isTaskDefined(BACKGROUND_TRACKING_TASK);
      if (!isDefined) {
        TaskManager.defineTask(BACKGROUND_TRACKING_TASK, async ({ data, error }: any) => {
          if (error) {
            console.error('Background tracking task error:', error);
            return;
          }
          if (data && data.locations && data.locations.length > 0) {
            const loc = data.locations[data.locations.length - 1];
            trackingManager.handleNewLocation({
              latitude: loc.coords.latitude,
              longitude: loc.coords.longitude,
              accuracy: loc.coords.accuracy,
              client_ts: new Date(loc.timestamp).toISOString(),
            });
          }
        });
      }

      const hasBg = await Location.getBackgroundPermissionsAsync();
      if (hasBg.status === 'granted') {
        await Location.startLocationUpdatesAsync(BACKGROUND_TRACKING_TASK, {
          accuracy: Location.Accuracy.High,
          timeInterval: this.trackingConfig.interval_seconds * 1000,
          distanceInterval: this.trackingConfig.min_distance_meters,
          showsBackgroundLocationIndicator: true,
          foregroundService: {
            notificationTitle: 'Ncode Field Attendance Active',
            notificationBody: 'Your location is active and securely shared with administrators.',
            notificationColor: '#059669',
          },
        });
      }
    } catch (e) {
      console.warn('Background tracking not supported in current environment (Expo Go):', e);
    }
  }

  public stopTracking(): void {
    if (this.locationSubscription) {
      this.locationSubscription.remove();
      this.locationSubscription = null;
    }
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
    if (this.appStateSubscription) {
      this.appStateSubscription.remove();
      this.appStateSubscription = null;
    }

    if (FEATURE_BACKGROUND_TRACKING) {
      Location.hasStartedLocationUpdatesAsync(BACKGROUND_TRACKING_TASK)
        .then(started => {
          if (started) Location.stopLocationUpdatesAsync(BACKGROUND_TRACKING_TASK);
        })
        .catch(() => {});
    }

    this.activeSessionId = null;
    this.setStatus('OFF_DUTY');
    this.hasReportedLocationUnavailable = false;
    this.hasReportedPermissionDenied = false;
  }

  public getStatus(): AppTrackingStatus {
    return this.status;
  }

  public getInterruptionCount(): number {
    return this.interruptionCount;
  }
}

export const trackingManager = new TrackingManager();
export default trackingManager;
