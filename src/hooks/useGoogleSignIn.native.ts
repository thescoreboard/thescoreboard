/**
 * Native implementation — uses expo-auth-session's Google provider.
 *
 * We use selectAccount + useProxy so Google redirects to
 * https://auth.expo.io/@rejinold14/thescoreboard (a valid HTTPS URL)
 * and Expo bounces the result back to the app.
 * This avoids the "must contain a domain" error that custom schemes
 * (thescoreboard://) trigger on Google's Web application clients.
 */
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';

WebBrowser.maybeCompleteAuthSession();

export function useGoogleSignIn(config: Google.GoogleAuthRequestConfig) {
  return Google.useAuthRequest(config, { useProxy: true });
}
