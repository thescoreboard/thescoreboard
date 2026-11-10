/**
 * Profile tab — organiser account: name/email, sign out, legal links, delete account.
 * There is no player account or player dashboard.
 */
import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTheme } from '../../src/hooks/useTheme';
import { useAuthStore } from '../../src/store/auth';
import { apiGetMe, apiDeleteAccount } from '../../src/api/client';
import { F } from '../../src/theme';

// ── Helpers ───────────────────────────────────────────────────────────────────

function initials(name: string): string {
  return name.split(' ').slice(0, 2).map(n => n[0]?.toUpperCase() ?? '').join('');
}

// ── Organiser Profile ────────────────────────────────────────

function OrganiserProfile() {
  const { theme } = useTheme();
  const c = theme.colors;
  const router = useRouter();
  const { token, isLoggedIn, user: storeUser } = useAuthStore();

  const [user,    setUser]    = useState<any>(storeUser);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isLoggedIn() || !token) { setLoading(false); return; }
    (async () => {
      try {
        const u = await apiGetMe(token);
        setUser(u);
      } catch {}
      setLoading(false);
    })();
  }, [token]);

  if (loading) {
    return (
      <SafeAreaView style={{ flex:1, backgroundColor:c.bg }}>
        <ActivityIndicator style={{ flex:1 }} color={c.primary} />
      </SafeAreaView>
    );
  }

  const displayName = user?.name ?? 'Organiser';

  return (
    <SafeAreaView style={{ flex:1, backgroundColor:c.bg }}>
      <ScrollView contentContainerStyle={{ padding:16, paddingBottom:40 }}>

        {/* ── Organiser hero ── */}
        <View style={{ alignItems:'center', paddingVertical:28,
          borderBottomWidth:1.5, borderBottomColor:c.border, marginBottom:20 }}>
          {/* Avatar */}
          <View style={{ width:72, height:72, borderRadius:36,
            backgroundColor:'#7c3aed', alignItems:'center', justifyContent:'center',
            marginBottom:12, borderWidth:3, borderColor:'#7c3aed44' }}>
            <Text style={{ fontFamily:F.display, fontSize:24, color:'#fff' }}>
              {initials(displayName)}
            </Text>
          </View>
          <Text style={{ fontFamily:F.display, fontSize:18, color:c.ink, letterSpacing:-0.5, marginBottom:4 }}>
            {displayName}
          </Text>
          <Text style={{ fontFamily:F.body, fontSize:13, color:c.muted }}>
            {user?.email}
          </Text>
          {/* Organiser badge */}
          <View style={{ marginTop:10, paddingHorizontal:12, paddingVertical:5, borderRadius:20,
            backgroundColor:'#7c3aed18', borderWidth:1.5, borderColor:'#7c3aed44' }}>
            <Text style={{ fontFamily:F.bold, fontSize:10, color:'#7c3aed',
              textTransform:'uppercase', letterSpacing:0.8 }}>
              ⚙️ Tournament Organiser
            </Text>
          </View>
        </View>

        {/* ── Account details ── */}
        <View style={{ backgroundColor:c.surface, borderRadius:12, borderWidth:1.5,
          borderColor:c.border, overflow:'hidden', marginBottom:16 }}>
          <View style={{ padding:14, borderBottomWidth:1, borderBottomColor:c.border }}>
            <Text style={{ fontFamily:F.bold, fontSize:11, color:c.muted,
              textTransform:'uppercase', letterSpacing:1.2 }}>Account</Text>
          </View>
          <View style={{ padding:16, gap:14 }}>
            <View>
              <Text style={{ fontFamily:F.bold, fontSize:10, color:c.muted,
                textTransform:'uppercase', letterSpacing:0.5 }}>Name</Text>
              <Text style={{ fontFamily:F.body, fontSize:14, color:c.ink,
                fontWeight:'600', marginTop:2 }}>{displayName}</Text>
            </View>
            <View>
              <Text style={{ fontFamily:F.bold, fontSize:10, color:c.muted,
                textTransform:'uppercase', letterSpacing:0.5 }}>Email</Text>
              <Text style={{ fontFamily:F.body, fontSize:14, color:c.ink,
                fontWeight:'600', marginTop:2 }}>{user?.email}</Text>
            </View>
          </View>
        </View>

        {/* ── Sign out + legal + delete ── */}
        <SignOutButton />
        <LegalLinks />
        <DeleteAccountButton />

        <View style={{ height: 8 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Sign out button (shared) ──────────────────────────────────────────────────

function SignOutButton() {
  const { theme } = useTheme();
  const c = theme.colors;
  const { clearToken } = useAuthStore();
  const router = useRouter();

  const handleSignOut = async () => {
    await clearToken();
    router.replace('/(tabs)' as any);
  };

  return (
    <TouchableOpacity onPress={handleSignOut}
      style={{ backgroundColor:c.surface, borderRadius:12, borderWidth:1.5,
        borderColor:'#e53e3e33', padding:16, alignItems:'center' }}>
      <Text style={{ fontFamily:F.bold, fontSize:14, color:'#e53e3e' }}>Sign Out</Text>
    </TouchableOpacity>
  );
}

// ── Legal links (shared) ──────────────────────────────────────────────────────

function LegalLinks() {
  const { theme } = useTheme();
  const c = theme.colors;
  const router = useRouter();
  return (
    <View style={{ flexDirection:'row', justifyContent:'center', gap:24, marginTop:14 }}>
      <TouchableOpacity onPress={() => router.push('/terms' as any)}>
        <Text style={{ fontFamily:F.body, fontSize:12, color:c.muted, textDecorationLine:'underline' }}>Terms of Service</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => router.push('/privacy' as any)}>
        <Text style={{ fontFamily:F.body, fontSize:12, color:c.muted, textDecorationLine:'underline' }}>Privacy Policy</Text>
      </TouchableOpacity>
    </View>
  );
}

// ── Delete account button (shared) ────────────────────────────────────────────

function DeleteAccountButton() {
  const { theme } = useTheme();
  const c = theme.colors;
  const { token, clearToken } = useAuthStore();
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  const handleDelete = () => {
    // Guard: must have a token
    if (!token) {
      Alert.alert('Not signed in', 'Please sign in to delete your account.');
      return;
    }

    Alert.alert(
      'Delete Account',
      'This will permanently remove your personal data (name, email, phone, location).\n\nYour tournament history will be kept in anonymised form.\n\nThis action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete My Account',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              await apiDeleteAccount(token);
              await clearToken();
              router.replace('/(tabs)' as any);
            } catch (e: any) {
              setDeleting(false);
              Alert.alert(
                'Could not delete account',
                e.message ?? 'Something went wrong. Please try again or contact support@thescoreboard.in',
              );
            }
          },
        },
      ],
    );
  };

  return (
    <TouchableOpacity
      onPress={handleDelete}
      disabled={deleting}
      style={{ marginTop:8, borderRadius:12, borderWidth:1.5,
        borderColor:c.border, padding:14, alignItems:'center',
        opacity: deleting ? 0.5 : 1 }}>
      {deleting
        ? <ActivityIndicator size="small" color={c.muted} />
        : <Text style={{ fontFamily:F.body, fontSize:13, color:c.muted }}>Delete Account</Text>
      }
    </TouchableOpacity>
  );
}

