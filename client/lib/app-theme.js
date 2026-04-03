import React from 'react';
import * as SecureStore from 'expo-secure-store';

const APP_THEME_KEY = 'app-theme-mode';

const LIGHT_THEME = {
  mode: 'light',
  screenBg: '#F7F4EE',
  surface: '#FFFDF8',
  surfaceMuted: '#FCFAF5',
  surfaceDanger: '#FFF8F7',
  border: '#E7E0D4',
  borderSoft: '#DDD8CD',
  borderDanger: '#EBD9D5',
  textPrimary: '#111827',
  textSecondary: '#6B7280',
  textMuted: '#9CA3AF',
  textOnDark: '#FFFFFF',
  textOnDarkMuted: '#BFC9D9',
  heroBg: '#182033',
  heroBorder: 'rgba(255,255,255,0.06)',
  heroMuted: '#D6DDE9',
  primary: '#4F7DFF',
  primaryText: '#FFFFFF',
  secondaryBg: '#FFFFFF',
  secondaryBorder: '#DDD8CD',
  secondaryText: '#354052',
  dangerText: '#C8423A',
  dangerBorder: '#E3C8C4',
  tabBarBg: '#FFFDF8',
  tabBarBorder: '#E7E0D4',
  tabActive: '#4F7DFF',
  tabInactive: '#8A8F98',
};

const DARK_THEME = {
  mode: 'dark',
  screenBg: '#0F1722',
  surface: '#162033',
  surfaceMuted: '#1B2638',
  surfaceDanger: '#211A1D',
  border: '#273246',
  borderSoft: '#2E3A50',
  borderDanger: '#4A2D32',
  textPrimary: '#F8FAFC',
  textSecondary: '#CBD5E1',
  textMuted: '#94A3B8',
  textOnDark: '#FFFFFF',
  textOnDarkMuted: '#D7E1EE',
  heroBg: '#1A2437',
  heroBorder: 'rgba(255,255,255,0.08)',
  heroMuted: '#D6DDE9',
  primary: '#78A6FF',
  primaryText: '#09111D',
  secondaryBg: '#1B2638',
  secondaryBorder: '#314057',
  secondaryText: '#E2E8F0',
  dangerText: '#F28B82',
  dangerBorder: '#5A343B',
  tabBarBg: '#121B29',
  tabBarBorder: '#273246',
  tabActive: '#78A6FF',
  tabInactive: '#8FA1B9',
};

function normalizeThemeMode(value) {
  if (value === 'dark') {
    return 'dark';
  }
  return 'light';
}

function getThemeByMode(mode) {
  if (mode === 'dark') {
    return DARK_THEME;
  }
  return LIGHT_THEME;
}

const AppThemeContext = React.createContext({
  themeMode: 'light',
  theme: LIGHT_THEME,
  setThemeMode: async () => {},
  isThemeLoaded: false,
});

export function AppThemeProvider({ children }) {
  const [themeMode, setThemeModeState] = React.useState('light');
  const [isThemeLoaded, setIsThemeLoaded] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;

    async function loadThemePreference() {
      try {
        const raw = await SecureStore.getItemAsync(APP_THEME_KEY);
        if (cancelled) {
          return;
        }
        const nextMode = normalizeThemeMode(raw);
        setThemeModeState(nextMode);
      } catch (error) {
        if (!cancelled) {
          setThemeModeState('light');
        }
      } finally {
        if (!cancelled) {
          setIsThemeLoaded(true);
        }
      }
    }

    loadThemePreference();

    return () => {
      cancelled = true;
    };
  }, []);

  const setThemeMode = React.useCallback(async (nextMode) => {
    const safeMode = normalizeThemeMode(nextMode);
    setThemeModeState(safeMode);
    try {
      await SecureStore.setItemAsync(APP_THEME_KEY, safeMode);
    } catch (error) {
      // Best effort persistence only.
    }
  }, []);

  const theme = React.useMemo(() => getThemeByMode(themeMode), [themeMode]);

  const value = React.useMemo(
    () => ({
      themeMode,
      theme,
      setThemeMode,
      isThemeLoaded,
    }),
    [themeMode, theme, setThemeMode, isThemeLoaded]
  );

  return <AppThemeContext.Provider value={value}>{children}</AppThemeContext.Provider>;
}

export function useAppTheme() {
  return React.useContext(AppThemeContext);
}
