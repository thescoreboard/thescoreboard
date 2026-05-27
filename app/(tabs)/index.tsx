/**
 * Home screen — role-aware.
 *   Guest     → landing page (hero · stats · live · how-it-works · player/organiser cards)
 *   Player    → personalised feed (4 category cards · Near You · Match Updates · Closing Soon · Recently Viewed)
 *   Organiser → quick-create + live tournament feed
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  RefreshControl, ActivityIndicator, Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTheme }    from '../../src/hooks/useTheme';
import { useAuthStore } from '../../src/store/auth';
import { apiGetHomepage, apiGetMyTournaments, apiGetDashboard } from '../../src/api/client';
import { getRecentlyViewed, RecentTournament } from '../../src/utils/recentlyViewed';
import TournamentCard from '../../src/components/shared/TournamentCard';
import { F, SPORT_COLORS, SPORT_LABELS, STATUS_LABELS, STATUS_COLORS } from '../../src/theme';

// ─── helpers ─────────────────────────────────────────────────────────────────

function cityMatch(t: any, city: string): boolean {
  if (!city) return false;
  return (t.location ?? '').toLowerCase().includes(city.toLowerCase());
}

// ─── Compact horizontal card ─────────────────────────────────────────────────

function MiniCard({ t, onPress }: { t: any; onPress: () => void }) {
  const { theme } = useTheme();
  const c         = theme.colors;
  const sportKey  = t.sport_key ?? t.events?.[0]?.sport_key ?? '';
  const accent    = SPORT_COLORS[sportKey] ?? '#888';
  const stColor   = STATUS_COLORS[t.status] ?? '#888';

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [mc.card, { backgroundColor: c.elevated, borderColor: c.border, opacity: pressed ? 0.8 : 1 }]}
    >
      <View style={mc.topRow}>
        <View style={[mc.sportTag, { backgroundColor: accent + '18', borderColor: accent + '40' }]}>
          <Text style={[mc.sportText, { fontFamily: F.bold, color: accent }]}>{SPORT_LABELS[sportKey] ?? sportKey}</Text>
        </View>
        <View style={[mc.statusPill, { backgroundColor: stColor + '18' }]}>
          <View style={[mc.dot, { backgroundColor: stColor }]} />
          <Text style={[mc.statusText, { fontFamily: F.bold, color: stColor }]}>{STATUS_LABELS[t.status] ?? t.status}</Text>
        </View>
      </View>
      <Text style={[mc.name, { fontFamily: F.bold, color: c.ink }]} numberOfLines={2}>{t.name}</Text>
      {t.location ? <Text style={[mc.loc, { fontFamily: F.body, color: c.muted }]} numberOfLines={1}>{t.location}</Text> : null}
    </Pressable>
  );
}
const mc = StyleSheet.create({
  card:       { width:200, borderRadius:12, borderWidth:1.5, padding:14, marginRight:10, gap:8 },
  topRow:     { flexDirection:'row', alignItems:'center', justifyContent:'space-between', gap:6 },
  sportTag:   { borderRadius:6, borderWidth:1, paddingHorizontal:8, paddingVertical:3 },
  sportText:  { fontSize:9, fontWeight:'800', textTransform:'uppercase', letterSpacing:0.5 },
  statusPill: { flexDirection:'row', alignItems:'center', borderRadius:6, paddingHorizontal:7, paddingVertical:3, gap:4 },
  dot:        { width:5, height:5, borderRadius:3 },
  statusText: { fontSize:9, fontWeight:'800', textTransform:'uppercase', letterSpacing:0.4 },
  name:       { fontSize:13, fontWeight:'700', lineHeight:18 },
  loc:        { fontSize:11 },
});

// ─── Recently viewed card ────────────────────────────────────────────────────

function RecentCard({ t, onPress }: { t: RecentTournament; onPress: () => void }) {
  const { theme } = useTheme();
  const c = theme.colors;
  const accent = SPORT_COLORS[t.sportKey] ?? '#888';
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [rvc.card, { backgroundColor: c.elevated, borderColor: c.border, borderLeftColor: accent, opacity: pressed ? 0.8 : 1 }]}
    >
      <Text style={[rvc.sport, { fontFamily: F.bold, color: accent }]}>{SPORT_LABELS[t.sportKey] ?? t.sportKey}</Text>
      <Text style={[rvc.name, { fontFamily: F.bold, color: c.ink }]} numberOfLines={2}>{t.name}</Text>
      <Text style={[rvc.status, { fontFamily: F.body, color: c.muted }]}>{STATUS_LABELS[t.status] ?? t.status}</Text>
    </Pressable>
  );
}
const rvc = StyleSheet.create({
  card:   { width:170, borderRadius:12, borderWidth:1.5, borderLeftWidth:4, padding:14, marginRight:10, gap:6 },
  sport:  { fontSize:9, fontWeight:'800', textTransform:'uppercase', letterSpacing:0.5 },
  name:   { fontSize:13, fontWeight:'700', lineHeight:18 },
  status: { fontSize:11 },
});

// ─── Category card (2×2 grid) ────────────────────────────────────────────────

function CategoryCard({ label, count, accent, onPress }: { label:string; count:number; accent:string; onPress:()=>void }) {
  const { theme } = useTheme();
  const c = theme.colors;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [ccat.card, { backgroundColor: c.surface, borderColor: accent + '40', borderLeftColor: accent, opacity: pressed ? 0.85 : 1 }]}
    >
      <Text style={[ccat.count, { fontFamily: F.display, color: accent }]}>{count}</Text>
      <Text style={[ccat.label, { fontFamily: F.bold, color: c.muted }]}>{label}</Text>
      <View style={[ccat.bar, { backgroundColor: accent }]} />
    </Pressable>
  );
}
const ccat = StyleSheet.create({
  card:  { flex:1, borderRadius:12, borderWidth:1.5, borderLeftWidth:4, padding:16, minHeight:92, justifyContent:'space-between' },
  count: { fontSize:32, fontWeight:'900', letterSpacing:-1, lineHeight:36 },
  label: { fontSize:10, fontWeight:'700', textTransform:'uppercase', letterSpacing:0.6, marginTop:4 },
  bar:   { height:2, width:24, borderRadius:2, marginTop:8 },
});

// ─── Section header ───────────────────────────────────────────────────────────

function SectionHead({ label, title, count, accent }: { label?:string; title:string; count?:number; accent?:string }) {
  const { theme } = useTheme();
  const c = theme.colors;
  const ac = accent ?? c.primary;
  return (
    <View style={sh.wrap}>
      {label && <Text style={[sh.label, { fontFamily: F.bold, color: ac }]}>{label}</Text>}
      <View style={sh.row}>
        <View style={[sh.bar, { backgroundColor: ac }]} />
        <Text style={[sh.title, { fontFamily: F.display, color: c.ink }]}>{title}</Text>
        {count != null && count > 0 && (
          <View style={[sh.badge, { backgroundColor: ac + '20' }]}>
            <Text style={[sh.badgeText, { fontFamily: F.bold, color: ac }]}>{count}</Text>
          </View>
        )}
      </View>
    </View>
  );
}
const sh = StyleSheet.create({
  wrap:      { paddingHorizontal:16, paddingTop:24, paddingBottom:10 },
  label:     { fontSize:10, fontWeight:'800', textTransform:'uppercase', letterSpacing:1, marginBottom:6 },
  row:       { flexDirection:'row', alignItems:'center', gap:8 },
  bar:       { width:3, height:16, borderRadius:2 },
  title:     { fontSize:13, fontWeight:'900', letterSpacing:-0.2, flex:1 },
  badge:     { borderRadius:10, paddingHorizontal:9, paddingVertical:3 },
  badgeText: { fontSize:11, fontWeight:'700' },
});

// ─── How it works step card ───────────────────────────────────────────────────

function StepCard({ num, title, desc, accent }: { num:string; title:string; desc:string; accent:string }) {
  const { theme } = useTheme();
  const c = theme.colors;
  return (
    <View style={[step.card, { backgroundColor: c.surface, borderColor: c.border }]}>
      <View style={step.topRow}>
        <View style={[step.numBadge, { backgroundColor: accent + '20' }]}>
          <Text style={[step.numText, { fontFamily: F.display, color: accent }]}>{num}</Text>
        </View>
        <Text style={[step.watermark, { fontFamily: F.display, color: accent + '18' }]}>{num}</Text>
      </View>
      <Text style={[step.title, { fontFamily: F.bold, color: c.ink }]}>{title}</Text>
      <Text style={[step.desc, { fontFamily: F.body, color: c.muted }]}>{desc}</Text>
    </View>
  );
}
const step = StyleSheet.create({
  card:     { borderRadius:16, borderWidth:1.5, padding:20, marginBottom:12 },
  topRow:   { flexDirection:'row', alignItems:'center', justifyContent:'space-between', marginBottom:16 },
  numBadge: { borderRadius:8, paddingHorizontal:10, paddingVertical:6 },
  numText:  { fontSize:14, fontWeight:'900', letterSpacing:0.5 },
  watermark:{ fontSize:64, fontWeight:'900', letterSpacing:-4, lineHeight:68 },
  title:    { fontSize:16, fontWeight:'800', marginBottom:8 },
  desc:     { fontSize:13, lineHeight:20 },
});

// ─── Value proposition card (dark) ───────────────────────────────────────────

function ValueCard({ forLabel, title, desc, checks, accent, btnLabel, onPress }: {
  forLabel: string; title: string; desc: string;
  checks: string[]; accent: string;
  btnLabel: string; onPress: () => void;
}) {
  return (
    <View style={[vc.card, { backgroundColor: '#111827' }]}>
      <Text style={[vc.forLabel, { fontFamily: F.bold, color: accent }]}>{forLabel}</Text>
      <Text style={[vc.title, { fontFamily: F.bold }]}>{title}</Text>
      <Text style={[vc.desc, { fontFamily: F.body }]}>{desc}</Text>
      <View style={vc.checks}>
        {checks.map(item => (
          <View key={item} style={vc.checkRow}>
            <Text style={[vc.tick, { color: accent }]}>✓</Text>
            <Text style={[vc.checkText, { fontFamily: F.body }]}>{item}</Text>
          </View>
        ))}
      </View>
      <TouchableOpacity onPress={onPress} style={[vc.btn, { backgroundColor: accent }]}>
        <Text style={[vc.btnText, { fontFamily: F.display }]}>{btnLabel}</Text>
      </TouchableOpacity>
    </View>
  );
}
const vc = StyleSheet.create({
  card:      { borderRadius:16, padding:24, marginHorizontal:16, marginBottom:12 },
  forLabel:  { fontSize:10, fontWeight:'800', textTransform:'uppercase', letterSpacing:1, marginBottom:10 },
  title:     { fontSize:22, fontWeight:'900', color:'#fff', lineHeight:28, marginBottom:10, letterSpacing:-0.5 },
  desc:      { fontSize:13, color:'rgba(255,255,255,0.6)', lineHeight:20, marginBottom:16 },
  checks:    { gap:8, marginBottom:20 },
  checkRow:  { flexDirection:'row', alignItems:'flex-start', gap:10 },
  tick:      { fontSize:13, fontWeight:'900', marginTop:1 },
  checkText: { fontSize:13, color:'rgba(255,255,255,0.75)', lineHeight:20, flex:1 },
  btn:       { borderRadius:10, paddingVertical:13, alignItems:'center' },
  btnText:   { color:'#fff', fontSize:11, fontWeight:'900', textTransform:'uppercase', letterSpacing:0.5 },
});

// ─── Main screen ─────────────────────────────────────────────────────────────

// ─── Organiser command centre ─────────────────────────────────────────────────

function OrgStatBox({ label, value, accent, c }: { label:string; value:number|string; accent:string; c:any }) {
  return (
    <View style={[os.statBox, { backgroundColor: c.surface, borderColor: accent + '30', borderTopColor: accent }]}>
      <Text style={[os.statValue, { fontFamily: F.display, color: accent }]}>{value}</Text>
      <Text style={[os.statLabel, { fontFamily: F.bold, color: c.muted }]}>{label}</Text>
    </View>
  );
}

function OrgQuickAction({ label, sub, accent, onPress, c }: { label:string; sub:string; accent:string; onPress:()=>void; c:any }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [os.actionCard, { backgroundColor: accent, opacity: pressed ? 0.85 : 1 }]}
    >
      <Text style={[os.actionLabel, { fontFamily: F.display }]}>{label}</Text>
      <Text style={[os.actionSub, { fontFamily: F.body }]}>{sub}</Text>
    </Pressable>
  );
}

function OrgTournamentRow({ t, onPress, onManage, c }: { t:any; onPress:()=>void; onManage:()=>void; c:any }) {
  const accent      = SPORT_COLORS[t.sport_key ?? t.events?.[0]?.sport_key ?? ''] ?? '#888';
  const stColor     = STATUS_COLORS[t.status] ?? '#888';
  return (
    <View style={[os.tournRow, { backgroundColor: c.surface, borderColor: c.border, borderLeftColor: accent }]}>
      <Pressable onPress={onPress} style={{ flex:1 }}>
        <View style={os.tournTop}>
          <View style={[os.sportTag, { backgroundColor: accent + '18', borderColor: accent + '40' }]}>
            <Text style={[os.sportTagText, { fontFamily: F.bold, color: accent }]}>
              {SPORT_LABELS[t.sport_key ?? ''] ?? t.sport_key ?? ''}
            </Text>
          </View>
          <View style={[os.stTag, { backgroundColor: stColor + '18' }]}>
            <View style={[os.stDot, { backgroundColor: stColor }]} />
            <Text style={[os.stText, { fontFamily: F.bold, color: stColor }]}>
              {STATUS_LABELS[t.status] ?? t.status}
            </Text>
          </View>
        </View>
        <Text style={[os.tournName, { fontFamily: F.bold, color: c.ink }]} numberOfLines={1}>{t.name}</Text>
        {t.location && <Text style={[os.tournLoc, { fontFamily: F.body, color: c.muted }]}>{t.location}</Text>}
      </Pressable>
      <Pressable onPress={onManage} style={[os.manageBtn, { backgroundColor: c.primary }]}>
        <Text style={[os.manageBtnText, { fontFamily: F.display }]}>Manage</Text>
      </Pressable>
    </View>
  );
}

function OrganiserHome({ myTourneys, liveNow, firstName, c, router }: {
  myTourneys: any[]; liveNow: any[]; firstName: string; c: any; router: any;
}) {
  const myLive      = myTourneys.filter((t: any) => t.status === 'live' || t.status === 'fixtures');
  const myUpcoming  = myTourneys.filter((t: any) => t.status === 'registration');
  const myDraft     = myTourneys.filter((t: any) => t.status === 'draft');
  const myCompleted = myTourneys.filter((t: any) => t.status === 'completed');

  return (
    <>
      {/* Greeting */}
      <View style={[os.greet, { borderBottomColor: c.border }]}>
        <View>
          <Text style={[os.greetSub, { fontFamily: F.body, color: c.muted }]}>Command Centre</Text>
          <Text style={[os.greetName, { fontFamily: F.display, color: c.ink }]}>{firstName || 'Organiser'}</Text>
        </View>
        <Pressable
          onPress={() => router.push('/organiser/create' as any)}
          style={({ pressed }) => [os.newBtn, { backgroundColor: c.primary, opacity: pressed ? 0.85 : 1 }]}
        >
          <Text style={[os.newBtnText, { fontFamily: F.display }]}>+ Create</Text>
        </Pressable>
      </View>

      {/* Stats strip */}
      <View style={os.statsRow}>
        <OrgStatBox label="Total"     value={myTourneys.length}  accent={c.primary} c={c} />
        <OrgStatBox label="Live Now"  value={myLive.length}      accent="#FF6B35"   c={c} />
        <OrgStatBox label="Open"      value={myUpcoming.length}  accent="#22c55e"   c={c} />
        <OrgStatBox label="Completed" value={myCompleted.length} accent="#888"      c={c} />
      </View>

      {/* Quick actions */}
      <View style={os.actionsRow}>
        <OrgQuickAction
          label="New Tournament"
          sub="Create & publish"
          accent={c.primary}
          c={c}
          onPress={() => router.push('/organiser/create' as any)}
        />
        <OrgQuickAction
          label="Manage"
          sub="Fixtures, scores & teams"
          accent="#1e293b"
          c={c}
          onPress={() => router.push('/(tabs)/organiser' as any)}
        />
      </View>

      {/* My Live / Active tournaments */}
      {myLive.length > 0 && (
        <>
          <SectionHead label="HAPPENING NOW" title="Your Live Tournaments" count={myLive.length} accent={c.primary} />
          <View style={{ paddingHorizontal:16, gap:10 }}>
            {myLive.map((t: any) => (
              <OrgTournamentRow
                key={t.tournament_id}
                t={t}
                c={c}
                onPress={() => router.push(`/t/${t.slug}` as any)}
                onManage={() => router.push(`/organiser/tournament/${t.tournament_id}` as any)}
              />
            ))}
          </View>
        </>
      )}

      {/* My Upcoming (registration open) */}
      {myUpcoming.length > 0 && (
        <>
          <SectionHead label="REGISTRATION OPEN" title="Upcoming Tournaments" count={myUpcoming.length} accent="#22c55e" />
          <View style={{ paddingHorizontal:16, gap:10 }}>
            {myUpcoming.map((t: any) => (
              <OrgTournamentRow
                key={t.tournament_id}
                t={t}
                c={c}
                onPress={() => router.push(`/t/${t.slug}` as any)}
                onManage={() => router.push(`/organiser/tournament/${t.tournament_id}` as any)}
              />
            ))}
          </View>
        </>
      )}

      {/* Drafts */}
      {myDraft.length > 0 && (
        <>
          <SectionHead label="DRAFTS" title="In Progress" count={myDraft.length} accent="#888" />
          <View style={{ paddingHorizontal:16, gap:10 }}>
            {myDraft.map((t: any) => (
              <OrgTournamentRow
                key={t.tournament_id}
                t={t}
                c={c}
                onPress={() => router.push(`/t/${t.slug}` as any)}
                onManage={() => router.push(`/organiser/tournament/${t.tournament_id}` as any)}
              />
            ))}
          </View>
        </>
      )}

      {/* Empty state */}
      {myTourneys.length === 0 && (
        <View style={os.emptyWrap}>
          <Text style={[os.emptyTitle, { fontFamily: F.display, color: c.ink }]}>No tournaments yet</Text>
          <Text style={[os.emptySub, { fontFamily: F.body, color: c.muted }]}>
            Create your first tournament and invite players to register.
          </Text>
          <Pressable
            onPress={() => router.push('/organiser/create' as any)}
            style={({ pressed }) => [os.emptyBtn, { backgroundColor: c.primary, opacity: pressed ? 0.85 : 1 }]}
          >
            <Text style={[os.emptyBtnText, { fontFamily: F.display }]}>Create Tournament</Text>
          </Pressable>
          <Pressable
            onPress={() => router.push('/(tabs)/explore' as any)}
            style={({ pressed }) => [os.emptyBtnOutline, { borderColor: c.border, opacity: pressed ? 0.7 : 1 }]}
          >
            <Text style={[os.emptyBtnOutlineText, { fontFamily: F.bold, color: c.muted }]}>Read Feature Guides</Text>
          </Pressable>
        </View>
      )}

      {/* Community live */}
      {liveNow.length > 0 && (
        <>
          <SectionHead label="COMMUNITY" title="Live Right Now" count={liveNow.length} accent="#3b82f6" />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal:16 }}>
            {liveNow.slice(0, 6).map((t: any) => (
              <MiniCard key={t.tournament_id} t={t} onPress={() => router.push(`/t/${t.slug}` as any)} />
            ))}
          </ScrollView>
        </>
      )}
    </>
  );
}

