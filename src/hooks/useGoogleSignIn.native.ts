/**
 * Native implementation — uses expo-auth-session's Google provider.
 *
 * Google Sign-In redirect flow for standalone Android APKs:
 *   1. expo-auth-session opens a browser → Google login page
 *   2. After auth, Google redirects to the reverse-client-ID URI:
 *        com.googleusercontent.apps.{prefix}:/oauth2redirect/google
 *   3. The intent filter in app.config.js (android.intentFilters) makes
 *      Android hand that URL back to our app
 *   4. WebBrowser.maybeCompleteAuthSession() (in useEffect below) completes
 *      the session and populates `response` in the hook
 *
 * expo-auth-session v5 requires androidClientId to be defined on Android —
 * it throws "androidClientId must be defined" during render if it is missing,
 * crashing the entire screen before the user can interact with it.
 *
 * NOTE: WebBrowser.maybeCompleteAuthSession() MUST be called inside a
 * useEffect, NOT at module evaluation time. Calling it at the top level
 * of a module triggers before React Native's native bridge is fully
 * ready in standalone APKs, causing a NativeModule crash on Android.
 */
import { useMemo, useEffect } from 'react';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';

export function useGoogleSignIn(config: Google.GoogleAuthRequestConfig) {
  useEffect(() => {
    WebBrowser.maybeCompleteAuthSession();
  }, []);

  // Build the reverse-client-ID redirect URI that Android OAuth clients expect.
  // e.g. 876140482091-xxx.apps.googleusercontent.com
  //   → com.googleusercontent.apps.876140482091-xxx:/oauth2redirect/google
  const androidRedirectUri = useMemo(() => {
    if (!config.androidClientId) return undefined;
    const prefix = config.androidClientId.replace('.apps.googleusercontent.com', '');
    return `com.googleusercontent.apps.${prefix}:/oauth2redirect/google`;
  }, [config.androidClientId]);

  const resolvedConfig: Google.GoogleAuthRequestConfig = {
    ...config,
    redirectUri: androidRedirectUri,
  };

  return Google.useAuthRequest(resolvedConfig);
}
