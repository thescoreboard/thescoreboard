/**
 * Tournament public screen — mirrors TournamentPublic.jsx
 * Tabs: Fixtures | Teams | Standings | Road to Final | Info
 * Polls every 8s + WebSocket live updates.
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, Modal, Share, RefreshControl, Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTheme } from '../../src/hooks/useTheme';
import { apiGetTournamentBySlug, shareUrl } from '../../src/api/client';
import { useTournamentSocket } from '../../src/hooks/useTournamentSocket';
import MatchCard from '../../src/components/shared/MatchCard';
import RoadToFinal from '../../src/components/shared/RoadToFinal';
import { F, SPORT_COLORS, SPORT_LABELS, STATUS_LABELS, STATUS_COLORS } from '../../src/theme';
import { computeStandings } from '../../src/utils/standings';
import { STAGE_ORDER } from '../../src/utils/match';

// ── Section nav tabs ──────────────────────────────────────────────
function SectionNav({ tabs, active, onChange, theme }: any) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}
      style={[sn.bar, { borderBottomColor: theme.colors.border }]}
      contentContainerStyle={{ paddingHorizontal: 16, gap: 4 }}>
      {tabs.map((t: any) => (
        <TouchableOpacity key={t.id} onPress={() => onChange(t.id)}
          style={[sn.tab, active === t.id && { borderBottomColor: theme.colors.primary, borderBottomWidth: 2 }]}>
          <Text style={[sn.tabText, { color: active===t.id ? theme.colors.primary : theme.colors.muted, fontWeight: active===t.id?'800':'600' }]}>
            {t.label.toUpperCase()}
          </Text>
          {t.count != null && (
            <View style={[sn.badge, { backgroundColor: active===t.id ? theme.colors.primary+'22' : theme.colors.elevated }]}>
              <Text style={{ fontSize:10, color: active===t.id ? theme.colors.primary : theme.colors.muted, fontWeight:'700' }}>{t.count}</Text>
            </View>
          )}
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}
const sn = StyleSheet.create({
  bar:     { flexShrink:0, borderBottomWidth:1.5 },
  tab:     { flexDirection:'row', alignItems:'center', paddingVertical:12, paddingHorizontal:8, gap:5 },
  tabText: { fontFamily: 'SpaceGrotesk_700Bold', fontSize:11, letterSpacing:0.8 },
  badge:   { borderRadius:4, paddingHorizontal:6, paddingVertical:2, minWidth:20, alignItems:'center' },
});

// ── Fixtures section ─────────────────────────────────────────────
function FixturesSection({ events, sportKey }: any) {
  const { theme } = useTheme();
  const allMatches = events.flatMap((ev: any) => ev.all_matches ?? []);
  const done       = allMatches.filter((m: any) => m.status === 'done');
  const live       = allMatches.filter((m: any) => m.status === 'live');
  const upcoming   = allMatches.filter((m: any) => m.status !== 'done' && m.status !== 'live');
  const c = theme.colors;

  if (allMatches.length === 0) return <Text style={{ color:c.muted, textAlign:'center', padding:32 }}>No fixtures yet.</Text>;

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }}>
      {/* Stats row */}
      <View style={{ flexDirection:'row', gap:10, marginBottom:16 }}>
        {[['Total', allMatches.length, c.muted], ['Done', done.length, '#16a34a'], ['Live', live.length, c.primary], ['Upcoming', upcoming.length, c.muted]].map(([l,v,cl]) =>
          (v as number) > 0 ? (
            <View key={l as string} style={{ alignItems:'center', backgroundColor: c.elevated, borderRadius:10, padding:10, flex:1 }}>
              <Text style={{ fontSize:20, fontWeight:'900', color: cl as string }}>{v as number}</Text>
              <Text style={{ fontSize:10, color: c.muted, fontWeight:'600', textTransform:'uppercase' }}>{l as string}</Text>
            </View>
          ) : null
        )}
      </View>

      {live.length > 0 && (
        <>
          <Text style={[fs.sectionLabel, { color: c.primary }]}>LIVE</Text>
          {live.map((m: any) => <MatchCard key={m.match_id} match={m} sportKey={sportKey} />)}
        </>
      )}
      {upcoming.length > 0 && (
        <>
          <Text style={[fs.sectionLabel, { color: c.muted }]}>UPCOMING</Text>
          {upcoming.map((m: any) => <MatchCard key={m.match_id} match={m} sportKey={sportKey} />)}
        </>
      )}
      {done.length > 0 && (
        <>
          <Text style={[fs.sectionLabel, { color: c.muted }]}>COMPLETED</Text>
          {done.map((m: any) => <MatchCard key={m.match_id} match={m} sportKey={sportKey} />)}
        </>
      )}
    </ScrollView>
  );
}
const fs = StyleSheet.create({ sectionLabel: { fontSize:10, fontWeight:'800', letterSpacing:1.5, marginBottom:6, marginTop:10 } });

