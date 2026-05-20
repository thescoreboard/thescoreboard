/**
 * Explore screen — browse by sport, filter by city/status. Mirrors SportPage.jsx.
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  TextInput, ActivityIndicator, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTheme } from '../../src/hooks/useTheme';
import { apiGetSportPage } from '../../src/api/client';
import TournamentCard from '../../src/components/shared/TournamentCard';
import { F, SPORT_COLORS, SPORT_LABELS, SPORT_ICONS } from '../../src/theme';

const SPORTS = ['football', 'cricket', 'table_tennis', 'badminton'];
const STATUSES = ['live', 'registration', 'fixtures', 'completed'];
const STATUS_LABELS: Record<string, string> = { live: 'Live', registration: 'Open', fixtures: 'Fixtures', completed: 'Completed' };

export default function ExploreScreen() {
  const { theme } = useTheme();
  const router    = useRouter();
  const params    = useLocalSearchParams<{ sport?: string }>();

  const [sport,        setSport]        = useState<string>(params.sport ?? 'football');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [cityFilter,   setCityFilter]   = useState<string>('');
  const [search,       setSearch]       = useState('');
  const [data,         setData]         = useState<any>(null);
  const [loading,      setLoading]      = useState(true);
  const [refreshing,   setRefreshing]   = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await apiGetSportPage(sport, cityFilter || undefined, search || undefined);
      setData(res);
    } catch {}
    setLoading(false);
    setRefreshing(false);
  }, [sport, cityFilter, search]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const id = setInterval(load, 8000);
    return () => clearInterval(id);
  }, [load]);

  const tournaments: any[] = data?.tournaments ?? [];
  const cities: string[]   = data?.cities ?? [];

  const filtered = tournaments.filter(t =>
    (!statusFilter || t.status === statusFilter) &&
    (!cityFilter   || t.city === cityFilter)
  );

  const c = theme.colors;

  return (
    <SafeAreaView style={[{ flex: 1, backgroundColor: c.bg }]}>
      {/* Sport selector */}
      <View style={[s.sportBar, { borderBottomColor: c.border, borderBottomWidth: 1.5 }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 8, alignItems: 'center' }}>
          {SPORTS.map(sk => {
            const active = sport === sk;
            const color  = SPORT_COLORS[sk] ?? '#888';
            return (
              <TouchableOpacity
                key={sk}
                onPress={() => { setSport(sk); setLoading(true); }}
                style={[s.sportPill, { backgroundColor: active ? color : color + '15', borderColor: color + '55', borderTopWidth: active ? 2 : 0, borderTopColor: color }]}
              >
                <Text style={[s.sportAbbrev, { fontFamily: F.display, color: active ? '#fff' : color }]}>{SPORT_ICONS[sk]}</Text>
                <Text style={[s.sportPillText, { fontFamily: F.bold, color: active ? '#fff' : color }]}>{SPORT_LABELS[sk]}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Search */}
      <View style={[s.searchWrap, { backgroundColor: c.elevated, borderColor: c.border }]}>
        <TextInput
          style={[s.searchInput, { fontFamily: F.body, color: c.ink }]}
          placeholder="Search tournaments…"
          placeholderTextColor={c.muted}
          value={search}
          onChangeText={q => { setSearch(q); }}
          onSubmitEditing={load}
        />
      </View>

      {/* Status + city filters */}
      <View style={s.filterBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 8, alignItems: 'center' }}>
          {['', ...STATUSES].map(st => (
            <TouchableOpacity
              key={st}
              onPress={() => setStatusFilter(st)}
              style={[s.filterPill, {
                backgroundColor: statusFilter === st ? c.primary : c.elevated,
                borderColor:     statusFilter === st ? c.primary : c.border,
              }]}
            >
              <Text style={[s.filterPillText, { fontFamily: F.bold, color: statusFilter === st ? '#fff' : c.muted }]}>
                {st ? STATUS_LABELS[st] : 'All'}
              </Text>
            </TouchableOpacity>
          ))}
          {cities.slice(0, 5).map(city => (
            <TouchableOpacity
              key={city}
              onPress={() => setCityFilter(cityFilter === city ? '' : city)}
              style={[s.filterPill, {
                backgroundColor: cityFilter === city ? c.ink : c.elevated,
                borderColor:     c.border,
              }]}
            >
              <Text style={[s.filterPillText, { fontFamily: F.bold, color: cityFilter === city ? c.bg : c.muted }]}>
                {city}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {loading
        ? <ActivityIndicator style={{ flex: 1 }} color={c.primary} />
        : (
          <ScrollView
            contentContainerStyle={{ padding: 16 }}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={c.primary} />
            }
          >
            {filtered.length === 0
              ? <Text style={{ fontFamily: F.body, color: c.muted, textAlign: 'center', marginTop: 40 }}>No tournaments found.</Text>
              : filtered.map(t => (
                  <TournamentCard
                    key={t.tournament_id}
                    tournament={t}
                    onPress={() => router.push(`/t/${t.slug}`)}
                  />
                ))
            }
          </ScrollView>
        )
      }
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  sportBar:      { height: 56, justifyContent: 'center' },
  filterBar:     { height: 44, justifyContent: 'center' },
  sportPill:     { flexDirection: 'row', alignItems: 'center', borderRadius: 8, borderWidth: 1.5, paddingHorizontal: 12, paddingVertical: 7, gap: 5 },
  sportAbbrev:   { fontSize: 9, fontWeight: '900', letterSpacing: 0.5 },
  sportPillText: { fontSize: 12, fontWeight: '700' },
  searchWrap:    { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginVertical: 8, borderRadius: 8, borderWidth: 1.5, paddingHorizontal: 14, paddingVertical: 10 },
  searchInput:   { flex: 1, fontSize: 14, padding: 0 },
  filterPill:    { borderRadius: 4, borderWidth: 1.5, paddingHorizontal: 12, paddingVertical: 5 },
  filterPillText:{ fontSize: 11, fontWeight: '700', letterSpacing: 0.3 },
});
