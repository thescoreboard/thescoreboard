/**
 * Profile / Dashboard tab — mode-aware:
 *   player mode    → full player dashboard (stats, history, profile edit)
 *   organiser mode → account settings + profile edit
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  ActivityIndicator, Alert, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTheme } from '../../src/hooks/useTheme';
import { useAuthStore } from '../../src/store/auth';
import {
  apiGetMe, apiGetPlayerProfile, apiSavePlayerProfile,
  apiGetMyStats, apiGetMyTournaments,
} from '../../src/api/client';
import { F, STATUS_COLORS, STATUS_LABELS, SPORT_COLORS, SPORT_LABELS } from '../../src/theme';

const GENDERS = ['Male', 'Female', 'Other'];

// ── Helpers ───────────────────────────────────────────────────────────────────

function initials(name: string): string {
  return name.split(' ').slice(0, 2).map(n => n[0]?.toUpperCase() ?? '').join('');
}

function sportIcon(key: string): string {
  const icons: Record<string, string> = {
    table_tennis: '🏓', badminton: '🏸', football: '⚽', cricket: '🏏',
  };
  return icons[key] ?? '🏅';
}

// ── Mode Switcher bar ─────────────────────────────────────────────────────────

function ModeSwitcher({ mode, hasOrganiser }: { mode: string; hasOrganiser: boolean }) {
  const { theme } = useTheme();
  const c = theme.colors;
  const { setMode } = useAuthStore();

  const isPlayer = mode === 'player';

  return (
    <View style={{ flexDirection:'row', alignItems:'center', justifyContent:'space-between',
      paddingHorizontal:16, paddingVertical:10, backgroundColor:c.surface,
      borderBottomWidth:1.5, borderBottomColor:c.border }}>
      {/* Current mode pill */}
      <View style={{ flexDirection:'row', alignItems:'center', gap:8 }}>
        <View style={{ paddingHorizontal:10, paddingVertical:4, borderRadius:20,
          backgroundColor: isPlayer ? c.primary+'18' : '#7c3aed18',
          borderWidth:1.5, borderColor: isPlayer ? c.primary+'44' : '#7c3aed44' }}>
          <Text style={{ fontFamily:F.bold, fontSize:10, letterSpacing:0.8, textTransform:'uppercase',
            color: isPlayer ? c.primary : '#7c3aed' }}>
            {isPlayer ? '🏅 Player Mode' : '⚙️ Organiser Mode'}
          </Text>
        </View>
      </View>

      {/* Switch button */}
      {(hasOrganiser || !isPlayer) && (
        <TouchableOpacity
          onPress={() => setMode(isPlayer ? 'organiser' : 'player')}
          style={{ flexDirection:'row', alignItems:'center', gap:4,
            borderWidth:1.5, borderColor:c.border, borderRadius:8,
            paddingHorizontal:12, paddingVertical:6 }}>
          <Text style={{ fontFamily:F.bold, fontSize:11, color:c.muted }}>
            {isPlayer ? 'Organiser →' : '← Player'}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ── Profile Edit form (shared) ────────────────────────────────────────────────

function ProfileEditCard({
  profile, onSaved,
}: { profile: any; onSaved: (p: any) => void }) {
  const { theme } = useTheme();
  const c = theme.colors;
  const { token } = useAuthStore();
  const [editing, setEditing] = useState(!profile);
  const [form, setForm] = useState({
    name: profile?.name ?? '',
    phone: profile?.phone ?? '',
    age: profile?.age != null ? String(profile.age) : '',
    gender: profile?.gender ?? 'Male',
    location: profile?.location ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState(false);

  const handleSave = async () => {
    if (!form.name.trim()) { Alert.alert('Name is required'); return; }
    setSaving(true);
    try {
      const p = await apiSavePlayerProfile(token!, {
        name: form.name.trim(),
        phone: form.phone.trim() || null,
        age: parseInt(form.age) || null,
        gender: form.gender,
        location: form.location.trim() || null,
      });
      onSaved(p); setEditing(false); setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e: any) { Alert.alert('Error', e.message); }
    setSaving(false);
  };

  return (
    <View style={{ backgroundColor:c.surface, borderRadius:12, borderWidth:1.5,
      borderColor:c.border, overflow:'hidden', marginBottom:16 }}>
      <View style={{ flexDirection:'row', alignItems:'center', justifyContent:'space-between',
        padding:14, borderBottomWidth:1, borderBottomColor:c.border }}>
        <Text style={{ fontFamily:F.bold, fontSize:11, color:c.muted, textTransform:'uppercase', letterSpacing:1.2 }}>
          Player Profile
        </Text>
        {!editing && profile && (
          <TouchableOpacity onPress={() => setEditing(true)}
            style={{ borderRadius:6, borderWidth:1.5, borderColor:c.border, paddingHorizontal:12, paddingVertical:4 }}>
            <Text style={{ fontSize:12, color:c.muted, fontWeight:'600' }}>Edit</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={{ padding:16 }}>
        {!editing && profile && (
          <View>
            {[['Name', profile.name], ['Phone', profile.phone], ['Age', profile.age ? `${profile.age} yrs` : null], ['Gender', profile.gender], ['Location', profile.location]].map(([label, val]) =>
              val ? (
                <View key={label as string} style={{ marginBottom:10 }}>
                  <Text style={{ fontFamily:F.bold, fontSize:10, color:c.muted, textTransform:'uppercase', letterSpacing:0.5 }}>{label}</Text>
                  <Text style={{ fontFamily:F.body, fontSize:14, color:c.ink, marginTop:2 }}>{val}</Text>
                </View>
              ) : null
            )}
          </View>
        )}

        {editing && (
          <View>
            {!profile && (
              <View style={{ backgroundColor:c.primary+'10', borderRadius:8, borderWidth:1.5,
                borderColor:c.primary+'33', padding:10, marginBottom:14 }}>
                <Text style={{ fontFamily:F.body, fontSize:12, color:c.muted }}>
                  Set up your player profile to register for tournaments.
                </Text>
              </View>
            )}
            {[
              { label:'Full Name *', key:'name', placeholder:'Rahul Sharma' },
              { label:'Phone', key:'phone', placeholder:'9876543210' },
              { label:'City / Location', key:'location', placeholder:'e.g. Chennai' },
            ].map(f => (
              <View key={f.key} style={{ marginBottom:12 }}>
                <Text style={{ fontFamily:F.bold, fontSize:11, color:c.muted, textTransform:'uppercase', letterSpacing:0.8, marginBottom:6 }}>{f.label}</Text>
                <TextInput
                  style={{ fontFamily:F.body, borderRadius:8, borderWidth:1.5, borderColor:c.border,
                    paddingHorizontal:12, paddingVertical:10, fontSize:14, minHeight:44,
                    backgroundColor:c.elevated, color:c.ink }}
                  placeholder={f.placeholder} placeholderTextColor={c.muted}
                  value={(form as any)[f.key]}
                  onChangeText={v => setForm(p => ({ ...p, [f.key]: v }))}
                />
              </View>
            ))}

            <View style={{ flexDirection:'row', gap:12, marginBottom:12 }}>
              <View style={{ flex:1 }}>
                <Text style={{ fontFamily:F.bold, fontSize:11, color:c.muted, textTransform:'uppercase', letterSpacing:0.8, marginBottom:6 }}>Age</Text>
                <TextInput
                  style={{ fontFamily:F.body, borderRadius:8, borderWidth:1.5, borderColor:c.border,
                    paddingHorizontal:12, paddingVertical:10, fontSize:14, minHeight:44,
                    backgroundColor:c.elevated, color:c.ink }}
                  placeholder="24" keyboardType="numeric"
                  value={form.age} onChangeText={v => setForm(p => ({ ...p, age: v }))}
                  placeholderTextColor={c.muted}
                />
              </View>
              <View style={{ flex:1 }}>
                <Text style={{ fontFamily:F.bold, fontSize:11, color:c.muted, textTransform:'uppercase', letterSpacing:0.8, marginBottom:6 }}>Gender</Text>
                <View style={{ flexDirection:'row', gap:6, marginTop:4 }}>
                  {GENDERS.map(g => (
                    <TouchableOpacity key={g} onPress={() => setForm(p => ({ ...p, gender: g }))}
                      style={{ borderRadius:4, borderWidth:1.5, paddingHorizontal:8, paddingVertical:5,
                        backgroundColor: form.gender===g ? c.ink : c.elevated,
                        borderColor: c.border }}>
                      <Text style={{ fontSize:11, color: form.gender===g ? c.bg : c.muted, fontWeight:'600' }}>{g}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </View>

            <View style={{ flexDirection:'row', gap:10, marginTop:8 }}>
              <TouchableOpacity onPress={handleSave} disabled={saving}
                style={{ flex:1, borderRadius:8, padding:13, alignItems:'center',
                  backgroundColor:c.primary, opacity:saving?0.6:1 }}>
                <Text style={{ fontFamily:F.display, color:'#fff', fontSize:11, letterSpacing:0.5, textTransform:'uppercase' }}>
                  {saving ? 'Saving…' : 'Save Profile'}
                </Text>
              </TouchableOpacity>
              {profile && (
                <TouchableOpacity onPress={() => setEditing(false)}
                  style={{ borderRadius:8, borderWidth:1.5, paddingHorizontal:16,
                    alignItems:'center', justifyContent:'center',
                    borderColor:c.border, backgroundColor:c.elevated }}>
                  <Text style={{ color:c.muted, fontWeight:'600' }}>Cancel</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}
      </View>
      {saved && (
        <View style={{ padding:10, borderTopWidth:1, borderTopColor:'#16a34a33', backgroundColor:'#16a34a15' }}>
          <Text style={{ color:'#16a34a', fontWeight:'700', fontSize:12 }}>✓ Profile saved</Text>
        </View>
      )}
    </View>
  );
}

// ── Player Dashboard (player mode) ────────────────────────────────────────────

function PlayerDashboard() {
  const { theme } = useTheme();
  const c = theme.colors;
  const router = useRouter();
  const { token, isLoggedIn, user: storeUser, hasRole, mode } = useAuthStore();

  const [user,        setUser]        = useState<any>(storeUser);
  const [profile,     setProfile]     = useState<any>(null);
  const [stats,       setStats]       = useState<any>(null);
  const [tournaments, setTournaments] = useState<any[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [refreshing,  setRefreshing]  = useState(false);

  const load = useCallback(async () => {
    if (!isLoggedIn() || !token) { setLoading(false); return; }
    try {
      const [u, p, st, tv] = await Promise.all([
        apiGetMe(token),
        apiGetPlayerProfile(token).catch(() => null),
        apiGetMyStats(token).catch(() => null),
        apiGetMyTournaments(token).catch(() => []),
      ]);
      setUser(u);
      setProfile(p);
      setStats(st);
      setTournaments(Array.isArray(tv) ? tv : []);
    } catch {}
    setLoading(false);
    setRefreshing(false);
  }, [token]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <SafeAreaView style={{ flex:1, backgroundColor:c.bg }}>
        <ModeSwitcher mode={mode} hasOrganiser={hasRole('organiser')} />
        <ActivityIndicator style={{ flex:1 }} color={c.primary} />
      </SafeAreaView>
    );
  }

  const displayName = user?.name ?? profile?.name ?? 'Player';
  const memberSince = user?.created_at
    ? new Date(user.created_at).getFullYear()
    : null;

  // Sport pills from tournaments participated in
  const sportKeys = Array.from(new Set(tournaments.map((t: any) => t.sport_key).filter(Boolean)));

  // Stats defaults
  const st = stats ?? { tournaments_count: 0, matches_played: 0, wins: 0, losses: 0, win_pct: 0, by_sport: {} };
  const bySport: Record<string, any> = st.by_sport ?? {};

  return (
    <SafeAreaView style={{ flex:1, backgroundColor:c.bg }}>
      <ModeSwitcher mode={mode} hasOrganiser={hasRole('organiser')} />

      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={c.primary} />}
      >
        {/* ── Hero ── */}
        <View style={{ padding:20, alignItems:'center', borderBottomWidth:1, borderBottomColor:c.border }}>
          {/* Avatar */}
          <View style={{ width:72, height:72, borderRadius:36, backgroundColor:c.primary,
            alignItems:'center', justifyContent:'center', marginBottom:12,
            borderWidth:3, borderColor:c.primary+'44' }}>
            <Text style={{ fontFamily:F.display, fontSize:24, color:'#fff' }}>
              {initials(displayName)}
            </Text>
          </View>

          <Text style={{ fontFamily:F.display, fontSize:18, color:c.ink, letterSpacing:-0.5, marginBottom:2 }}>
            {displayName}
          </Text>
          {profile?.location && (
            <Text style={{ fontFamily:F.body, fontSize:13, color:c.muted, marginBottom:8 }}>
              📍 {profile.location}
            </Text>
          )}

          {/* Sport pills */}
          {sportKeys.length > 0 && (
            <View style={{ flexDirection:'row', flexWrap:'wrap', gap:6, justifyContent:'center', marginBottom:8 }}>
              {sportKeys.map(sk => {
                const col = SPORT_COLORS[sk] ?? '#888';
                return (
                  <View key={sk} style={{ backgroundColor:col+'18', borderRadius:20, paddingHorizontal:10, paddingVertical:4, borderWidth:1, borderColor:col+'44' }}>
                    <Text style={{ fontFamily:F.bold, fontSize:11, color:col }}>{sportIcon(sk)} {SPORT_LABELS[sk] ?? sk}</Text>
                  </View>
                );
              })}
            </View>
          )}

          {memberSince && (
            <Text style={{ fontFamily:F.body, fontSize:12, color:c.muted }}>Member since {memberSince}</Text>
          )}
        </View>

        {/* ── Stats strip ── */}
        <View style={{ flexDirection:'row', padding:12, gap:8 }}>
          {[
            { label:'Tournaments', val: st.tournaments_count, color: c.ink },
            { label:'Matches', val: st.matches_played, color: c.primary },
            { label:'Wins', val: st.wins, color: '#22c55e' },
            { label:'Win %', val: `${st.win_pct}%`, color: '#f59e0b' },
          ].map(({ label, val, color }) => (
            <View key={label} style={{ flex:1, backgroundColor:c.surface, borderRadius:10,
              borderWidth:1.5, borderColor:c.border, padding:10, alignItems:'center' }}>
              <Text style={{ fontFamily:F.display, fontSize:18, color, letterSpacing:-0.5 }}>{val}</Text>
              <Text style={{ fontFamily:F.bold, fontSize:9, color:c.muted, textTransform:'uppercase', letterSpacing:0.5, marginTop:2, textAlign:'center' }}>{label}</Text>
            </View>
          ))}
        </View>

        {/* ── Sport breakdown ── */}
        {Object.keys(bySport).length > 0 && (
          <View style={{ marginBottom:8 }}>
            <Text style={{ fontFamily:F.bold, fontSize:11, color:c.muted, textTransform:'uppercase',
              letterSpacing:1, marginHorizontal:16, marginBottom:10, marginTop:4 }}>
              By Sport
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal:16, gap:10 }}>
              {Object.entries(bySport).map(([sk, data]: [string, any]) => {
                const col = SPORT_COLORS[sk] ?? '#888';
                return (
                  <View key={sk} style={{ backgroundColor:c.surface, borderRadius:12,
                    borderWidth:1.5, borderColor:c.border, borderTopWidth:3, borderTopColor:col,
                    padding:14, width:160 }}>
                    <Text style={{ fontSize:20, marginBottom:6 }}>{sportIcon(sk)}</Text>
                    <Text style={{ fontFamily:F.bold, fontSize:12, color:col, marginBottom:8 }}>
                      {SPORT_LABELS[sk] ?? sk}
                    </Text>
                    <View style={{ gap:4 }}>
                      {[
                        ['Matches', data.matches],
                        ['Wins',    data.wins],
                        ['Win %',   `${data.win_pct}%`],
                      ].map(([l, v]) => (
                        <View key={l as string} style={{ flexDirection:'row', justifyContent:'space-between' }}>
                          <Text style={{ fontFamily:F.body, fontSize:12, color:c.muted }}>{l}</Text>
                          <Text style={{ fontFamily:F.bold, fontSize:12, color:c.ink }}>{v}</Text>
                        </View>
                      ))}
                      {data.best_finish && (
                        <View style={{ marginTop:6, backgroundColor:col+'15', borderRadius:6,
                          paddingHorizontal:8, paddingVertical:4, borderWidth:1, borderColor:col+'33' }}>
                          <Text style={{ fontFamily:F.bold, fontSize:11, color:col }}>🏅 {data.best_finish}</Text>
                        </View>
                      )}
                    </View>
                  </View>
                );
              })}
            </ScrollView>
          </View>
        )}

        {/* ── Recent tournaments ── */}
        <View style={{ paddingHorizontal:16, marginTop:8 }}>
          <View style={{ flexDirection:'row', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
            <Text style={{ fontFamily:F.bold, fontSize:11, color:c.muted, textTransform:'uppercase', letterSpacing:1 }}>
              My Tournaments
            </Text>
            {tournaments.length > 0 && (
              <TouchableOpacity onPress={() => {/* Tab 3 - Matches */}}>
                <Text style={{ fontFamily:F.bold, fontSize:12, color:c.primary }}>See all</Text>
              </TouchableOpacity>
            )}
          </View>

          {tournaments.length === 0 ? (
            <View style={{ backgroundColor:c.surface, borderRadius:12, borderWidth:1.5,
              borderColor:c.border, padding:24, alignItems:'center', marginBottom:16 }}>
              <Text style={{ fontSize:32, marginBottom:8 }}>🏆</Text>
              <Text style={{ fontFamily:F.body, fontSize:14, color:c.muted, textAlign:'center' }}>
                No tournaments yet. Register for one to get started!
              </Text>
              <TouchableOpacity onPress={() => router.push('/explore')}
                style={{ marginTop:12, backgroundColor:c.primary, borderRadius:8,
                  paddingVertical:10, paddingHorizontal:20 }}>
                <Text style={{ fontFamily:F.display, color:'#fff', fontSize:11, letterSpacing:0.5, textTransform:'uppercase' }}>
                  Explore
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            tournaments.slice(0, 5).map((t: any) => {
              const scol = SPORT_COLORS[t.sport_key] ?? '#888';
              const stcol = STATUS_COLORS[t.status] ?? '#888';
              return (
                <TouchableOpacity key={t.tournament_id}
                  onPress={() => router.push(`/t/${t.slug}`)}
                  style={{ backgroundColor:c.surface, borderRadius:10, borderWidth:1.5,
                    borderColor:c.border, borderLeftWidth:3, borderLeftColor:scol,
                    padding:12, marginBottom:8, flexDirection:'row', alignItems:'center', gap:12 }}
                  activeOpacity={0.8}>
                  <Text style={{ fontSize:20 }}>{sportIcon(t.sport_key)}</Text>
                  <View style={{ flex:1 }}>
                    <Text style={{ fontFamily:F.bold, fontSize:13, color:c.ink }} numberOfLines={1}>{t.name}</Text>
                    <Text style={{ fontFamily:F.body, fontSize:11, color:c.muted }}>{t.event_name}{t.city ? ` · ${t.city}` : ''}</Text>
                    {t.stage_reached && (
                      <Text style={{ fontFamily:F.bold, fontSize:11, color:c.primary, marginTop:2 }}>🏅 {t.stage_reached}</Text>
                    )}
                  </View>
                  <View style={{ backgroundColor:stcol+'18', borderRadius:4, paddingHorizontal:8, paddingVertical:4, borderWidth:1, borderColor:stcol+'33' }}>
                    <Text style={{ fontFamily:F.bold, fontSize:10, color:stcol, letterSpacing:0.6 }}>
                      {(STATUS_LABELS[t.status] ?? t.status ?? '').toUpperCase()}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </View>

        {/* ── Profile edit ── */}
        <View style={{ paddingHorizontal:16 }}>
          <ProfileEditCard
            profile={profile}
            onSaved={(p) => setProfile(p)}
          />
        </View>

        {/* ── Account ── */}
        <View style={{ paddingHorizontal:16, marginBottom:8 }}>
          <View style={{ backgroundColor:c.surface, borderRadius:12, borderWidth:1.5,
            borderColor:c.border, overflow:'hidden', marginBottom:16 }}>
            <View style={{ padding:14, borderBottomWidth:1, borderBottomColor:c.border }}>
              <Text style={{ fontFamily:F.bold, fontSize:11, color:c.muted, textTransform:'uppercase', letterSpacing:1.2 }}>Account</Text>
            </View>
            <View style={{ padding:16 }}>
              <Text style={{ fontFamily:F.bold, fontSize:10, color:c.muted, textTransform:'uppercase', letterSpacing:0.5 }}>Email</Text>
              <Text style={{ fontFamily:F.body, fontSize:13, color:c.ink, fontWeight:'600', marginTop:2 }}>{user?.email}</Text>
            </View>
          </View>
        </View>

        {/* ── Sign out ── */}
        <View style={{ paddingHorizontal:16, paddingBottom:32 }}>
          <SignOutButton />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Organiser Profile (organiser mode) ────────────────────────────────────────

function OrganiserProfile() {
  const { theme } = useTheme();
  const c = theme.colors;
  const router = useRouter();
  const { token, isLoggedIn, mode, hasRole, user: storeUser } = useAuthStore();

  const [user,    setUser]    = useState<any>(storeUser);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isLoggedIn() || !token) { setLoading(false); return; }
    (async () => {
      try {
        const [u, p] = await Promise.all([
          apiGetMe(token),
          apiGetPlayerProfile(token).catch(() => null),
        ]);
        setUser(u); setProfile(p);
      } catch {}
      setLoading(false);
    })();
  }, [token]);

  if (loading) {
    return (
      <SafeAreaView style={{ flex:1, backgroundColor:c.bg }}>
        <ModeSwitcher mode={mode} hasOrganiser={hasRole('organiser')} />
        <ActivityIndicator style={{ flex:1 }} color={c.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex:1, backgroundColor:c.bg }}>
      <ModeSwitcher mode={mode} hasOrganiser={hasRole('organiser')} />

      <ScrollView contentContainerStyle={{ padding:16 }}>
        {/* Header */}
        <Text style={{ fontFamily:F.display, fontSize:16, color:c.ink, letterSpacing:-0.5, marginBottom:4 }}>
          Account Settings
        </Text>
        <Text style={{ fontFamily:F.body, fontSize:13, color:c.muted, marginBottom:20 }}>
          {user?.email}
        </Text>

        {/* Profile edit */}
        <ProfileEditCard profile={profile} onSaved={(p) => setProfile(p)} />

        {/* Account card */}
        <View style={{ backgroundColor:c.surface, borderRadius:12, borderWidth:1.5,
          borderColor:c.border, overflow:'hidden', marginBottom:16 }}>
          <View style={{ padding:14, borderBottomWidth:1, borderBottomColor:c.border }}>
            <Text style={{ fontFamily:F.bold, fontSize:11, color:c.muted, textTransform:'uppercase', letterSpacing:1.2 }}>Account</Text>
          </View>
          <View style={{ padding:16 }}>
            <Text style={{ fontFamily:F.bold, fontSize:10, color:c.muted, textTransform:'uppercase', letterSpacing:0.5 }}>Email</Text>
            <Text style={{ fontFamily:F.body, fontSize:13, color:c.ink, fontWeight:'600', marginTop:2 }}>{user?.email}</Text>
          </View>
        </View>

        <SignOutButton />
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Sign out button (shared) ──────────────────────────────────────────────────

function SignOutButton() {
  const { theme } = useTheme();
  const c = theme.colors;
  const { clearToken } = useAuthStore();

  return (
    <TouchableOpacity onPress={() => clearToken()}
      style={{ backgroundColor:c.surface, borderRadius:12, borderWidth:1.5,
        borderColor:'#e53e3e33', padding:16, alignItems:'center' }}>
      <Text style={{ fontFamily:F.bold, fontSize:14, color:'#e53e3e' }}>Sign Out</Text>
    </TouchableOpacity>
  );
}

// ── Login prompt (not logged in) ─────────────────────────────────────────────

function LoginPrompt() {
  const { theme } = useTheme();
  const c = theme.colors;
  const router = useRouter();
  const { mode, hasRole } = useAuthStore();

  return (
    <SafeAreaView style={{ flex:1, backgroundColor:c.bg }}>
      <ModeSwitcher mode={mode} hasOrganiser={false} />
      <View style={{ flex:1, alignItems:'center', justifyContent:'center', gap:16, padding:32 }}>
        <Text style={{ fontFamily:F.display, fontSize:36 }}>🏅</Text>
        <Text style={{ fontFamily:F.display, fontSize:18, color:c.ink, textAlign:'center', letterSpacing:-0.5 }}>
          Your Player Dashboard
        </Text>
        <Text style={{ fontFamily:F.body, color:c.muted, textAlign:'center', lineHeight:20, fontSize:14 }}>
          Sign in to track your stats, match history, and tournament achievements.
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
  const { isLoggedIn, mode } = useAuthStore();

  if (!isLoggedIn()) return <LoginPrompt />;
  if (mode === 'player') return <PlayerDashboard />;
  return <OrganiserProfile />;
}
