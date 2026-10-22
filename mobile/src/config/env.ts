import { Platform } from 'react-native';

const DEFAULT_API_URL = Platform.select({
  android: 'http://192.168.20.64:8000/api',
  ios: 'http://192.168.20.64:8000/api',
  default: 'http://localhost:8000/api',
});

export const API_URL: string =
  process.env.EXPO_PUBLIC_API_URL || DEFAULT_API_URL || 'http://localhost:8000/api';

export const FEATURE_BACKGROUND_TRACKING: boolean =
  process.env.EXPO_PUBLIC_FEATURE_BACKGROUND_TRACKING === 'true';

export const APP_VERSION = '1.0.0';
