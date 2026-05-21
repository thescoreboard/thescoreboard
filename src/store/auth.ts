/**
 * Auth store — JWT kept in SecureStore on native, localStorage on web.
 */
import { create } from 'zustand';
import { storage } from '../utils/storage';
import { apiGetMe } from '../api/client';

const TOKEN_KEY = 'tsb_token';
const MODE_KEY  = 'tsb_mode';

function decodeJwt(token: string): Record<string, any> | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(payload));
  } catch {
    return null;
  }
}

function isTokenValid(token: string): boolean {
  const decoded = decodeJwt(token);
  if (!decoded?.exp) return false;
  return decoded.exp * 1000 > Date.now();
}

type Mode = 'organiser' | 'player';

interface AuthState {
  token:    string | null;
  user:     any | null;       // cached /me response (includes roles)
  mode:     Mode;
  hydrated: boolean;

  setToken:   (token: string) => Promise<void>;
  clearToken: () => Promise<void>;
  setMode:    (mode: Mode)   => Promise<void>;
  hydrate:    () => Promise<void>;
  refreshUser: () => Promise<void>;
  isLoggedIn: () => boolean;
  hasRole:    (role: string) => boolean;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  token:    null,
  user:     null,
  mode:     'player',
  hydrated: false,

  hydrate: async () => {
    const [token, mode] = await Promise.all([
      storage.getItem(TOKEN_KEY),
      storage.getItem(MODE_KEY),
    ]);
    const validToken = token && isTokenValid(token) ? token : null;
    if (token && !validToken) await storage.deleteItem(TOKEN_KEY);
    set({ token: validToken, mode: (mode as Mode) || 'player', hydrated: true });
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

  setMode: async (mode: Mode) => {
    await storage.setItem(MODE_KEY, mode);
    set({ mode });
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
