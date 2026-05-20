/**
 * Home screen — mirrors Landing.jsx
 * Shows live count, sport grid, trending tournaments. Polls every 5s.
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  TextInput, RefreshControl, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTheme } from '../../src/hooks/useTheme';
import { apiGetHomepage } from '../../src/api/client';
import TournamentCard from '../../src/components/shared/TournamentCard';
import { F, SPORT_COLORS, SPORT_LABELS } from '../../src/theme';

const SPORTS = ['football', 'cricket', 'table_tennis', 'badminton'];

export default function HomeScreen() {
  const { theme, toggle } = useTheme();
  const router = useRouter();

  const [data,        setData]        = useState<any>(null);
  const [loading,     setLoading]     = useState(true);
  const [refreshing,  setRefreshing]  = useState(false);
  const [search,      setSearch]      = useState('');

  const load = useCallback(async (q?: string) => {
    try {
      const res = await apiGetHomepage(q);
      setData(res);
    } catch {}
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const id = setInterval(() => load(search || undefined), 5000);
    return () => clearInterval(id);
  }, [load, search]);

  const onSearch = (q: string) => {
    setSearch(q);
    load(q || undefined);
  };

  const c = theme.colors;

  if (loading) {
    return (
      <SafeAreaView style={[s.flex, { backgroundColor: c.bg }]}>
        <ActivityIndicator style={{ flex: 1 }} color={c.primary} />
      </SafeAreaView>
    );
  }

  const trending: any[] = data?.trending ?? [];
  const sports:   any[] = data?.sports   ?? [];
  const totalLive: number = data?.total_live_matches ?? 0;

  return (
    <SafeAreaView style={[s.flex, { backgroundColor: c.bg }]}>
      {/* Header */}
      <View style={[s.header, { borderBottomColor: c.border }]}>
        {/* Brand: "THE" + "SCORE" (primary) + "BOARD" — matches web */}
        <Text style={[s.brand, { color: c.ink }]}>
          THE<Text style={{ color: c.primary }}>SCORE</Text>BOARD
        </Text>
        <TouchableOpacity onPress={toggle} style={[s.themeBtn, { borderColor: c.border }]}>
          <Text style={[s.themeBtnText, { color: c.muted }]}>
            {theme.isDark ? 'LIGHT' : 'DARK'}
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); load(); }}
            tintColor={c.primary}
          />
        }
      >
        {/* Search */}
        <View style={[s.searchWrap, { backgroundColor: c.elevated, borderColor: c.border }]}>
          <TextInput
            style={[s.searchInput, { fontFamily: F.body, color: c.ink }]}
            placeholder="Search tournaments…"
            placeholderTextColor={c.muted}
            value={search}
            onChangeText={onSearch}
          />
        </View>

        {/* Live banner */}
        {totalLive > 0 && (
          <View style={[s.liveBanner, { backgroundColor: c.primary + '15', borderColor: c.primary + '44' }]}>
            <View style={[s.liveDot, { backgroundColor: c.primary }]} />
            <Text style={[s.liveBannerText, { fontFamily: F.bold, color: c.primary }]}>
              {totalLive} match{totalLive !== 1 ? 'es' : ''} live right now
            </Text>
          </View>
        )}

        {/* Sport grid */}
        <View style={s.sectionHeader}>
          <Text style={[s.sectionTitle, { fontFamily: F.display, color: c.ink }]}>Browse by Sport</Text>
        </View>
        <View style={s.sportGrid}>
          {SPORTS.map(sk => {
            const sportData = sports.find((sp: any) => sp.sport_key === sk);
            const liveCount = sportData?.live_count ?? 0;
            const color = SPORT_COLORS[sk] ?? '#888';
            return (
              <TouchableOpacity
                key={sk}
                onPress={() => router.push(`/explore?sport=${sk}`)}
                style={[s.sportCard, { backgroundColor: color + '15', borderColor: color + '33', borderTopColor: color }]}
                activeOpacity={0.8}
              >
                <Text style={[s.sportName, { fontFamily: F.bold, color }]}>{SPORT_LABELS[sk]}</Text>
                {liveCount > 0 && (
                  <View style={[s.sportLive, { backgroundColor: color + '22' }]}>
                    <Text style={[s.sportLiveText, { fontFamily: F.bold, color }]}>{liveCount} live</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Trending tournaments */}
        {trending.length > 0 && (
          <>
            <View style={s.sectionHeader}>
              <Text style={[s.sectionTitle, { fontFamily: F.display, color: c.ink }]}>Tournaments</Text>
            </View>
            <View style={s.listPad}>
              {trending.map((t: any) => (
                <TournamentCard
                  key={t.tournament_id}
                  tournament={t}
                  onPress={() => router.push(`/t/${t.slug}`)}
                />
              ))}
            </View>
          </>
        )}

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  flex:            { flex: 1 },
  header:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, height: 56, borderBottomWidth: 1.5 },
  brand:           { fontSize: 19, fontFamily: 'Unbounded_900Black', letterSpacing: -1 },
  themeBtn:        { borderRadius: 6, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 5 },
  themeBtnText:    { fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  searchWrap:      { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginVertical: 10, borderRadius: 8, borderWidth: 1.5, paddingHorizontal: 14, paddingVertical: 11 },
  searchInput:     { flex: 1, fontSize: 14, padding: 0 },
  liveBanner:      { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginBottom: 8, borderRadius: 8, borderWidth: 1.5, paddingHorizontal: 12, paddingVertical: 9, gap: 8 },
  liveDot:         { width: 8, height: 8, borderRadius: 4 },
  liveBannerText:  { fontSize: 13, fontWeight: '700' },
  sectionHeader:   { paddingHorizontal: 16, paddingTop: 18, paddingBottom: 10 },
  sectionTitle:    { fontSize: 14, fontWeight: '900', letterSpacing: -0.3 },
  sportGrid:       { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 12, gap: 8 },
  sportCard:       { flex: 1, minWidth: '45%', borderRadius: 12, borderWidth: 1.5, borderTopWidth: 3, padding: 16, alignItems: 'center', gap: 8 },
  sportName:       { fontSize: 12, fontWeight: '700', textAlign: 'center' },
  sportLive:       { borderRadius: 4, paddingHorizontal: 8, paddingVertical: 3 },
  sportLiveText:   { fontSize: 10, fontWeight: '700' },
  listPad:         { paddingHorizontal: 16 },
});
