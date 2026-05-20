/**
 * Bracket template calculator — mirrors the getBracketTemplate function
 * in frontend/src/pages/organiser/workspace/EventWorkspace.jsx
 */

export interface BracketRound {
  stage:        string;
  label:        string;
  matchCount:   number;
  isAssignable: boolean;
}

export interface BracketTemplate {
  bracketSize: number;
  byeCount:    number;
  rounds:      BracketRound[];
  total:       number;
}

const STAGE_LABELS: Record<string, string> = {
  preliminary:  'Round 1',
  round_of_32:  'Round of 32',
  round_of_16:  'Round of 16',
  quarter:      'Quarter Finals',
  semi:         'Semi Finals',
  final:        'Final',
  '3rd_place':  '3rd Place Match',
};

function nextPow2(n: number): number {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

export function getBracketTemplate(n: number, thirdPlace = false): BracketTemplate {
  if (n < 2) return { bracketSize: 0, byeCount: 0, rounds: [], total: 0 };

  const bracketSize = nextPow2(n);
  const byeCount    = bracketSize - n;

  // Build rounds bottom-up
  const mainRounds: BracketRound[] = [];
  let matchCount = bracketSize / 2;
  const allStages = ['preliminary', 'round_of_32', 'round_of_16', 'quarter', 'semi', 'final'];

  // determine how many rounds we need
  const numRounds = Math.log2(bracketSize);
  let stageIdx    = 0;

  // first round may be "preliminary" if there are byes
  if (byeCount > 0) {
    const prelim = bracketSize / 2 - byeCount;
    if (prelim > 0) {
      mainRounds.push({
        stage:        'preliminary',
        label:        'Round 1',
        matchCount:   prelim,
        isAssignable: true,
      });
    }
    stageIdx = 1; // skip preliminary in allStages
    matchCount = bracketSize / 4;
    const remaining = Math.log2(bracketSize) - 1;
    for (let i = 0; i < remaining; i++) {
      const stg = allStages[stageIdx + i] || `round_${i}`;
      mainRounds.push({
        stage:        stg,
        label:        STAGE_LABELS[stg] ?? stg,
        matchCount,
        isAssignable: false,
      });
      matchCount = Math.max(1, matchCount / 2);
    }
  } else {
    for (let i = 0; i < numRounds; i++) {
      const stg = allStages[i] || `round_${i}`;
      mainRounds.push({
        stage:        stg,
        label:        STAGE_LABELS[stg] ?? stg,
        matchCount,
        isAssignable: i === 0,
      });
      matchCount = Math.max(1, matchCount / 2);
    }
  }

  const rounds = [...mainRounds];
  if (thirdPlace) {
    rounds.push({
      stage:        '3rd_place',
      label:        '3rd Place Match',
      matchCount:   1,
      isAssignable: false,
    });
  }

  return {
    bracketSize,
    byeCount,
    rounds,
    total: rounds.reduce((s, r) => s + r.matchCount, 0),
  };
}
