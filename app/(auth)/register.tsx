import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTheme } from '../../src/hooks/useTheme';
import { useAuthStore } from '../../src/store/auth';
import { apiRegister } from '../../src/api/client';
import { F } from '../../src/theme';

export default function RegisterScreen() {
  const { theme } = useTheme();
  const router = useRouter();
  const { setToken } = useAuthStore();
  const c = theme.colors;

  const [name,     setName]     = useState('');
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [phone,    setPhone]    = useState('');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');

  const handleRegister = async () => {
    if (!name.trim())                    { setError('Name is required.'); return; }
    if (!email.trim())                   { setError('Email is required.'); return; }
    if (password.length < 6)             { setError('Password must be at least 6 characters.'); return; }
    setError(''); setLoading(true);
    try {
      const data = await apiRegister({ name: name.trim(), email: email.trim().toLowerCase(), password, phone: phone.trim()||null });
      await setToken(data.access_token);
      router.replace('/(tabs)/profile');
    } catch (e: any) { setError(e.message ?? 'Registration failed'); }
    setLoading(false);
  };

  return (
    <SafeAreaView style={[{ flex:1, backgroundColor: c.bg }]}>
      <KeyboardAvoidingView behavior={Platform.OS==='ios'?'padding':'height'} style={{ flex:1 }}>
        <ScrollView contentContainerStyle={{ padding:24 }} keyboardShouldPersistTaps="handled">
          <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/(auth)/login' as any)} style={{ alignSelf:'flex-start', marginBottom:24 }}>
            <Text style={{ fontFamily: F.body, color: c.muted, fontSize:14 }}>← Back</Text>
          </TouchableOpacity>

          {/* Brand */}
          <Text style={[s.brand, { color: c.ink }]}>
            The<Text style={{ color: c.primary }}>Score</Text>Board
          </Text>

          <Text style={[s.title, { fontFamily: F.display, color: c.ink }]}>Create account</Text>
          <Text style={[s.sub, { fontFamily: F.body, color: c.muted }]}>Join TheScoreBoard</Text>

          <View style={{ marginTop: 24, gap: 14 }}>
            {[
              { label:'Full Name *',    value:name,     set:setName,     placeholder:'Rahul Sharma',      type:undefined,    complete:undefined },
              { label:'Email *',        value:email,    set:setEmail,    placeholder:'you@example.com',   type:'email-address' as const, complete:'email' as const },
              { label:'Phone',          value:phone,    set:setPhone,    placeholder:'9876543210',         type:'phone-pad' as const,  complete:undefined },
              { label:'Password *',     value:password, set:setPassword, placeholder:'At least 6 chars',  type:undefined,    complete:'password' as const, secure:true },
            ].map(f => (
              <View key={f.label}>
                <Text style={[s.label, { fontFamily: F.bold, color: c.muted }]}>{f.label}</Text>
                <TextInput
                  style={[s.input, { fontFamily: F.body, borderColor: c.border, backgroundColor: c.elevated, color: c.ink }]}
                  placeholder={f.placeholder} placeholderTextColor={c.muted}
                  value={f.value} onChangeText={f.set}
                  keyboardType={f.type} autoComplete={f.complete}
                  secureTextEntry={(f as any).secure} autoCapitalize="none"
                />
              </View>
            ))}
          </View>

          {error ? <Text style={[s.errText, { fontFamily: F.semi }]}>{error}</Text> : null}

          <TouchableOpacity onPress={handleRegister} disabled={loading}
            style={[s.btn, { backgroundColor: c.primary, opacity: loading?0.6:1, marginTop: 24 }]}>
            <Text style={[s.btnText, { fontFamily: F.display }]}>
              {loading ? 'Creating…' : 'Create Account'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => router.push('/(auth)/login')} style={{ marginTop:16, alignItems:'center' }}>
            <Text style={{ fontFamily: F.body, color: c.muted, fontSize:13 }}>
              Already have an account?{' '}
              <Text style={{ fontFamily: F.bold, color: c.primary }}>Sign in</Text>
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  brand:   { fontFamily: 'Unbounded_900Black', fontSize: 17, letterSpacing: -0.5, marginBottom: 28 },
  title:   { fontSize: 22, fontWeight:'900', letterSpacing:-0.5, marginBottom:4 },
  sub:     { fontSize: 14 },
  label:   { fontSize:11, fontWeight:'700', textTransform:'uppercase', letterSpacing:0.8, marginBottom:6 },
  input:   { borderRadius:8, borderWidth:1.5, paddingHorizontal:14, paddingVertical:12, fontSize:14, minHeight:44 },
  errText: { color:'#e53e3e', marginTop:12, marginBottom:4, fontSize:13 },
  btn:     { borderRadius:8, paddingVertical:14, alignItems:'center', minHeight:48 },
  btnText: { color:'#fff', fontSize:12, fontWeight:'900', textTransform:'uppercase', letterSpacing:0.5 },
});
