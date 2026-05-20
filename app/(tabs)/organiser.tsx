/**
 * Organiser tab — entry point. Shows org dashboard or login prompt.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Alert, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTheme } from '../../src/hooks/useTheme';
import { useAuthStore } from '../../src/store/auth';
import { apiGetDashboard, apiCreateOrg } from '../../src/api/client';
import { F, STATUS_COLORS, STATUS_LABELS, SPORT_COLORS, SPORT_LABELS } from '../../src/theme';

const STATUS_ORDER = ['live','registration','fixtures','draft','completed'];
const SPORTS       = ['football','cricket','table_tennis','badminton'];
// Short labels for status filter chips
const STATUS_SHORT: Record<string,string> = {
  live: 'Live', registration: 'Open', fixtures: 'Fixtures', draft: 'Draft', completed: 'Done',
};

export default function OrganiserTab() {
  const { theme } = useTheme();
  const router = useRouter();
  const { token, isLoggedIn } = useAuthStore();
  const c = theme.colors;

  const [data,         setData]         = useState<any>(null);
  const [loading,      setLoading]      = useState(true);
  const [refreshing,   setRefreshing]   = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [sportFilter,  setSportFilter]  = useState('');
  const [autoMsg,      setAutoMsg]      = useState('');

  const load = useCallback(async () => {
    if (!isLoggedIn()) { setLoading(false); return; }
    try {
      const d = await apiGetDashboard(token!);

      // First-time organiser: silently create a personal org so they land
      // straight on the dashboard with no modal or blocker.
      if ((d.orgs ?? []).length === 0 && d.user) {
        try {
          const autoName = d.user.name ? `${d.user.name}'s Club` : 'My Club';
          const org = await apiCreateOrg(token!, { name: autoName, city: '', state: '' });
          d.orgs = [{ ...org, tournaments: [] }];
          setAutoMsg(`We created "${org.name}" for you — rename it anytime.`);
          setTimeout(() => setAutoMsg(''), 4000);
        } catch {
          // Auto-create failed silently — user can still tap + New which
          // has its own org-creation fallback inside create.tsx.
        }
      }

      setData(d);
    } catch {}
    setLoading(false); setRefreshing(false);
  }, [token]);

  useEffect(() => { load(); }, [load]);

  if (!isLoggedIn()) {
    return (
      <SafeAreaView style={[{ flex:1, backgroundColor:c.bg }]}>
        <View style={{ flex:1, alignItems:'center', justifyContent:'center', gap:16, padding:32 }}>
          <Text style={{ fontFamily: F.display, fontSize:18, color:c.ink, textAlign:'center', letterSpacing:-0.5 }}>
            Organise Tournaments
          </Text>
          <Text style={{ fontFamily: F.body, color:c.muted, textAlign:'center', lineHeight:20, fontSize:14 }}>
            Sign in to create and manage tournaments.
          </Text>
          <TouchableOpacity onPress={() => router.push('/(auth)/login')}
            style={{ backgroundColor:c.primary, borderRadius:8, paddingVertical:14, paddingHorizontal:32, minHeight:48, alignItems:'center', justifyContent:'center' }}>
            <Text style={{ fontFamily: F.display, color:'#fff', fontSize:12, letterSpacing:0.5, textTransform:'uppercase' }}>Login</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (loading) return <SafeAreaView style={{ flex:1, backgroundColor:c.bg }}><ActivityIndicator style={{ flex:1 }} color={c.primary} /></SafeAreaView>;

  // ── Super-admin: no tournament management on mobile ──────────────────────
  if (data?.user?.is_superadmin) {
    return (
      <SafeAreaView style={{ flex:1, backgroundColor:c.bg }}>
        {/* Admin header */}
        <View style={{ flexDirection:'row', alignItems:'center', justifyContent:'space-between', paddingHorizontal:16, height:56, borderBottomWidth:1.5, borderBottomColor:c.border }}>
          <Text style={{ fontFamily: F.display, fontSize:14, color:c.ink, letterSpacing:-0.3 }}>TheScoreBoard</Text>
          <View style={{ paddingHorizontal:10, paddingVertical:4, borderRadius:20, backgroundColor:'rgba(124,58,237,.1)', borderWidth:1, borderColor:'rgba(124,58,237,.3)' }}>
            <Text style={{ fontFamily: F.bold, fontSize:9, letterSpacing:1.2, textTransform:'uppercase', color:'#7c3aed' }}>Super Admin</Text>
          </View>
        </View>

        {/* Admin info screen */}
        <View style={{ flex:1, alignItems:'center', justifyContent:'center', padding:32, gap:16 }}>
          {/* Shield icon */}
          <View style={{ width:72, height:72, borderRadius:36, backgroundColor:'rgba(124,58,237,.1)', alignItems:'center', justifyContent:'center', borderWidth:1.5, borderColor:'rgba(124,58,237,.25)' }}>
            <Text style={{ fontSize:32 }}>🛡️</Text>
          </View>

          <Text style={{ fontFamily: F.display, fontSize:16, color:c.ink, textAlign:'center', letterSpacing:-0.5 }}>
            Admin Panel
          </Text>
          <Text style={{ fontFamily: F.body, fontSize:14, color:c.muted, textAlign:'center', lineHeight:20 }}>
            The admin dashboard is available on the web app. Visit the link below on a desktop browser to manage users and view platform analytics.
          </Text>
          <View style={{ backgroundColor:c.surface, borderRadius:10, borderWidth:1.5, borderColor:'rgba(124,58,237,.2)', padding:14, width:'100%' }}>
            <Text style={{ fontFamily: F.bold, fontSize:11, color:c.muted, textTransform:'uppercase', letterSpacing:1, marginBottom:4 }}>Web Admin Panel</Text>
            <Text style={{ fontFamily: F.body, fontSize:14, color:'#7c3aed', fontWeight:'600' }}>thescoreboard.in/admin</Text>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  const orgs: any[] = data?.orgs ?? [];
  const allTournaments = orgs.flatMap((o: any) =>
    (o.tournaments ?? []).map((t: any) => ({ ...t, org_name: o.name, org_id: o.org_id }))
  );
  const filtered = allTournaments.filter(t => {
    const matchStatus = !statusFilter || t.status === statusFilter;
    const matchSport  = !sportFilter  || (t.events ?? []).some((ev: any) => ev.sport_key === sportFilter);
    return matchStatus && matchSport;
  });

  const stats = {
    total:        allTournaments.length,
    live:         allTournaments.filter(t => t.status === 'live').length,
    registration: allTournaments.filter(t => t.status === 'registration').length,
    completed:    allTournaments.filter(t => t.status === 'completed').length,
  };

  return (
    <SafeAreaView style={{ flex:1, backgroundColor:c.bg }}>
      {/* Header */}
      <View style={{ flexDirection:'row', alignItems:'center', justifyContent:'space-between', paddingHorizontal:16, height:56, borderBottomWidth:1.5, borderBottomColor:c.border }}>
        <View style={{ flexDirection:'row', alignItems:'center', gap:8 }}>
          <Text style={{ fontFamily: F.display, fontSize:14, color:c.ink, letterSpacing:-0.3 }}>My Tournaments</Text>
          {/* Plan badge — only shown for Pro users */}
          {data?.user?.plan === 'pro' && (
            <View style={{
              paddingHorizontal:8, paddingVertical:3, borderRadius:20,
              backgroundColor: '#f59e0b22',
              borderWidth:1, borderColor: '#f59e0b55',
            }}>
              <Text style={{
                fontFamily: F.bold, fontSize:9, letterSpacing:0.8, textTransform:'uppercase',
                color: '#d97706',
              }}>
                Pro
              </Text>
            </View>
          )}
        </View>
        <TouchableOpacity onPress={() => router.push('/organiser/create')}
          style={{ backgroundColor:c.primary, borderRadius:8, paddingHorizontal:14, paddingVertical:8, minHeight:36, alignItems:'center', justifyContent:'center' }}>
          <Text style={{ fontFamily: F.display, color:'#fff', fontSize:10, letterSpacing:0.5, textTransform:'uppercase' }}>+ New</Text>
        </TouchableOpacity>
      </View>

      {/* Auto-org welcome banner — shown briefly on first login */}
      {!!autoMsg && (
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => setAutoMsg('')}
          style={{ backgroundColor:'#16a34a18', borderBottomWidth:1, borderBottomColor:'#16a34a33', paddingVertical:10, paddingHorizontal:16, flexDirection:'row', alignItems:'center', gap:8 }}>
          <Text style={{ fontSize:14 }}>✓</Text>
          <Text style={{ fontFamily: F.body, fontSize:13, color:'#16a34a', flex:1, lineHeight:18 }}>{autoMsg}</Text>
          <Text style={{ fontSize:16, color:'#16a34a', opacity:0.5 }}>×</Text>
        </TouchableOpacity>
      )}

      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={c.primary} />}
      >
        {/* Stats */}
        <View style={{ flexDirection:'row', padding:12, gap:8 }}>
          {[['Total', stats.total, c.muted],['Live', stats.live, c.primary],['Open', stats.registration, '#22c55e'],['Done', stats.completed, c.muted]].map(([l,v,cl]) => (
            <View key={l as string} style={{ flex:1, backgroundColor:c.surface, borderRadius:8, borderWidth:1.5, borderColor:c.border, padding:10, alignItems:'center' }}>
              <Text style={{ fontFamily: F.display, fontSize:18, color:cl as string }}>{v as number}</Text>
              <Text style={{ fontFamily: F.bold, fontSize:9, color:c.muted, textTransform:'uppercase', letterSpacing:0.5, marginTop:2 }}>{l as string}</Text>
            </View>
          ))}
        </View>

        {/* ── Filters ── */}
        <View style={{ borderTopWidth: 1, borderTopColor: c.border,
          backgroundColor: c.surface, paddingBottom: 8 }}>

          {/* Sport row */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 16, gap: 6, alignItems: 'center', paddingVertical: 8 }}>

            <TouchableOpacity onPress={() => setSportFilter('')}
              style={{ borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7,
                backgroundColor: sportFilter === '' ? c.ink : c.elevated,
                borderWidth: 1.5, borderColor: sportFilter === '' ? c.ink : c.border }}>
              <Text style={{ fontFamily: F.bold, fontSize: 12,
                color: sportFilter === '' ? c.bg : c.muted }}>All Sports</Text>
            </TouchableOpacity>

            {SPORTS.map(sk => {
              const active = sportFilter === sk;
              const color  = SPORT_COLORS[sk] ?? '#888';
              return (
                <TouchableOpacity key={sk}
                  onPress={() => setSportFilter(active ? '' : sk)}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 5,
                    borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7,
                    backgroundColor: active ? color : color + '12',
                    borderWidth: 1.5, borderColor: active ? color : color + '55' }}>
                  <Text style={{ fontFamily: F.bold, fontSize: 12,
                    color: active ? '#fff' : color }}>{SPORT_LABELS[sk]}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Status row */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 16, gap: 6, alignItems: 'center' }}>
            {['', ...STATUS_ORDER].map(st => (
              <TouchableOpacity key={st} onPress={() => setStatusFilter(st)}
                style={{ borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6,
                  backgroundColor: statusFilter === st ? c.primary : 'transparent',
                  borderWidth: 1.5, borderColor: statusFilter === st ? c.primary : c.border }}>
                <Text style={{ fontFamily: F.bold, fontSize: 12,
                  color: statusFilter === st ? '#fff' : c.muted }}>
                  {st ? STATUS_SHORT[st] ?? st : 'All'}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Tournament list */}
        <View style={{ padding:16 }}>
          {filtered.length === 0
            ? <Text style={{ fontFamily: F.body, color:c.muted, textAlign:'center', marginTop:24 }}>No tournaments yet. Tap + New to create one.</Text>
            : filtered.map((t: any) => (
              <TouchableOpacity key={t.tournament_id}
                onPress={() => router.push(`/organiser/tournament/${t.tournament_id}`)}
                style={{ backgroundColor:c.surface, borderRadius:12, borderWidth:1.5,
                  borderColor: t.status==='live' ? c.primary+'44' : c.border,
                  borderTopWidth:3, borderTopColor: SPORT_COLORS[t.events?.[0]?.sport_key] ?? c.primary,
                  padding:14, marginBottom:10 }}
                activeOpacity={0.8}>
                {/* Status badge */}
                <View style={{ flexDirection:'row', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
                  <View style={{ borderRadius:4, backgroundColor:(STATUS_COLORS[t.status]??'#888')+'18', paddingHorizontal:8, paddingVertical:3, borderWidth:1, borderColor:(STATUS_COLORS[t.status]??'#888')+'33' }}>
                    <Text style={{ fontFamily: F.bold, fontSize:10, letterSpacing:1, color:STATUS_COLORS[t.status]??'#888' }}>
                      {(STATUS_LABELS[t.status]??t.status).toUpperCase()}
                    </Text>
                  </View>
                  {t.live_matches > 0 && (
                    <View style={{ flexDirection:'row', alignItems:'center', gap:4 }}>
                      <View style={{ width:6,height:6,borderRadius:3,backgroundColor:c.primary }} />
                      <Text style={{ fontFamily: F.bold, fontSize:11, color:c.primary }}>{t.live_matches} live</Text>
                    </View>
                  )}
                </View>
                <Text style={{ fontFamily: F.display, fontSize:14, color:c.ink, marginBottom:4, letterSpacing:-0.3 }} numberOfLines={1}>
                  {(t.name ?? '').toUpperCase()}
                </Text>
                <Text style={{ fontFamily: F.body, fontSize:12, color:c.muted }}>{t.org_name}{t.city?` · ${t.city}`:''}</Text>
                {/* Sport badges */}
                <View style={{ flexDirection:'row', gap:6, marginTop:10 }}>
                  {(t.events??[]).slice(0,3).map((ev: any) => {
                    const color = SPORT_COLORS[ev.sport_key] ?? '#888';
                    return (
                      <View key={ev.event_id} style={{ backgroundColor: color+'18', borderRadius:6, paddingHorizontal:8, paddingVertical:4, borderWidth:1, borderColor:color+'33' }}>
                        <Text style={{ fontFamily: F.bold, fontSize:10, color, letterSpacing:0.3 }}>
                          {(SPORT_LABELS[ev.sport_key] ?? ev.sport_key ?? '').toUpperCase()}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              </TouchableOpacity>
            ))
          }
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
