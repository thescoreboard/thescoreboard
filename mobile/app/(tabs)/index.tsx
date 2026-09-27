/**
 * Home screen — role-aware.
 *   Guest     → Spotlight discovery page (warm cream, featured hero + rails)
 *   Player    → personalised feed (4 category cards · Near You · Match Updates · Closing Soon · Recently Viewed)
 *   Organiser → quick-create + live tournament feed
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  RefreshControl, ActivityIndicator, Pressable, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path } from 'react-native-svg';
import { useTheme }    from '../../src/hooks/useTheme';
import { useAuthStore } from '../../src/store/auth';
import { apiGetHomepage, apiGetMyTournaments, apiGetDashboard } from '../../src/api/client';
import { getRecentlyViewed, RecentTournament } from '../../src/utils/recentlyViewed';
import { storage } from '../../src/utils/storage';
import TournamentCard from '../../src/components/shared/TournamentCard';
import { F, SPORT_COLORS, SPORT_LABELS, STATUS_LABELS, STATUS_COLORS, SPORT_ICONS } from '../../src/theme';

// ── Warm palette for the guest Spotlight view ────────────────────────────────
const WARM = {
  bg:      '#FAF7F0',
  surface: '#FFFFFF',
  border:  '#E9DECB',
  ink:     '#211C14',
  muted:   '#7A6F5D',
  subtle:  '#A99D88',
};
const PRIMARY = '#FF6B35';
const GREEN   = '#22c55e';

// ─── helpers ─────────────────────────────────────────────────────────────────

function cityMatch(t: any, city: string): boolean {
  if (!city) return false;
  return (t.location ?? '').toLowerCase().includes(city.toLowerCase());
}

const sportOf = (t: any): string => t.sport_key ?? t.events?.[0]?.sport_key ?? '';
const cityOf  = (t: any): string => t.city ?? t.location ?? '';

// ── Tiny SVG icons ────────────────────────────────────────────────────────────
const IconPin = ({ size = 14, color = PRIMARY }: { size?: number; color?: string }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path d="M12 2C8.1 2 5 5.1 5 9c0 5.2 7 13 7 13s7-7.8 7-13c0-3.9-3.1-7-7-7Zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5Z" fill={color} />
  </Svg>
);
const IconChevron = ({ size = 12, color = WARM.muted }: { size?: number; color?: string }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path d="m6 9 6 6 6-6" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" fill="none" />
  </Svg>
);
const IconPlay = ({ size = 13, color = '#fff' }: { size?: number; color?: string }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24"><Path d="M6 4l14 8-14 8z" fill={color} /></Svg>
);
const IconArrow = ({ size = 12, color = WARM.muted }: { size?: number; color?: string }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path d="M5 12h14M13 6l6 6-6 6" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" fill="none" />
  </Svg>
);
const IconSearch = ({ size = 16, color = WARM.subtle }: { size?: number; color?: string }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0Z" stroke={color} strokeWidth={2} strokeLinecap="round" fill="none" />
  </Svg>
);

function LiveDot({ size = 6, color = '#fff' }: { size?: number; color?: string }) {
  return <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }} />;
}

// ── Watch Live button ─────────────────────────────────────────────────────────
function WatchLiveButton({ onPress, accent = PRIMARY }: { onPress: () => void; accent?: string }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [wl.btn, { backgroundColor: '#fff', opacity: pressed ? 0.85 : 1 }]}>
      <IconPlay color={accent} />
      <Text style={[wl.txt, { color: accent }]}>WATCH LIVE</Text>
    </Pressable>
  );
}
const wl = StyleSheet.create({
  btn: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 9, paddingHorizontal: 15, paddingVertical: 9 },
  txt: { fontFamily: F.display, fontSize: 9.5, letterSpacing: 0.8 },
});

// ── Featured hero card ────────────────────────────────────────────────────────
function FeaturedHero({ t, router }: { t: any; router: any }) {
  const sk     = sportOf(t);
  const accent = SPORT_COLORS[sk] ?? PRIMARY;
  const isLive = t.status === 'live' || (t.live_count ?? 0) > 0;
  const meta   = [cityOf(t), t.total_players ? `${t.total_players} players` : null].filter(Boolean);

  return (
    <LinearGradient
      colors={[accent, shadeColor(accent, -30)]}
      start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
      style={fh.hero}
    >
      {/* Large faded sport watermark */}
      <Text style={fh.watermark}>{SPORT_ICONS[sk] ?? '🏆'}</Text>

      {/* Badge */}
      <View style={fh.badge}>
        <LiveDot size={6} color="#fff" />
        <Text style={fh.badgeTxt}>{isLive ? 'FEATURED · LIVE NOW' : 'FEATURED'}</Text>
      </View>

      <Text style={fh.title} numberOfLines={2}>{(t.name ?? '').toUpperCase()}</Text>

      {meta.length > 0 && (
        <View style={fh.metaRow}>
          {meta.map((m, i) => (
            <Text key={i} style={fh.metaTxt}>{m}</Text>
          ))}
        </View>
      )}

      <View style={fh.actions}>
        <WatchLiveButton accent={accent} onPress={() => router.push(`/t/${t.slug}` as any)} />
        <Pressable onPress={() => router.push(`/t/${t.slug}` as any)} style={({ pressed }) => [fh.follow, { opacity: pressed ? 0.8 : 1 }]}>
          <Text style={fh.followTxt}>FOLLOW</Text>
        </Pressable>
      </View>
    </LinearGradient>
  );
}
const fh = StyleSheet.create({
  hero:      { marginHorizontal: 16, marginBottom: 22, borderRadius: 20, paddingHorizontal: 20, paddingTop: 18, paddingBottom: 20, overflow: 'hidden' },
  watermark: { position: 'absolute', top: -30, right: -12, fontSize: 130, opacity: 0.15 },
  badge:     { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', backgroundColor: 'rgba(0,0,0,0.22)', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5, marginBottom: 14 },
  badgeTxt:  { fontFamily: F.display, fontSize: 8.5, color: '#fff', letterSpacing: 1.5 },
  title:     { fontFamily: F.display, fontSize: 22, color: '#fff', letterSpacing: -1, lineHeight: 25, marginBottom: 9 },
  metaRow:   { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginBottom: 16 },
  metaTxt:   { fontSize: 12, color: 'rgba(255,255,255,0.9)', fontWeight: '600' },
  actions:   { flexDirection: 'row', gap: 10 },
  follow:    { backgroundColor: 'rgba(0,0,0,0.22)', borderRadius: 9, paddingHorizontal: 18, paddingVertical: 9, justifyContent: 'center' },
  followTxt: { fontFamily: F.display, fontSize: 9.5, color: '#fff', letterSpacing: 0.5 },
});

// ── Search bar (shown when no featured tournament) ────────────────────────────
function SearchBar({ router }: { router: any }) {
  const [query, setQuery] = useState('');
  return (
    <Pressable
      onPress={() => router.push('/(tabs)/explore' as any)}
      style={sb.wrap}
    >
      <View style={sb.inner} pointerEvents="none">
        <IconSearch size={16} color={WARM.subtle} />
        <Text style={sb.placeholder}>Search tournaments, sports, venues</Text>
      </View>
    </Pressable>
  );
}
const sb = StyleSheet.create({
  wrap:        { marginHorizontal: 16, marginBottom: 22 },
  inner:       { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: WARM.surface, borderWidth: 1.5, borderColor: WARM.border, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14 },
  placeholder: { fontSize: 14, color: WARM.subtle, flex: 1 },
});

// ── Rail card (horizontal scroll tile) ───────────────────────────────────────
function RailCard({ t, onPress }: { t: any; onPress: () => void }) {
  const sk = sportOf(t);
  const accent = SPORT_COLORS[sk] ?? '#888';
  const isLive = t.status === 'live' || (t.live_count ?? 0) > 0;
  const spotsLeft = t.max_participants && t.total_players
    ? t.max_participants - t.total_players
    : null;

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [rc.card, { borderTopColor: accent, opacity: pressed ? 0.85 : 1 }]}>
      <View style={rc.top}>
        <View style={rc.emojiBox}>
          <Text style={rc.emoji}>{SPORT_ICONS[sk] ?? '🏆'}</Text>
        </View>
        {isLive ? (
          <View style={rc.liveRow}>
            <LiveDot size={6} color={PRIMARY} />
            <Text style={[rc.liveTxt, { color: PRIMARY }]}>LIVE</Text>
          </View>
        ) : spotsLeft != null ? (
          <Text style={[rc.spotsTxt, { color: GREEN }]}>{spotsLeft} spots left</Text>
        ) : (
          <Text style={[rc.spotsTxt, { color: GREEN }]}>OPEN</Text>
        )}
      </View>
      <Text style={rc.name} numberOfLines={2}>{(t.name ?? '').toUpperCase()}</Text>
      <View style={{ flex: 1 }} />
      <View style={rc.metaRow}>
        <IconPin size={11} color={WARM.muted} />
        <Text style={rc.metaTxt} numberOfLines={1}>{cityOf(t) || '—'}</Text>
      </View>
    </Pressable>
  );
}
const rc = StyleSheet.create({
  card:     { width: 172, height: 116, backgroundColor: WARM.surface, borderWidth: 1, borderColor: WARM.border, borderTopWidth: 3, borderRadius: 13, padding: 14, marginRight: 11 },
  top:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: 22, marginBottom: 9 },
  emojiBox: { width: 26, height: 22, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  emoji:    { fontSize: 17, includeFontPadding: false },
  liveRow:  { flexDirection: 'row', alignItems: 'center', gap: 4 },
  liveTxt:  { fontFamily: F.display, fontSize: 9, letterSpacing: 1, includeFontPadding: false, lineHeight: 13 },
  spotsTxt: { fontFamily: F.display, fontSize: 9, letterSpacing: 0.5, includeFontPadding: false, lineHeight: 13 },
  name:     { fontFamily: F.display, fontSize: 11.5, color: WARM.ink, letterSpacing: -0.4, lineHeight: 15, includeFontPadding: false },
  metaRow:  { flexDirection: 'row', alignItems: 'center', gap: 5 },
  metaTxt:  { fontSize: 11, color: WARM.muted, flex: 1, includeFontPadding: false, lineHeight: 15 },
});

