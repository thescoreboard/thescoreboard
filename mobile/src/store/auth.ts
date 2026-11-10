/**
 * Auth store — JWT kept in SecureStore on native, localStorage on web.
 */
import { create } from 'zustand';
import { storage } from '../utils/storage';
import { apiGetMe } from '../api/client';

const TOKEN_KEY   = 'tsb_token';

function decodeJwt(token: string): Record<string, any> | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    // Convert URL-safe base64 → standard base64, then add padding
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - b64.length % 4) % 4);
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

function isTokenValid(token: string): boolean {
  const decoded = decodeJwt(token);
  if (!decoded?.exp) return false;
  return decoded.exp * 1000 > Date.now();
}

interface AuthState {
  token:       string | null;
  user:        any | null;       // cached /me response (includes roles)
  hydrated:    boolean;

  setToken:        (token: string) => Promise<void>;
  clearToken:      () => Promise<void>;
  hydrate:         () => Promise<void>;
  refreshUser:     () => Promise<void>;
  isLoggedIn:      () => boolean;
  hasRole:         (role: string) => boolean;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  token:       null,
  user:        null,
  hydrated:    false,

  hydrate: async () => {
    const token = await storage.getItem(TOKEN_KEY);

    // Player mode / onboarding were removed; clear their leftovers.
    storage.deleteItem('tsb_mode').catch(() => {});
    storage.deleteItem('tsb_prefs').catch(() => {});
    storage.deleteItem('tsb_onboarded').catch(() => {});

    const validToken = token && isTokenValid(token) ? token : null;
    if (token && !validToken) await storage.deleteItem(TOKEN_KEY);

    set({ token: validToken, hydrated: true });

    // Fetch user profile in background after hydration
    if (validToken) {
      try {
        const user = await apiGetMe(validToken);
        set({ user });
      } catch { /* ignore — token may have been revoked */ }
    }
  },

  setToken: async (token: string) => {
    await storage.setItem(TOKEN_KEY, token);
    set({ token });
    // Eagerly fetch user so roles/name are available immediately after login
    try {
      const user = await apiGetMe(token);
      set({ user });
    } catch { /* ignore */ }
  },

  clearToken: async () => {
    await storage.deleteItem(TOKEN_KEY);
    set({ token: null, user: null });
  },

  refreshUser: async () => {
    const { token } = get();
    if (!token) return;
    try {
      const user = await apiGetMe(token);
      set({ user });
    } catch { /* ignore */ }
  },

  isLoggedIn: () => {
    const { token } = get();
    return token !== null && isTokenValid(token);
  },

  hasRole: (role: string) => {
    const { user } = get();
    return Array.isArray(user?.roles) && user.roles.includes(role);
  },
}));

export function getAuthHeaders(token: string | null): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}
