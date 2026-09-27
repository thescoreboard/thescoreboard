/**
 * Client-side standings computation — mirrors computeStandings in TournamentPublic.jsx
 */

export interface StandingRow {
  name:     string;
  id:       number | string;
  p:        number; // played
  w:        number; // wins
  d:        number; // draws
  l:        number; // losses
  sf:       number; // score for
  sa:       number; // score against
  pts:      number;
}

export function computeStandings(matches: any[], sportKey: string): StandingRow[] {
  const map = new Map<string, StandingRow>();

  const ensure = (id: string, name: string) => {
    if (!map.has(id)) {
      map.set(id, { name, id, p: 0, w: 0, d: 0, l: 0, sf: 0, sa: 0, pts: 0 });
    }
    return map.get(id)!;
  };

  for (const m of matches) {
    if (m.status !== 'done') continue;
    const p1 = m.player_1;
    const p2 = m.player_2;
    if (!p1 || !p2) continue;

    const id1 = String(p1.player_id ?? p1.team_id ?? p1.name);
    const id2 = String(p2.player_id ?? p2.team_id ?? p2.name);
    const r1 = ensure(id1, p1.name);
    const r2 = ensure(id2, p2.name);

    r1.p++; r2.p++;
    r1.sf += p1.score; r1.sa += p2.score;
    r2.sf += p2.score; r2.sa += p1.score;

    if (p1.is_winner)      { r1.w++; r1.pts += 3; r2.l++; }
    else if (p2.is_winner) { r2.w++; r2.pts += 3; r1.l++; }
    else                   { r1.d++; r2.d++; r1.pts++; r2.pts++; }
  }

  return [...map.values()].sort((a, b) => {
    if (b.pts !== a.pts) return b.pts - a.pts;
    if (b.w   !== a.w)   return b.w   - a.w;
    return (b.sf - b.sa) - (a.sf - a.sa);
  });
}