// ── Horizontal rail section ───────────────────────────────────────────────────
function Rail({ label, items, router }: { label: string; items: any[]; router: any }) {
  if (!items.length) return null;
  return (
    <View style={{ marginBottom: 18 }}>
      <View style={rl.head}>
        <Text style={rl.label}>{label}</Text>
        <Pressable onPress={() => router.push('/(tabs)/explore' as any)} style={rl.allRow}>
          <Text style={rl.all}>All</Text>
          <IconArrow size={12} color={WARM.muted} />
        </Pressable>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, alignItems: 'flex-start' }}>
        {items.map((t) => (
          <RailCard key={t.tournament_id ?? t.slug} t={t} onPress={() => router.push(`/t/${t.slug}` as any)} />
        ))}
        <View style={{ width: 8 }} />
      </ScrollView>
    </View>
  );
}
const rl = StyleSheet.create({
  head:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 10 },
  label:  { fontFamily: F.bold, fontSize: 14, color: WARM.ink, letterSpacing: -0.3 },
  allRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  all:    { fontFamily: F.semi, fontSize: 12, color: WARM.muted },
});

// ── shade helper (darken a hex colour by pct%) ────────────────────────────────
function shadeColor(hex: string, pct: number): string {
  const n = parseInt(hex.replace('#', ''), 16);
  const f = pct / 100;
  const r = Math.max(0, Math.min(255, ((n >> 16) & 0xff) + Math.round(255 * f)));
  const g = Math.max(0, Math.min(255, ((n >>  8) & 0xff) + Math.round(255 * f)));
  const b = Math.max(0, Math.min(255, ( n        & 0xff) + Math.round(255 * f)));
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

// ═════════════════════════════════════════════════════════════════════════════
// Compact horizontal card (used in logged-in views)
// ═════════════════════════════════════════════════════════════════════════════

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
          <Text style={[mc.sportText, { fontFamily: F.display, color: accent }]}>{SPORT_LABELS[sportKey] ?? sportKey}</Text>
        </View>
        <View style={[mc.statusPill, { backgroundColor: stColor + '18' }]}>
          <View style={[mc.dot, { backgroundColor: stColor }]} />
          <Text style={[mc.statusText, { fontFamily: F.display, color: stColor }]}>{STATUS_LABELS[t.status] ?? t.status}</Text>
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
      <Text style={[rvc.sport, { fontFamily: F.display, color: accent }]}>{SPORT_LABELS[t.sportKey] ?? t.sportKey}</Text>
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
      <Text style={[ccat.label, { fontFamily: F.semi, color: c.muted }]}>{label}</Text>
      <View style={[ccat.bar, { backgroundColor: accent }]} />
    </Pressable>
  );
}
const ccat = StyleSheet.create({
  card:  { flex:1, borderRadius:12, borderWidth:1.5, borderLeftWidth:4, padding:16, minHeight:92, justifyContent:'space-between' },
  count: { fontSize:32, fontWeight:'900', letterSpacing:-1, lineHeight:36 },
  label: { fontSize:11, letterSpacing:0, marginTop:4 },
  bar:   { height:2, width:24, borderRadius:2, marginTop:8 },
});

