// Single-elimination bracket layout. This is a line-for-line mirror of
// backend/app/sports/bracket.py `build_bracket`, so what the organiser sees
// (and drags participants into) is exactly what the server will create.
//
//   n participants → bracket size B = next power of two
//   preliminary matches = n - B/2, byes = B/2 - preliminary matches
//   Byes sit directly in round 2; everybody else plays round 1.
//
// A manual draw is sent to the server as an ordered id list:
//   [bye players (in round-2 slot order)..., round-1 pairs (1v2, 3v4, ...)...]
// Every "pick" slot below carries `idx`, its position in that list.

export const STAGE_LABEL = {
  preliminary: "Preliminary Round",
  round_of_32: "Round of 32",
  round_of_16: "Round of 16",
  quarter:     "Quarter Finals",
  semi:        "Semi Finals",
  third_place: "3rd Place Match",
  final:       "Final",
};

export function stageForSize(n) {
  if (n <= 2)  return "final";
  if (n <= 4)  return "semi";
  if (n <= 8)  return "quarter";
  if (n <= 16) return "round_of_16";
  if (n <= 32) return "round_of_32";
  return "preliminary";
}

/**
 * @returns {null | {
 *   n, byeCount, total,
 *   matches: {no, stage, round, slots: ({type:"pick", idx}|{type:"winner", of}|{type:"loser", of})[]}[],
 *   rounds:  {stage, label, matches}[],
 * }}
 */
export function bracketLayout(n, thirdPlace = true) {
  if (!Number.isInteger(n) || n < 2) return null;

  const size    = 2 ** Math.ceil(Math.log2(n));
  const half    = size / 2;
  const prelim  = n - half;
  const byes    = half - prelim;
  const r1Stage = byes > 0 ? "preliminary" : stageForSize(n);

  const matches = [];
  const rounds  = [];
  let no = 0;

  const r1 = [];
  for (let j = 0; j < prelim; j++) {
    const m = { no: ++no, stage: r1Stage, round: 1,
      slots: [{ type: "pick", idx: byes + 2 * j }, { type: "pick", idx: byes + 2 * j + 1 }] };
    matches.push(m); r1.push(m);
  }
  rounds.push({ stage: r1Stage, label: STAGE_LABEL[r1Stage], matches: r1 });

  let current = [
    ...Array.from({ length: byes }, (_, k) => ({ type: "pick", idx: k })),
    ...r1.map(m => ({ type: "winner", of: m.no })),
  ];

  let round = 2;
  while (current.length > 1) {
    const stage = stageForSize(current.length);
    const rm = [];
    const next = [];
    for (let i = 0; i < current.length; i += 2) {
      const m = { no: ++no, stage, round, slots: [current[i], current[i + 1]] };
      matches.push(m); rm.push(m);
      next.push({ type: "winner", of: m.no });
    }
    rounds.push({ stage, label: STAGE_LABEL[stage], matches: rm });
    current = next;
    round++;
  }

  if (thirdPlace && n >= 4) {
    const semis = rounds[rounds.length - 1].stage === "final"
      ? rounds[rounds.length - 2].matches
      : [];
    const m = { no: ++no, stage: "third_place", round, slots: semis.map(s => ({ type: "loser", of: s.no })) };
    matches.push(m);
    rounds.push({ stage: "third_place", label: STAGE_LABEL.third_place, matches: [m] });
  }

  return { n, byeCount: byes, total: matches.length, matches, rounds };
}
