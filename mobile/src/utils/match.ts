/** Match display helpers shared between scorer and public view */

export function getMatchScore(m: any): { s1: number; s2: number } {
  if (!m) return { s1: 0, s2: 0 };
  return { s1: m.player_1?.score ?? 0, s2: m.player_2?.score ?? 0 };
}

export function getCurrentSetScore(m: any): { s1: number; s2: number } {
  if (!m?.sets?.length) return { s1: 0, s2: 0 };
  const active = m.sets.find((s: any) => !s.is_complete) ?? m.sets[m.sets.length - 1];
  return { s1: active.score_p1, s2: active.score_p2 };
}

export function formatOvers(balls: number): string {
  return `${Math.floor(balls / 6)}.${balls % 6}`;
}

export const STAGE_ORDER = [
  'group', 'preliminary', 'round_of_32', 'round_of_16', 'quarter', 'semi', 'final', 'third_place',
];

export const STAGE_LABELS: Record<string, string> = {
  group:        'Group Stage',
  preliminary:  'Round 1',
  round_of_32:  'R32',
  round_of_16:  'R16',
  quarter:      'Quarter Final',
  semi:         'Semi Final',
  final:        'Final',
  third_place:  '3rd Place',   // backend stores "third_place" (underscore, no digit-dash)
  '3rd_place':  '3rd Place',   // legacy alias — keep for any old data
};