// ─── Section header ───────────────────────────────────────────────────────────

function SectionHead({ label, title, count, accent }: { label?:string; title:string; count?:number; accent?:string }) {
  const { theme } = useTheme();
  const c = theme.colors;
  const ac = accent ?? c.primary;
  return (
    <View style={sh.wrap}>
      {label && <Text style={[sh.label, { fontFamily: F.semi, color: ac }]}>{label}</Text>}
      <View style={sh.row}>
        <View style={[sh.bar, { backgroundColor: ac }]} />
        <Text style={[sh.title, { fontFamily: F.bold, color: c.ink }]}>{title}</Text>
        {count != null && count > 0 && (
          <View style={[sh.badge, { backgroundColor: ac + '20' }]}>
            <Text style={[sh.badgeText, { fontFamily: F.semi, color: ac }]}>{count}</Text>
          </View>
        )}
      </View>
    </View>
  );
}
const sh = StyleSheet.create({
  wrap:      { paddingHorizontal:16, paddingTop:22, paddingBottom:10 },
  label:     { fontSize:11, letterSpacing:0.3, marginBottom:5 },
  row:       { flexDirection:'row', alignItems:'center', gap:8 },
  bar:       { width:3, height:18, borderRadius:2 },
  title:     { fontSize:17, letterSpacing:-0.4, flex:1 },
  badge:     { borderRadius:10, paddingHorizontal:9, paddingVertical:3 },
  badgeText: { fontSize:12 },
});

