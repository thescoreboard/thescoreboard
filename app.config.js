/**
 * Expo app config.
 * API URL routing is handled dynamically in src/api/client.ts using __DEV__
 * and Constants.expoConfig.hostUri — no env vars needed here.
 */

const API_URL = 'https://api.thescoreboard.in/api';
const WS_URL  = 'wss://api.thescoreboard.in/api';

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
        NSPhotoLibraryAddUsageDescription: 'Used to save tournament posters and match screenshots.',
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
      // expo-auth-session uses a browser redirect flow, which REQUIRES a
      // "Web application" OAuth client — NOT an Android client.
      // Android OAuth clients do not support redirect URIs and will cause
      // useAuthRequest() to return null, disabling the Google button.
      //
      // Setup (console.cloud.google.com → APIs & Services → Credentials):
      //   1. Create OAuth 2.0 Client ID → type: Web application
      //      Name: "TheScoreBoard Mobile"
      //      Authorized redirect URIs:
      //        https://auth.expo.io/@YOUR_EXPO_USERNAME/thescoreboard
      //        thescoreboard://
      //   2. Paste the resulting client ID below (or set env var)
      //   3. Enable: YouTube Data API v3
      //   4. OAuth consent screen scopes: .../auth/youtube.upload, .../auth/youtube
      //
      // The Android client ID (in .env) is only needed if you switch to
      // @react-native-google-signin/google-signin (native SDK approach).
      googleClientIdAndroid: process.env.GOOGLE_CLIENT_ID_ANDROID || '876140482091-28svan5do1odatprdhn0jq8fmfca9hp9.apps.googleusercontent.com',
      // Web application client ID — used by expo-auth-session on BOTH web and
      // native Android (redirect flow). Must have "thescoreboard://" added as
      // an Authorized Redirect URI in Google Cloud Console.
      googleClientIdWeb:     process.env.GOOGLE_CLIENT_ID_WEB     || '876140482091-5vc5130v75fa038i38nro0la6gdlmr2r.apps.googleusercontent.com',
      eas: {
        projectId: "3e544007-87d3-4481-bab0-4ab594a4f08e"
      }
    },
  },
};
