/**
 * Cross-platform key-value storage.
 * - Native (iOS / Android): expo-secure-store  (encrypted)
 * - Web (Expo web / browser): localStorage     (plain, dev-only)
 *
 * SecureStore only works on physical native targets; calling it in a browser
 * throws "_ExpoSecureStore.default.getValueWithKeyAsync is not a function".
 * This wrapper eliminates that crash while keeping secure storage on device.
 */
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

export const storage = {
  getItem: async (key: string): Promise<string | null> => {
    if (Platform.OS === 'web') {
      try { return localStorage.getItem(key); } catch { return null; }
    }
    return SecureStore.getItemAsync(key);
  },

  setItem: async (key: string, value: string): Promise<void> => {
    if (Platform.OS === 'web') {
      try { localStorage.setItem(key, value); } catch {}
      return;
    }
    return SecureStore.setItemAsync(key, value);
  },

  deleteItem: async (key: string): Promise<void> => {
    if (Platform.OS === 'web') {
      try { localStorage.removeItem(key); } catch {}
      return;
    }
    return SecureStore.deleteItemAsync(key);
  },
};
