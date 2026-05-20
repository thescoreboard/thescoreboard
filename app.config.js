/**
 * Expo app config.
 * API URL routing is handled dynamically in src/api/client.ts using __DEV__
 * and Constants.expoConfig.hostUri — no env vars needed here.
 */

const API_URL = 'https://thescoreboard.in/api';
const WS_URL  = 'wss://thescoreboard.in/api';

/** @type {import('expo/config').ExpoConfig} */
module.exports = {
  expo: {
    name: 'TheScoreBoard',
    slug: 'thescoreboard',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/icon.png',
    userInterfaceStyle: 'automatic',
    splash: {
      image: './assets/splash.png',
      resizeMode: 'contain',
      backgroundColor: '#0d0d0d',
    },
    assetBundlePatterns: ['**/*'],
    ios: {
      supportsTablet: true,
      bundleIdentifier: 'in.thescoreboard.app',
      infoPlist: {
        NSCameraUsageDescription: 'Used to upload tournament logos and posters.',
        NSPhotoLibraryUsageDescription: 'Used to select tournament logos and posters.',
      },
    },
    android: {
      adaptiveIcon: {
        foregroundImage: './assets/adaptive-icon.png',
        backgroundColor: '#0d0d0d',
      },
      package: 'in.thescoreboard.app',
    },
    web: {
      bundler: 'metro',
      output: 'static',
      favicon: './assets/favicon.png',
    },
    plugins: [
      'expo-router',
      'expo-secure-store',
      ['expo-font', { fonts: [] }],
    ],
    experiments: {
      typedRoutes: true,
    },
    scheme: 'thescoreboard',
    extra: {
      apiUrl: API_URL,
      wsUrl:  WS_URL,
    },
  },
};
