/**
 * Tournament public screen — mirrors TournamentPublic.jsx
 * Tabs: Fixtures | Teams | Standings | Road to Final | Info
 * Polls every 8s + WebSocket live updates.
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, Share, Platform, Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTheme } from '../../src/hooks/useTheme';
import { apiGetTournamentBySlug, shareUrl } from '../../src/api/client';
import { useTournamentSocket } from '../../src/hooks/useTournamentSocket';
import MatchCard from '../../src/components/shared/MatchCard';
import RoadToFinal from '../../src/components/shared/RoadToFinal';
import { F, SPORT_COLORS, SPORT_LABELS, STATUS_LABELS, STATUS_COLORS } from '../../src/theme';
import { computeStandings } from '../../src/utils/standings';
import { STAGE_ORDER } from '../../src/utils/match';

// ── Ticker bar (live scores strip) ───────────────────────────────────
function TickerBar({ matches }: { matches: any[] }) {
  const scrollX     = useRef(new Animated.Value(0)).current;
  const animRef     = useRef<Animated.CompositeAnimation | null>(null);
  const [contentW,   setContentW]   = useState(0);
  const [containerW, setContainerW] = useState(0);

  useEffect(() => {
    if (animRef.current) { animRef.current.stop(); animRef.current = null; }
    if (contentW <= containerW || contentW === 0) return;
    const travel = contentW - containerW + 40;
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(scrollX, { toValue: -travel, duration: travel * 25, useNativeDriver: true }),
        Animated.delay(800),
        Animated.timing(scrollX, { toValue: 0, duration: 400, useNativeDriver: true }),
        Animated.delay(400),
      ]),
    );
    animRef.current = anim;
    anim.start();
    return () => { anim.stop(); animRef.current = null; };
  }, [contentW, containerW]);

  if (matches.length === 0) return null;

  const items = matches.map((m: any) => {
    const p1 = m.player_1?.name ?? 'TBD';
    const p2 = m.player_2?.name ?? 'TBD';
    const s1 = m.player_1?.score ?? 0;
    const s2 = m.player_2?.score ?? 0;
    return `${p1}  ${s1} – ${s2}  ${p2}`;
  });

  return (
    <View style={tk.bar}>
      <View style={tk.label}>
        <View style={tk.dot} />
        <Text style={tk.labelText}>SCORES</Text>
      </View>
      <View style={tk.track} onLayout={(e) => setContainerW(e.nativeEvent.layout.width)}>
        <Animated.View
          style={[tk.items, { transform: [{ translateX: scrollX }] }]}
          onLayout={(e) => setContentW(e.nativeEvent.layout.width)}>
          {items.map((item, i) => (
            <React.Fragment key={i}>
              {i > 0 && <Text style={tk.sep}>·</Text>}
              <Text style={tk.item}>{item}</Text>
            </React.Fragment>
          ))}
        </Animated.View>
      </View>
    </View>
  );
}
const tk = StyleSheet.create({
  bar:       { flexDirection:'row', alignItems:'center', backgroundColor:'#f97316', paddingVertical:7 },
  label:     { flexDirection:'row', alignItems:'center', gap:5, paddingHorizontal:12, paddingRight:10, borderRightWidth:1, borderRightColor:'rgba(255,255,255,0.25)', marginRight:10 },
  dot:       { width:6, height:6, borderRadius:3, backgroundColor:'#fff' },
  labelText: { fontSize:9, fontWeight:'900', color:'#fff', letterSpacing:1.5 },
  track:     { flex:1, overflow:'hidden' },
  items:     { flexDirection:'row', alignItems:'center' },
  item:      { fontSize:11, fontWeight:'700', color:'#fff', paddingRight:4 },
  sep:       { fontSize:13, color:'rgba(255,255,255,0.5)', paddingHorizontal:10 },
});

// ── Section nav tabs ──────────────────────────────────────────────
function SectionNav({ tabs, active, onChange, theme }: any) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={[sn.bar, { borderBottomColor: theme.colors.border }]}
      contentContainerStyle={{ paddingHorizontal: 16, gap: 4 }}>
      {tabs.map((t: any) => (
        <TouchableOpacity
          key={t.id}
          onPress={() => onChange(t.id)}
          style={[sn.tab, active === t.id && { borderBottomColor: theme.colors.primary, borderBottomWidth: 2 }]}>
          <Text style={[sn.tabText, { color: active === t.id ? theme.colors.primary : theme.colors.muted, fontWeight: active === t.id ? '800' : '600' }]}>
            {t.label.toUpperCase()}
          </Text>
          {t.count != null && (
            <View style={[sn.badge, { backgroundColor: active === t.id ? theme.colors.primary + '22' : theme.colors.elevated }]}>
              <Text style={{ fontSize: 10, color: active === t.id ? theme.colors.primary : theme.colors.muted, fontWeight: '700' }}>{t.count}</Text>
            </View>
          )}
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}
const sn = StyleSheet.create({
  bar:     { flexShrink: 0, borderBottomWidth: 1.5 },
  tab:     { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 8, gap: 5 },
  tabText: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 11, letterSpacing: 0.8 },
  badge:   { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, minWidth: 20, alignItems: 'center' },
});

// ── Fixtures section ─────────────────────────────────────────────
function FixturesSection({ events, sportKey }: any) {
  const { theme } = useTheme();
  const allMatches = events.flatMap((ev: any) => ev.all_matches ?? []);
  const c = theme.colors;

  const stageIdx = (m: any) => { const i = STAGE_ORDER.indexOf(m.stage ?? ''); return i === -1 ? 999 : i; };
  const byStage  = (arr: any[]) => [...arr].sort((a, b) => stageIdx(a) - stageIdx(b));

  const live     = byStage(allMatches.filter((m: any) => m.status === 'live'));
  const upcoming = byStage(allMatches.filter((m: any) => m.status !== 'done' && m.status !== 'live'));
  const done     = byStage(allMatches.filter((m: any) => m.status === 'done'));

  if (allMatches.length === 0) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: c.muted, fontSize: 14, textAlign: 'center', padding: 32 }}>No fixtures yet.</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }}>
      {live.length > 0 && (
        <>
          <Text style={[fs.label, { color: c.primary }]}>LIVE</Text>
          {live.map((m: any) => <MatchCard key={m.match_id} match={m} sportKey={sportKey} />)}
        </>
      )}
      {upcoming.length > 0 && (
        <>
          <Text style={[fs.label, { color: c.muted, marginTop: live.length > 0 ? 8 : 0 }]}>UPCOMING</Text>
          {upcoming.map((m: any) => <MatchCard key={m.match_id} match={m} sportKey={sportKey} />)}
        </>
      )}
      {done.length > 0 && (
        <>
          <Text style={[fs.label, { color: c.muted, marginTop: (live.length > 0 || upcoming.length > 0) ? 8 : 0 }]}>COMPLETED</Text>
          {done.map((m: any) => <MatchCard key={m.match_id} match={m} sportKey={sportKey} />)}
        </>
      )}
    </ScrollView>
  );
}
const fs = StyleSheet.create({
  label: { fontSize: 10, fontWeight: '800', letterSpacing: 1.5, marginBottom: 8, textTransform: 'uppercase' },
});

// ── Standings section ─────────────────────────────────────────────
function StandingsSection({ events }: any) {
  const { theme } = useTheme();
  const c = theme.colors;
  const allMatches = events.flatMap((ev: any) => ev.all_matches ?? []);
  const rows = computeStandings(allMatches, events[0]?.sport_key);

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }}>
      <View style={{ borderRadius: 12, borderWidth: 1, borderColor: c.border, overflow: 'hidden' }}>
        <View style={{ flexDirection: 'row', backgroundColor: c.elevated, padding: 10 }}>
          {['#', 'Name', 'P', 'W', 'D', 'L', 'PF', 'PA', 'Pts'].map((h, i) => (
            <Text key={h} style={{ fontSize: 10, fontWeight: '800', color: c.muted, flex: i === 1 ? 3 : 1, textAlign: i > 1 ? 'center' : 'left' }}>{h}</Text>
          ))}
        </View>
        {rows.map((r, i) => (
          <View key={String(r.id)} style={{ flexDirection: 'row', padding: 10, borderTopWidth: 1, borderTopColor: c.border }}>
            <Text style={[std.cell, { color: c.muted, flex: 1 }]}>{i + 1}</Text>
            <Text style={[std.cell, { color: c.ink, flex: 3, fontWeight: '700' }]} numberOfLines={1}>{r.name}</Text>
            {[r.p, r.w, r.d, r.l, r.sf, r.sa, r.pts].map((v, j) => (
              <Text key={j} style={[std.cell, { color: j === 6 ? c.primary : c.ink, fontWeight: j === 6 ? '900' : '500' }]}>{v}</Text>
            ))}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}
const std = StyleSheet.create({ cell: { flex: 1, fontSize: 12, textAlign: 'center' } });

// ── Info section ──────────────────────────────────────────────────
function InfoSection({ info, tournament }: any) {
  const { theme } = useTheme();
  const c = theme.colors;

  const hasContent = !!(
    info?.overview || info?.prize_pool?.length || info?.rules ||
    info?.contact?.entry_fee || info?.contact?.persons?.length ||
    tournament?.description || tournament?.org_name ||
    tournament?.venue || tournament?.city
  );

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>

      {/* Tournament description (top-level field) */}
      {!!tournament?.description && (
        <View style={[inf.box, { backgroundColor: c.surface, borderColor: c.border }]}>
          <Text style={[inf.heading, { color: c.muted }]}>ABOUT</Text>
          <Text style={{ fontSize: 14, color: c.ink, lineHeight: 22 }}>{tournament.description}</Text>
        </View>
      )}

      {/* Overview from tournament_info */}
      {!!info?.overview && !tournament?.description && (
        <View style={[inf.box, { backgroundColor: c.surface, borderColor: c.border }]}>
          <Text style={[inf.heading, { color: c.muted }]}>OVERVIEW</Text>
          <Text style={{ fontSize: 14, color: c.ink, lineHeight: 22 }}>{info.overview}</Text>
        </View>
      )}

      {/* Organiser + Venue */}
      {(tournament?.org_name || tournament?.venue || tournament?.city) && (
        <View style={[inf.box, { backgroundColor: c.surface, borderColor: c.border }]}>
          <Text style={[inf.heading, { color: c.muted }]}>DETAILS</Text>
          {!!tournament.org_name && (
            <View style={inf.row}>
              <Text style={inf.rowLabel}>Organiser</Text>
              <Text style={[inf.rowValue, { color: c.ink }]}>{tournament.org_name}</Text>
            </View>
          )}
          {!!tournament.venue && (
            <View style={[inf.row, { borderTopWidth: 1, borderTopColor: c.border }]}>
              <Text style={inf.rowLabel}>Venue</Text>
              <Text style={[inf.rowValue, { color: c.ink }]}>{tournament.venue}</Text>
            </View>
          )}
          {(tournament.city || tournament.state) && (
            <View style={[inf.row, { borderTopWidth: tournament.venue ? 1 : 0, borderTopColor: c.border }]}>
              <Text style={inf.rowLabel}>Location</Text>
              <Text style={[inf.rowValue, { color: c.ink }]}>{[tournament.city, tournament.state].filter(Boolean).join(', ')}</Text>
            </View>
          )}
          {(tournament.start_date || tournament.end_date) && (
            <View style={[inf.row, { borderTopWidth: 1, borderTopColor: c.border }]}>
              <Text style={inf.rowLabel}>Date</Text>
              <Text style={[inf.rowValue, { color: c.ink }]}>
                {tournament.start_date
                  ? new Date(tournament.start_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
                  : ''}
                {tournament.end_date && tournament.end_date !== tournament.start_date
                  ? ' – ' + new Date(tournament.end_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
                  : ''}
              </Text>
            </View>
          )}
        </View>
      )}

      {/* Prize pool */}
      {info?.prize_pool?.length > 0 && (
        <View style={[inf.box, { backgroundColor: c.surface, borderColor: c.border }]}>
          <Text style={[inf.heading, { color: c.muted }]}>PRIZE POOL</Text>
          {info.prize_pool.map((p: any, i: number) => (
            <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderTopWidth: i > 0 ? 1 : 0, borderTopColor: c.border }}>
              <Text style={{ color: c.muted, fontSize: 13 }}>{p.category} · {p.position}</Text>
              <Text style={{ color: c.ink, fontWeight: '700', fontSize: 13 }}>{p.amount}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Rules */}
      {!!info?.rules && (
        <View style={[inf.box, { backgroundColor: c.surface, borderColor: c.border }]}>
          <Text style={[inf.heading, { color: c.muted }]}>RULES</Text>
          <Text style={{ fontSize: 14, color: c.ink, lineHeight: 22 }}>{info.rules}</Text>
        </View>
      )}

      {/* Registration & contact */}
      {(info?.contact?.entry_fee || info?.contact?.persons?.length > 0) && (
        <View style={[inf.box, { backgroundColor: c.surface, borderColor: c.border }]}>
          <Text style={[inf.heading, { color: c.muted }]}>REGISTRATION & CONTACT</Text>
          {!!info.contact.entry_fee && (
            <Text style={{ fontSize: 14, color: c.ink, marginBottom: 6 }}>
              Entry fee: <Text style={{ fontWeight: '700' }}>{info.contact.entry_fee}</Text>
            </Text>
          )}
          {!!info.contact.reg_deadline && (
            <Text style={{ fontSize: 13, color: c.muted, marginBottom: 8 }}>Deadline: {info.contact.reg_deadline}</Text>
          )}
          {info.contact.persons?.map((p: any, i: number) => (
            <Text key={i} style={{ fontSize: 13, color: c.muted }}>{p.name}{p.phone ? ` · ${p.phone}` : ''}</Text>
          ))}
        </View>
      )}

      {/* Empty state */}
      {!hasContent && (
        <View style={{ alignItems: 'center', paddingVertical: 48 }}>
          <Text style={{ fontSize: 32, marginBottom: 12 }}>📋</Text>
          <Text style={{ fontSize: 14, color: c.muted, textAlign: 'center' }}>
            No information added yet.
          </Text>
        </View>
      )}

    </ScrollView>
  );
}
const inf = StyleSheet.create({
  box:      { borderRadius: 12, borderWidth: 1.5, padding: 16 },
  heading:  { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 11, fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 10 },
  row:      { flexDirection: 'row', paddingVertical: 8 },
  rowLabel: { fontSize: 12, fontWeight: '700', color: '#888', width: 90 },
  rowValue: { fontSize: 13, fontWeight: '500', flex: 1 },
});

// ── Teams section ─────────────────────────────────────────────────
function TeamsSection({ events, theme }: any) {
  const c = theme.colors;
  const participants = events.flatMap((ev: any) =>
    ev.participants
      ? ev.participants
      : [...(ev.ungrouped_players ?? []), ...(ev.groups ?? []).flatMap((g: any) => g.players ?? [])]
  );
  return (
    <ScrollView contentContainerStyle={{ padding: 16 }}>
      {participants.length === 0
        ? <Text style={{ color: c.muted, textAlign: 'center', marginTop: 32 }}>No participants yet.</Text>
        : participants.map((p: any) => (
          <View key={p.id ?? p.player_id ?? p.ep_id} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.border }}>
            <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: c.elevated, alignItems: 'center', justifyContent: 'center', marginRight: 10 }}>
              <Text style={{ fontSize: 14, fontWeight: '800', color: c.muted }}>{(p.name ?? '?')[0].toUpperCase()}</Text>
            </View>
            <Text style={{ fontSize: 14, fontWeight: '600', color: c.ink }}>{p.name}</Text>
            {(p.group ?? p.seed_level) && (
              <Text style={{ marginLeft: 'auto', fontSize: 11, color: c.muted }}>{p.group ?? p.seed_level}</Text>
            )}
          </View>
        ))
      }
    </ScrollView>
  );
}

