import { useThemeStore } from '../store/theme';
import { getTheme } from '../theme';

export function useTheme() {
  const { mode, toggle } = useThemeStore();
  return { theme: getTheme(mode), mode, toggle };
}