// ── Standings section ─────────────────────────────────────────────
function StandingsSection({ events }: any) {
  const { theme } = useTheme();
  const c = theme.colors;
  const allMatches = events.flatMap((ev: any) => ev.all_matches ?? []);
  const rows = computeStandings(allMatches, events[0]?.sport_key);

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }}>
      <View style={{ borderRadius:12, borderWidth:1, borderColor:c.border, overflow:'hidden' }}>
        {/* Header */}
        <View style={[{ flexDirection:'row', backgroundColor:c.elevated, padding:10 }]}>
          {['#','Name','P','W','D','L','PF','PA','Pts'].map((h, i) => (
            <Text key={h} style={[{ fontSize:10, fontWeight:'800', color:c.muted, flex: i===1?3:1, textAlign: i>1?'center':'left' }]}>{h}</Text>
          ))}
        </View>
        {rows.map((r, i) => (
          <View key={String(r.id)} style={{ flexDirection:'row', padding:10, borderTopWidth:1, borderTopColor:c.border }}>
            <Text style={[std.cell, { color:c.muted, flex:1 }]}>{i+1}</Text>
            <Text style={[std.cell, { color:c.ink, flex:3, fontWeight:'700' }]} numberOfLines={1}>{r.name}</Text>
            {[r.p, r.w, r.d, r.l, r.sf, r.sa, r.pts].map((v, j) => (
              <Text key={j} style={[std.cell, { color: j===6?c.primary:c.ink, fontWeight: j===6?'900':'500' }]}>{v}</Text>
            ))}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}
const std = StyleSheet.create({ cell: { flex:1, fontSize:12, textAlign:'center' } });

// ── Info section ──────────────────────────────────────────────────
function InfoSection({ info }: any) {
  const { theme } = useTheme();
  const c = theme.colors;
  if (!info) return null;
  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
      {info.overview ? (
        <View style={[inf.box, { backgroundColor:c.surface, borderColor:c.border }]}>
          <Text style={[inf.heading, { color:c.muted }]}>OVERVIEW</Text>
          <Text style={{ fontSize:14, color:c.ink, lineHeight:22, ...(Platform.OS === 'web' ? { whiteSpace: 'pre-wrap' } : {}) } as any}>{info.overview}</Text>
        </View>
      ) : null}
      {info.prize_pool?.length > 0 && (
        <View style={[inf.box, { backgroundColor:c.surface, borderColor:c.border }]}>
          <Text style={[inf.heading, { color:c.muted }]}>PRIZE POOL</Text>
          {info.prize_pool.map((p: any, i: number) => (
            <View key={i} style={{ flexDirection:'row', justifyContent:'space-between', paddingVertical:6, borderTopWidth: i>0?1:0, borderTopColor:c.border }}>
              <Text style={{ color:c.muted, fontSize:13 }}>{p.category} · {p.position}</Text>
              <Text style={{ color:c.ink, fontWeight:'700', fontSize:13 }}>{p.amount}</Text>
            </View>
          ))}
        </View>
      )}
      {info.rules ? (
        <View style={[inf.box, { backgroundColor:c.surface, borderColor:c.border }]}>
          <Text style={[inf.heading, { color:c.muted }]}>RULES</Text>
          <Text style={{ fontSize:14, color:c.ink, lineHeight:22, ...(Platform.OS === 'web' ? { whiteSpace: 'pre-wrap' } : {}) } as any}>{info.rules}</Text>
        </View>
      ) : null}
      {(info.contact?.entry_fee || info.contact?.persons?.length > 0) && (
        <View style={[inf.box, { backgroundColor:c.surface, borderColor:c.border }]}>
          <Text style={[inf.heading, { color:c.muted }]}>REGISTRATION & CONTACT</Text>
          {info.contact.entry_fee && <Text style={{ fontSize:14, color:c.ink, marginBottom:6 }}>Entry fee: <Text style={{ fontWeight:'700' }}>{info.contact.entry_fee}</Text></Text>}
          {info.contact.reg_deadline && <Text style={{ fontSize:13, color:c.muted, marginBottom:8 }}>Deadline: {info.contact.reg_deadline}</Text>}
          {info.contact.persons?.map((p: any, i: number) => (
            <Text key={i} style={{ fontSize:13, color:c.muted }}>{p.name}{p.phone ? ` · ${p.phone}` : ''}</Text>
          ))}
        </View>
      )}
    </ScrollView>
  );
}
const inf = StyleSheet.create({
  box:     { borderRadius:12, borderWidth:1.5, padding:16 },
  heading: { fontFamily: 'SpaceGrotesk_700Bold', fontSize:11, fontWeight:'700', letterSpacing:1.5, textTransform:'uppercase', marginBottom:10 },
});

// ── Main screen ───────────────────────────────────────────────────
export default function TournamentPublicScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { theme } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const c = theme.colors;

  const [t,          setT]          = useState<any>(null);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab,  setActiveTab]  = useState('fixtures');

  const load = useCallback(async () => {
    try {
      const data = await apiGetTournamentBySlug(slug);
      setT(data);
    } catch {}
    setLoading(false);
    setRefreshing(false);
  }, [slug]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { const id = setInterval(load, 8000); return () => clearInterval(id); }, [load]);

  useTournamentSocket({ slug, onData: (payload) => { setT((prev: any) => prev ? { ...prev, ...payload } : prev); } });

  if (loading) return <SafeAreaView style={{ flex:1, backgroundColor:c.bg }}><ActivityIndicator style={{ flex:1 }} color={c.primary} /></SafeAreaView>;
  if (!t)      return <SafeAreaView style={{ flex:1, backgroundColor:c.bg }}><Text style={{ color:c.muted, textAlign:'center', marginTop:40 }}>Tournament not found.</Text></SafeAreaView>;

  const events: any[] = t.events ?? [];
  const allMatches    = events.flatMap((ev: any) => ev.all_matches ?? []);
  const liveCount     = allMatches.filter((m: any) => m.status === 'live').length;
  const isTeamSport   = events.some((ev: any) => ev.participant_type === 'team');
  const primarySport  = events[0]?.sport_key;
  const sportColor    = SPORT_COLORS[primarySport] ?? c.primary;
  const hasStandings  = events.some((ev: any) => ev.format === 'round_robin' || ev.format === 'group_knockout');
  const hasInfo       = !!(t.tournament_info?.overview || t.tournament_info?.prize_pool?.length || t.tournament_info?.rules);
  const hasKnockout   = allMatches.some((m: any) => ['semi','final','quarter'].includes(m.stage));
  const canRegister   = t.status === 'registration';

  const tabs = [
    { id:'fixtures', label:'Fixtures', count: allMatches.length },
    { id:'teams',    label: isTeamSport ? 'Teams' : 'Players' },
    ...(hasStandings ? [{ id:'standings', label:'Standings' }] : []),
    ...(hasKnockout  ? [{ id:'bracket',   label:'Road to Final' }] : []),
    ...(hasInfo      ? [{ id:'info',      label:'Info' }] : []),
  ];

  return (
    <View style={{ flex:1, backgroundColor:c.bg }}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: c.bg }}>
        {/* Back + share bar */}
        <View style={{ flexDirection:'row', alignItems:'center', justifyContent:'space-between', paddingHorizontal:16, paddingVertical:10 }}>
          <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)' as any)}>
            <Text style={{ color:c.muted, fontSize:14 }}>← Back</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => Share.share({ message: `${t.name} — Live on TheScoreBoard\n${shareUrl.tournament(t.slug)}` })}>
            <Text style={{ color:c.primary, fontSize:14, fontWeight:'700' }}>Share ↗</Text>
          </TouchableOpacity>
        </View>

        {/* Hero */}
        <View style={{ paddingHorizontal:16, paddingBottom:12 }}>
          {/* Sport + status pills */}
          <View style={{ flexDirection:'row', gap:8, marginBottom:10, flexWrap:'wrap' }}>
            {liveCount > 0 && (
              <View style={[hero.pill, { backgroundColor: c.primary+'20', borderColor: c.primary+'55' }]}>
                <View style={{ width:6, height:6, borderRadius:3, backgroundColor:c.primary, marginRight:4 }} />
                <Text style={{ fontFamily: F.bold, fontSize:10, fontWeight:'700', letterSpacing:1, color:c.primary }}>LIVE NOW</Text>
              </View>
            )}
            {primarySport && (
              <View style={[hero.pill, { backgroundColor: sportColor+'15', borderColor: sportColor+'44' }]}>
                <Text style={{ fontFamily: F.bold, fontSize:10, fontWeight:'700', letterSpacing:1, color:sportColor }}>{(SPORT_LABELS[primarySport]??'').toUpperCase()}</Text>
              </View>
            )}
            {t.status && t.status !== 'live' && (
              <View style={[hero.pill, { backgroundColor: (STATUS_COLORS[t.status]??'#888')+'22', borderColor:(STATUS_COLORS[t.status]??'#888')+'44' }]}>
                <Text style={{ fontFamily: F.bold, fontSize:10, fontWeight:'700', letterSpacing:1, color: STATUS_COLORS[t.status]??'#888' }}>{(STATUS_LABELS[t.status]??t.status).toUpperCase()}</Text>
              </View>
            )}
          </View>

          {/* Name */}
          <Text style={[hero.name, { color:c.ink }]} numberOfLines={3}>{t.name?.toUpperCase()}</Text>

          {/* Meta */}
          <View style={{ flexDirection:'row', flexWrap:'wrap', gap:10, marginTop:8 }}>
            {t.start_date && <Text style={{ fontFamily: F.body, fontSize:12, color:c.muted }}>{new Date(t.start_date).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'})}</Text>}
            {t.city && <Text style={{ fontFamily: F.body, fontSize:12, color:c.muted }}>{t.city}{t.state?`, ${t.state}`:''}</Text>}
          </View>

          {/* Register button */}
          {canRegister && (
            <TouchableOpacity
              onPress={() => router.push(`/register/${t.slug}`)}
              style={[hero.registerBtn, { backgroundColor:c.primary }]}>
              <Text style={{ fontFamily: F.display, color:'#fff', fontSize:12, letterSpacing:0.5, textTransform:'uppercase' }}>Register Now →</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Tab nav */}
        <SectionNav tabs={tabs} active={activeTab} onChange={setActiveTab} theme={theme} />
      </SafeAreaView>

      {/* Tab content */}
      {activeTab === 'fixtures'  && <FixturesSection events={events} sportKey={primarySport} />}
      {activeTab === 'teams'     && <TeamsSection events={events} theme={theme} />}
      {activeTab === 'standings' && <StandingsSection events={events} />}
      {activeTab === 'bracket'   && (
        <ScrollView contentContainerStyle={{ padding:16 }}>
          {events.map((ev: any) => (
            <View key={ev.event_id}>
              {t.is_multi_sport && <Text style={{ color:c.muted, fontWeight:'700', marginBottom:8 }}>{ev.name}</Text>}
              <RoadToFinal matches={ev.all_matches ?? []} />
            </View>
          ))}
        </ScrollView>
      )}
      {activeTab === 'info'      && <InfoSection info={t.tournament_info} />}
    </View>
  );
}

function TeamsSection({ events, theme }: any) {
  const c = theme.colors;
  const participants = events.flatMap((ev: any) => [
    ...(ev.ungrouped_players ?? []),
    ...(ev.groups ?? []).flatMap((g: any) => g.players ?? []),
  ]);
  return (
    <ScrollView contentContainerStyle={{ padding:16 }}>
      {participants.length === 0
        ? <Text style={{ color:c.muted, textAlign:'center', marginTop:32 }}>No participants yet.</Text>
        : participants.map((p: any) => (
          <View key={p.player_id ?? p.ep_id} style={{ flexDirection:'row', alignItems:'center', paddingVertical:10, borderBottomWidth:1, borderBottomColor:c.border }}>
            <View style={{ width:36, height:36, borderRadius:18, backgroundColor:c.elevated, alignItems:'center', justifyContent:'center', marginRight:10 }}>
              <Text style={{ fontSize:14, fontWeight:'800', color:c.muted }}>{(p.name??'?')[0].toUpperCase()}</Text>
            </View>
            <Text style={{ fontSize:14, fontWeight:'600', color:c.ink }}>{p.name}</Text>
            {p.seed_level && <Text style={{ marginLeft:'auto', fontSize:11, color:c.muted }}>{p.seed_level}</Text>}
          </View>
        ))
      }
    </ScrollView>
  );
}

const hero = StyleSheet.create({
  pill:        { flexDirection:'row', alignItems:'center', borderRadius:4, borderWidth:1.5, paddingHorizontal:10, paddingVertical:4 },
  name:        { fontFamily: 'Unbounded_900Black', fontSize:22, letterSpacing:-0.5, lineHeight:28 },
  registerBtn: { borderRadius:8, paddingVertical:14, alignItems:'center', marginTop:16, minHeight:52 },
});
