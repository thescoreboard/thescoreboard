/**
 * Expo app config.
 * API URL routing is handled dynamically in src/api/client.ts using __DEV__
 * and Constants.expoConfig.hostUri — no env vars needed here.
 */

const API_URL = 'https://api.thescoreboard.in/api';
const WS_URL  = 'wss://api.thescoreboard.in/api';

// Derive the reverse-client-ID scheme used by Android OAuth redirect.
// e.g. 876140482091-xxx.apps.googleusercontent.com
//   → com.googleusercontent.apps.876140482091-xxx
const ANDROID_CLIENT_ID = process.env.GOOGLE_CLIENT_ID_ANDROID
  || '876140482091-28svan5do1odatprdhn0jq8fmfca9hp9.apps.googleusercontent.com';
const ANDROID_OAUTH_SCHEME = 'com.googleusercontent.apps.'
  + ANDROID_CLIENT_ID.replace('.apps.googleusercontent.com', '');

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
      // Intent filter so Android can intercept Google's OAuth redirect back to
      // the app. Google uses the reverse of the Android client ID as the scheme:
      //   com.googleusercontent.apps.{client_id_prefix}:/oauth2redirect/google
      intentFilters: [
        {
          action: 'VIEW',
          data: [{ scheme: ANDROID_OAUTH_SCHEME }],
          category: ['BROWSABLE', 'DEFAULT'],
        },
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
      // ── Google OAuth ─────────────────────────────────────────────────────
      // expo-auth-session on Android uses the Android OAuth client with a
      // reverse-client-ID redirect URI:
      //   com.googleusercontent.apps.{client_prefix}:/oauth2redirect/google
      // The intent filter for this scheme is registered above in
      // android.intentFilters so Android can intercept Google's redirect.
      //
      // Setup (console.cloud.google.com → APIs & Services → Credentials):
      //   Android client — package: in.thescoreboard.app
      //                    SHA-1: your release keystore SHA-1 fingerprint
      //   Web client     — used for the web version of the app only
      googleClientIdAndroid: ANDROID_CLIENT_ID,
      googleClientIdWeb:     process.env.GOOGLE_CLIENT_ID_WEB || '876140482091-5vc5130v75fa038i38nro0la6gdlmr2r.apps.googleusercontent.com',
      eas: {
        projectId: "3e544007-87d3-4481-bab0-4ab594a4f08e"
      }
    },
  },
};
