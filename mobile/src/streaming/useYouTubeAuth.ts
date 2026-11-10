/**
 * YouTube OAuth for the streaming spike — Authorization Code + PKCE using the
 * ANDROID OAuth client and the reverse-client-ID redirect, exactly like the
 * existing Google login (useGoogleSignIn.native.ts).
 *
 * Why not the prototype's flow (useYouTubeStream.ts)? It called
 * makeRedirectUri({ useProxy: true }), but expo-auth-session 5.5 has no
 * `useProxy` option (removed in SDK 50), so the redirect URI silently became
 * `thescoreboard://…`, which Google's Web client rejects. Android OAuth
 * clients also cannot use the implicit (token) response type.
 *
 * Token is kept in memory only (1 h lifetime, no refresh token requested).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import Constants from 'expo-constants';

const DISCOVERY: AuthSession.DiscoveryDocument = {
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
  revocationEndpoint: 'https://oauth2.googleapis.com/revoke',
};

// Same scope as the prototype; liveBroadcasts/liveStreams accept `youtube`
// or `youtube.force-ssl` (both "sensitive" → need Google verification to ship).
const SCOPES = ['https://www.googleapis.com/auth/youtube'];

export function useYouTubeAuth() {
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const clientId = (Constants.expoConfig?.extra?.googleClientIdAndroid as string) ?? '';
  const redirectUri = useMemo(
    () => clientId
      ? `com.googleusercontent.apps.${clientId.replace('.apps.googleusercontent.com', '')}:/oauth2redirect/google`
      : '',
    [clientId],
  );

  useEffect(() => { WebBrowser.maybeCompleteAuthSession(); }, []);

  const [request, , promptAsync] = AuthSession.useAuthRequest(
    {
      clientId: clientId || 'missing',
      scopes: SCOPES,
      redirectUri,
      responseType: AuthSession.ResponseType.Code,
      usePKCE: true,
      // Always show the account chooser: the streaming channel is often not the
      // account the phone's browser is already signed into.
      prompt: AuthSession.Prompt.SelectAccount,
    },
    DISCOVERY,
  );

  /** Opens Google consent; resolves with an access token or null. */
  const connect = useCallback(async (): Promise<string | null> => {
    setError(null);
    if (!clientId) {
      setError('googleClientIdAndroid is not configured in app.config.js');
      return null;
    }
    try {
      const result = await promptAsync();
      if (result.type !== 'success') {
        if (result.type === 'error') setError(result.error?.message ?? 'Google sign-in failed');
        return null;
      }
      const tokens = await AuthSession.exchangeCodeAsync(
        {
          clientId,
          code: result.params.code,
          redirectUri,
          extraParams: request?.codeVerifier ? { code_verifier: request.codeVerifier } : undefined,
        },
        DISCOVERY,
      );
      setToken(tokens.accessToken);
      return tokens.accessToken;
    } catch (e: any) {
      setError(e?.message ?? 'Google sign-in failed');
      return null;
    }
  }, [clientId, redirectUri, promptAsync, request]);

  const disconnect = useCallback(() => setToken(null), []);

  return { token, error, connect, disconnect, ready: !!request };
}
