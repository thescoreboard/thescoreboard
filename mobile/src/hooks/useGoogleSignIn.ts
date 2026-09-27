/**
 * Web stub — Google OAuth via expo-auth-session is native-only.
 * Returns the same tuple shape so login.tsx can import unconditionally.
 */
export function useGoogleSignIn(_config: Record<string, any>) {
  return [null, null, async () => ({ type: 'dismiss' as const })] as const;
}
