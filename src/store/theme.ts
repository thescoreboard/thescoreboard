import { create } from 'zustand';
import { ThemeMode } from '../theme';
import { storage } from '../utils/storage';

interface ThemeState {
  mode:     ThemeMode;
  hydrated: boolean;
  toggle:   () => Promise<void>;
  hydrate:  () => Promise<void>;
}

const THEME_KEY = 'tsb_theme';

export const useThemeStore = create<ThemeState>((set, get) => ({
  mode:     'light',
  hydrated: false,

  hydrate: async () => {
    const saved = await storage.getItem(THEME_KEY);
    set({ mode: (saved as ThemeMode) || 'light', hydrated: true });
  },

  toggle: async () => {
    const next: ThemeMode = get().mode === 'dark' ? 'light' : 'dark';
    await storage.setItem(THEME_KEY, next);
    set({ mode: next });
  },
}));
