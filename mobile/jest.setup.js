jest.mock('react-native', () => ({
  Platform: {
    OS: 'ios',
    select: (objs) => objs.default || objs.ios || objs.android,
  },
  AppState: {
    addEventListener: () => ({ remove: () => {} }),
  },
  StyleSheet: {
    create: (styles) => styles,
  },
}));

jest.mock('expo-secure-store', () => ({
  isAvailableAsync: async () => true,
  getItemAsync: async () => null,
  setItemAsync: async () => null,
  deleteItemAsync: async () => null,
  AFTER_FIRST_UNLOCK: 'AFTER_FIRST_UNLOCK',
}));

jest.mock('expo-sqlite', () => ({
  openDatabaseAsync: async () => null,
}));
