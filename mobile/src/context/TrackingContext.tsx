import React, { createContext, useContext, useEffect, useState } from 'react';
import trackingManager from '../services/trackingManager';
import { AppTrackingStatus, AttendanceSession, LocationPoint } from '../types';
import api from '../services/api';

interface TrackingContextType {
  status: AppTrackingStatus;
  lastPoint: LocationPoint | null;
  lastUpdateAt: Date | null;
  interruptionCount: number;
  queuedPointsCount: number;
  activeSession: AttendanceSession | null;
  setActiveSession: (session: AttendanceSession | null) => void;
  startTrackingForSession: (session: AttendanceSession) => Promise<void>;
  stopTrackingForSession: () => void;
  refreshActiveSession: () => Promise<AttendanceSession | null>;
}

const TrackingContext = createContext<TrackingContextType>({
  status: 'OFF_DUTY',
  lastPoint: null,
  lastUpdateAt: null,
  interruptionCount: 0,
  queuedPointsCount: 0,
  activeSession: null,
  setActiveSession: () => {},
  startTrackingForSession: async () => {},
  stopTrackingForSession: () => {},
  refreshActiveSession: async () => null,
});

export const TrackingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [status, setStatus] = useState<AppTrackingStatus>('OFF_DUTY');
  const [lastPoint, setLastPoint] = useState<LocationPoint | null>(null);
  const [lastUpdateAt, setLastUpdateAt] = useState<Date | null>(null);
  const [interruptionCount, setInterruptionCount] = useState<number>(0);
  const [queuedPointsCount, setQueuedPointsCount] = useState<number>(0);
  const [activeSession, setActiveSession] = useState<AttendanceSession | null>(null);

  const refreshActiveSession = async (): Promise<AttendanceSession | null> => {
    try {
      const res = await api.get<AttendanceSession | null>('/attendance/current/');
      const session = res.data;
      setActiveSession(session);
      if (session && session.status === 'ACTIVE') {
        trackingManager.startTracking(session.id);
      } else {
        trackingManager.stopTracking();
      }
      return session;
    } catch {
      setActiveSession(null);
      trackingManager.stopTracking();
      return null;
    }
  };

  const startTrackingForSession = async (session: AttendanceSession) => {
    setActiveSession(session);
    await trackingManager.startTracking(session.id);
  };

  const stopTrackingForSession = () => {
    trackingManager.stopTracking();
    setActiveSession(null);
  };

  useEffect(() => {
    const unsubscribe = trackingManager.subscribe(state => {
      setStatus(state.status);
      setLastPoint(state.lastPoint);
      setLastUpdateAt(state.lastUpdateAt);
      setInterruptionCount(state.interruptionCount);
      setQueuedPointsCount(state.queuedPointsCount);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  return (
    <TrackingContext.Provider
      value={{
        status,
        lastPoint,
        lastUpdateAt,
        interruptionCount,
        queuedPointsCount,
        activeSession,
        setActiveSession,
        startTrackingForSession,
        stopTrackingForSession,
        refreshActiveSession,
      }}
    >
      {children}
    </TrackingContext.Provider>
  );
};

export const useTracking = () => useContext(TrackingContext);
export default TrackingContext;
