/**
 * Explore screen — tournament browser for players/guests.
 * Organiser mode → Feature Guides.
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Pressable,
  TextInput, ActivityIndicator, RefreshControl, StyleSheet, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTheme } from '../../src/hooks/useTheme';
import { useAuthStore } from '../../src/store/auth';
import { apiGetSportPage } from '../../src/api/client';
import TournamentCard from '../../src/components/shared/TournamentCard';
import { F, SPORT_COLORS, SPORT_LABELS } from '../../src/theme';

// ─── Organiser Guides ────────────────────────────────────────────────────────

const GUIDES = [
  {
    num: '01',
    title: 'Create a Tournament',
    desc: 'Set up your tournament in minutes. Choose your sport, format (knockout, round-robin, league) and configure entry details.',
    accent: '#FF6B35',
    steps: ['Tap + Create on Home', 'Choose sport & format', 'Set dates & location', 'Publish for registration'],
  },
  {
    num: '02',
    title: 'Manage Registration',
    desc: 'Review and approve player or team registrations. Set limits and track who has signed up.',
    accent: '#22c55e',
    steps: ['Open your tournament', 'Go to the Participants tab', 'Approve or reject entries', 'Set max participant limit'],
  },
  {
    num: '03',
    title: 'Generate Fixtures',
    desc: 'Auto-generate match fixtures based on your format. Create brackets for knockouts or schedules for leagues.',
    accent: '#3b82f6',
    steps: ['Registration must be closed', 'Tap "Generate Fixtures"', 'Review and confirm matches', 'Publish the schedule'],
  },
  {
    num: '04',
    title: 'Score Matches Live',
    desc: 'Update scores in real time from your phone. Scores appear live for players and viewers instantly.',
    accent: '#D97706',
    steps: ['Open the Organise tab', 'Select your live match', 'Tap the match to score', 'Submit scores to confirm'],
  },
  {
    num: '05',
    title: 'Live Stream a Match',
    desc: 'Stream your match directly to YouTube. Connect your Google account and go live with one tap.',
    accent: '#8b5cf6',
    steps: ['Connect Google account in Profile', 'Open a live match', 'Tap "Go Live"', 'Copy stream link to share'],
  },
  {
    num: '06',
    title: 'Share & Promote',
    desc: 'Share your tournament page with players and spectators. Anyone can follow live scores without signing up.',
    accent: '#38bdf8',
    steps: ['Open your tournament', 'Tap the Share button', 'Send the public link', 'Spectators view live scores'],
  },
];

function GuideCard({ guide, c }: { guide: typeof GUIDES[0]; c: any }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <Pressable
      onPress={() => setExpanded(e => !e)}
      style={[gc.card, { backgroundColor: c.surface, borderColor: c.border, borderTopColor: guide.accent }]}
    >
      <View style={gc.topRow}>
        <View style={[gc.numBadge, { backgroundColor: guide.accent + '18' }]}>
          <Text style={[gc.numText, { fontFamily: F.display, color: guide.accent }]}>{guide.num}</Text>
        </View>
        <View style={[gc.watermark]}>
          <Text style={[gc.watermarkText, { fontFamily: F.display, color: guide.accent + '14' }]}>{guide.num}</Text>
        </View>
      </View>

      <Text style={[gc.title, { fontFamily: F.bold, color: c.ink }]}>{guide.title}</Text>
      <Text style={[gc.desc, { fontFamily: F.body, color: c.muted }]}>{guide.desc}</Text>

      {expanded && (
        <View style={[gc.stepsWrap, { borderTopColor: c.border }]}>
          <Text style={[gc.stepsLabel, { fontFamily: F.bold, color: c.muted }]}>How to do it</Text>
          {guide.steps.map((step, i) => (
            <View key={i} style={gc.stepRow}>
              <View style={[gc.stepNum, { backgroundColor: guide.accent }]}>
                <Text style={[gc.stepNumText, { fontFamily: F.bold }]}>{i + 1}</Text>
              </View>
              <Text style={[gc.stepText, { fontFamily: F.body, color: c.ink }]}>{step}</Text>
            </View>
          ))}
        </View>
      )}

      <View style={gc.expandRow}>
        <Text style={[gc.expandText, { fontFamily: F.bold, color: guide.accent }]}>
          {expanded ? 'Hide steps' : 'Show steps'}
        </Text>
        <Text style={[gc.expandArrow, { color: guide.accent }]}>{expanded ? '↑' : '↓'}</Text>
      </View>
    </Pressable>
  );
}

const gc = StyleSheet.create({
  card:          { borderRadius:14, borderWidth:1.5, borderTopWidth:4, padding:20, marginBottom:12 },
  topRow:        { flexDirection:'row', justifyContent:'space-between', alignItems:'flex-start', marginBottom:14 },
  numBadge:      { borderRadius:8, paddingHorizontal:12, paddingVertical:7 },
  numText:       { fontSize:13, fontWeight:'900', letterSpacing:0.5 },
  watermark:     { position:'absolute', right:0, top:-8 },
  watermarkText: { fontSize:72, fontWeight:'900', letterSpacing:-4, lineHeight:72 },
  title:         { fontSize:16, fontWeight:'800', marginBottom:8, letterSpacing:-0.3 },
  desc:          { fontSize:13, lineHeight:20 },
  stepsWrap:     { borderTopWidth:1, marginTop:14, paddingTop:14, gap:10 },
  stepsLabel:    { fontSize:10, fontWeight:'800', textTransform:'uppercase', letterSpacing:0.6, marginBottom:4 },
  stepRow:       { flexDirection:'row', alignItems:'flex-start', gap:10 },
  stepNum:       { width:22, height:22, borderRadius:11, alignItems:'center', justifyContent:'center', marginTop:1 },
  stepNumText:   { color:'#fff', fontSize:11, fontWeight:'800' },
  stepText:      { flex:1, fontSize:13, lineHeight:20 },
  expandRow:     { flexDirection:'row', alignItems:'center', gap:6, marginTop:14 },
  expandText:    { fontSize:12, fontWeight:'700' },
  expandArrow:   { fontSize:12, fontWeight:'900' },
});

function OrganiserGuides() {
  const { theme } = useTheme();
  const router    = useRouter();
  const c         = theme.colors;

  return (
    <SafeAreaView style={{ flex:1, backgroundColor: c.bg }}>
      {/* Header */}
      <View style={[gg.header, { borderBottomColor: c.border }]}>
        <View>
          <Text style={[gg.headerSub, { fontFamily: F.bold, color: c.muted }]}>Organiser</Text>
          <Text style={[gg.headerTitle, { fontFamily: F.display, color: c.ink }]}>Feature Guides</Text>
        </View>
        <Pressable
          onPress={() => router.push('/organiser/create' as any)}
          style={({ pressed }) => [gg.createBtn, { backgroundColor: c.primary, opacity: pressed ? 0.85 : 1 }]}
        >
          <Text style={[gg.createBtnText, { fontFamily: F.display }]}>+ Create</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding:16 }} showsVerticalScrollIndicator={false}>
        {/* Intro banner */}
        <View style={[gg.banner, { backgroundColor: c.primary + '10', borderColor: c.primary + '30' }]}>
          <Text style={[gg.bannerTitle, { fontFamily: F.display, color: c.ink }]}>
            Run tournaments like a pro
          </Text>
          <Text style={[gg.bannerSub, { fontFamily: F.body, color: c.muted }]}>
            Step-by-step guides to help you create, manage and score tournaments from your phone.
          </Text>
        </View>

        {GUIDES.map(g => <GuideCard key={g.num} guide={g} c={c} />)}

        {/* Help CTA */}
        <View style={[gg.helpCard, { backgroundColor: c.elevated, borderColor: c.border }]}>
          <Text style={[gg.helpTitle, { fontFamily: F.bold, color: c.ink }]}>Need help?</Text>
          <Text style={[gg.helpSub, { fontFamily: F.body, color: c.muted }]}>
            Visit thescoreboard.in for full documentation and support.
          </Text>
        </View>
        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const gg = StyleSheet.create({
  header:        { flexDirection:'row', alignItems:'center', justifyContent:'space-between', paddingHorizontal:16, paddingVertical:14, borderBottomWidth:1.5 },
  headerSub:     { fontSize:10, fontWeight:'700', textTransform:'uppercase', letterSpacing:0.6, marginBottom:2 },
  headerTitle:   { fontSize:18, fontWeight:'900', letterSpacing:-0.5 },
  createBtn:     { borderRadius:8, paddingHorizontal:14, paddingVertical:9 },
  createBtnText: { color:'#fff', fontSize:10, fontWeight:'900', textTransform:'uppercase', letterSpacing:0.4 },
  banner:        { borderRadius:12, borderWidth:1.5, padding:18, marginBottom:16, gap:8 },
  bannerTitle:   { fontSize:15, fontWeight:'900', letterSpacing:-0.4 },
  bannerSub:     { fontSize:13, lineHeight:20 },
  helpCard:      { borderRadius:12, borderWidth:1.5, padding:18, gap:6, marginTop:4 },
  helpTitle:     { fontSize:14, fontWeight:'700' },
  helpSub:       { fontSize:12, lineHeight:18 },
});