// ─── Organiser command centre ─────────────────────────────────────────────────

function OrgStatBox({ label, value, accent, c }: { label:string; value:number|string; accent:string; c:any }) {
  return (
    <View style={[os.statBox, { backgroundColor: c.surface, borderColor: accent + '30', borderTopColor: accent }]}>
      <Text style={[os.statValue, { fontFamily: F.display, color: accent }]}>{value}</Text>
      <Text style={[os.statLabel, { fontFamily: F.semi, color: c.muted }]}>{label}</Text>
    </View>
  );
}

function OrgQuickAction({ label, sub, accent, onPress, c }: { label:string; sub:string; accent:string; onPress:()=>void; c:any }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [os.actionCard, { backgroundColor: accent, opacity: pressed ? 0.85 : 1 }]}
    >
      <Text style={[os.actionLabel, { fontFamily: F.bold }]}>{label}</Text>
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
            <Text style={[os.sportTagText, { fontFamily: F.display, color: accent }]}>
              {SPORT_LABELS[t.sport_key ?? ''] ?? t.sport_key ?? ''}
            </Text>
          </View>
          <View style={[os.stTag, { backgroundColor: stColor + '18' }]}>
            <View style={[os.stDot, { backgroundColor: stColor }]} />
            <Text style={[os.stText, { fontFamily: F.display, color: stColor }]}>
              {STATUS_LABELS[t.status] ?? t.status}
            </Text>
          </View>
        </View>
        <Text style={[os.tournName, { fontFamily: F.bold, color: c.ink }]} numberOfLines={1}>{t.name}</Text>
        {t.location && <Text style={[os.tournLoc, { fontFamily: F.body, color: c.muted }]}>{t.location}</Text>}
      </Pressable>
      <Pressable onPress={onManage} style={[os.manageBtn, { backgroundColor: c.primary }]}>
        <Text style={[os.manageBtnText, { fontFamily: F.bold }]}>Manage</Text>
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
          <Text style={[os.greetSub, { fontFamily: F.semi, color: c.muted }]}>Command centre</Text>
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

      {myLive.length > 0 && (
        <>
          <SectionHead label="Happening now" title="Your live tournaments" count={myLive.length} accent={c.primary} />
          <View style={{ paddingHorizontal:16, gap:10 }}>
            {myLive.map((t: any) => (
              <OrgTournamentRow key={t.tournament_id} t={t} c={c}
                onPress={() => router.push(`/t/${t.slug}` as any)}
                onManage={() => router.push(`/organiser/tournament/${t.tournament_id}` as any)}
              />
            ))}
          </View>
        </>
      )}

      {myUpcoming.length > 0 && (
        <>
          <SectionHead label="Registration open" title="Upcoming tournaments" count={myUpcoming.length} accent="#22c55e" />
          <View style={{ paddingHorizontal:16, gap:10 }}>
            {myUpcoming.map((t: any) => (
              <OrgTournamentRow key={t.tournament_id} t={t} c={c}
                onPress={() => router.push(`/t/${t.slug}` as any)}
                onManage={() => router.push(`/organiser/tournament/${t.tournament_id}` as any)}
              />
            ))}
          </View>
        </>
      )}

      {myDraft.length > 0 && (
        <>
          <SectionHead label="Drafts" title="In progress" count={myDraft.length} accent="#888" />
          <View style={{ paddingHorizontal:16, gap:10 }}>
            {myDraft.map((t: any) => (
              <OrgTournamentRow key={t.tournament_id} t={t} c={c}
                onPress={() => router.push(`/t/${t.slug}` as any)}
                onManage={() => router.push(`/organiser/tournament/${t.tournament_id}` as any)}
              />
            ))}
          </View>
        </>
      )}

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
        </View>
      )}

      {liveNow.length > 0 && (
        <>
          <SectionHead label="Community" title="Live right now" count={liveNow.length} accent="#3b82f6" />
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

const os = StyleSheet.create({
  greet:       { flexDirection:'row', alignItems:'center', justifyContent:'space-between', paddingHorizontal:16, paddingTop:18, paddingBottom:14, borderBottomWidth:1 },
  greetSub:    { fontSize:12, letterSpacing:0, marginBottom:3 },
  greetName:   { fontSize:22, fontWeight:'900', letterSpacing:-0.8 },
  newBtn:      { borderRadius:8, paddingHorizontal:16, paddingVertical:10 },
  newBtnText:  { color:'#fff', fontSize:10, fontWeight:'900', textTransform:'uppercase', letterSpacing:0.5 },
  statsRow:    { flexDirection:'row', paddingHorizontal:16, paddingTop:16, paddingBottom:4, gap:8 },
  statBox:     { flex:1, borderRadius:10, borderWidth:1.5, borderTopWidth:3, padding:12, alignItems:'center', gap:3 },
  statValue:   { fontSize:22, fontWeight:'900', letterSpacing:-1 },
  statLabel:   { fontSize:10, letterSpacing:0 },
  actionsRow:  { flexDirection:'row', paddingHorizontal:16, paddingVertical:12, gap:10 },
  actionCard:  { flex:1, borderRadius:12, padding:16, gap:3 },
  actionLabel: { color:'#fff', fontSize:13, letterSpacing:-0.3 },
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
});

// ═════════════════════════════════════════════════════════════════════════════
// Main screen
// ═════════════════════════════════════════════════════════════════════════════

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

  const loadVersionRef = useRef(0);
  const scrollRef      = useRef<ScrollView>(null);
  const sectionY       = useRef<Record<string, number>>({});

  const load = useCallback(async () => {
    const version = ++loadVersionRef.current;
    try {
      const personalPromise = (loggedIn && token)
        ? (isOrganiser ? apiGetDashboard(token) : apiGetMyTournaments(token))
        : Promise.resolve(null);

      const [homeRes, rv, personalData] = await Promise.all([
        apiGetHomepage(),
        getRecentlyViewed(),
        personalPromise,
      ]);

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
      if (version === loadVersionRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [loggedIn, token, isOrganiser]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { const id = setInterval(load, 20000); return () => clearInterval(id); }, [load]);

  const trending: any[]   = data?.trending ?? [];
  const sports: any[]     = data?.sports   ?? [];
  const totalLive: number = data?.total_live_matches ?? 0;
  const city              = preferences?.city ?? '';

  const liveNow     = trending.filter(t => t.status === 'live' || t.status === 'fixtures');
  const nearYou     = city ? trending.filter(t => cityMatch(t, city)) : [];
  const closingSoon = trending.filter(t => t.status === 'registration');
  const featured    = liveNow[0] ?? closingSoon[0] ?? null;
  const firstName   = user?.name?.split(' ')[0] ?? '';

  const scrollTo = (key: string) => {
    const y = sectionY.current[key];
    if (y != null) scrollRef.current?.scrollTo({ y, animated: true });
  };

  // ── Loading state ─────────────────────────────────────────────────────────
  if (loading) {
    const loadBg = loggedIn ? c.bg : WARM.bg;
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: loadBg }}>
        <ActivityIndicator style={{ flex: 1 }} color={PRIMARY} />
      </SafeAreaView>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // GUEST VIEW — Spotlight design
  // ══════════════════════════════════════════════════════════════════════════
  if (!loggedIn) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: WARM.bg }} edges={['top']}>
        {/* Header */}
        <View style={gs.header}>
          <Text style={gs.brand}>
            THE<Text style={{ color: PRIMARY }}>SCORE</Text>BOARD
          </Text>
          <Pressable onPress={() => router.push('/(auth)/login')} style={({ pressed }) => [gs.signIn, { opacity: pressed ? 0.85 : 1 }]}>
            <Text style={gs.signInTxt}>SIGN IN</Text>
          </Pressable>
        </View>

        {/* Headline + city chip */}
        <View style={gs.headlineRow}>
          <Text style={gs.headline}>Find your{'\n'}next match</Text>
          <Pressable style={gs.cityChip}>
            <IconPin size={13} color={PRIMARY} />
            <Text style={gs.cityTxt}>{city || 'Near You'}</Text>
            <IconChevron size={12} color={WARM.muted} />
          </Pressable>
        </View>

        {/* Scrollable content */}
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingTop: 4, paddingBottom: 120 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); load(); }}
              tintColor={PRIMARY}
            />
          }
        >
          {/* Featured hero OR search bar if no tournaments */}
          {featured
            ? <FeaturedHero t={featured} router={router} />
            : <SearchBar router={router} />
          }

          {/* Live Now rail */}
          <Rail label="Live now" items={liveNow} router={router} />

          {/* Closing Soon rail */}
          <Rail label="Closing soon" items={closingSoon} router={router} />

          {/* Empty state — nothing at all */}
          {liveNow.length === 0 && closingSoon.length === 0 && (
            <View style={gs.emptyState}>
              <Text style={gs.emptyEmoji}>🏆</Text>
              <Text style={gs.emptyTitle}>No tournaments yet</Text>
              <Text style={gs.emptySub}>Check back soon — tournaments are added every day.</Text>
            </View>
          )}
        </ScrollView>

        {/* Bottom-pinned CTAs (fade over content) */}
        <LinearGradient
          colors={['rgba(250,247,240,0)', WARM.bg, WARM.bg]}
          style={gs.pinned}
          pointerEvents="box-none"
        >
          <View style={gs.pinnedRow}>
            <Pressable
              onPress={async () => {
                await storage.setItem('tsb_intent', 'player');
                router.push('/(auth)/register' as any);
              }}
              style={({ pressed }) => [gs.ctaPrimary, { opacity: pressed ? 0.9 : 1 }]}
            >
              <Text style={gs.ctaPrimaryTxt}>REGISTER TO PLAY</Text>
            </Pressable>
            <Pressable
              onPress={async () => {
                await storage.setItem('tsb_intent', 'organiser');
                router.push('/(auth)/login');
              }}
              style={({ pressed }) => [gs.ctaSecondary, { opacity: pressed ? 0.9 : 1 }]}
            >
              <Text style={gs.ctaSecondaryTxt}>ORGANISE</Text>
            </Pressable>
          </View>
        </LinearGradient>
      </SafeAreaView>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // LOGGED-IN VIEWS (player / organiser)
  // ══════════════════════════════════════════════════════════════════════════
  return (
    <SafeAreaView style={{ flex:1, backgroundColor: c.bg }}>
      {/* Header */}
      <View style={[s.header, { borderBottomColor: c.border }]}>
        <Text style={[s.brand, { color: c.ink }]}>
          THE<Text style={{ color: c.primary }}>SCORE</Text>BOARD
        </Text>
        <View style={{ flexDirection:'row', gap:8, alignItems:'center' }}>
          <TouchableOpacity onPress={toggle} style={[s.themeBtn, { borderColor: c.border }]}>
            <Text style={[s.themeBtnTxt, { color: c.muted }]}>{theme.isDark ? 'LIGHT' : 'DARK'}</Text>
          </TouchableOpacity>
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
        {/* ── PLAYER VIEW ── */}
        {isPlayer && (
          <>
            {/* Greeting */}
            <View style={[s.greetWrap, { paddingHorizontal:16, paddingTop:18, paddingBottom:4 }]}>
              <View>
                <Text style={[s.greetHi, { fontFamily: F.semi, color: c.muted }]}>Good day,</Text>
                <Text style={[s.greetName, { fontFamily: F.display, color: c.ink }]}>{firstName || 'Player'}</Text>
              </View>
              {city ? (
                <View style={[s.cityPill, { backgroundColor: c.elevated, borderColor: c.border }]}>
                  <Text style={[s.cityTxt, { fontFamily: F.display, color: c.muted }]}>{city}</Text>
                </View>
              ) : null}
            </View>

            {totalLive > 0 && (
              <View style={[s.livePulse, { backgroundColor: c.primary + '14', borderColor: c.primary + '40' }]}>
                <View style={[s.liveDot, { backgroundColor: c.primary }]} />
                <Text style={[s.livePulseText, { fontFamily: F.semi, color: c.primary }]}>
                  {totalLive} match{totalLive !== 1 ? 'es' : ''} live right now
                </Text>
              </View>
            )}

            {/* 2×2 category grid */}
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

            {nearYou.length > 0 && (
              <View onLayout={e => { sectionY.current['near-you'] = e.nativeEvent.layout.y; }}>
                <SectionHead label="Your location" title="Near you" count={nearYou.length} accent="#22c55e" />
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal:16 }}>
                  {nearYou.slice(0, 8).map((t: any) => (
                    <MiniCard key={t.tournament_id} t={t} onPress={() => router.push(`/t/${t.slug}` as any)} />
                  ))}
                </ScrollView>
              </View>
            )}

            {liveNow.length > 0 && (
              <View onLayout={e => { sectionY.current['match-updates'] = e.nativeEvent.layout.y; }}>
                <SectionHead label="Happening now" title="Match updates" count={liveNow.length} accent={c.primary} />
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal:16 }}>
                  {liveNow.slice(0, 8).map((t: any) => (
                    <MiniCard key={t.tournament_id} t={t} onPress={() => router.push(`/t/${t.slug}` as any)} />
                  ))}
                </ScrollView>
              </View>
            )}

            {closingSoon.length > 0 && (
              <View onLayout={e => { sectionY.current['closing-soon'] = e.nativeEvent.layout.y; }}>
                <SectionHead label="Register now" title="Closing soon" count={closingSoon.length} accent="#D97706" />
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal:16 }}>
                  {closingSoon.slice(0, 8).map((t: any) => (
                    <MiniCard key={t.tournament_id} t={t} onPress={() => router.push(`/t/${t.slug}` as any)} />
                  ))}
                </ScrollView>
              </View>
            )}

            {recents.length > 0 && (
              <View onLayout={e => { sectionY.current['recently-viewed'] = e.nativeEvent.layout.y; }}>
                <SectionHead label="Pick up where you left off" title="Recently viewed" count={recents.length} accent="#38bdf8" />
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal:16 }}>
                  {recents.map(t => (
                    <RecentCard key={t.slug} t={t} onPress={() => router.push(`/t/${t.slug}` as any)} />
                  ))}
                </ScrollView>
              </View>
            )}

            <TouchableOpacity
              onPress={() => router.push('/(tabs)/explore' as any)}
              style={[s.exploreCta, { backgroundColor: c.primary }]}
            >
              <Text style={[s.exploreCtaText, { fontFamily: F.bold }]}>Browse all tournaments</Text>
            </TouchableOpacity>
          </>
        )}

        {/* ── ORGANISER VIEW ── */}
        {isOrganiser && (
          <OrganiserHome
            myTourneys={myTourneys}
            liveNow={liveNow}
            firstName={firstName}
            c={c}
            router={router}
          />
        )}

        <View style={{ height: 48 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Guest Spotlight styles ───────────────────────────────────────────────────
const gs = StyleSheet.create({
  header:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 6, paddingBottom: 12 },
  brand:        { fontFamily: F.display, fontSize: 16, color: WARM.ink, letterSpacing: -0.8 },
  signIn:       { backgroundColor: PRIMARY, borderRadius: 9, paddingHorizontal: 16, paddingVertical: 9 },
  signInTxt:    { fontFamily: F.display, fontSize: 10, color: '#fff', letterSpacing: 0.4 },

  headlineRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 4, paddingBottom: 16 },
  headline:     { fontFamily: F.display, fontSize: 24, color: WARM.ink, letterSpacing: -1, lineHeight: 28, maxWidth: 200 },
  cityChip:     { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: WARM.surface, borderWidth: 1, borderColor: WARM.border, borderRadius: 999, paddingHorizontal: 11, paddingVertical: 7 },
  cityTxt:      { fontFamily: F.display, fontSize: 12, color: WARM.ink },

  emptyState:   { alignItems: 'center', paddingTop: 40, paddingHorizontal: 32, gap: 10 },
  emptyEmoji:   { fontSize: 48 },
  emptyTitle:   { fontFamily: F.display, fontSize: 16, color: WARM.ink, letterSpacing: -0.3 },
  emptySub:     { fontSize: 13, color: WARM.muted, textAlign: 'center', lineHeight: 20 },

  pinned:       { position: 'absolute', left: 0, right: 0, bottom: 0, paddingTop: 28 },
  pinnedRow:    { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingBottom: 14 },
  ctaPrimary:   { flex: 1, backgroundColor: PRIMARY, borderRadius: 13, paddingVertical: 15, alignItems: 'center', shadowColor: PRIMARY, shadowOpacity: 0.35, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 6 },
  ctaPrimaryTxt:{ fontFamily: F.display, fontSize: 10.5, color: '#fff', letterSpacing: 0.4 },
  ctaSecondary: { flex: 1, backgroundColor: WARM.surface, borderWidth: 1.5, borderColor: WARM.border, borderRadius: 13, paddingVertical: 15, alignItems: 'center' },
  ctaSecondaryTxt: { fontFamily: F.display, fontSize: 10.5, color: WARM.ink, letterSpacing: 0.4 },
});

