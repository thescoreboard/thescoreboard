/**
 * Explore screen — browse tournaments by sport & status.
 * "All Sports" mode fetches all 4 sport pages in parallel and deduplicates.
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTheme } from '../../src/hooks/useTheme';
import { apiGetSportPage } from '../../src/api/client';
import TournamentCard from '../../src/components/shared/TournamentCard';
import { F, SPORT_COLORS, SPORT_LABELS } from '../../src/theme';

const SPORTS = ['football', 'cricket', 'table_tennis', 'badminton'];
const STATUSES = ['live', 'registration', 'fixtures', 'completed'];
const STATUS_LABELS: Record<string, string> = {
  live: 'Live', registration: 'Open', fixtures: 'Fixtures', completed: 'Completed',
};

export default function ExploreScreen() {
  const { theme } = useTheme();
  const router    = useRouter();
  const params    = useLocalSearchParams<{ sport?: string }>();
  const c         = theme.colors;

  // '' = All Sports (default — no forced sport)
  const [sport,        setSport]        = useState<string>(params.sport ?? '');
  const [statusFilter, setStatusFilter] = useState('');
  const [cityFilter,   setCityFilter]   = useState('');
  const [search,       setSearch]       = useState('');
  const [data,         setData]         = useState<any>(null);
  const [loading,      setLoading]      = useState(true);
  const [refreshing,   setRefreshing]   = useState(false);

  // Guard: prevent concurrent in-flight requests from stacking up
  const isFetchingRef = useRef(false);

  const load = useCallback(async () => {
    if (isFetchingRef.current) return;   // already in-flight — skip
    isFetchingRef.current = true;
    try {
      if (!sport) {
        // All Sports: fetch every sport in parallel, merge + deduplicate
        const results = await Promise.all(
          SPORTS.map(sk =>
            apiGetSportPage(sk, cityFilter || undefined, search || undefined)
              .catch(() => ({ tournaments: [], cities: [] }))
          )
        );
        const seen = new Set<number>();
        const all: any[] = [];
        for (const res of results) {
          for (const t of (res.tournaments ?? [])) {
            if (!seen.has(t.tournament_id)) { seen.add(t.tournament_id); all.push(t); }
          }
        }
        const allCities = [...new Set(results.flatMap((r: any) => r.cities ?? []))] as string[];
        setData({ tournaments: all, cities: allCities });
      } else {
        const res = await apiGetSportPage(sport, cityFilter || undefined, search || undefined);
        setData(res);
      }
    } catch {}
    finally {
      isFetchingRef.current = false;
      setLoading(false);
      setRefreshing(false);
    }
  }, [sport, cityFilter, search]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const id = setInterval(load, 10000);
    return () => clearInterval(id);
  }, [load]);

  const tournaments: any[] = data?.tournaments ?? [];
  const cities: string[]   = data?.cities ?? [];

  const filtered = tournaments.filter(t =>
    (!statusFilter || t.status === statusFilter) &&
    (!cityFilter   || t.city   === cityFilter)
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>

      {/* ── Search ── */}
      <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 6 }}>
        <View style={{ backgroundColor: c.elevated, borderRadius: 10, borderWidth: 1.5,
          borderColor: c.border, flexDirection: 'row', alignItems: 'center',
          paddingHorizontal: 12, height: 44 }}>
          <TextInput
            style={{ flex: 1, fontSize: 14, color: c.ink, padding: 0 }}
            placeholder="Search tournaments…"
            placeholderTextColor={c.muted}
            value={search}
            onChangeText={q => setSearch(q)}
            onSubmitEditing={load}
          />
          {!!search && (
            <TouchableOpacity onPress={() => setSearch('')} hitSlop={{ top:8,bottom:8,left:8,right:8 }}>
              <Text style={{ color: c.muted, fontSize: 18 }}>×</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* ── Filters ── */}
      <View style={{ borderBottomWidth: 1, borderBottomColor: c.border,
        backgroundColor: c.surface, paddingBottom: 8 }}>

        {/* Sport row */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16, gap: 6, alignItems: 'center', paddingVertical: 8 }}>

          {/* All Sports chip */}
          <TouchableOpacity onPress={() => { setSport(''); setLoading(true); }}
            style={{ borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7,
              backgroundColor: sport === '' ? c.ink : c.elevated,
              borderWidth: 1.5, borderColor: sport === '' ? c.ink : c.border }}>
            <Text style={{ fontSize: 12, fontWeight: '700',
              color: sport === '' ? c.bg : c.muted }}>All Sports</Text>
          </TouchableOpacity>

          {SPORTS.map(sk => {
            const active = sport === sk;
            const color  = SPORT_COLORS[sk] ?? '#888';
            return (
              <TouchableOpacity key={sk}
                onPress={() => { setSport(active ? '' : sk); setLoading(true); }}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 5,
                  borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7,
                  backgroundColor: active ? color : color + '12',
                  borderWidth: 1.5, borderColor: active ? color : color + '55' }}>
                <Text style={{ fontSize: 12, fontWeight: '700',
                  color: active ? '#fff' : color }}>{SPORT_LABELS[sk]}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Status + city row */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16, gap: 6, alignItems: 'center' }}>

          {['', ...STATUSES].map(st => (
            <TouchableOpacity key={st} onPress={() => setStatusFilter(st)}
              style={{ borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6,
                backgroundColor: statusFilter === st ? c.primary : 'transparent',
                borderWidth: 1.5, borderColor: statusFilter === st ? c.primary : c.border }}>
              <Text style={{ fontSize: 12, fontWeight: '700',
                color: statusFilter === st ? '#fff' : c.muted }}>
                {st ? STATUS_LABELS[st] : 'All'}
              </Text>
            </TouchableOpacity>
          ))}

          {cities.slice(0, 5).map(city => (
            <TouchableOpacity key={city}
              onPress={() => setCityFilter(cityFilter === city ? '' : city)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 4,
                borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6,
                backgroundColor: cityFilter === city ? '#64748b' : 'transparent',
                borderWidth: 1.5, borderColor: c.border }}>
              <Text style={{ fontSize: 12, fontWeight: '700',
                color: cityFilter === city ? '#fff' : c.muted }}>{city}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* ── Results ── */}
      {loading
        ? <ActivityIndicator style={{ flex: 1 }} color={c.primary} />
        : (
          <ScrollView
            contentContainerStyle={{ padding: 16 }}
            refreshControl={
              <RefreshControl refreshing={refreshing}
                onRefresh={() => { setRefreshing(true); load(); }}
                tintColor={c.primary} />
            }
          >
            {/* Results count */}
            <Text style={{ fontSize: 11, color: c.muted, fontWeight: '600', marginBottom: 10 }}>
              {filtered.length} tournament{filtered.length !== 1 ? 's' : ''}
              {sport ? ` · ${SPORT_LABELS[sport]}` : ''}
              {statusFilter ? ` · ${STATUS_LABELS[statusFilter]}` : ''}
            </Text>

            {filtered.length === 0 ? (
              <View style={{ alignItems: 'center', paddingTop: 48, gap: 10 }}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: c.ink }}>No tournaments found</Text>
                <Text style={{ fontSize: 13, color: c.muted, textAlign: 'center' }}>
                  Try clearing some filters or check back later.
                </Text>
                {(sport || statusFilter || cityFilter || search) && (
                  <TouchableOpacity onPress={() => {
                    setSport(''); setStatusFilter(''); setCityFilter(''); setSearch('');
                  }} style={{ marginTop: 8, borderRadius: 8, borderWidth: 1.5,
                    borderColor: c.border, paddingHorizontal: 16, paddingVertical: 9 }}>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: c.muted }}>Clear all filters</Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : (
              filtered.map(t => (
                <TournamentCard
                  key={t.tournament_id}
                  tournament={t}
                  onPress={() => router.push(`/t/${t.slug}`)}
                />
              ))
            )}
          </ScrollView>
        )
      }
    </SafeAreaView>
  );
}
