/**
 * Profile screen — player profile + account info. Mirrors PlayerDashboard.jsx.
 */
import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTheme } from '../../src/hooks/useTheme';
import { useAuthStore } from '../../src/store/auth';
import { apiGetMe, apiGetPlayerProfile, apiSavePlayerProfile } from '../../src/api/client';
import { F } from '../../src/theme';

const GENDERS = ['Male', 'Female', 'Other'];

export default function ProfileScreen() {
  const { theme } = useTheme();
  const router = useRouter();
  const { token, clearToken, isLoggedIn } = useAuthStore();

  const [user,    setUser]    = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [editing, setEditing] = useState(false);
  const [form,    setForm]    = useState({ name:'', phone:'', age:'', gender:'Male', location:'' });
  const [saving,  setSaving]  = useState(false);
  const [loading, setLoading] = useState(true);
  const [saved,   setSaved]   = useState(false);

  useEffect(() => {
    if (!isLoggedIn()) { setLoading(false); return; }
    (async () => {
      try {
        const [u, p] = await Promise.all([
          apiGetMe(token!),
          apiGetPlayerProfile(token!).catch(() => null),
        ]);
        setUser(u);
        setProfile(p);
        if (p) setForm({ name: p.name??'', phone: p.phone??'', age: p.age!=null?String(p.age):'', gender: p.gender??'Male', location: p.location??'' });
        else setEditing(true);
      } catch { clearToken(); }
      setLoading(false);
    })();
  }, [token]);

  const handleSave = async () => {
    if (!form.name.trim()) { Alert.alert('Name is required'); return; }
    setSaving(true);
    try {
      const p = await apiSavePlayerProfile(token!, {
        name: form.name.trim(), phone: form.phone.trim()||null,
        age: parseInt(form.age)||null, gender: form.gender, location: form.location.trim()||null,
      });
      setProfile(p); setEditing(false); setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e: any) { Alert.alert('Error', e.message); }
    setSaving(false);
  };

  const bg = theme.colors.bg;
  const c  = theme.colors;

  if (loading) return <SafeAreaView style={[{ flex:1, backgroundColor:bg }]}><ActivityIndicator style={{flex:1}} color={c.primary} /></SafeAreaView>;

  if (!isLoggedIn()) {
    return (
      <SafeAreaView style={[s.flex, { backgroundColor: bg }]}>
        <View style={s.center}>
          <Text style={[s.bigLabel, { color: c.ink }]}>Sign in to manage your profile</Text>
          <TouchableOpacity onPress={() => router.push('/(auth)/login')} style={[s.btn, { backgroundColor: c.primary }]}>
            <Text style={s.btnText}>Login</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push('/(auth)/register')} style={[s.btn, { backgroundColor: c.elevated, borderWidth:1, borderColor: c.border }]}>
            <Text style={[s.btnText, { color: c.ink }]}>Create Account</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[s.flex, { backgroundColor: bg }]}>
      <ScrollView contentContainerStyle={{ padding: 20 }}>
        {/* Header */}
        <Text style={[s.title, { color: c.ink }]}>Player Dashboard</Text>
        <Text style={[s.sub, { color: c.muted }]}>Welcome back, <Text style={{ fontFamily: F.bold, color: c.ink }}>{user?.name}</Text></Text>

        {/* Profile card */}
        <View style={[s.card, { backgroundColor: c.surface, borderColor: c.border }]}>
          <View style={[s.cardHeader, { borderBottomColor: c.border }]}>
            <Text style={[s.cardLabel, { color: c.muted }]}>PLAYER PROFILE</Text>
            {!editing && profile && (
              <TouchableOpacity onPress={() => setEditing(true)} style={[s.editBtn, { borderColor: c.border }]}>
                <Text style={{ fontSize: 12, color: c.muted, fontWeight:'600' }}>Edit</Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={{ padding: 16 }}>
            {!editing && profile && (
              <View style={s.profileGrid}>
                {[['Name', profile.name], ['Phone', profile.phone], ['Age', profile.age], ['Gender', profile.gender], ['Location', profile.location]].map(([label, val]) =>
                  val ? (
                    <View key={label as string} style={{ marginBottom: 12 }}>
                      <Text style={{ fontSize: 10, fontWeight:'700', textTransform:'uppercase', letterSpacing:0.5, color: c.muted }}>{label}</Text>
                      <Text style={{ fontSize: 14, fontWeight:'600', color: c.ink }}>{val}</Text>
                    </View>
                  ) : null
                )}
              </View>
            )}

            {editing && (
              <View>
                {!profile && (
                  <View style={[s.banner, { backgroundColor: c.primary+'10', borderColor: c.primary+'33' }]}>
                    <Text style={{ fontSize: 12, color: c.muted }}>Set up your player profile to register for tournaments.</Text>
                  </View>
                )}

                {[
                  { label:'Full Name *', key:'name', placeholder:'Rahul Sharma' },
                  { label:'Phone', key:'phone', placeholder:'9876543210' },
                  { label:'City / Location', key:'location', placeholder:'e.g. Chennai' },
                ].map(f => (
                  <View key={f.key} style={{ marginBottom: 12 }}>
                    <Text style={[s.fieldLabel, { color: c.muted }]}>{f.label}</Text>
                    <TextInput
                      style={[s.input, { backgroundColor: c.elevated, borderColor: c.border, color: c.ink }]}
                      placeholder={f.placeholder}
                      placeholderTextColor={c.muted}
                      value={(form as any)[f.key]}
                      onChangeText={v => setForm(p => ({ ...p, [f.key]: v }))}
                    />
                  </View>
                ))}

                <View style={{ flexDirection:'row', gap:12, marginBottom:12 }}>
                  <View style={{ flex:1 }}>
                    <Text style={[s.fieldLabel, { color: c.muted }]}>Age</Text>
                    <TextInput
                      style={[s.input, { backgroundColor: c.elevated, borderColor: c.border, color: c.ink }]}
                      placeholder="24" keyboardType="numeric"
                      value={form.age} onChangeText={v => setForm(p => ({ ...p, age: v }))}
                      placeholderTextColor={c.muted}
                    />
                  </View>
                  <View style={{ flex:1 }}>
                    <Text style={[s.fieldLabel, { color: c.muted }]}>Gender</Text>
                    <View style={{ flexDirection:'row', gap: 6, marginTop: 4 }}>
                      {GENDERS.map(g => (
                        <TouchableOpacity key={g} onPress={() => setForm(p => ({ ...p, gender: g }))}
                          style={[s.genderPill, { backgroundColor: form.gender===g ? c.ink : c.elevated, borderColor: c.border }]}>
                          <Text style={{ fontSize:12, color: form.gender===g ? c.bg : c.muted }}>{g}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                </View>

                <View style={{ flexDirection:'row', gap: 10, marginTop: 8 }}>
                  <TouchableOpacity onPress={handleSave} disabled={saving}
                    style={[s.saveBtn, { backgroundColor: c.primary, opacity: saving?0.6:1 }]}>
                    <Text style={{ fontFamily: F.display, color:'#fff', fontSize:11, letterSpacing:0.5, textTransform:'uppercase' }}>{saving?'Saving…':'Save Profile'}</Text>
                  </TouchableOpacity>
                  {profile && (
                    <TouchableOpacity onPress={() => setEditing(false)}
                      style={[s.cancelBtn, { borderColor: c.border, backgroundColor: c.elevated }]}>
                      <Text style={{ color: c.muted, fontWeight:'600' }}>Cancel</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            )}
          </View>
          {saved && <View style={[s.savedBanner, { backgroundColor:'#16a34a15', borderTopColor:'#16a34a33' }]}><Text style={{ color:'#16a34a', fontWeight:'700', fontSize:12 }}>✓ Profile saved</Text></View>}
        </View>

        {/* Account info */}
        <View style={[s.card, { backgroundColor: c.surface, borderColor: c.border }]}>
          <View style={[s.cardHeader, { borderBottomColor: c.border }]}>
            <Text style={[s.cardLabel, { color: c.muted }]}>ACCOUNT</Text>
          </View>
          <View style={{ padding: 16 }}>
            <Text style={{ fontSize:10, color:c.muted, fontWeight:'700', textTransform:'uppercase' }}>Email</Text>
            <Text style={{ fontSize:13, color:c.ink, fontWeight:'600', marginTop:2 }}>{user?.email}</Text>
          </View>
        </View>

        {/* Actions */}
        <TouchableOpacity onPress={() => router.replace('/(tabs)/organiser' as any)}
          style={[s.actionBtn, { backgroundColor: c.surface, borderColor: c.border }]}>
          <Text style={{ fontSize:11, color:c.muted, fontWeight:'800', textTransform:'uppercase' }}>Switch to</Text>
          <Text style={{ fontSize:15, fontWeight:'700', color:c.ink }}>Organiser Mode</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => { clearToken(); }}
          style={[s.actionBtn, { backgroundColor: c.surface, borderColor: c.border }]}>
          <Text style={{ fontSize:15, fontWeight:'700', color:'#e53e3e' }}>Sign Out</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  flex:        { flex: 1 },
  center:      { flex:1, alignItems:'center', justifyContent:'center', gap:12, padding:32 },
  bigLabel:    { fontSize:17, fontWeight:'700', textAlign:'center', marginBottom:8 },
  btn:         { width:'100%', borderRadius:8, padding:14, alignItems:'center', minHeight:48 },
  btnText:     { fontFamily: 'Unbounded_900Black', color:'#fff', fontSize:11, letterSpacing:0.5, textTransform:'uppercase' },
  title:       { fontFamily: 'Unbounded_900Black', fontSize:18, letterSpacing:-0.5, marginBottom:4 },
  sub:         { fontFamily: 'SpaceGrotesk_400Regular', fontSize:14, marginBottom:20 },
  card:        { borderRadius:12, borderWidth:1.5, overflow:'hidden', marginBottom:16 },
  cardHeader:  { flexDirection:'row', alignItems:'center', justifyContent:'space-between', padding:14, borderBottomWidth:1 },
  cardLabel:   { fontFamily: 'SpaceGrotesk_700Bold', fontSize:11, fontWeight:'700', textTransform:'uppercase', letterSpacing:1.5 },
  editBtn:     { borderRadius:6, borderWidth:1.5, paddingHorizontal:12, paddingVertical:4 },
  profileGrid: {},
  banner:      { borderRadius:8, borderWidth:1.5, padding:10, marginBottom:14 },
  fieldLabel:  { fontFamily: 'SpaceGrotesk_700Bold', fontSize:11, fontWeight:'700', textTransform:'uppercase', letterSpacing:0.8, marginBottom:6 },
  input:       { fontFamily: 'SpaceGrotesk_400Regular', borderRadius:8, borderWidth:1.5, paddingHorizontal:12, paddingVertical:10, fontSize:14, minHeight:44 },
  genderPill:  { borderRadius:4, borderWidth:1.5, paddingHorizontal:10, paddingVertical:5 },
  saveBtn:     { flex:1, borderRadius:8, padding:13, alignItems:'center' },
  cancelBtn:   { borderRadius:8, borderWidth:1.5, paddingHorizontal:16, alignItems:'center', justifyContent:'center' },
  savedBanner: { padding:10, borderTopWidth:1 },
  actionBtn:   { borderRadius:12, borderWidth:1.5, padding:14, marginBottom:10 },
});
