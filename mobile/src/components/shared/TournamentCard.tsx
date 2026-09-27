import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTheme } from '../../hooks/useTheme';
import { F, SPORT_COLORS, SPORT_LABELS, STATUS_LABELS, STATUS_COLORS } from '../../theme';

interface Props {
  tournament: any;
  onPress: () => void;
}

export default function TournamentCard({ tournament: t, onPress }: Props) {
  const { theme } = useTheme();
  const c = theme.colors;
  const isLive = t.status === 'live';

  const sports: string[] = t.sport_key
    ? [t.sport_key]
    : (t.events ?? []).map((e: any) => e.sport_key).filter(Boolean);
  const uniqueSports = [...new Set(sports)] as string[];

  // Top accent colour: first sport's colour, fallback to primary
  const accentColor = SPORT_COLORS[uniqueSports[0]] ?? c.primary;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      style={[
        s.card,
        {
          backgroundColor: c.surface,
          borderColor:     isLive ? c.primary + '66' : c.border,
          borderTopColor:  accentColor,
        },
      ]}
    >
      {/* Pills row — status + sports */}
      <View style={s.pills}>
        {/* Live pill */}
        {isLive && (
          <View style={[s.pill, { backgroundColor: c.primary + '18', borderColor: c.primary + '44' }]}>
            <View style={[s.liveDot, { backgroundColor: c.primary }]} />
            <Text style={[s.pillText, { fontFamily: F.bold, color: c.primary }]}>LIVE</Text>
          </View>
        )}
        {/* Status pill (non-live) */}
        {!isLive && t.status && (
          <View style={[s.pill, { backgroundColor: (STATUS_COLORS[t.status] ?? '#888') + '18', borderColor: (STATUS_COLORS[t.status] ?? '#888') + '33' }]}>
            <Text style={[s.pillText, { fontFamily: F.bold, color: STATUS_COLORS[t.status] ?? '#888' }]}>
              {(STATUS_LABELS[t.status] ?? t.status).toUpperCase()}
            </Text>
          </View>
        )}
        {/* Sport chips */}
        {uniqueSports.slice(0, 2).map(sk => (
          <View key={sk} style={[s.pill, { backgroundColor: (SPORT_COLORS[sk] ?? '#888') + '18', borderColor: (SPORT_COLORS[sk] ?? '#888') + '33' }]}>
            <Text style={[s.pillText, { fontFamily: F.bold, color: SPORT_COLORS[sk] ?? '#888' }]}>
              {(SPORT_LABELS[sk] ?? sk).toUpperCase()}
            </Text>
          </View>
        ))}
      </View>

      {/* Tournament name — Unbounded, uppercase */}
      <Text style={[s.name, { fontFamily: F.display, color: c.ink }]} numberOfLines={2}>
        {(t.name ?? '').toUpperCase()}
      </Text>

      {/* Meta row */}
      <View style={s.meta}>
        {t.city && (
          <Text style={[s.metaText, { fontFamily: F.body, color: c.muted }]}>{t.city}</Text>
        )}
        {t.start_date && (
          <Text style={[s.metaText, { fontFamily: F.body, color: c.muted }]}>
            {new Date(t.start_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
          </Text>
        )}
      </View>

      {/* Stats row */}
      {(t.total_players > 0 || t.live_count > 0) && (
        <View style={s.stats}>
          {t.total_players > 0 && (
            <Text style={[s.stat, { fontFamily: F.body, color: c.muted }]}>
              {t.total_players} players
            </Text>
          )}
          {t.done_count > 0 && (
            <Text style={[s.stat, { fontFamily: F.body, color: c.muted }]}>
              {t.done_count}/{t.total_matches} matches
            </Text>
          )}
          {t.live_count > 0 && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <View style={[s.liveDot, { backgroundColor: c.primary }]} />
              <Text style={[s.stat, { fontFamily: F.bold, color: c.primary }]}>
                {t.live_count} live
              </Text>
            </View>
          )}
        </View>
      )}
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  card:     { borderRadius: 12, borderWidth: 1.5, borderTopWidth: 3, overflow: 'hidden', marginBottom: 12, padding: 14 },
  pills:    { flexDirection: 'row', gap: 5, flexWrap: 'wrap', marginBottom: 10 },
  pill:     { flexDirection: 'row', alignItems: 'center', borderRadius: 4, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3, gap: 4 },
  pillText: { fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  liveDot:  { width: 6, height: 6, borderRadius: 3 },
  name:     { fontSize: 15, fontWeight: '900', letterSpacing: -0.5, marginBottom: 8, lineHeight: 20 },
  meta:     { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 6 },
  metaText: { fontSize: 12 },
  stats:    { flexDirection: 'row', gap: 12, flexWrap: 'wrap', paddingTop: 10 },
  stat:     { fontSize: 12 },
});
