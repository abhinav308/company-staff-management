import axios from 'axios';
import { errorMessage } from '../src/services/api';

describe('API Client & Error Message Extraction', () => {
  it('extracts detail string from DRF 400/401/409 errors', () => {
    const error = {
      isAxiosError: true,
      response: {
        data: { detail: 'No active session.' },
        status: 409,
      },
    };
    // @ts-ignore
    expect(errorMessage(error)).toBe('No active session.');
  });

  it('extracts error string from custom error responses', () => {
    const error = {
      isAxiosError: true,
      response: {
        data: { error: 'Invalid credentials provided.' },
        status: 400,
      },
    };
    // @ts-ignore
    expect(errorMessage(error)).toBe('Invalid credentials provided.');
  });

  it('extracts first field validation error from DRF serializer dicts', () => {
    const error = {
      isAxiosError: true,
      response: {
        data: {
          username: ['This field may not be blank.'],
        },
        status: 400,
      },
    };
    // @ts-ignore
    expect(errorMessage(error)).toBe('username: This field may not be blank.');
  });

  it('provides friendly message on network disconnects', () => {
    const error = {
      isAxiosError: true,
      message: 'Network Error',
    };
    // @ts-ignore
    expect(errorMessage(error)).toContain('Network request failed');
  });
});

describe('Single In-Flight Refresh Mutex Logic', () => {
  it('deduplicates simultaneous 401 refresh calls into a single promise', async () => {
    let refreshCallCount = 0;
    let isRefreshing = false;
    let queue: Array<(token: string) => void> = [];

    const mockRefreshTokenCall = async (): Promise<string> => {
      refreshCallCount++;
      return new Promise(resolve => {
        setTimeout(() => resolve('new_access_token_xyz'), 50);
      });
    };

    const handle401 = async () => {
      if (isRefreshing) {
        return new Promise<string>(resolve => {
          queue.push(resolve);
        });
      }

      isRefreshing = true;
      try {
        const newToken = await mockRefreshTokenCall();
        queue.forEach(res => res(newToken));
        queue = [];
        return newToken;
      } finally {
        isRefreshing = false;
      }
    };

    // Trigger 3 concurrent 401s
    const [t1, t2, t3] = await Promise.all([handle401(), handle401(), handle401()]);

    expect(refreshCallCount).toBe(1);
    expect(t1).toBe('new_access_token_xyz');
    expect(t2).toBe('new_access_token_xyz');
    expect(t3).toBe('new_access_token_xyz');
  });
});
