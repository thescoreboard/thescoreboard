/**
 * Cricket Scorer — fullscreen mobile scorer.
 * Toss setup → Ball-by-ball scoring → End innings → Match result
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView,
  ActivityIndicator, Alert, Modal, StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { useAuthStore } from '../../../../src/store/auth';
import {
  apiUpdateMatchStatus, apiUpdateScore, apiFinishMatch, apiGetWorkspace,
} from '../../../../src/api/client';

const C = {
  bg:      '#060f06',
  surface: '#0a1e0a',
  surface2:'#0f2810',
  border:  '#173517',
  green:   '#16a34a',
  lime:    '#4ade80',
  gold:    '#f59e0b',
  red:     '#ef4444',
  orange:  '#f97316',
  purple:  '#a855f7',
  muted:   '#4b7055',
  mutedHi: '#6d9b7d',
  ink:     '#ecfdf5',
};

const DISMISSALS = [
  { key: 'b',   label: 'Bowled'         },
  { key: 'lbw', label: 'LBW'            },
  { key: 'c',   label: 'Caught'         },
  { key: 'cb',  label: 'Caught & Bowled'},
  { key: 'ro',  label: 'Run Out'        },
  { key: 'hw',  label: 'Hit Wicket'     },
  { key: 'st',  label: 'Stumped'        },
  { key: 'o',   label: 'Other'          },
];

const fmt   = (balls: number) => `${Math.floor(balls / 6)}.${balls % 6}`;
const bRuns = (label: string) => {
  if (label === '4')  return 4;
  if (label === '6')  return 6;
  if (label === 'Wd' || label === 'Nb') return 1;
  if (label === 'B'  || label === 'LB') return 1;
  const n = parseInt(label);
  return isNaN(n) ? 0 : n;
};
const isLegal = (label: string) => label !== 'Wd' && label !== 'Nb';

function BallDot({ label }: { label: string }) {
  const isW   = label.startsWith('W');
  const is4   = label === '4';
  const is6   = label === '6';
  const isExt = label === 'Wd' || label === 'Nb';
  const isDot = label === '•';
  const bg    = isW ? '#dc2626' : is6 ? '#d97706' : is4 ? '#15803d' : isExt ? '#c2410c' : isDot ? '#1f2937' : '#1e3a2e';
  return (
    <View style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center',
      backgroundColor: bg,
      borderWidth: isW || is6 || is4 ? 2 : 0,
      borderColor: isW ? '#ef4444' : is6 ? '#f59e0b' : is4 ? '#22c55e' : 'transparent' }}>
      <Text style={{ color: '#fff', fontSize: label.length > 2 ? 7 : label.length > 1 ? 9 : 12, fontWeight: '900' }}>
        {isW ? 'W' : label}
      </Text>
    </View>
  );
}

export default function CricketScorerScreen() {
  const params      = useLocalSearchParams<{ matchId: string; eventId?: string; tournamentId?: string }>();
  const { matchId } = params;
  const router      = useRouter();
  const { token }   = useAuthStore();

  const [match,        setMatch]        = useState<any>(null);
  const [loading,      setLoading]      = useState(true);
  const [setupBatFirst, setSetupBatFirst] = useState<1 | 2>(1);
  const [showWicket,   setShowWicket]   = useState(false);
  const [showEndConf,  setShowEndConf]  = useState(false);
  const [showSOToss,   setShowSOToss]   = useState(false);
  const [soTossChoice, setSoTossChoice] = useState<1 | 2>(1);
  const [submitting,   setSubmitting]   = useState(false);
  const [st, setSt] = useState({ runs: 0, wickets: 0, balls: 0, log: [] as string[] });

  const loadMatch = useCallback(async () => {
    if (!params.tournamentId) return;
    try {
      const ws = await apiGetWorkspace(token!, parseInt(params.tournamentId));
      const ev = (ws.events ?? []).find((e: any) => e.event_id === parseInt(params.eventId ?? '0'));
      const m  = (ev?.matches ?? []).find((m: any) => m.match_id === parseInt(matchId));
      if (m) {
        setMatch(m);
        const ls = m.live_state ?? {};
        setSt({ runs: ls.runs ?? 0, wickets: ls.wickets ?? 0, balls: ls.balls ?? 0, log: ls.ball_log ?? [] });
      }
    } catch {}
    setLoading(false);
  }, [matchId, params.tournamentId, params.eventId, token]);

  useFocusEffect(useCallback(() => { loadMatch(); }, [loadMatch]));

  if (loading) return (
    <View style={{ flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator color={C.green} size="large" />
    </View>
  );
  if (!match) return (
    <View style={{ flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: C.muted }}>Match not found.</Text>
      <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)/organiser' as any)} style={{ marginTop: 12 }}>
        <Text style={{ color: C.green, fontSize: 14 }}>← Back</Text>
      </TouchableOpacity>
    </View>
  );

  const ls        = match.live_state ?? {};
  const sets      = (match.sets ?? []).slice().sort((a: any, b: any) => a.set_number - b.set_number);
  const isDone    = match.status === 'done';
  const isPreLive = match.status === 'scheduled';
  const innings   = ls.current_innings ?? 1;

  const isSuperOver      = !!(ls.is_super_over) || innings >= 3;
  const config           = match.sport_config ?? {};
  const maxOvers         = isSuperOver ? 1 : (ls.configured_overs ?? config.overs ?? 20);
  const maxWickets       = isSuperOver ? 2 : (ls.configured_wickets ?? config.wickets ?? 10);
  const battingFirst     = ls.batting_first ?? null;
  const setupDone        = !!battingFirst;

  const superOverBF      = ls.super_over_batting_first ?? null;
  const effectiveBF      = (isSuperOver && superOverBF) ? superOverBF : battingFirst;
  const battingTeamPos   = !effectiveBF ? 1 : (innings % 2 === 1 ? effectiveBF : (3 - effectiveBF));

  const p1Name     = match.player_1?.name ?? 'Team 1';
  const p2Name     = match.player_2?.name ?? 'Team 2';
  const battingName = battingTeamPos === 1 ? p1Name : p2Name;
  const bowlingName = battingTeamPos === 1 ? p2Name : p1Name;

  const prevSet        = innings >= 2 ? sets.find((s: any) => s.set_number === innings - 1) : null;
  const isSOFirstInn   = isSuperOver && innings % 2 === 1;
  const target         = (prevSet && !isSOFirstInn) ? prevSet.score_p1 + 1 : null;

  const runsNeeded     = target ? Math.max(0, target - st.runs) : null;
  const allOut         = st.wickets >= maxWickets;
  const oversUp        = Math.floor(st.balls / 6) >= maxOvers;
  const targetAchieved = !!target && st.runs >= target;
  const canEndInnings  = allOut || oversUp || targetAchieved;
  const ballsInOver    = st.balls % 6;
  const isTied         = innings >= 2 && !targetAchieved && !isSOFirstInn && prevSet && st.runs === prevSet.score_p1;

  const matchWinner = isDone ? (match.player_1?.is_winner ? p1Name : match.player_2?.is_winner ? p2Name : null) : null;

  const currentOverLog = (() => {
    if (!st.log.length) return [];
    const result: string[] = [];
    let legal = 0;
    for (let i = st.log.length - 1; i >= 0; i--) {
      const b = st.log[i];
      result.unshift(b);
      if (isLegal(b)) legal++;
      if (legal >= ballsInOver) break;
    }
    return result.slice(-12);
  })();

  // ── Actions ───────────────────────────────────────────────────
  const doScore = async (next: typeof st, extra: any = {}) => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const updated = await apiUpdateScore(token!, parseInt(matchId), {
        score_p1: next.runs, score_p2: next.wickets,
        half: innings, minute: next.balls, overs: fmt(next.balls),
        cricket_live_state: { ball_log: next.log, ...extra },
        ...extra,
      });
      setMatch(updated);
    } catch (e: any) { Alert.alert('Error', e.message); }
    setSubmitting(false);
  };

  const deliver = (label: string, runs: number, legal: boolean, isWkt = false) => {
    const next = {
      runs:    st.runs    + runs,
      wickets: st.wickets + (isWkt ? 1 : 0),
      balls:   st.balls   + (legal ? 1 : 0),
      log:     [...st.log, label],
    };
    setSt(next);
    doScore(next);
  };

  const undo = () => {
    if (!st.log.length) return;
    const last = st.log[st.log.length - 1];
    const next = {
      runs:    Math.max(0, st.runs    - bRuns(last)),
      wickets: Math.max(0, st.wickets - (last.startsWith('W') ? 1 : 0)),
      balls:   Math.max(0, st.balls   - (isLegal(last) ? 1 : 0)),
      log:     st.log.slice(0, -1),
    };
    setSt(next);
    doScore(next);
  };

  const wicketOut = (type: string) => {
    setShowWicket(false);
    deliver(`W(${type})`, 0, true, true);
  };

  const handleGoLive = async () => {
    try { const u = await apiUpdateMatchStatus(token!, parseInt(matchId), { status: 'live' }); setMatch(u); }
    catch (e: any) { Alert.alert('Error', e.message); }
  };

  const confirmSetup = async () => {
    try {
      const updated = await apiUpdateScore(token!, parseInt(matchId), {
        score_p1: 0, score_p2: 0, half: 1, minute: 0, overs: '0.0',
        cricket_live_state: {
          batting_first: setupBatFirst, configured_overs: maxOvers, configured_wickets: maxWickets,
        },
      });
      setMatch(updated);
      setSt({ runs: 0, wickets: 0, balls: 0, log: [] });
    } catch (e: any) { Alert.alert('Error', e.message); }
  };

  const triggerEndInnings = () => {
    if (innings === 1 || isSOFirstInn) handleFinish(null);
    else setShowEndConf(true);
  };

  const handleFinish = async (winnerPos: 1 | 2 | null | 'super_over', extra: any = {}) => {
    setShowEndConf(false);
    setShowSOToss(false);
    try {
      const u = await apiFinishMatch(token!, parseInt(matchId), { winner_position: winnerPos, ...extra });
      setMatch(u);
      if (u?.status === 'done') {
        router.canGoBack() ? router.back() : router.replace('/(tabs)/organiser' as any);
      } else {
        setSt({ runs: 0, wickets: 0, balls: 0, log: [] });
      }
    } catch (e: any) { Alert.alert('Error', e.message); }
  };

  const inningsLabel = isSuperOver ? 'Super Over' : innings === 1 ? '1st Innings' : '2nd Innings';
  const isKnockout   = !!(match.stage && match.stage !== 'group');

  // ── Setup screen (toss) ───────────────────────────────────────
  if (!setupDone && !isDone) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        <StatusBar barStyle="light-content" backgroundColor={C.bg} />
        <SafeAreaView style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
            padding: 12, backgroundColor: C.surface, borderBottomWidth: 2, borderBottomColor: C.border }}>
            <View style={{ backgroundColor: '#f59e0b', borderRadius: 4, paddingHorizontal: 10, paddingVertical: 4 }}>
              <Text style={{ fontSize: 10, fontWeight: '900', color: '#000', letterSpacing: 2, textTransform: 'uppercase' }}>Toss</Text>
            </View>
            <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)/organiser' as any)}
              style={{ borderRadius: 7, borderWidth: 1, borderColor: C.border, paddingHorizontal: 12, paddingVertical: 6 }}>
              <Text style={{ color: C.muted, fontSize: 12 }}>✕ Close</Text>
            </TouchableOpacity>
          </View>

          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 20 }}>
            <Text style={{ fontSize: 22, fontWeight: '900', color: C.ink, textAlign: 'center' }}>Toss Setup</Text>
            <Text style={{ color: C.muted, fontSize: 14, textAlign: 'center' }}>
              Who bats first?
            </Text>
            <View style={{ width: '100%', gap: 10 }}>
              {([{ pos: 1, name: p1Name }, { pos: 2, name: p2Name }] as any[]).map(({ pos, name }) => (
                <TouchableOpacity key={pos} onPress={() => setSetupBatFirst(pos as 1 | 2)}
                  style={{ paddingVertical: 18, borderRadius: 14, alignItems: 'center',
                    backgroundColor: setupBatFirst === pos ? C.green : C.surface,
                    borderWidth: 2, borderColor: setupBatFirst === pos ? C.green : C.border }}>
                  <Text style={{ fontSize: 16, fontWeight: '800', color: setupBatFirst === pos ? '#000' : C.ink }}>{name}</Text>
                  <Text style={{ fontSize: 11, color: setupBatFirst === pos ? '#004d00' : C.muted, marginTop: 3 }}>bats first</Text>
                </TouchableOpacity>
              ))}
            </View>
            {isPreLive ? (
              <TouchableOpacity onPress={async () => { await handleGoLive(); confirmSetup(); }}
                style={{ width: '100%', paddingVertical: 18, borderRadius: 12, alignItems: 'center', backgroundColor: C.green }}>
                <Text style={{ fontSize: 16, fontWeight: '900', color: '#000', letterSpacing: 1, textTransform: 'uppercase' }}>
                  ▶ GO LIVE
                </Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity onPress={confirmSetup}
                style={{ width: '100%', paddingVertical: 16, borderRadius: 12, alignItems: 'center', backgroundColor: C.green }}>
                <Text style={{ fontSize: 15, fontWeight: '800', color: '#000' }}>Confirm Toss →</Text>
              </TouchableOpacity>
            )}
          </View>
        </SafeAreaView>
      </View>
    );
  }

  // ── Main scoring screen ───────────────────────────────────────
  const balls = [
    { label: '•', runs: 0, legal: true  },
    { label: '1', runs: 1, legal: true  },
    { label: '2', runs: 2, legal: true  },
    { label: '3', runs: 3, legal: true  },
    { label: '4', runs: 4, legal: true  },
    { label: '6', runs: 6, legal: true  },
    { label: 'Wd',runs: 1, legal: false },
    { label: 'Nb',runs: 1, legal: false },
    { label: 'B', runs: 1, legal: true  },
    { label: 'LB',runs: 1, legal: true  },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />
      <SafeAreaView style={{ flex: 1 }}>

        {/* Top bar */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          padding: 12, backgroundColor: C.surface, borderBottomWidth: 2, borderBottomColor: C.border }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ backgroundColor: isDone ? C.gold : C.green, borderRadius: 4,
              paddingHorizontal: 10, paddingVertical: 4 }}>
              <Text style={{ fontSize: 10, fontWeight: '900', color: '#000', letterSpacing: 1.5, textTransform: 'uppercase' }}>
                {isDone ? 'Final' : inningsLabel}
              </Text>
            </View>
            {!isDone && target && (
              <Text style={{ fontSize: 11, color: C.mutedHi, fontWeight: '700' }}>
                Need {runsNeeded} from {Math.floor((maxOvers * 6 - st.balls) / 6)}.{(maxOvers * 6 - st.balls) % 6}
              </Text>
            )}
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity
              onPress={() => router.push({
                pathname: '/organiser/score/stream/[matchId]',
                params: {
                  matchId,
                  eventId:      params.eventId ?? '',
                  tournamentId: params.tournamentId ?? '',
                  sport:        'cricket',
                },
              } as any)}
              style={{ borderRadius: 7, borderWidth: 1, borderColor: '#ef4444' + '66',
                paddingHorizontal: 10, paddingVertical: 6, backgroundColor: '#ef4444' + '12' }}>
              <Text style={{ color: '#ef4444', fontSize: 12, fontWeight: '700' }}>Stream</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)/organiser' as any)}
              style={{ borderRadius: 7, borderWidth: 1, borderColor: C.border, paddingHorizontal: 12, paddingVertical: 6 }}>
              <Text style={{ color: C.muted, fontSize: 12, fontWeight: '700' }}>✕ Close</Text>
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }}>

          {/* Match winner */}
          {matchWinner && (
            <Text style={{ textAlign: 'center', color: C.gold, fontWeight: '900', fontSize: 18, letterSpacing: 2 }}>
              {matchWinner} Wins!
            </Text>
          )}

          {/* Previous innings scores */}
          {sets.filter((s: any) => s.is_complete).map((s: any) => {
            const batPos = s.set_number % 2 === 1 ? battingFirst : (3 - (battingFirst ?? 1));
            const name   = batPos === 1 ? p1Name : p2Name;
            return (
              <View key={s.set_number} style={{ backgroundColor: C.surface, borderRadius: 10,
                borderWidth: 1, borderColor: C.border, padding: 10, flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ color: C.mutedHi, fontSize: 12 }}>
                  Inn {s.set_number}: {name}
                </Text>
                <Text style={{ color: C.lime, fontWeight: '900', fontSize: 12 }}>
                  {s.score_p1}/{s.score_p2} ({s.score_p2 >= maxWickets ? 'all out' : fmt(s.score_p1 * 6 ?? 0)})
                </Text>
              </View>
            );
          })}

          {/* Scorecard */}
          {!isDone && (
            <View style={{ backgroundColor: C.surface2, borderRadius: 14, borderWidth: 1, borderColor: C.border, padding: 16 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                <View>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: C.mutedHi, textTransform: 'uppercase', letterSpacing: 1 }}>
                    Batting: {battingName}
                  </Text>
                  <Text style={{ fontSize: 52, fontWeight: '900', color: C.lime, lineHeight: 56 }}>
                    {st.runs}<Text style={{ fontSize: 24, color: C.muted }}>/</Text>
                    <Text style={{ fontSize: 24, color: C.red }}>{st.wickets}</Text>
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ fontSize: 22, fontWeight: '900', color: C.ink }}>
                    {fmt(st.balls)}
                  </Text>
                  <Text style={{ fontSize: 11, color: C.muted }}>overs</Text>
                  <Text style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
                    max {maxOvers} ov, {maxWickets}wk
                  </Text>
                </View>
              </View>

              {target && (
                <View style={{ marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: C.border }}>
                  <Text style={{ fontSize: 13, color: targetAchieved ? C.green : C.gold, fontWeight: '700' }}>
                    {targetAchieved
                      ? `✓ Target chased! (${battingName} wins)`
                      : `Target: ${target} — Need ${runsNeeded} more`}
                  </Text>
                </View>
              )}
              {allOut && !targetAchieved && (
                <Text style={{ color: C.red, fontWeight: '700', fontSize: 12, marginTop: 6 }}>All Out!</Text>
              )}
              {oversUp && !allOut && !targetAchieved && (
                <Text style={{ color: C.orange, fontWeight: '700', fontSize: 12, marginTop: 6 }}>
                  Overs complete!
                </Text>
              )}
            </View>
          )}

          {/* Current over ball log */}
          {!isDone && st.log.length > 0 && (
            <View>
              <Text style={{ fontSize: 10, fontWeight: '800', color: C.muted,
                textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
                This Over ({ballsInOver} balls)
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {currentOverLog.map((label, i) => <BallDot key={i} label={label} />)}
                </View>
              </ScrollView>
            </View>
          )}

          {/* Scoring buttons */}
          {!isDone && (
            <>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {balls.map(b => {
                  const isSpecial = b.label === '4' || b.label === '6';
                  const isExtra   = b.label === 'Wd' || b.label === 'Nb';
                  return (
                    <TouchableOpacity key={b.label} onPress={() => deliver(b.label, b.runs, b.legal)}
                      disabled={submitting}
                      style={{ borderRadius: 10, paddingVertical: 14, paddingHorizontal: 14, alignItems: 'center',
                        backgroundColor: isSpecial ? C.green + '33' : isExtra ? C.orange + '22' : C.surface,
                        borderWidth: 1.5,
                        borderColor: isSpecial ? C.green + '88' : isExtra ? C.orange + '66' : C.border,
                        opacity: submitting ? 0.5 : 1, minWidth: 60 }}>
                      <Text style={{ fontSize: 18, fontWeight: '900',
                        color: isSpecial ? C.lime : isExtra ? C.orange : C.ink }}>{b.label}</Text>
                    </TouchableOpacity>
                  );
                })}
                {/* Wicket */}
                <TouchableOpacity onPress={() => setShowWicket(true)} disabled={submitting}
                  style={{ borderRadius: 10, paddingVertical: 14, paddingHorizontal: 18, alignItems: 'center',
                    backgroundColor: C.red + '22', borderWidth: 1.5, borderColor: C.red + '88',
                    opacity: submitting ? 0.5 : 1 }}>
                  <Text style={{ fontSize: 18, fontWeight: '900', color: C.red }}>W</Text>
                </TouchableOpacity>
              </View>

              {/* Undo + End Innings */}
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity onPress={undo} disabled={!st.log.length || submitting}
                  style={{ flex: 1, paddingVertical: 11, borderRadius: 9, alignItems: 'center',
                    borderWidth: 1, borderColor: C.border, opacity: !st.log.length ? 0.35 : 1 }}>
                  <Text style={{ color: C.muted, fontWeight: '700', fontSize: 13 }}>↩ Undo</Text>
                </TouchableOpacity>
                {canEndInnings && (
                  <TouchableOpacity onPress={triggerEndInnings}
                    style={{ flex: 2, paddingVertical: 11, borderRadius: 9, alignItems: 'center',
                      backgroundColor: C.gold }}>
                    <Text style={{ color: '#000', fontWeight: '900', fontSize: 13 }}>
                      {innings === 1 || isSOFirstInn ? 'End Innings →' : 'Finish Match ✓'}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            </>
          )}

          {/* Bowling team label */}
          {!isDone && (
            <Text style={{ textAlign: 'center', fontSize: 11, color: C.muted }}>
              Bowling: {bowlingName}
            </Text>
          )}
        </ScrollView>
      </SafeAreaView>

      {/* Wicket modal */}
      <Modal visible={showWicket} transparent animationType="slide">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.92)',
          justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: C.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20,
            padding: 20, gap: 12 }}>
            <Text style={{ color: C.red, fontWeight: '900', fontSize: 14, textAlign: 'center', letterSpacing: 1 }}>
              Wicket — Select Dismissal
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
              {DISMISSALS.map(d => (
                <TouchableOpacity key={d.key} onPress={() => wicketOut(d.key)}
                  style={{ borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11,
                    backgroundColor: C.red + '22', borderWidth: 1, borderColor: C.red + '44' }}>
                  <Text style={{ color: C.red, fontWeight: '700', fontSize: 13 }}>{d.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity onPress={() => setShowWicket(false)}
              style={{ paddingVertical: 12, borderRadius: 9, borderWidth: 1, borderColor: C.border, alignItems: 'center' }}>
              <Text style={{ color: C.muted, fontWeight: '700' }}>↩ Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* End innings / result modal */}
      <Modal visible={showEndConf} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.93)',
          alignItems: 'center', justifyContent: 'center', padding: 32, gap: 16 }}>
          <Text style={{ color: C.gold, fontWeight: '900', fontSize: 14, letterSpacing: 2, textTransform: 'uppercase' }}>
            End of Match
          </Text>
          <View style={{ backgroundColor: C.surface, borderRadius: 14, borderWidth: 1,
            borderColor: C.border, padding: 20, alignItems: 'center', width: '100%', gap: 8 }}>
            <Text style={{ color: C.lime, fontWeight: '900', fontSize: 24 }}>
              {st.runs}/{st.wickets} ({fmt(st.balls)})
            </Text>
            {target && (
              <Text style={{ color: C.mutedHi, fontSize: 13 }}>
                Target was {target}
              </Text>
            )}
          </View>

          {/* Determine winner options */}
          {targetAchieved && (
            <TouchableOpacity onPress={() => handleFinish(battingTeamPos as 1 | 2)}
              style={{ width: '100%', paddingVertical: 16, borderRadius: 12, alignItems: 'center', backgroundColor: C.green }}>
              <Text style={{ color: '#000', fontWeight: '900', fontSize: 14 }}>
                {battingName} Wins ✓
              </Text>
            </TouchableOpacity>
          )}
          {!targetAchieved && (
            <TouchableOpacity onPress={() => handleFinish((3 - battingTeamPos) as 1 | 2)}
              style={{ width: '100%', paddingVertical: 16, borderRadius: 12, alignItems: 'center', backgroundColor: C.green }}>
              <Text style={{ color: '#000', fontWeight: '900', fontSize: 14 }}>
                {bowlingName} Wins ✓
              </Text>
            </TouchableOpacity>
          )}
          {isTied && isKnockout && (
            <TouchableOpacity onPress={() => { setShowEndConf(false); setShowSOToss(true); }}
              style={{ width: '100%', paddingVertical: 14, borderRadius: 12, alignItems: 'center',
                backgroundColor: C.gold + '22', borderWidth: 1, borderColor: C.gold }}>
              <Text style={{ color: C.gold, fontWeight: '800', fontSize: 14 }}>Super Over →</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={() => setShowEndConf(false)}
            style={{ borderRadius: 7, borderWidth: 1, borderColor: C.border, paddingHorizontal: 24, paddingVertical: 10 }}>
            <Text style={{ color: C.muted, fontWeight: '700', fontSize: 12 }}>↩ Cancel</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      {/* Super Over toss */}
      <Modal visible={showSOToss} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.93)',
          alignItems: 'center', justifyContent: 'center', padding: 32, gap: 20 }}>
          <Text style={{ color: C.gold, fontWeight: '900', fontSize: 14, letterSpacing: 2, textTransform: 'uppercase' }}>
            Super Over Toss
          </Text>
          <Text style={{ color: C.mutedHi, fontSize: 14 }}>Who bats first in Super Over?</Text>
          <View style={{ width: '100%', gap: 10 }}>
            {([{ pos: 1, name: p1Name }, { pos: 2, name: p2Name }] as any[]).map(({ pos, name }) => (
              <TouchableOpacity key={pos} onPress={() => setSoTossChoice(pos as 1 | 2)}
                style={{ paddingVertical: 16, borderRadius: 12, alignItems: 'center',
                  backgroundColor: soTossChoice === pos ? C.green : C.surface,
                  borderWidth: 2, borderColor: soTossChoice === pos ? C.green : C.border }}>
                <Text style={{ fontSize: 15, fontWeight: '800', color: soTossChoice === pos ? '#000' : C.ink }}>{name}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity onPress={() => handleFinish('super_over', { super_over_batting_first: soTossChoice })}
            style={{ width: '100%', paddingVertical: 15, borderRadius: 12, alignItems: 'center', backgroundColor: C.gold }}>
            <Text style={{ color: '#000', fontWeight: '900', fontSize: 14 }}>Start Super Over →</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setShowSOToss(false)}
            style={{ borderRadius: 7, borderWidth: 1, borderColor: C.border, paddingHorizontal: 24, paddingVertical: 10 }}>
            <Text style={{ color: C.muted, fontWeight: '700', fontSize: 12 }}>↩ Cancel</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </View>
  );
}