// ─── Logged-in view styles ────────────────────────────────────────────────────
const s = StyleSheet.create({
  header:       { flexDirection:'row', alignItems:'center', justifyContent:'space-between', paddingHorizontal:16, height:56, borderBottomWidth:1.5 },
  brand:        { fontSize:18, fontFamily:'Unbounded_900Black', letterSpacing:-1 },
  themeBtn:     { borderRadius:6, borderWidth:1, paddingHorizontal:8, paddingVertical:5 },
  themeBtnTxt:  { fontSize:9, fontWeight:'800', letterSpacing:0.5 },
  signInBtn:    { borderRadius:8, paddingHorizontal:14, paddingVertical:8 },
  signInTxt:    { color:'#fff', fontSize:10, fontWeight:'900', textTransform:'uppercase', letterSpacing:0.4 },

  exploreCta:     { marginHorizontal:16, marginTop:20, borderRadius:10, paddingVertical:14, alignItems:'center' },
  exploreCtaText: { color:'#fff', fontSize:13, letterSpacing:-0.2 },

  greetWrap:  { flexDirection:'row', alignItems:'center', justifyContent:'space-between' },
  greetHi:    { fontSize:13, letterSpacing:0, marginBottom:2 },
  greetName:  { fontSize:20, fontWeight:'900', letterSpacing:-0.8 },
  cityPill:   { borderRadius:20, borderWidth:1.5, paddingHorizontal:12, paddingVertical:6 },
  cityTxt:    { fontSize:11, fontWeight:'700' },

  livePulse:     { flexDirection:'row', alignItems:'center', marginHorizontal:16, marginTop:10, borderRadius:8, borderWidth:1.5, paddingHorizontal:12, paddingVertical:9, gap:8 },
  liveDot:       { width:7, height:7, borderRadius:4 },
  livePulseText: { fontSize:13 },

  grid:    { paddingHorizontal:16, paddingTop:14, gap:10 },
  gridRow: { flexDirection:'row', gap:10 },
});
