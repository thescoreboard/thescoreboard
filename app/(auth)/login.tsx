import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  Alert, KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import { useTheme }    from '../../src/hooks/useTheme';
import { useAuthStore } from '../../src/store/auth';
import { useGoogleSignIn } from '../../src/hooks/useGoogleSignIn';
import { apiLogin, apiGoogleAuth } from '../../src/api/client';
import { F } from '../../src/theme';

export default function LoginScreen() {
  const { theme }                   = useTheme();
  const router                      = useRouter();
  const { setToken, onboarded }     = useAuthStore();
  const c = theme.colors;

  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [loading,  setLoading]  = useState(false);
  const [gLoading, setGLoading] = useState(false);

  // ── Google OAuth (native only — web stub returns null/null/noop) ──────────
  const extra = Constants.expoConfig?.extra ?? {};
  const [request, response, promptAsync] = useGoogleSignIn({
    androidClientId: extra.googleClientIdAndroid,
    webClientId:     extra.googleClientIdWeb || undefined,
  });

  const isNative = Platform.OS !== 'web';

  useEffect(() => {
    if (!response || (response as any).type !== 'success') return;
    const accessToken = (response as any).authentication?.accessToken;
    if (!accessToken) return;

    (async () => {
      setGLoading(true);
      try {
        const data = await apiGoogleAuth(accessToken);
        await setToken(data.access_token);
        await afterLogin();
      } catch (e: any) {
        Alert.alert('Google Sign-In failed', e.message ?? 'Could not verify account');
      } finally {
        setGLoading(false);
      }
    })();
  }, [response]);

  // ── Post-login routing ────────────────────────────────────────────────────
  const afterLogin = async () => {
    const freshOnboarded = useAuthStore.getState().onboarded;
    const { storage } = await import('../../src/utils/storage');
    const next = await storage.getItem('tsb_next');
    if (next) {
      await storage.deleteItem('tsb_next');
      router.replace(next as any);
    } else if (!freshOnboarded) {
      router.replace('/onboarding' as any);
    } else {
      router.replace('/(tabs)' as any);
    }
  };

  // ── Email / password login ────────────────────────────────────────────────
  const handleLogin = async () => {
    if (!email.trim() || !password) { Alert.alert('Enter email and password'); return; }
    setLoading(true);
    try {
      const data = await apiLogin({ email: email.trim().toLowerCase(), password });
      await setToken(data.access_token);
      await afterLogin();
    } catch (e: any) {
      Alert.alert('Login failed', e.message ?? 'Invalid credentials');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={[{ flex:1, backgroundColor: c.bg }]}>
      <KeyboardAvoidingView behavior={Platform.OS==='ios'?'padding':'height'} style={{ flex:1 }}>
        <ScrollView contentContainerStyle={s.wrap} keyboardShouldPersistTaps="handled">
          <TouchableOpacity
            onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)' as any)}
            style={{ alignSelf:'flex-start', marginBottom:24 }}
          >
            <Text style={{ fontFamily: F.body, color: c.muted, fontSize:14 }}>← Back</Text>
          </TouchableOpacity>

          {/* Brand */}
          <Text style={[s.brand, { color: c.ink }]}>
            THE<Text style={{ color: c.primary }}>SCORE</Text>BOARD
          </Text>

          <Text style={[s.title, { fontFamily: F.display, color: c.ink }]}>Welcome back</Text>
          <Text style={[s.sub, { fontFamily: F.body, color: c.muted }]}>Sign in to your account</Text>

          {/* Google SSO — native only */}
          {isNative && (
            <>
              <TouchableOpacity
                onPress={() => { if (!gLoading) promptAsync(); }}
                disabled={!request || gLoading}
                style={[s.googleBtn, {
                  borderColor: c.border,
                  backgroundColor: c.elevated,
                  opacity: (!request || gLoading) ? 0.6 : 1,
                  marginTop: 24,
                }]}
              >
                {gLoading
                  ? <ActivityIndicator color={c.ink} size="small" />
                  : <Text style={[s.googleBtnText, { fontFamily: F.bold, color: c.ink }]}>Continue with Google</Text>
                }
              </TouchableOpacity>

              <View style={s.dividerRow}>
                <View style={[s.dividerLine, { backgroundColor: c.border }]} />
                <Text style={[s.dividerLabel, { fontFamily: F.body, color: c.muted }]}>or sign in with email</Text>
                <View style={[s.dividerLine, { backgroundColor: c.border }]} />
              </View>
            </>
          )}

          {!isNative && <View style={{ marginTop: 24 }} />}

          {/* Email + password */}
          <View style={{ gap: 14 }}>
            <View>
              <Text style={[s.label, { fontFamily: F.bold, color: c.muted }]}>Email</Text>
              <TextInput
                style={[s.input, { fontFamily: F.body, backgroundColor: c.elevated, borderColor: c.border, color: c.ink }]}
                placeholder="you@example.com" placeholderTextColor={c.muted}
                value={email} onChangeText={setEmail}
                autoCapitalize="none" keyboardType="email-address" autoComplete="email"
              />
            </View>
            <View>
              <Text style={[s.label, { fontFamily: F.bold, color: c.muted }]}>Password</Text>
              <TextInput
                style={[s.input, { fontFamily: F.body, backgroundColor: c.elevated, borderColor: c.border, color: c.ink }]}
                placeholder="••••••••" placeholderTextColor={c.muted}
                value={password} onChangeText={setPassword}
                secureTextEntry autoComplete="password"
              />
            </View>
          </View>

          <TouchableOpacity
            onPress={handleLogin}
            disabled={loading}
            style={[s.btn, { backgroundColor: c.primary, opacity: loading ? 0.6 : 1, marginTop: 20 }]}
          >
            <Text style={[s.btnText, { fontFamily: F.display }]}>
              {loading ? 'Signing in…' : 'Sign In'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => router.push('/(auth)/register')} style={{ marginTop:16, alignItems:'center' }}>
            <Text style={{ fontFamily: F.body, color: c.muted, fontSize:13 }}>
              Don't have an account?{' '}
              <Text style={{ fontFamily: F.bold, color: c.primary }}>Register</Text>
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  wrap:          { padding:24, flexGrow:1 },
  brand:         { fontFamily: 'Unbounded_900Black', fontSize: 19, letterSpacing: -1, marginBottom: 28 },
  title:         { fontSize: 22, fontWeight:'900', letterSpacing:-0.5, marginBottom:4 },
  sub:           { fontSize: 14, marginBottom: 0 },
  googleBtn:     { borderRadius:8, borderWidth:1.5, paddingVertical:14, alignItems:'center', minHeight:48 },
  googleBtnText: { fontSize:13, fontWeight:'700' },
  dividerRow:    { flexDirection:'row', alignItems:'center', gap:10, marginVertical:20 },
  dividerLine:   { flex:1, height:1 },
  dividerLabel:  { fontSize:11, textTransform:'uppercase', letterSpacing:0.5 },
  label:         { fontSize:11, fontWeight:'700', textTransform:'uppercase', letterSpacing:0.8, marginBottom:6 },
  input:         { borderRadius:8, borderWidth:1.5, paddingHorizontal:14, paddingVertical:12, fontSize:14, minHeight:44 },
  btn:           { borderRadius:8, paddingVertical:14, alignItems:'center', minHeight:48 },
  btnText:       { color:'#fff', fontSize:12, fontWeight:'900', textTransform:'uppercase', letterSpacing:0.5 },
});
