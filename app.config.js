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
        NSCameraUsageDescription: 'Used to live stream matches and upload tournament logos.',
        NSMicrophoneUsageDescription: 'Used to capture audio when live streaming matches.',
        NSPhotoLibraryUsageDescription: 'Used to select tournament logos and posters.',
      },
    },
    android: {
      adaptiveIcon: {
        foregroundImage: './assets/adaptive-icon.png',
        backgroundColor: '#0d0d0d',
      },
      package: 'in.thescoreboard.app',
      permissions: [
        'android.permission.CAMERA',
        'android.permission.RECORD_AUDIO',
        'android.permission.INTERNET',
      ],
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
      'expo-dev-client',
    ],
    experiments: {
      typedRoutes: true,
    },
    scheme: 'thescoreboard',
    extra: {
      apiUrl: API_URL,
      wsUrl:  WS_URL,
      // ── YouTube / Google OAuth ───────────────────────────────────────────
      // Two separate OAuth client IDs are required:
      //   1. Android client (type: Android, package: in.thescoreboard.app)
      //      → used on physical device / APK builds
      //   2. Web client (type: Web application)
      //      → used when running on web (localhost:8081 / thescoreboard.in)
      //      Authorized redirect URIs to add in Google Cloud Console:
      //        http://localhost:8081
      //        https://thescoreboard.in
      //
      // Guide: console.cloud.google.com → APIs & Services → Credentials
      // Enable: YouTube Data API v3
      // OAuth consent screen scopes: .../auth/youtube
      googleClientIdAndroid: process.env.GOOGLE_CLIENT_ID_ANDROID || '876140482091-28svan5do1odatprdhn0jq8fmfca9hp9.apps.googleusercontent.com',
      googleClientIdWeb:     process.env.GOOGLE_CLIENT_ID_WEB     || '',
    },
  },
};
