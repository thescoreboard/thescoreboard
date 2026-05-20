import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  useFonts,
  SpaceGrotesk_400Regular,
  SpaceGrotesk_600SemiBold,
  SpaceGrotesk_700Bold,
} from '@expo-google-fonts/space-grotesk';
import {
  Unbounded_900Black,
} from '@expo-google-fonts/unbounded';
import * as SplashScreen from 'expo-splash-screen';

import { useAuthStore } from '../src/store/auth';
import { useThemeStore } from '../src/store/theme';
import { useTheme } from '../src/hooks/useTheme';

SplashScreen.preventAutoHideAsync();

function RootLayoutInner() {
  const { theme } = useTheme();

  return (
    <>
      <StatusBar style={theme.isDark ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)"     options={{ headerShown: false }} />
        <Stack.Screen name="(auth)"     options={{ headerShown: false, presentation: 'modal' }} />
        <Stack.Screen name="t/[slug]"   options={{ headerShown: false }} />
        <Stack.Screen name="register/[slug]" options={{ headerShown: false }} />
        <Stack.Screen name="organiser"  options={{ headerShown: false }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  const hydrateAuth  = useAuthStore(s => s.hydrate);
  const hydrateTheme = useThemeStore(s => s.hydrate);

  const [fontsLoaded] = useFonts({
    SpaceGrotesk_400Regular,
    SpaceGrotesk_600SemiBold,
    SpaceGrotesk_700Bold,
    Unbounded_900Black,
  });

  useEffect(() => {
    Promise.all([hydrateAuth(), hydrateTheme()]).then(() => {
      if (fontsLoaded) SplashScreen.hideAsync();
    });
  }, [fontsLoaded]);

  if (!fontsLoaded) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <RootLayoutInner />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
