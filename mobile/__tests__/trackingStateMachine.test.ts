import { AppTrackingStatus } from '../src/types';

// Pure State Machine unit test
class MockTrackingStateMachine {
  public status: AppTrackingStatus = 'OFF_DUTY';
  public interruptionCount = 0;
  public activeSessionId: number | null = null;
  public isOnline = true;

  public start(sessionId: number) {
    this.activeSessionId = sessionId;
    this.status = 'ON_DUTY';
    this.interruptionCount = 0;
  }

  public setStatus(newStatus: AppTrackingStatus) {
    if (this.status !== newStatus) {
      if (this.status === 'ON_DUTY' && (newStatus === 'LOCATION_LOST' || newStatus === 'OFFLINE')) {
        this.interruptionCount++;
      }
      this.status = newStatus;
    }
  }

  public handleLocationUpdate() {
    if (this.status === 'LOCATION_LOST' || (this.isOnline && this.status === 'OFFLINE')) {
      this.status = 'ON_DUTY';
    }
  }

  public setNetworkState(online: boolean) {
    this.isOnline = online;
    if (!online && this.activeSessionId) {
      this.setStatus('OFFLINE');
    } else if (online && this.status === 'OFFLINE') {
      this.status = 'ON_DUTY';
    }
  }

  public stop() {
    this.activeSessionId = null;
    this.status = 'OFF_DUTY';
  }
}

describe('Tracking State Machine', () => {
  let sm: MockTrackingStateMachine;

  beforeEach(() => {
    sm = new MockTrackingStateMachine();
  });

  it('starts in OFF_DUTY and transitions to ON_DUTY on session start', () => {
    expect(sm.status).toBe('OFF_DUTY');
    sm.start(42);
    expect(sm.status).toBe('ON_DUTY');
    expect(sm.interruptionCount).toBe(0);
  });

  it('increments interruption count when transitioning to LOCATION_LOST', () => {
    sm.start(42);
    sm.setStatus('LOCATION_LOST');
    expect(sm.status).toBe('LOCATION_LOST');
    expect(sm.interruptionCount).toBe(1);

    // Remaining in LOCATION_LOST does not double count
    sm.setStatus('LOCATION_LOST');
    expect(sm.interruptionCount).toBe(1);

    // Location returns -> status recovers to ON_DUTY without changing count
    sm.handleLocationUpdate();
    expect(sm.status).toBe('ON_DUTY');
    expect(sm.interruptionCount).toBe(1);

    // Second interruption
    sm.setStatus('LOCATION_LOST');
    expect(sm.interruptionCount).toBe(2);
  });

  it('increments interruption count when network drops to OFFLINE', () => {
    sm.start(42);
    sm.setNetworkState(false);
    expect(sm.status).toBe('OFFLINE');
    expect(sm.interruptionCount).toBe(1);

    // Network returns
    sm.setNetworkState(true);
    expect(sm.status).toBe('ON_DUTY');
    expect(sm.interruptionCount).toBe(1);
  });

  it('resets to OFF_DUTY on punch out or session stop', () => {
    sm.start(42);
    sm.stop();
    expect(sm.status).toBe('OFF_DUTY');
    expect(sm.activeSessionId).toBeNull();
  });
});
