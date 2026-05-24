/**
 * Native implementation — uses expo-auth-session's Google provider.
 */
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';

WebBrowser.maybeCompleteAuthSession();

export function useGoogleSignIn(config: Google.GoogleAuthRequestConfig) {
  return Google.useAuthRequest(config);
}
