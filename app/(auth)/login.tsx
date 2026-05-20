import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTheme } from '../../src/hooks/useTheme';
import { useAuthStore } from '../../src/store/auth';
import { apiLogin } from '../../src/api/client';
import { F } from '../../src/theme';

export default function LoginScreen() {
  const { theme } = useTheme();
  const router = useRouter();
  const { setToken } = useAuthStore();
  const c = theme.colors;

  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [loading,  setLoading]  = useState(false);

  const handleLogin = async () => {
    if (!email.trim() || !password) { Alert.alert('Enter email and password'); return; }
    setLoading(true);
    try {
      const data = await apiLogin({ email: email.trim().toLowerCase(), password });
      await setToken(data.access_token);
      router.replace('/(tabs)/profile');
    } catch (e: any) {
      Alert.alert('Login failed', e.message ?? 'Invalid credentials');
    }
    setLoading(false);
  };

  return (
    <SafeAreaView style={[{ flex:1, backgroundColor: c.bg }]}>
      <KeyboardAvoidingView behavior={Platform.OS==='ios'?'padding':'height'} style={{ flex:1 }}>
        <ScrollView contentContainerStyle={s.wrap} keyboardShouldPersistTaps="handled">
          <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)' as any)} style={{ alignSelf:'flex-start', marginBottom:24 }}>
            <Text style={{ fontFamily: F.body, color: c.muted, fontSize:14 }}>← Back</Text>
          </TouchableOpacity>

          {/* Brand */}
          <Text style={[s.brand, { color: c.ink }]}>
            The<Text style={{ color: c.primary }}>Score</Text>Board
          </Text>

          <Text style={[s.title, { fontFamily: F.display, color: c.ink }]}>Welcome back</Text>
          <Text style={[s.sub, { fontFamily: F.body, color: c.muted }]}>Sign in to your account</Text>

          <View style={{ marginTop: 24, gap: 14 }}>
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

          <TouchableOpacity onPress={handleLogin} disabled={loading}
            style={[s.btn, { backgroundColor: c.primary, opacity: loading?0.6:1, marginTop: 24 }]}>
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
  wrap:    { padding:24, flexGrow:1 },
  brand:   { fontFamily: 'Unbounded_900Black', fontSize: 17, letterSpacing: -0.5, marginBottom: 28 },
  title:   { fontSize: 22, fontWeight:'900', letterSpacing:-0.5, marginBottom:4 },
  sub:     { fontSize: 14, marginBottom: 0 },
  label:   { fontSize:11, fontWeight:'700', textTransform:'uppercase', letterSpacing:0.8, marginBottom:6 },
  input:   { borderRadius:8, borderWidth:1.5, paddingHorizontal:14, paddingVertical:12, fontSize:14, minHeight:44 },
  btn:     { borderRadius:8, paddingVertical:14, alignItems:'center', minHeight:48 },
  btnText: { color:'#fff', fontSize:12, fontWeight:'900', textTransform:'uppercase', letterSpacing:0.5 },
});