// Organiser home styles
const os = StyleSheet.create({
  greet:       { flexDirection:'row', alignItems:'center', justifyContent:'space-between', paddingHorizontal:16, paddingTop:18, paddingBottom:14, borderBottomWidth:1 },
  greetSub:    { fontSize:10, fontWeight:'700', textTransform:'uppercase', letterSpacing:0.6, marginBottom:3 },
  greetName:   { fontSize:22, fontWeight:'900', letterSpacing:-0.8 },
  newBtn:      { borderRadius:8, paddingHorizontal:16, paddingVertical:10 },
  newBtnText:  { color:'#fff', fontSize:10, fontWeight:'900', textTransform:'uppercase', letterSpacing:0.5 },

  statsRow:    { flexDirection:'row', paddingHorizontal:16, paddingTop:16, paddingBottom:4, gap:8 },
  statBox:     { flex:1, borderRadius:10, borderWidth:1.5, borderTopWidth:3, padding:12, alignItems:'center', gap:3 },
  statValue:   { fontSize:22, fontWeight:'900', letterSpacing:-1 },
  statLabel:   { fontSize:9, fontWeight:'700', textTransform:'uppercase', letterSpacing:0.4 },

  actionsRow:  { flexDirection:'row', paddingHorizontal:16, paddingVertical:12, gap:10 },
  actionCard:  { flex:1, borderRadius:12, padding:16, gap:3 },
  actionLabel: { color:'#fff', fontSize:12, fontWeight:'900', letterSpacing:-0.3 },
  actionSub:   { color:'rgba(255,255,255,0.7)', fontSize:11 },

  tournRow:    { flexDirection:'row', alignItems:'center', borderRadius:12, borderWidth:1.5, borderLeftWidth:4, padding:14, gap:10 },
  tournTop:    { flexDirection:'row', alignItems:'center', gap:6, marginBottom:6 },
  sportTag:    { borderRadius:6, borderWidth:1, paddingHorizontal:8, paddingVertical:3 },
  sportTagText:{ fontSize:9, fontWeight:'800', textTransform:'uppercase', letterSpacing:0.4 },
  stTag:       { flexDirection:'row', alignItems:'center', borderRadius:6, paddingHorizontal:8, paddingVertical:3, gap:4 },
  stDot:       { width:5, height:5, borderRadius:3 },
  stText:      { fontSize:9, fontWeight:'800', textTransform:'uppercase', letterSpacing:0.4 },
  tournName:   { fontSize:14, fontWeight:'700', marginBottom:2 },
  tournLoc:    { fontSize:11 },
  manageBtn:   { borderRadius:8, paddingHorizontal:12, paddingVertical:8 },
  manageBtnText:{ color:'#fff', fontSize:10, fontWeight:'900', textTransform:'uppercase', letterSpacing:0.3 },

  emptyWrap:       { alignItems:'center', padding:40, gap:12 },
  emptyTitle:      { fontSize:16, fontWeight:'900' },
  emptySub:        { fontSize:13, textAlign:'center', lineHeight:20 },
  emptyBtn:        { borderRadius:10, paddingVertical:14, paddingHorizontal:28, alignItems:'center' },
  emptyBtnText:    { color:'#fff', fontSize:11, fontWeight:'900', textTransform:'uppercase', letterSpacing:0.5 },
  emptyBtnOutline: { borderRadius:10, paddingVertical:12, paddingHorizontal:28, alignItems:'center', borderWidth:1.5, marginTop:4 },
  emptyBtnOutlineText: { fontSize:12, fontWeight:'700' },
});

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const { theme, toggle } = useTheme();
  const router            = useRouter();
  const { isLoggedIn, mode, preferences, user, token } = useAuthStore();
  const c = theme.colors;

  const loggedIn    = isLoggedIn();
  const isPlayer    = loggedIn && mode === 'player';
  const isOrganiser = loggedIn && mode === 'organiser';

  const [data,       setData]       = useState<any>(null);
  const [myTourneys, setMyTourneys] = useState<any[]>([]);
  const [recents,    setRecents]    = useState<RecentTournament[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Version counter — each call gets a unique ID so stale results from
  // a superseded load (e.g. auth hydrating mid-flight) are silently dropped.
  const loadVersionRef = useRef(0);
  const scrollRef      = useRef<ScrollView>(null);
  const sectionY       = useRef<Record<string, number>>({});

  const load = useCallback(async () => {
    const version = ++loadVersionRef.current;
    try {
      // ── Fire ALL three calls in parallel — no sequential waiting ──
      // Personal data starts immediately, not after homepage returns.
      const personalPromise = (loggedIn && token)
        ? (isOrganiser ? apiGetDashboard(token) : apiGetMyTournaments(token))
        : Promise.resolve(null);

      const [homeRes, rv, personalData] = await Promise.all([
        apiGetHomepage(),
        getRecentlyViewed(),
        personalPromise,
      ]);

      // Ignore stale results — a newer load has already started
      // (e.g. auth hydrated while this request was in-flight)
      if (version !== loadVersionRef.current) return;

      setData(homeRes);
      setRecents(rv);

      if (personalData) {
        if (isOrganiser) {
          const orgs: any[] = personalData?.orgs ?? [];
          setMyTourneys(orgs.flatMap((o: any) =>
            (o.tournaments ?? []).map((t: any) => ({ ...t, org_name: o.name, org_id: o.org_id }))
          ));
        } else {
          setMyTourneys(Array.isArray(personalData) ? personalData : personalData?.tournaments ?? []);
        }
      }
    } catch {}
    finally {
      // Only update loading state if this is still the latest load
      if (version === loadVersionRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [loggedIn, token, isOrganiser]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { const id = setInterval(load, 20000); return () => clearInterval(id); }, [load]);

  if (loading) {
    return (
      <SafeAreaView style={{ flex:1, backgroundColor: c.bg }}>
        <ActivityIndicator style={{ flex:1 }} color={c.primary} />
      </SafeAreaView>
    );
  }

  const trending: any[]   = data?.trending ?? [];
  const sports: any[]     = data?.sports   ?? [];
  const totalLive: number = data?.total_live_matches ?? 0;
  const city              = preferences?.city ?? '';

  const liveNow     = trending.filter(t => t.status === 'live' || t.status === 'fixtures');
  const nearYou     = city ? trending.filter(t => cityMatch(t, city)) : [];
  const closingSoon = trending.filter(t => t.status === 'registration');
  const myActive    = myTourneys.filter((t: any) => t.status === 'live' || t.status === 'fixtures');
  const firstName   = user?.name?.split(' ')[0] ?? '';

  // Stats for guest hero
  const totalTournaments = trending.length;
  const sportCount       = sports.filter(s => s.tournament_count > 0).length || 4;

  const scrollTo = (key: string) => {
    const y = sectionY.current[key];
    if (y != null) scrollRef.current?.scrollTo({ y, animated: true });
  };

  return (
    <SafeAreaView style={{ flex:1, backgroundColor: c.bg }}>

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <View style={[s.header, { borderBottomColor: c.border }]}>
        <Text style={[s.brand, { color: c.ink }]}>
          THE<Text style={{ color: c.primary }}>SCORE</Text>BOARD
        </Text>
        <View style={{ flexDirection:'row', gap:8, alignItems:'center' }}>
          <TouchableOpacity onPress={toggle} style={[s.themeBtn, { borderColor: c.border }]}>
            <Text style={[s.themeBtnTxt, { color: c.muted }]}>{theme.isDark ? 'LIGHT' : 'DARK'}</Text>
          </TouchableOpacity>
          {!loggedIn && (
            <TouchableOpacity onPress={() => router.push('/(auth)/login')} style={[s.signInBtn, { backgroundColor: c.primary }]}>
              <Text style={[s.signInTxt, { fontFamily: F.display }]}>Sign In</Text>
            </TouchableOpacity>
          )}
          {isOrganiser && (
            <TouchableOpacity onPress={() => router.push('/organiser/create' as any)} style={[s.signInBtn, { backgroundColor: c.primary }]}>
              <Text style={[s.signInTxt, { fontFamily: F.display }]}>+ New</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={c.primary} />}
      >

        {/* ════════════════════════════════════════════════════════════════
            GUEST VIEW — landing page
        ════════════════════════════════════════════════════════════════ */}
        {!loggedIn && (
          <>
            {/* Live pill */}
            {totalLive > 0 && (
              <View style={s.livePillWrap}>
                <View style={[s.livePill, { backgroundColor: c.primary + '18', borderColor: c.primary + '40' }]}>
                  <View style={[s.liveDot, { backgroundColor: c.primary }]} />
                  <Text style={[s.livePillText, { fontFamily: F.bold, color: c.primary }]}>
                    {totalLive} match{totalLive !== 1 ? 'es' : ''} live now
                  </Text>
                </View>
              </View>
            )}

            {/* Hero */}
            <View style={s.hero}>
              <Text style={[s.heroTitle, { fontFamily: F.display, color: c.ink }]}>
                Your Local Sports Scene,{' '}
                <Text style={{ color: c.primary }}>Live & Trackable</Text>
              </Text>
              <Text style={[s.heroSub, { fontFamily: F.body, color: c.muted }]}>
                Find local tournaments, register to compete, and follow live scores — all in one place. Built for grassroots sports communities.
              </Text>
              <TouchableOpacity
                onPress={() => router.push('/(tabs)/explore' as any)}
                style={[s.heroBtnPrimary, { backgroundColor: c.primary }]}
              >
                <Text style={[s.heroBtnText, { fontFamily: F.display }]}>Find Tournaments</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => router.push('/(auth)/login')}
                style={[s.heroBtnSecondary, { borderColor: c.border }]}
              >
                <Text style={[s.heroBtnSecText, { fontFamily: F.display, color: c.ink }]}>Sign In / Register</Text>
              </TouchableOpacity>
            </View>

            {/* Stats band */}
            <View style={[s.statsBand, { backgroundColor: c.primary }]}>
              <View style={s.statItem}>
                <Text style={[s.statValue, { fontFamily: F.display }]}>{totalTournaments}+</Text>
                <Text style={[s.statLabel, { fontFamily: F.bold }]}>Tournaments</Text>
              </View>
              <View style={[s.statDivider, { backgroundColor: 'rgba(255,255,255,0.3)' }]} />
              <View style={s.statItem}>
                <Text style={[s.statValue, { fontFamily: F.display }]}>{sportCount}</Text>
                <Text style={[s.statLabel, { fontFamily: F.bold }]}>Sports</Text>
              </View>
              <View style={[s.statDivider, { backgroundColor: 'rgba(255,255,255,0.3)' }]} />
              <View style={s.statItem}>
                <Text style={[s.statValue, { fontFamily: F.display }]}>{totalLive}</Text>
                <Text style={[s.statLabel, { fontFamily: F.bold }]}>Live Now</Text>
              </View>
            </View>

            {/* Happening Now */}
            {liveNow.length > 0 && (
              <>
                <SectionHead label="HAPPENING NOW" title="Live & Featured" count={liveNow.length} accent={c.primary} />
                <Text style={[s.happeningSub, { fontFamily: F.body, color: c.muted }]}>
                  {totalLive} match{totalLive !== 1 ? 'es' : ''} in progress right now
                </Text>
                <View style={{ paddingHorizontal:16, gap:10, marginTop:12 }}>
                  {liveNow.slice(0, 3).map((t: any) => (
                    <TournamentCard key={t.tournament_id} tournament={t} onPress={() => router.push(`/t/${t.slug}` as any)} />
                  ))}
                </View>
                {liveNow.length > 3 && (
                  <TouchableOpacity
                    onPress={() => router.push('/(tabs)/explore' as any)}
                    style={[s.viewAllBtn, { backgroundColor: c.primary }]}
                  >
                    <Text style={[s.viewAllText, { fontFamily: F.bold }]}>View All →</Text>
                  </TouchableOpacity>
                )}
              </>
            )}

            {/* Closing Soon */}
            {closingSoon.length > 0 && (
              <>
                <SectionHead label="REGISTER NOW" title="Closing Soon" count={closingSoon.length} accent="#D97706" />
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal:16 }}>
                  {closingSoon.slice(0, 6).map((t: any) => (
                    <MiniCard key={t.tournament_id} t={t} onPress={() => router.push(`/t/${t.slug}` as any)} />
                  ))}
                </ScrollView>
              </>
            )}

            {/* How it works */}
            <View style={s.howSection}>
              <Text style={[s.howLabel, { fontFamily: F.bold, color: c.primary }]}>HOW IT WORKS</Text>
              <Text style={[s.howTitle, { fontFamily: F.display, color: c.ink }]}>
                Get on the field in three steps
              </Text>
            </View>
            <View style={{ paddingHorizontal:16 }}>
              <StepCard num="01" accent={c.primary}
                title="Find Your Tournament"
                desc="Browse local tournaments by sport, city, or skill level. From grassroots leagues to competitive championships."
              />
              <StepCard num="02" accent="#22c55e"
                title="Register & Play"
                desc="Sign up in seconds, get your bracket placement, and receive live updates as the competition unfolds."
              />
              <StepCard num="03" accent="#38bdf8"
                title="Track Your Progress"
                desc="Follow live scores, see your stats, and share your journey with your community."
              />
            </View>

            {/* For Players card */}
            <View style={{ marginTop:16 }}>
              <ValueCard
                forLabel="FOR PLAYERS"
                title="Compete in tournaments near you"
                desc="Browse by sport and location, register in seconds, track your stats, and follow live scores from anywhere."
                checks={[
                  'Find tournaments by sport & city',
                  'Register to play in minutes',
                  'Follow your live scores',
                  'Track stats & tournament history',
                ]}
                accent="#38bdf8"
                btnLabel="Find Tournaments"
                onPress={() => router.push('/(tabs)/explore' as any)}
              />
              <ValueCard
                forLabel="FOR ORGANISERS"
                title="Run tournaments like a pro"
                desc="Create brackets, manage fixtures, score matches live, and share results with your community instantly."
                checks={[
                  'Create brackets in minutes',
                  'Score matches from your phone',
                  'Share live results automatically',
                  'Manage registrations & teams',
                ]}
                accent={c.primary}
                btnLabel="Organise a Tournament"
                onPress={() => router.push('/(auth)/login')}
              />
            </View>

            {/* Explore CTA */}
            <TouchableOpacity
              onPress={() => router.push('/(tabs)/explore' as any)}
              style={[s.exploreCta, { backgroundColor: c.primary }]}
            >
              <Text style={[s.exploreCtaText, { fontFamily: F.display }]}>
                Browse All Tournaments
              </Text>
            </TouchableOpacity>
          </>
        )}

        {/* ════════════════════════════════════════════════════════════════
            PLAYER VIEW — personalised feed
        ════════════════════════════════════════════════════════════════ */}
        {isPlayer && (
          <>
            {/* Greeting */}
            <View style={[s.greetWrap, { paddingHorizontal:16, paddingTop:18, paddingBottom:4 }]}>
              <View>
                <Text style={[s.greetHi, { fontFamily: F.body, color: c.muted }]}>Good day,</Text>
                <Text style={[s.greetName, { fontFamily: F.display, color: c.ink }]}>{firstName || 'Player'}</Text>
              </View>
              {city ? (
                <View style={[s.cityPill, { backgroundColor: c.elevated, borderColor: c.border }]}>
                  <Text style={[s.cityTxt, { fontFamily: F.bold, color: c.muted }]}>{city}</Text>
                </View>
              ) : null}
            </View>

            {/* Live pulse */}
            {totalLive > 0 && (
              <View style={[s.livePulse, { backgroundColor: c.primary + '14', borderColor: c.primary + '40' }]}>
                <View style={[s.liveDot, { backgroundColor: c.primary }]} />
                <Text style={[s.livePulseText, { fontFamily: F.bold, color: c.primary }]}>
                  {totalLive} match{totalLive !== 1 ? 'es' : ''} live right now
                </Text>
              </View>
            )}

            {/* 4 category cards */}
            <View style={s.grid}>
              <View style={s.gridRow}>
                <CategoryCard label="Match Updates"  count={liveNow.length}     accent={c.primary} onPress={() => scrollTo('match-updates')} />
                <CategoryCard label="Near You"       count={nearYou.length}     accent="#22c55e"   onPress={() => scrollTo('near-you')} />
              </View>
              <View style={s.gridRow}>
                <CategoryCard label="Closing Soon"   count={closingSoon.length} accent="#D97706"   onPress={() => scrollTo('closing-soon')} />
                <CategoryCard label="Recently Viewed" count={recents.length}    accent="#38bdf8"   onPress={() => scrollTo('recently-viewed')} />
              </View>
            </View>

            {/* Near You */}
            {nearYou.length > 0 && (
              <View onLayout={e => { sectionY.current['near-you'] = e.nativeEvent.layout.y; }}>
                <SectionHead label="YOUR LOCATION" title="Near You" count={nearYou.length} accent="#22c55e" />
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal:16 }}>
                  {nearYou.slice(0, 8).map((t: any) => (
                    <MiniCard key={t.tournament_id} t={t} onPress={() => router.push(`/t/${t.slug}` as any)} />
                  ))}
                </ScrollView>
              </View>
            )}
            {isPlayer && nearYou.length === 0 && city && (
              <View style={[s.nudge, { borderColor: c.border, backgroundColor: c.elevated }]}>
                <Text style={[s.nudgeTxt, { fontFamily: F.body, color: c.muted }]}>No tournaments found near {city} right now.</Text>
              </View>
            )}

            {/* Match Updates */}
            {liveNow.length > 0 && (
              <View onLayout={e => { sectionY.current['match-updates'] = e.nativeEvent.layout.y; }}>
                <SectionHead label="HAPPENING NOW" title="Match Updates" count={liveNow.length} accent={c.primary} />
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal:16 }}>
                  {liveNow.slice(0, 8).map((t: any) => (
                    <MiniCard key={t.tournament_id} t={t} onPress={() => router.push(`/t/${t.slug}` as any)} />
                  ))}
                </ScrollView>
              </View>
            )}

            {/* Closing Soon */}
            {closingSoon.length > 0 && (
              <View onLayout={e => { sectionY.current['closing-soon'] = e.nativeEvent.layout.y; }}>
                <SectionHead label="REGISTER NOW" title="Closing Soon" count={closingSoon.length} accent="#D97706" />
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal:16 }}>
                  {closingSoon.slice(0, 8).map((t: any) => (
                    <MiniCard key={t.tournament_id} t={t} onPress={() => router.push(`/t/${t.slug}` as any)} />
                  ))}
                </ScrollView>
              </View>
            )}

            {/* Recently Viewed */}
            {recents.length > 0 && (
              <View onLayout={e => { sectionY.current['recently-viewed'] = e.nativeEvent.layout.y; }}>
                <SectionHead label="PICK UP WHERE YOU LEFT OFF" title="Recently Viewed" count={recents.length} accent="#38bdf8" />
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal:16 }}>
                  {recents.map(t => (
                    <RecentCard key={t.slug} t={t} onPress={() => router.push(`/t/${t.slug}` as any)} />
                  ))}
                </ScrollView>
              </View>
            )}

            {/* Explore CTA */}
            <TouchableOpacity
              onPress={() => router.push('/(tabs)/explore' as any)}
              style={[s.exploreCta, { backgroundColor: c.primary }]}
            >
              <Text style={[s.exploreCtaText, { fontFamily: F.display }]}>
                Browse All Tournaments
              </Text>
            </TouchableOpacity>
          </>
        )}

        {/* ════════════════════════════════════════════════════════════════
            ORGANISER VIEW — command centre
        ════════════════════════════════════════════════════════════════ */}
        {isOrganiser && (
          <OrganiserHome
            myTourneys={myTourneys}
            liveNow={liveNow}
            firstName={firstName}
            c={c}
            router={router}
          />
        )}

        <View style={{ height:48 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  // Header
  header:       { flexDirection:'row', alignItems:'center', justifyContent:'space-between', paddingHorizontal:16, height:56, borderBottomWidth:1.5 },
  brand:        { fontSize:18, fontFamily:'Unbounded_900Black', letterSpacing:-1 },
  themeBtn:     { borderRadius:6, borderWidth:1, paddingHorizontal:8, paddingVertical:5 },
  themeBtnTxt:  { fontSize:9, fontWeight:'800', letterSpacing:0.5 },
  signInBtn:    { borderRadius:8, paddingHorizontal:14, paddingVertical:8 },
  signInTxt:    { color:'#fff', fontSize:10, fontWeight:'900', textTransform:'uppercase', letterSpacing:0.4 },

  // Guest hero
  livePillWrap:   { paddingHorizontal:16, paddingTop:16 },
  livePill:       { flexDirection:'row', alignItems:'center', alignSelf:'flex-start', borderRadius:20, borderWidth:1.5, paddingHorizontal:12, paddingVertical:6, gap:7 },
  liveDot:        { width:7, height:7, borderRadius:4 },
  livePillText:   { fontSize:12, fontWeight:'700' },
  hero:           { padding:20, paddingBottom:24, gap:14 },
  heroTitle:      { fontSize:26, fontWeight:'900', letterSpacing:-0.8, lineHeight:34 },
  heroSub:        { fontSize:14, lineHeight:22 },
  heroBtnPrimary: { borderRadius:10, paddingVertical:15, alignItems:'center' },
  heroBtnSecondary:{ borderRadius:10, paddingVertical:14, alignItems:'center', borderWidth:1.5 },
  heroBtnText:    { color:'#fff', fontSize:12, fontWeight:'900', textTransform:'uppercase', letterSpacing:0.6 },
  heroBtnSecText: { fontSize:12, fontWeight:'900', textTransform:'uppercase', letterSpacing:0.6 },

  // Stats band
  statsBand:  { flexDirection:'row', alignItems:'center', justifyContent:'space-around', paddingVertical:20, paddingHorizontal:16, marginHorizontal:16, borderRadius:14 },
  statItem:   { alignItems:'center' },
  statValue:  { fontSize:26, fontWeight:'900', color:'#fff', letterSpacing:-1 },
  statLabel:  { fontSize:9, fontWeight:'700', color:'rgba(255,255,255,0.7)', textTransform:'uppercase', letterSpacing:0.5, marginTop:3 },
  statDivider:{ width:1, height:36 },

  // Happening sub
  happeningSub: { fontSize:13, paddingHorizontal:24, marginTop:-6 },

  // View All button (below live section)
  viewAllBtn:  { alignSelf:'center', marginTop:14, borderRadius:8, paddingHorizontal:22, paddingVertical:10 },
  viewAllText: { color:'#fff', fontSize:11, fontWeight:'800', textTransform:'uppercase', letterSpacing:1 },

  // Explore CTA
  exploreCta:     { marginHorizontal:16, marginTop:20, borderRadius:10, paddingVertical:14, alignItems:'center' },
  exploreCtaText: { color:'#fff', fontSize:11, fontWeight:'900', textTransform:'uppercase', letterSpacing:0.6 },

  // How it works
  howSection: { paddingHorizontal:16, paddingTop:32, paddingBottom:16, alignItems:'center' },
  howLabel:   { fontSize:10, fontWeight:'800', textTransform:'uppercase', letterSpacing:1, marginBottom:10 },
  howTitle:   { fontSize:22, fontWeight:'900', letterSpacing:-0.5, textAlign:'center', lineHeight:30 },

  // Player greeting
  greetWrap:  { flexDirection:'row', alignItems:'center', justifyContent:'space-between' },
  greetHi:    { fontSize:11, fontWeight:'600', textTransform:'uppercase', letterSpacing:0.5, marginBottom:2 },
  greetName:  { fontSize:20, fontWeight:'900', letterSpacing:-0.8 },
  cityPill:   { borderRadius:20, borderWidth:1.5, paddingHorizontal:12, paddingVertical:6 },
  cityTxt:    { fontSize:11, fontWeight:'700' },

  // Live pulse (player mode)
  livePulse:     { flexDirection:'row', alignItems:'center', marginHorizontal:16, marginTop:10, borderRadius:8, borderWidth:1.5, paddingHorizontal:12, paddingVertical:9, gap:8 },
  livePulseText: { fontSize:13, fontWeight:'700' },

  // 2×2 grid
  grid:    { paddingHorizontal:16, paddingTop:14, gap:10 },
  gridRow: { flexDirection:'row', gap:10 },

  // Nudge
  nudge:    { marginHorizontal:16, marginTop:12, borderRadius:10, borderWidth:1.5, padding:14 },
  nudgeTxt: { fontSize:12 },
});