// ── Main screen ───────────────────────────────────────────────────
export default function TournamentPublicScreen() {
  const { slug }     = useLocalSearchParams<{ slug: string }>();
  const { theme }    = useTheme();
  const router       = useRouter();
  const c            = theme.colors;

  const [t,          setT]       = useState<any>(null);
  const [loading,    setLoading] = useState(true);
  const [activeTab,  setActiveTab] = useState('fixtures');
  const isFetchingRef              = useRef(false);

  const load = useCallback(async () => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    try {
      const data = await apiGetTournamentBySlug(slug);
      // API returns { tournament: {...}, events: [...] }
      // Flatten so t.name / t.city / etc. work directly
      const flat = data.tournament
        ? { ...data.tournament, events: data.events ?? [] }
        : data;
      setT(flat);
    } catch {}
    finally {
      isFetchingRef.current = false;
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { const id = setInterval(load, 8000); return () => clearInterval(id); }, [load]);

  useTournamentSocket({
    slug,
    onData: (payload) => {
      setT((prev: any) => {
        if (!prev) return prev;
        const flat = payload.tournament
          ? { ...payload.tournament, events: payload.events ?? prev.events }
          : payload;
        return { ...prev, ...flat };
      });
    },
  });

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
        <ActivityIndicator style={{ flex: 1 }} color={c.primary} />
      </SafeAreaView>
    );
  }
  if (!t) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
        <Text style={{ color: c.muted, textAlign: 'center', marginTop: 40 }}>Tournament not found.</Text>
      </SafeAreaView>
    );
  }

  // ── Derived data ─────────────────────────────────────────────────
  const events: any[]  = t.events ?? [];
  const allMatches     = events.flatMap((ev: any) => ev.all_matches ?? []);
  const liveMatches    = allMatches.filter((m: any) => m.status === 'live');
  const doneMatches    = allMatches.filter((m: any) => m.status === 'done');
  const liveCount      = liveMatches.length;
  const isTeamSport    = events.some((ev: any) => ev.participant_type === 'team');
  const primarySport   = events[0]?.sport_key;
  const sportColor     = SPORT_COLORS[primarySport] ?? c.primary;
  const hasStandings   = events.some((ev: any) => ev.format === 'round_robin' || ev.format === 'group_knockout');
  const hasKnockout    = allMatches.some((m: any) => ['semi', 'final', 'quarter'].includes(m.stage));
  const hasInfo        = !!(t.tournament_info?.overview || t.tournament_info?.prize_pool?.length || t.tournament_info?.rules);
  const canRegister    = t.status === 'registration';

  // Participant count
  const participantCount = events.reduce((acc: number, ev: any) => {
    const ps = ev.participants
      ? ev.participants
      : [...(ev.ungrouped_players ?? []), ...(ev.groups ?? []).flatMap((g: any) => g.players ?? [])];
    return acc + ps.length;
  }, 0);

  // Format label e.g. "direct_knockout" → "Direct Knockout"
  const formatLabel = events[0]?.format
    ? events[0].format.replace(/_/g, ' ').replace(/\b\w/g, (ch: string) => ch.toUpperCase())
    : null;

  // Stats strip
  const statsItems = [
    { label: 'Matches', val: allMatches.length,   color: c.ink },
    ...(liveCount > 0  ? [{ label: 'Live',  val: liveCount,           color: c.primary  }] : []),
    { label: 'Done',    val: doneMatches.length,   color: '#16a34a' },
    ...(participantCount > 0 ? [{ label: isTeamSport ? 'Teams' : 'Players', val: participantCount, color: c.muted }] : []),
  ];

  const tabs = [
    { id: 'fixtures',  label: 'Fixtures', count: allMatches.length },
    { id: 'teams',     label: isTeamSport ? 'Teams' : 'Players' },
    ...(hasStandings ? [{ id: 'standings', label: 'Standings' }] : []),
    ...(hasKnockout  ? [{ id: 'bracket',   label: 'Road to Final' }] : []),
    { id: 'info', label: 'Info' },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: c.bg }}>

        {/* Ticker bar — only shown when matches are live */}
        <TickerBar matches={liveMatches} />

        {/* Back + share */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10 }}>
          <TouchableOpacity
            onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)' as any)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 6, paddingRight: 12 }}>
            <Text style={{ color: c.muted, fontSize: 18, lineHeight: 20 }}>←</Text>
            <Text style={{ fontFamily: F.bold, fontSize: 13, fontWeight: '600', color: c.muted }}>Back</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => Share.share({
              title:   t.name,
              message: `${t.name} — Live on TheScoreBoard\n${shareUrl.tournament(t.slug)}`,
            })}
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 5,
              borderWidth: 1.5, borderColor: c.primary,
              borderRadius: 8, paddingHorizontal: 14, paddingVertical: 7,
            }}>
            <Text style={{ fontFamily: F.bold, fontSize: 12, fontWeight: '700', color: c.primary }}>Share</Text>
            <Text style={{ fontSize: 12, color: c.primary, fontWeight: '700' }}>↗</Text>
          </TouchableOpacity>
        </View>

        {/* Hero */}
        <View style={{ paddingHorizontal: 16, paddingBottom: 14 }}>

          {/* Pills: live · sport · format · status */}
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
            {liveCount > 0 && (
              <View style={[h.pill, { backgroundColor: c.primary + '20', borderColor: c.primary + '55' }]}>
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: c.primary, marginRight: 4 }} />
                <Text style={[h.pillText, { color: c.primary }]}>LIVE NOW</Text>
              </View>
            )}
            {primarySport && (
              <View style={[h.pill, { backgroundColor: sportColor + '15', borderColor: sportColor + '44' }]}>
                <Text style={[h.pillText, { color: sportColor }]}>{(SPORT_LABELS[primarySport] ?? '').toUpperCase()}</Text>
              </View>
            )}
            {formatLabel && (
              <View style={[h.pill, { backgroundColor: c.elevated, borderColor: c.border }]}>
                <Text style={[h.pillText, { color: c.muted }]}>{formatLabel.toUpperCase()}</Text>
              </View>
            )}
            {t.status && t.status !== 'live' && (
              <View style={[h.pill, { backgroundColor: (STATUS_COLORS[t.status] ?? '#888') + '22', borderColor: (STATUS_COLORS[t.status] ?? '#888') + '44' }]}>
                <Text style={[h.pillText, { color: STATUS_COLORS[t.status] ?? '#888' }]}>{(STATUS_LABELS[t.status] ?? t.status).toUpperCase()}</Text>
              </View>
            )}
          </View>

          {/* Tournament name */}
          <Text style={[h.name, { color: c.ink }]} numberOfLines={3}>
            {t.name ? t.name.toUpperCase() : ''}
          </Text>

          {/* Date + location */}
          {(t.start_date || t.city || t.state) && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 8 }}>
              {!!t.start_date && (
                <Text style={[h.meta, { color: c.muted }]}>
                  {new Date(t.start_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                  {t.end_date && t.end_date !== t.start_date
                    ? ' – ' + new Date(t.end_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
                    : ''}
                </Text>
              )}
              {(t.city || t.state) && (
                <Text style={[h.meta, { color: c.muted }]}>
                  {[t.city, t.state].filter(Boolean).join(', ')}
                </Text>
              )}
              {!!t.org_name && (
                <Text style={[h.meta, { color: c.muted }]}>by {t.org_name}</Text>
              )}
            </View>
          )}

          {/* Description / overview */}
          {!!(t.description || t.tournament_info?.overview) && (
            <Text style={{ fontSize: 13, color: c.muted, lineHeight: 20, marginTop: 10 }} numberOfLines={4}>
              {t.description || t.tournament_info?.overview}
            </Text>
          )}

          {/* Stats strip */}
          {allMatches.length > 0 && (
            <View style={[h.statsStrip, { borderColor: c.border }]}>
              {statsItems.map((s, i) => (
                <View
                  key={s.label}
                  style={[h.statCell, { borderRightWidth: i < statsItems.length - 1 ? 1 : 0, borderRightColor: c.border }]}>
                  <Text style={{ fontSize: 22, fontWeight: '900', color: s.color, lineHeight: 26 }}>{s.val}</Text>
                  <Text style={{ fontSize: 9, color: c.muted, fontWeight: '700', letterSpacing: 1.2, marginTop: 3, textTransform: 'uppercase' }}>{s.label}</Text>
                </View>
              ))}
            </View>
          )}


          {/* Register button */}
          {canRegister && (
            <TouchableOpacity
              onPress={() => router.push(`/register/${t.slug}`)}
              style={[h.regBtn, { backgroundColor: c.primary }]}>
              <Text style={{ fontFamily: F.display, color: '#fff', fontSize: 12, letterSpacing: 0.5, textTransform: 'uppercase' }}>
                Register Now →
              </Text>
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
        <ScrollView contentContainerStyle={{ padding: 16 }}>
          {events.map((ev: any) => (
            <View key={ev.event_id}>
              {t.is_multi_sport && <Text style={{ color: c.muted, fontWeight: '700', marginBottom: 8 }}>{ev.name}</Text>}
              <RoadToFinal matches={ev.all_matches ?? []} />
            </View>
          ))}
        </ScrollView>
      )}
      {activeTab === 'info' && <InfoSection info={t.tournament_info} tournament={t} />}
    </View>
  );
}

const h = StyleSheet.create({
  pill:       { flexDirection: 'row', alignItems: 'center', borderRadius: 4, borderWidth: 1.5, paddingHorizontal: 10, paddingVertical: 4 },
  pillText:   { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  name:       { fontFamily: 'Unbounded_900Black', fontSize: 22, fontWeight: '900', letterSpacing: -0.5, lineHeight: 30 },
  meta:       { fontFamily: 'SpaceGrotesk_400Regular', fontSize: 12 },
  statsStrip: { flexDirection: 'row', borderRadius: 12, borderWidth: 1, overflow: 'hidden', marginTop: 14 },
  statCell:   { flex: 1, alignItems: 'center', paddingVertical: 12, paddingHorizontal: 4 },
  regBtn:     { borderRadius: 8, paddingVertical: 14, alignItems: 'center', marginTop: 16, minHeight: 52 },
});