// ── Login prompt (not logged in) ─────────────────────────────────────────────

function LoginPrompt() {
  const { theme } = useTheme();
  const c = theme.colors;
  const router = useRouter();

  return (
    <SafeAreaView style={{ flex:1, backgroundColor:c.bg }}>
      <View style={{ flex:1, alignItems:'center', justifyContent:'center', gap:16, padding:32 }}>
        <Text style={{ fontFamily:F.display, fontSize:36 }}>🏅</Text>
        <Text style={{ fontFamily:F.display, fontSize:18, color:c.ink, textAlign:'center', letterSpacing:-0.5 }}>
          Organiser Account
        </Text>
        <Text style={{ fontFamily:F.body, color:c.muted, textAlign:'center', lineHeight:20, fontSize:14 }}>
          Sign in to create and manage tournaments.
        </Text>
        <TouchableOpacity onPress={() => router.push('/(auth)/login')}
          style={{ backgroundColor:c.primary, borderRadius:8, paddingVertical:14,
            paddingHorizontal:32, minHeight:48, alignItems:'center', justifyContent:'center', width:'100%' }}>
          <Text style={{ fontFamily:F.display, color:'#fff', fontSize:12, letterSpacing:0.5, textTransform:'uppercase' }}>Sign In</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.push('/(auth)/register')}
          style={{ borderRadius:8, borderWidth:1.5, borderColor:c.border, paddingVertical:13,
            paddingHorizontal:32, alignItems:'center', width:'100%' }}>
          <Text style={{ fontFamily:F.display, color:c.ink, fontSize:12, letterSpacing:0.5, textTransform:'uppercase' }}>Create Account</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export default function ProfileTab() {
  const { isLoggedIn } = useAuthStore();

  if (!isLoggedIn()) return <LoginPrompt />;
  return <OrganiserProfile />;
}
