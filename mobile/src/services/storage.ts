import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const ACCESS_TOKEN_KEY = 'ncode_access_token';
const REFRESH_TOKEN_KEY = 'ncode_refresh_token';
const USER_KEY = 'ncode_user_data';
const CONSENT_KEY = 'ncode_consent_flag';

// In-memory fallback for environments where SecureStore is unavailable (e.g. Node.js tests or Web)
const memoryStore: Record<string, string> = {};

export async function setItem(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web' || typeof window !== 'undefined' && !SecureStore.isAvailableAsync) {
    try {
      localStorage.setItem(key, value);
    } catch {
      memoryStore[key] = value;
    }
    return;
  }

  try {
    const isAvail = await SecureStore.isAvailableAsync();
    if (isAvail) {
      await SecureStore.setItemAsync(key, value, {
        keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
      });
      return;
    }
  } catch {
    // Fall back to memory
  }
  memoryStore[key] = value;
}

export async function getItem(key: string): Promise<string | null> {
  if (Platform.OS === 'web' || typeof window !== 'undefined' && !SecureStore.isAvailableAsync) {
    try {
      return localStorage.getItem(key) || memoryStore[key] || null;
    } catch {
      return memoryStore[key] || null;
    }
  }

  try {
    const isAvail = await SecureStore.isAvailableAsync();
    if (isAvail) {
      return await SecureStore.getItemAsync(key);
    }
  } catch {
    // Fall back to memory
  }
  return memoryStore[key] || null;
}

export async function removeItem(key: string): Promise<void> {
  if (Platform.OS === 'web' || typeof window !== 'undefined' && !SecureStore.isAvailableAsync) {
    try {
      localStorage.removeItem(key);
    } catch {}
    delete memoryStore[key];
    return;
  }

  try {
    const isAvail = await SecureStore.isAvailableAsync();
    if (isAvail) {
      await SecureStore.deleteItemAsync(key);
    }
  } catch {}
  delete memoryStore[key];
}

export async function getAccessToken(): Promise<string | null> {
  return getItem(ACCESS_TOKEN_KEY);
}

export async function setAccessToken(token: string): Promise<void> {
  await setItem(ACCESS_TOKEN_KEY, token);
}

export async function getRefreshToken(): Promise<string | null> {
  return getItem(REFRESH_TOKEN_KEY);
}

export async function setRefreshToken(token: string): Promise<void> {
  await setItem(REFRESH_TOKEN_KEY, token);
}

export async function setTokens(access: string, refresh: string): Promise<void> {
  await Promise.all([setAccessToken(access), setRefreshToken(refresh)]);
}

export async function clearTokens(): Promise<void> {
  await Promise.all([removeItem(ACCESS_TOKEN_KEY), removeItem(REFRESH_TOKEN_KEY), removeItem(USER_KEY)]);
}

export async function getStoredUser(): Promise<any | null> {
  const data = await getItem(USER_KEY);
  if (!data) return null;
  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
}

export async function setStoredUser(user: any): Promise<void> {
  await setItem(USER_KEY, JSON.stringify(user));
}

export async function getLocalConsent(): Promise<boolean> {
  const v = await getItem(CONSENT_KEY);
  return v === 'true';
}

export async function setLocalConsent(consented: boolean): Promise<void> {
  await setItem(CONSENT_KEY, consented ? 'true' : 'false');
}
