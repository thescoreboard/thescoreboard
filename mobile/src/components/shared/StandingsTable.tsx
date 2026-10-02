/**
 * Renders the backend's /events/{id}/standings payload. No client-side maths:
 * points, tie-breaks, NRR etc. all come from the API (one implementation).
 */
import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import { useTheme } from '../../hooks/useTheme';

type Props = {
  groups: any[];
  sportKey?: string;
};

function diffCell(sportKey: string | undefined, row: any): { text: string; value: number } {
  if (sportKey === 'cricket') {
    const v = Number(row.nrr ?? 0);
    return { text: `${v > 0 ? '+' : ''}${v.toFixed(2)}`, value: v };
  }
  const v = Number(row.diff ?? 0);
  return { text: `${v > 0 ? '+' : ''}${v}`, value: v };
}

export default function StandingsTable({ groups, sportKey }: Props) {
  const { theme } = useTheme();
  const c = theme.colors;
  const diffLabel = sportKey === 'cricket' ? 'NRR' : sportKey === 'football' ? 'GD' : 'SD';
  const drawLabel = sportKey === 'cricket' ? 'T' : 'D';
  const W = { rank: 24, name: 112, n: 30, diff: 46, pts: 40 };

  if (!groups?.length || groups.every(g => !g.rows?.length)) {
    return (
      <Text style={{ color: c.muted, textAlign: 'center', marginTop: 24 }}>
        No standings yet. Complete some matches first.
      </Text>
    );
  }

  return (
    <View>
      {groups.map((group: any, gi: number) => (
        <View key={group.group_id ?? gi} style={{ marginBottom: 24 }}>
          {groups.length > 1 && (
            <Text style={{ fontSize: 11, fontWeight: '800', color: c.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
              {group.name}
            </Text>
          )}
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={{ borderRadius: 10, borderWidth: 1, borderColor: c.border, overflow: 'hidden' }}>
              <View style={{ flexDirection: 'row', backgroundColor: c.elevated, paddingHorizontal: 8, paddingVertical: 8 }}>
                {[
                  ['#', W.rank], ['Name', W.name], ['P', W.n], ['W', W.n], [drawLabel, W.n], ['L', W.n], [diffLabel, W.diff], ['Pts', W.pts],
                ].map(([h, w]: any, i) => (
                  <Text key={h + i} style={{ width: w, fontSize: 10, fontWeight: '800', color: c.muted, textTransform: 'uppercase', textAlign: i === 1 ? 'left' : 'center' }}>{h}</Text>
                ))}
              </View>
              {group.rows?.map((row: any, ri: number) => {
                const d = diffCell(sportKey, row);
                return (
                  <View key={row.participant_id} style={{ flexDirection: 'row', paddingHorizontal: 8, paddingVertical: 10, backgroundColor: ri % 2 === 0 ? 'transparent' : c.surface, borderTopWidth: 1, borderTopColor: c.border }}>
                    <Text style={{ width: W.rank, textAlign: 'center', color: c.muted, fontWeight: '700', fontSize: 12 }}>{row.rank ?? ri + 1}</Text>
                    <Text style={{ width: W.name, color: c.ink, fontWeight: '600', fontSize: 12 }} numberOfLines={1}>{row.name}</Text>
                    <Text style={{ width: W.n, textAlign: 'center', color: c.muted, fontSize: 12 }}>{row.played ?? row.matches_played}</Text>
                    <Text style={{ width: W.n, textAlign: 'center', color: '#22c55e', fontWeight: '700', fontSize: 12 }}>{row.wins}</Text>
                    <Text style={{ width: W.n, textAlign: 'center', color: c.muted, fontSize: 12 }}>{row.draws ?? 0}</Text>
                    <Text style={{ width: W.n, textAlign: 'center', color: '#ef4444', fontSize: 12 }}>{row.losses}</Text>
                    <Text style={{ width: W.diff, textAlign: 'center', fontSize: 12, fontWeight: '700', color: d.value > 0 ? '#22c55e' : d.value < 0 ? '#ef4444' : c.muted }}>{d.text}</Text>
                    <Text style={{ width: W.pts, textAlign: 'center', color: c.primary, fontWeight: '900', fontSize: 13 }}>{row.points ?? row.ranking_points}</Text>
                  </View>
                );
              })}
            </View>
          </ScrollView>
        </View>
      ))}
      <Text style={{ fontSize: 10, color: c.muted }}>
        P played · W won · {drawLabel} {sportKey === 'cricket' ? 'tied' : 'drawn'} · L lost · {diffLabel} {sportKey === 'cricket' ? 'net run rate' : sportKey === 'football' ? 'goal difference' : 'set difference'} · Pts points
      </Text>
    </View>
  );
}
