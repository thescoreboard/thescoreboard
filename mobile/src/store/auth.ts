/**
 * Auth store — JWT kept in SecureStore on native, localStorage on web.
 */
import { create } from 'zustand';
import { storage } from '../utils/storage';
import { apiGetMe } from '../api/client';

const TOKEN_KEY   = 'tsb_token';
const MODE_KEY    = 'tsb_mode';
const PREFS_KEY   = 'tsb_prefs';
const ONBOARD_KEY = 'tsb_onboarded';

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

type Mode = 'organiser' | 'player';

interface Preferences {
  sports: string[];
  city:   string;
}

interface AuthState {
  token:       string | null;
  user:        any | null;       // cached /me response (includes roles)
  mode:        Mode;
  preferences: Preferences;
  onboarded:   boolean;
  hydrated:    boolean;

  setToken:        (token: string) => Promise<void>;
  clearToken:      () => Promise<void>;
  setMode:         (mode: Mode)   => Promise<void>;
  setPreferences:  (prefs: Preferences) => Promise<void>;
  setOnboarded:    (value: boolean) => Promise<void>;
  hydrate:         () => Promise<void>;
  refreshUser:     () => Promise<void>;
  isLoggedIn:      () => boolean;
  hasRole:         (role: string) => boolean;
}

const DEFAULT_PREFS: Preferences = { sports: [], city: '' };

export const useAuthStore = create<AuthState>((set, get) => ({
  token:       null,
  user:        null,
  mode:        'player',
  preferences: DEFAULT_PREFS,
  onboarded:   false,
  hydrated:    false,

  hydrate: async () => {
    const [token, mode, prefsRaw, onboardedRaw] = await Promise.all([
      storage.getItem(TOKEN_KEY),
      storage.getItem(MODE_KEY),
      storage.getItem(PREFS_KEY),
      storage.getItem(ONBOARD_KEY),
    ]);

    const validToken = token && isTokenValid(token) ? token : null;
    if (token && !validToken) await storage.deleteItem(TOKEN_KEY);

    let preferences: Preferences = DEFAULT_PREFS;
    try {
      if (prefsRaw) preferences = JSON.parse(prefsRaw);
    } catch { /* ignore malformed */ }

    const onboarded = onboardedRaw === 'true';

    set({
      token: validToken,
      mode: (mode as Mode) || 'player',
      preferences,
      onboarded,
      hydrated: true,
    });

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

  setPreferences: async (prefs: Preferences) => {
    await storage.setItem(PREFS_KEY, JSON.stringify(prefs));
    set({ preferences: prefs });
  },

  setOnboarded: async (value: boolean) => {
    await storage.setItem(ONBOARD_KEY, String(value));
    set({ onboarded: value });
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
