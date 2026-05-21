/**
 * Match card for public tournament view.
 * Dispatches to sport-specific layouts (cricket, football, default racket sports).
 */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTheme } from '../../hooks/useTheme';
import { STAGE_LABELS } from '../../utils/match';

function StatusBadge({ status, sportKey }: { status: string; sportKey?: string }) {
  const { theme } = useTheme();
  if (status === 'live') {
    return (
      <View style={[sb.badge, { backgroundColor: theme.colors.primary + '22', borderColor: theme.colors.primary + '55' }]}>
        <View style={[sb.dot, { backgroundColor: theme.colors.primary }]} />
        <Text style={[sb.text, { color: theme.colors.primary }]}>LIVE</Text>
      </View>
    );
  }
  if (status === 'done') {
    // "FT" for football, "END" for cricket, "DONE" for racket sports
    const label = sportKey === 'football' ? 'FT'
                : sportKey === 'cricket'  ? 'END'
                : 'DONE';
    return (
      <View style={[sb.badge, { backgroundColor: '#16a34a18', borderColor: '#16a34a55' }]}>
        <Text style={[sb.text, { color: '#16a34a' }]}>{label}</Text>
      </View>
    );
  }
  return null;
}
const sb = StyleSheet.create({
  badge: { flexDirection:'row', alignItems:'center', borderRadius: 999, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 3, gap: 4 },
  dot:   { width: 6, height: 6, borderRadius: 3 },
  text:  { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
});

// ── Default (TT / Badminton) ─────────────────────────────────────
function DefaultCard({ m, theme }: any) {
  const sets = (m.sets ?? []).filter((s: any) => s.score_p1 > 0 || s.score_p2 > 0 || s.is_complete);
  return (
    <View>
      <View style={mc.row}>
        <Text style={[mc.pName, { color: m.player_1?.is_winner ? theme.colors.ink : theme.colors.muted, fontWeight: m.player_1?.is_winner ? '800' : '600' }]} numberOfLines={1}>
          {m.player_1?.name ?? 'TBD'}
        </Text>
        <Text style={[mc.score, { color: theme.colors.ink }]}>{m.player_1?.score ?? 0}</Text>
      </View>
      <View style={mc.row}>
        <Text style={[mc.pName, { color: m.player_2?.is_winner ? theme.colors.ink : theme.colors.muted, fontWeight: m.player_2?.is_winner ? '800' : '600' }]} numberOfLines={1}>
          {m.player_2?.name ?? 'TBD'}
        </Text>
        <Text style={[mc.score, { color: theme.colors.ink }]}>{m.player_2?.score ?? 0}</Text>
      </View>
      {sets.length > 0 && (
        <View style={mc.sets}>
          {sets.map((s: any, i: number) => (
            <View key={i} style={[mc.setChip, { borderColor: theme.colors.border }]}>
              <Text style={{ fontSize: 10, color: theme.colors.muted }}>{s.score_p1}–{s.score_p2}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

// ── Football ─────────────────────────────────────────────────────
function FootballCard({ m, theme }: any) {
  const ls = m.live_state ?? {};
  const half = ls.half;
  let phaseLabel = half >= 5 ? 'Penalties' : half >= 3 ? 'Extra Time' : half === 2 ? '2nd Half' : '1st Half';
  if (m.status !== 'live') phaseLabel = '';

  // Score: use first set if available, fall back to participant aggregate
  const set = m.sets?.[0];
  const g1 = set?.score_p1 ?? m.player_1?.score ?? 0;
  const g2 = set?.score_p2 ?? m.player_2?.score ?? 0;

  const isDone = m.status === 'done';
  const p1win  = m.player_1?.is_winner;
  const p2win  = m.player_2?.is_winner;
  const scoreColor = m.status === 'live' ? theme.colors.primary : theme.colors.ink;

  return (
    <View>
      <View style={mc.ftRow}>
        <Text
          style={[mc.ftName, {
            color: isDone && !p1win ? theme.colors.muted : theme.colors.ink,
            fontWeight: isDone && p1win ? '800' : '600',
          }]}
          numberOfLines={1}
        >
          {m.player_1?.name ?? 'TBD'}
        </Text>
        <Text style={[mc.ftScore, { color: scoreColor }]}>
          {m.status === 'done' || m.status === 'live' ? `${g1} – ${g2}` : 'vs'}
        </Text>
        <Text
          style={[mc.ftName, {
            color: isDone && !p2win ? theme.colors.muted : theme.colors.ink,
            fontWeight: isDone && p2win ? '800' : '600',
            textAlign: 'right',
          }]}
          numberOfLines={1}
        >
          {m.player_2?.name ?? 'TBD'}
        </Text>
      </View>
      {phaseLabel ? <Text style={{ fontSize: 11, color: theme.colors.muted, marginTop: 4, textAlign:'center' }}>{phaseLabel}</Text> : null}
    </View>
  );
}

// ── Cricket ──────────────────────────────────────────────────────
function CricketCard({ m, theme }: any) {
  const ls = m.live_state ?? {};
  const sets = m.sets ?? [];
  const inn1 = sets.find((s: any) => s.set_number === 1);
  const inn2 = sets.find((s: any) => s.set_number === 2);
  const battingFirst = ls.batting_first ?? 1;

  const team1 = m.player_1?.name ?? 'TBD';
  const team2 = m.player_2?.name ?? 'TBD';

  const runs1 = battingFirst === 1 ? inn1?.score_p1 : inn2?.score_p1;
  const wkts1 = battingFirst === 1 ? inn1?.score_p2 : inn2?.score_p2;
  const runs2 = battingFirst === 2 ? inn1?.score_p1 : inn2?.score_p1;
  const wkts2 = battingFirst === 2 ? inn1?.score_p2 : inn2?.score_p2;

  return (
    <View>
      <View style={mc.row}>
        <Text style={[mc.pName, { color: m.player_1?.is_winner ? theme.colors.ink : theme.colors.muted }]} numberOfLines={1}>{team1}</Text>
        {runs1 != null ? <Text style={[mc.score, { color: theme.colors.ink }]}>{runs1}/{wkts1 ?? 0}</Text> : <Text style={[mc.score, { color: theme.colors.muted }]}>—</Text>}
      </View>
      <View style={mc.row}>
        <Text style={[mc.pName, { color: m.player_2?.is_winner ? theme.colors.ink : theme.colors.muted }]} numberOfLines={1}>{team2}</Text>
        {runs2 != null ? <Text style={[mc.score, { color: theme.colors.ink }]}>{runs2}/{wkts2 ?? 0}</Text> : <Text style={[mc.score, { color: theme.colors.muted }]}>—</Text>}
      </View>
      {ls.runs != null && m.status === 'live' && (
        <Text style={{ fontSize: 11, color: theme.colors.muted, marginTop: 2 }}>
          {ls.runs}/{ls.wickets ?? 0} · {ls.overs ?? '0.0'} ov
        </Text>
      )}
    </View>
  );
}

const mc = StyleSheet.create({
  row:     { flexDirection:'row', alignItems:'center', justifyContent:'space-between', marginBottom: 2 },
  pName:   { fontSize: 14, flex: 1, marginRight: 8 },
  score:   { fontSize: 20, fontWeight: '900', minWidth: 28, textAlign: 'right' },
  sets:    { flexDirection:'row', gap: 4, marginTop: 6, flexWrap:'wrap' },
  setChip: { borderWidth:1, borderRadius:6, paddingHorizontal:6, paddingVertical:2 },
  ftRow:   { flexDirection:'row', alignItems:'center', gap: 6, width:'100%' },
  ftName:  { flex:1, fontSize:14, fontWeight:'600' },
  ftScore: { fontSize:24, fontWeight:'900', minWidth:72, textAlign:'center', letterSpacing:-0.5 },
});

// ── Main dispatcher ──────────────────────────────────────────────
interface Props {
  match:      any;
  sportKey?:  string;
  onPress?:   () => void;
}

export default function MatchCard({ match: m, sportKey, onPress }: Props) {
  const { theme } = useTheme();
  const sk = sportKey ?? m.sport_key;
  const stageLabel = STAGE_LABELS[m.stage] ?? m.stage ?? '';

  const inner = (
    <View style={[s.card, { backgroundColor: theme.colors.surface, borderColor: m.status === 'live' ? theme.colors.primary + '44' : theme.colors.border }]}>
      <View style={s.header}>
        {stageLabel ? <Text style={[s.stage, { color: theme.colors.muted }]}>{stageLabel.toUpperCase()}</Text> : <View />}
        <StatusBadge status={m.status} sportKey={sk} />
      </View>
      {sk === 'cricket'  ? <CricketCard  m={m} theme={theme} /> :
       sk === 'football' ? <FootballCard m={m} theme={theme} /> :
                           <DefaultCard  m={m} theme={theme} />}
    </View>
  );

  return onPress
    ? <TouchableOpacity onPress={onPress} activeOpacity={0.85}>{inner}</TouchableOpacity>
    : inner;
}

const s = StyleSheet.create({
  card:   { borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 14, marginBottom: 10 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  stage:  { fontSize: 10, fontWeight: '800', letterSpacing: 1.2, textTransform: 'uppercase' },
});
