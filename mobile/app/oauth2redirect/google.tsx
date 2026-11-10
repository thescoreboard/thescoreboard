/**
 * Catch-all for the Google OAuth redirect (com.googleusercontent.apps.…:/oauth2redirect/google).
 *
 * expo-router treats every incoming deep link as a route, so without this file
 * the OAuth return shows "Unmatched Route". The auth result itself is delivered
 * to expo-auth-session via Linking; this screen only needs to get out of the way.
 */
import { useEffect } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';

export default function OAuthRedirect() {
  const router = useRouter();
  useEffect(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/' as any);
  }, []);
  return <View style={{ flex: 1, backgroundColor: '#000' }} />;
}