// ─────────────────────────────────────────────────────────────────────────────

const SPORTS = ['football', 'cricket', 'table_tennis', 'badminton'];

const STATUS_OPTIONS = [
  { key: '',             label: 'All'       },
  { key: 'live',         label: 'Live'      },
  { key: 'registration', label: 'Open'      },
  { key: 'fixtures',     label: 'Fixtures'  },
  { key: 'completed',    label: 'Completed' },
];

const STATUS_ACCENT: Record<string, string> = {
  '':            '#888',
  live:          '#FF6B35',
  registration:  '#22c55e',
  fixtures:      '#3b82f6',
  completed:     '#888',
};

export default function ExploreScreen() {
  const { theme } = useTheme();
  const router    = useRouter();
  const params    = useLocalSearchParams<{ sport?: string }>();
  const { mode, isLoggedIn } = useAuthStore();
  const c = theme.colors;

  // ── All hooks must run unconditionally before any early return ──────────────
  const [sport,        setSport]        = useState(params.sport ?? '');
  const [statusFilter, setStatusFilter] = useState('');
  const [cityFilter,   setCityFilter]   = useState('');
  const [search,       setSearch]       = useState('');
  const [data,         setData]         = useState<any>(null);
  const [loading,      setLoading]      = useState(true);
  const [refreshing,   setRefreshing]   = useState(false);

  const isFetchingRef = useRef(false);

  const load = useCallback(async () => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    try {
      if (!sport) {
        const results = await Promise.all(
          SPORTS.map(sk =>
            apiGetSportPage(sk, cityFilter || undefined, search || undefined)
              .catch(() => ({ tournaments: [], cities: [] }))
          )
        );
        const seen = new Set<number>();
        const all: any[] = [];
        for (const res of results)
          for (const t of (res.tournaments ?? []))
            if (!seen.has(t.tournament_id)) { seen.add(t.tournament_id); all.push(t); }
        const allCities = [...new Set(results.flatMap((r: any) => r.cities ?? []))] as string[];
        setData({ tournaments: all, cities: allCities });
      } else {
        const res = await apiGetSportPage(sport, cityFilter || undefined, search || undefined);
        setData(res);
      }
    } catch {}
    finally { isFetchingRef.current = false; setLoading(false); setRefreshing(false); }
  }, [sport, cityFilter, search]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { const id = setInterval(load, 10000); return () => clearInterval(id); }, [load]);

  // ── Safe to conditionally render now — all hooks have been called ──────────
  if (isLoggedIn() && mode === 'organiser') return <OrganiserGuides />;

  const tournaments: any[] = data?.tournaments ?? [];
  const cities: string[]   = data?.cities ?? [];

  const filtered = tournaments.filter(t =>
    (!statusFilter || t.status === statusFilter) &&
    (!cityFilter   || t.city   === cityFilter)
  );

  const hasActiveFilter = !!sport || !!statusFilter || !!cityFilter || !!search;
  const clearAll = () => { setSport(''); setStatusFilter(''); setCityFilter(''); setSearch(''); };

  // Active status accent colour for the tab indicator
  const stAccent = STATUS_ACCENT[statusFilter] ?? '#888';

  return (
    <SafeAreaView style={{ flex:1, backgroundColor: c.bg }}>

      {/* ── Search bar ──────────────────────────────────────────────────── */}
      <View style={[s.searchWrap, { backgroundColor: c.bg, borderBottomColor: c.border }]}>
        <View style={[s.searchBox, { backgroundColor: c.elevated, borderColor: c.border }]}>
          <Text style={[s.searchIcon, { color: c.muted }]}>Search</Text>
          <TextInput
            style={[s.searchInput, { fontFamily: F.body, color: c.ink }]}
            placeholder="tournaments, cities…"
            placeholderTextColor={c.muted}
            value={search}
            onChangeText={q => setSearch(q)}
            onSubmitEditing={load}
          />
          {!!search && (
            <TouchableOpacity onPress={() => setSearch('')} hitSlop={{ top:8, bottom:8, left:8, right:8 }}>
              <Text style={[s.clearX, { color: c.muted }]}>✕</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* ── Filter panel ────────────────────────────────────────────────── */}
      <View style={[s.filterPanel, { backgroundColor: c.surface, borderBottomColor: c.border }]}>

        {/* ── Row 1: Sport chips ─────────────────────────────────────────── */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.filterRow}
        >
          {/* All Sports */}
          <Pressable
            onPress={() => { setSport(''); setLoading(true); }}
            style={({ pressed }) => [
              s.sportChip,
              {
                backgroundColor: sport === '' ? c.ink : c.bg,
                borderColor:     sport === '' ? c.ink : c.border,
                opacity: pressed ? 0.8 : 1,
              },
            ]}
          >
            <Text style={[s.sportChipText, { fontFamily: F.bold, color: sport === '' ? c.bg : c.muted }]}>
              All Sports
            </Text>
          </Pressable>

          {SPORTS.map(sk => {
            const active = sport === sk;
            const color  = SPORT_COLORS[sk] ?? '#888';
            return (
              <Pressable
                key={sk}
                onPress={() => { setSport(active ? '' : sk); setLoading(true); }}
                style={({ pressed }) => [
                  s.sportChip,
                  {
                    backgroundColor: active ? color : color + '12',
                    borderColor:     active ? color : color + '55',
                    opacity: pressed ? 0.8 : 1,
                  },
                ]}
              >
                {/* Left dot accent */}
                <View style={[s.sportDot, { backgroundColor: active ? '#fff' : color }]} />
                <Text style={[s.sportChipText, { fontFamily: F.bold, color: active ? '#fff' : color }]}>
                  {SPORT_LABELS[sk]}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* ── Row 2: Status — segmented tab style ───────────────────────── */}
        <View style={[s.segmentWrap, { backgroundColor: c.elevated, borderColor: c.border }]}>
          {STATUS_OPTIONS.map(({ key, label }) => {
            const active = statusFilter === key;
            const accent = STATUS_ACCENT[key];
            return (
              <Pressable
                key={key}
                onPress={() => setStatusFilter(key)}
                style={({ pressed }) => [
                  s.segmentItem,
                  active && [s.segmentActive, { backgroundColor: c.surface }],
                  { opacity: pressed ? 0.7 : 1 },
                ]}
              >
                {active && key !== '' && (
                  <View style={[s.segmentDot, { backgroundColor: accent }]} />
                )}
                <Text style={[
                  s.segmentText,
                  { fontFamily: active ? F.bold : F.body },
                  { color: active ? (key ? accent : c.ink) : c.muted },
                ]}>
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* ── Row 3: City chips (only if available) ─────────────────────── */}
        {cities.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={[s.filterRow, { paddingTop: 0, paddingBottom: 10 }]}
          >
            <Text style={[s.cityLabel, { fontFamily: F.bold, color: c.muted }]}>City</Text>
            {cities.slice(0, 8).map(city => {
              const active = cityFilter === city;
              return (
                <Pressable
                  key={city}
                  onPress={() => setCityFilter(active ? '' : city)}
                  style={({ pressed }) => [
                    s.cityChip,
                    {
                      backgroundColor: active ? '#64748b' : c.elevated,
                      borderColor:     active ? '#64748b' : c.border,
                      opacity: pressed ? 0.8 : 1,
                    },
                  ]}
                >
                  <Text style={[s.cityChipText, { fontFamily: F.body, color: active ? '#fff' : c.muted }]}>
                    {city}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        )}
      </View>

      {/* ── Results bar ────────────────────────────────────────────────── */}
      <View style={[s.resultsBar, { borderBottomColor: c.border }]}>
        <Text style={[s.resultsCount, { fontFamily: F.bold, color: c.muted }]}>
          {loading ? '…' : `${filtered.length} tournament${filtered.length !== 1 ? 's' : ''}`}
          {sport        ? ` · ${SPORT_LABELS[sport]}`              : ''}
          {statusFilter ? ` · ${STATUS_OPTIONS.find(o => o.key === statusFilter)?.label}` : ''}
          {cityFilter   ? ` · ${cityFilter}`                       : ''}
        </Text>
        {hasActiveFilter && (
          <TouchableOpacity onPress={clearAll} style={[s.clearAllBtn, { borderColor: c.border }]}>
            <Text style={[s.clearAllText, { fontFamily: F.bold, color: c.muted }]}>Clear all</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* ── Tournament list ─────────────────────────────────────────────── */}
      {loading
        ? <ActivityIndicator style={{ flex:1 }} color={c.primary} />
        : (
          <ScrollView
            contentContainerStyle={{ padding:16, gap:10 }}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={c.primary} />
            }
          >
            {filtered.length === 0 ? (
              <View style={s.emptyState}>
                <Text style={[s.emptyTitle, { fontFamily: F.display, color: c.ink }]}>No tournaments found</Text>
                <Text style={[s.emptySub, { fontFamily: F.body, color: c.muted }]}>
                  Try clearing some filters or check back later.
                </Text>
                {hasActiveFilter && (
                  <TouchableOpacity onPress={clearAll} style={[s.clearAllBtn, { borderColor: c.border, marginTop: 16 }]}>
                    <Text style={[s.clearAllText, { fontFamily: F.bold, color: c.muted }]}>Clear all filters</Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : (
              filtered.map(t => (
                <TournamentCard key={t.tournament_id} tournament={t} onPress={() => router.push(`/t/${t.slug}`)} />
              ))
            )}
            <View style={{ height: 24 }} />
          </ScrollView>
        )
      }
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  // Search
  searchWrap:   { paddingHorizontal:16, paddingVertical:10, borderBottomWidth:1 },
  searchBox:    { flexDirection:'row', alignItems:'center', borderRadius:10, borderWidth:1.5, paddingHorizontal:14, height:46, gap:8 },
  searchIcon:   { fontSize:13, fontWeight:'700' },
  searchInput:  { flex:1, fontSize:14, padding:0 },
  clearX:       { fontSize:14, fontWeight:'700' },

  // Filter panel
  filterPanel:  { borderBottomWidth:1.5 },
  filterRow:    { paddingHorizontal:16, paddingVertical:10, gap:7, alignItems:'center' },

  // Sport chips
  sportChip:    { flexDirection:'row', alignItems:'center', gap:6, borderRadius:20, borderWidth:1.5, paddingHorizontal:14, paddingVertical:8 },
  sportDot:     { width:6, height:6, borderRadius:3 },
  sportChipText:{ fontSize:12, fontWeight:'700' },

  // Status segmented control
  segmentWrap:   { flexDirection:'row', marginHorizontal:16, marginBottom:10, borderRadius:10, borderWidth:1.5, overflow:'hidden', padding:3 },
  segmentItem:   { flex:1, alignItems:'center', justifyContent:'center', flexDirection:'row', gap:4, paddingVertical:8, borderRadius:8 },
  segmentActive: { elevation:2 },
  segmentDot:    { width:5, height:5, borderRadius:3 },
  segmentText:   { fontSize:11, fontWeight:'600' },

  // City chips
  cityLabel:    { fontSize:10, fontWeight:'800', textTransform:'uppercase', letterSpacing:0.5, alignSelf:'center', marginRight:4, color:'#888' },
  cityChip:     { borderRadius:16, borderWidth:1.5, paddingHorizontal:12, paddingVertical:6 },
  cityChipText: { fontSize:11, fontWeight:'600' },

  // Results bar
  resultsBar:     { flexDirection:'row', alignItems:'center', justifyContent:'space-between', paddingHorizontal:16, paddingVertical:8, borderBottomWidth:1 },
  resultsCount:   { fontSize:11, fontWeight:'700' },
  clearAllBtn:    { borderRadius:6, borderWidth:1.5, paddingHorizontal:10, paddingVertical:4 },
  clearAllText:   { fontSize:11, fontWeight:'700' },

  // Empty state
  emptyState:  { alignItems:'center', paddingTop:56, gap:8 },
  emptyTitle:  { fontSize:15, fontWeight:'900' },
  emptySub:    { fontSize:13, textAlign:'center', lineHeight:20 },
});
