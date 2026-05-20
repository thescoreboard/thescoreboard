/**
 * Organiser tab — entry point. Shows org dashboard or login prompt.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Alert, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTheme } from '../../src/hooks/useTheme';
import { useAuthStore } from '../../src/store/auth';
import { apiGetDashboard } from '../../src/api/client';
import { F, STATUS_COLORS, STATUS_LABELS, SPORT_ICONS, SPORT_COLORS } from '../../src/theme';

const STATUS_ORDER = ['live','registration','fixtures','draft','completed'];

export default function OrganiserTab() {
  const { theme } = useTheme();
  const router = useRouter();
  const { token, isLoggedIn } = useAuthStore();
  const c = theme.colors;

  const [data,        setData]        = useState<any>(null);
  const [loading,     setLoading]     = useState(true);
  const [refreshing,  setRefreshing]  = useState(false);
  const [statusFilter,setStatusFilter]= useState('');

  const load = useCallback(async () => {
    if (!isLoggedIn()) { setLoading(false); return; }
    try { setData(await apiGetDashboard(token!)); }
    catch {}
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

  const orgs: any[] = data?.orgs ?? [];
  const allTournaments = orgs.flatMap((o: any) => (o.tournaments ?? []).map((t: any) => ({ ...t, org_name: o.name, org_id: o.org_id })));
  const filtered = statusFilter ? allTournaments.filter(t => t.status === statusFilter) : allTournaments;

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
        <Text style={{ fontFamily: F.display, fontSize:14, color:c.ink, letterSpacing:-0.3 }}>My Tournaments</Text>
        <TouchableOpacity onPress={() => router.push('/organiser/create')}
          style={{ backgroundColor:c.primary, borderRadius:8, paddingHorizontal:14, paddingVertical:8, minHeight:36, alignItems:'center', justifyContent:'center' }}>
          <Text style={{ fontFamily: F.display, color:'#fff', fontSize:10, letterSpacing:0.5, textTransform:'uppercase' }}>+ New</Text>
        </TouchableOpacity>
      </View>

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

        {/* Status filters */}
        <View style={{ height: 44, justifyContent: 'center' }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal:16, gap:8, alignItems:'center' }}>
            {['', ...STATUS_ORDER].map(st => (
              <TouchableOpacity key={st} onPress={() => setStatusFilter(st)}
                style={{ borderRadius:4, borderWidth:1.5, paddingHorizontal:12, paddingVertical:5,
                  backgroundColor: statusFilter===st ? c.ink : c.elevated, borderColor: statusFilter===st ? c.ink : c.border }}>
                <Text style={{ fontFamily: F.bold, fontSize:11, letterSpacing:0.3, color: statusFilter===st ? c.bg : c.muted }}>
                  {st ? (STATUS_LABELS[st]??st).toUpperCase() : 'ALL'}
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
                      <View key={ev.event_id} style={{ backgroundColor: color+'18', borderRadius:4, paddingHorizontal:7, paddingVertical:3, borderWidth:1, borderColor:color+'33' }}>
                        <Text style={{ fontFamily: F.bold, fontSize:10, color, letterSpacing:0.5 }}>
                          {SPORT_ICONS[ev.sport_key]??ev.sport_key?.slice(0,2).toUpperCase()}
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
