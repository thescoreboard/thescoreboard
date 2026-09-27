/**
 * Visual knockout bracket — adapted from frontend RoadToFinal.jsx
 * Mobile: vertical stack of stage columns with horizontal scroll per stage.
 */
import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useTheme } from '../../hooks/useTheme';
import { STAGE_ORDER, STAGE_LABELS } from '../../utils/match';

interface Props { matches: any[] }

export default function RoadToFinal({ matches }: Props) {
  const { theme } = useTheme();

  // Group by stage, in bracket order
  const byStage: Record<string, any[]> = {};
  for (const m of matches) {
    if (!byStage[m.stage]) byStage[m.stage] = [];
    byStage[m.stage].push(m);
  }

  const stages = STAGE_ORDER.filter(s => (byStage[s]?.length ?? 0) > 0);
  if (stages.length === 0) return null;

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -16 }}>
      <View style={{ flexDirection: 'row', paddingHorizontal: 16, gap: 8 }}>
        {stages.map(stage => (
          <View key={stage} style={{ width: 160 }}>
            <Text style={[s.stageLabel, { color: theme.colors.muted }]}>
              {(STAGE_LABELS[stage] ?? stage).toUpperCase()}
            </Text>
            <View style={{ gap: 8 }}>
              {byStage[stage].map(m => (
                <View key={m.match_id} style={[s.matchBox, { backgroundColor: theme.colors.surface, borderColor: m.status === 'live' ? theme.colors.primary + '55' : theme.colors.border }]}>
                  <MatchSlot p={m.player_1} theme={theme} />
                  <View style={[s.divider, { backgroundColor: theme.colors.border }]} />
                  <MatchSlot p={m.player_2} theme={theme} />
                </View>
              ))}
            </View>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

function MatchSlot({ p, theme }: { p: any; theme: any }) {
  const isTbd = !p || !p.name || p.name === 'TBD';
  return (
    <View style={s.slot}>
      <Text style={[s.slotName, { color: isTbd ? theme.colors.muted : theme.colors.ink, fontStyle: isTbd ? 'italic' : 'normal' }]} numberOfLines={1}>
        {p?.name ?? 'TBD'}
      </Text>
      {!isTbd && p.score != null && (
        <Text style={[s.slotScore, { color: p.is_winner ? theme.colors.primary : theme.colors.ink }]}>
          {p.score}
        </Text>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  stageLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 1.5, marginBottom: 6 },
  matchBox:   { borderRadius: 8, borderWidth: 1, overflow: 'hidden' },
  slot:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8, paddingVertical: 7 },
  slotName:   { fontSize: 12, fontWeight: '600', flex: 1 },
  slotScore:  { fontSize: 14, fontWeight: '900', marginLeft: 4 },
  divider:    { height: 1 },
});
