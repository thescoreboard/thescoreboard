/**
 * Football Scorer — fullscreen mobile scorer.
 * Phases: Normal (1st/2nd half) → Extra Time → Penalties
 */
import React, { useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView,
  ActivityIndicator, Alert, Modal, StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { useAuthStore } from '../../../../src/store/auth';
import {
  apiUpdateMatchStatus, apiUpdateScore, apiFinishMatch, apiWalkoverMatch, apiGetWorkspace,
} from '../../../../src/api/client';

const C = {
  bg:      '#0d0d0d',
  surface: '#1a1a1a',
  border:  '#2a2a2a',
  orange:  '#FF6B35',
  gold:    '#FFCC00',
  green:   '#22c55e',
  red:     '#ef4444',
  muted:   '#666',
  mutedHi: '#999',
  ink:     '#fff',
};

function PenSlot({ result, isCurrent }: { result: string; isCurrent: boolean }) {
  const scored = result === 'H';
  const missed = result === 'M';
  const taken  = scored || missed;
  return (
    <View style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center',
      backgroundColor: scored ? '#16a34a' : missed ? '#dc2626' : 'transparent',
      borderWidth: isCurrent ? 2.5 : taken ? 0 : 2,
      borderColor: isCurrent ? C.gold : C.border }}>
      <Text style={{ color: '#fff', fontWeight: '900', fontSize: 14 }}>
        {scored ? '✓' : missed ? '✗' : isCurrent ? '→' : ''}
      </Text>
    </View>
  );
}

export default function FootballScorerScreen() {
  const params      = useLocalSearchParams<{ matchId: string; eventId?: string; tournamentId?: string }>();
  const { matchId } = params;
  const router      = useRouter();
  const { token }   = useAuthStore();

  const [match,      setMatch]      = useState<any>(null);
  const [loading,    setLoading]    = useState(true);
  const [goals1,     setGoals1]     = useState(0);
  const [goals2,     setGoals2]     = useState(0);
  const [half,       setHalf]       = useState(1);
  const [phase,      setPhase]      = useState<'normal' | 'extra_time' | 'penalties'>('normal');
  const [penH1,      setPenH1]      = useState<string[]>([]);
  const [penH2,      setPenH2]      = useState<string[]>([]);
  const [walkoverVis, setWalkoverVis] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const loadMatch = useCallback(async () => {
    if (!params.tournamentId) return;
    try {
      const ws = await apiGetWorkspace(token!, parseInt(params.tournamentId));
      const ev = (ws.events ?? []).find((e: any) => e.event_id === parseInt(params.eventId ?? '0'));
      const m  = (ev?.matches ?? []).find((m: any) => m.match_id === parseInt(matchId));
      if (m) {
        setMatch(m);
        const cs   = (m.sets ?? []).find((s: any) => !s.is_complete) ?? (m.sets ?? [])[0];
        const ls   = m.live_state ?? {};
        setGoals1(cs?.score_p1 ?? 0);
        setGoals2(cs?.score_p2 ?? 0);
        const h = ls.half ?? 1;
        setHalf(h);
        setPhase(h >= 5 ? 'penalties' : h >= 3 ? 'extra_time' : 'normal');
        setPenH1(ls.pen_h1 ?? []);
        setPenH2(ls.pen_h2 ?? []);
      }
    } catch {}
    setLoading(false);
  }, [matchId, params.tournamentId, params.eventId, token]);

  useFocusEffect(useCallback(() => { loadMatch(); }, [loadMatch]));

  if (loading) return (
    <View style={{ flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator color={C.orange} size="large" />
    </View>
  );
  if (!match) return (
    <View style={{ flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: C.muted }}>Match not found.</Text>
      <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)/organiser' as any)} style={{ marginTop: 12 }}>
        <Text style={{ color: C.orange, fontSize: 14 }}>← Back</Text>
      </TouchableOpacity>
    </View>
  );

  const isDone     = match.status === 'done';
  const isPreLive  = match.status === 'scheduled';
  const isKnockout = !!(match.stage && match.stage !== 'group');

  const p1Name = match.player_1?.name ?? 'Team 1';
  const p2Name = match.player_2?.name ?? 'Team 2';

  const matchWinner = isDone ? (match.player_1?.is_winner ? 1 : match.player_2?.is_winner ? 2 : null) : null;

  // Penalty helpers
  const penGoals1 = penH1.filter((r: string) => r === 'H').length;
  const penGoals2 = penH2.filter((r: string) => r === 'H').length;
  const nextPenTeam = penH1.length > penH2.length ? 2 : 1;
  const slotsToShow = Math.max(5, penH1.length + (nextPenTeam === 1 ? 1 : 0), penH2.length + (nextPenTeam === 2 ? 1 : 0));

  const doScore = async (g1: number, g2: number, h: number) => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const updated = await apiUpdateScore(token!, parseInt(matchId), {
        score_p1: g1, score_p2: g2, football_half: h,
      });
      setMatch(updated);
    } catch (e: any) { Alert.alert('Error', e.message); }
    setSubmitting(false);
  };

  const addGoal = (pos: 1 | 2) => {
    if (isDone || submitting) return;
    const g1 = pos === 1 ? goals1 + 1 : goals1;
    const g2 = pos === 2 ? goals2 + 1 : goals2;
    if (pos === 1) setGoals1(g1); else setGoals2(g2);
    doScore(g1, g2, half);
  };

  const removeGoal = (pos: 1 | 2) => {
    if (isDone || submitting) return;
    const g1 = pos === 1 ? Math.max(0, goals1 - 1) : goals1;
    const g2 = pos === 2 ? Math.max(0, goals2 - 1) : goals2;
    if (pos === 1) setGoals1(g1); else setGoals2(g2);
    doScore(g1, g2, half);
  };

  const changeHalf = (h: number) => {
    setHalf(h);
    doScore(goals1, goals2, h);
    if (h >= 5) setPhase('penalties');
    else if (h >= 3) setPhase('extra_time');
    else setPhase('normal');
  };

  const handleGoLive = async () => {
    try { const u = await apiUpdateMatchStatus(token!, parseInt(matchId), { status: 'live' }); setMatch(u); }
    catch (e: any) { Alert.alert('Error', e.message); }
  };

  const handleFullTime = async () => {
    try {
      const u = await apiFinishMatch(token!, parseInt(matchId), { winner_position: goals1 > goals2 ? 1 : goals2 > goals1 ? 2 : null });
      setMatch(u);
      if (u?.status === 'done') router.canGoBack() ? router.back() : router.replace('/(tabs)/organiser' as any);
    } catch (e: any) { Alert.alert('Error', e.message); }
  };

  const handlePenFinish = async () => {
    const winner = penGoals1 > penGoals2 ? 1 : penGoals2 > penGoals1 ? 2 : null;
    if (!winner) { Alert.alert('Cannot finish — penalties are tied'); return; }
    try {
      const u = await apiFinishMatch(token!, parseInt(matchId), {
        winner_position: winner, pen_h1: penH1, pen_h2: penH2,
      });
      setMatch(u);
      if (u?.status === 'done') router.canGoBack() ? router.back() : router.replace('/(tabs)/organiser' as any);
    } catch (e: any) { Alert.alert('Error', e.message); }
  };

  const recordPen = (team: 1 | 2, result: 'H' | 'M') => {
    const newH1 = team === 1 ? [...penH1, result] : penH1;
    const newH2 = team === 2 ? [...penH2, result] : penH2;
    if (team === 1) setPenH1(newH1);
    else            setPenH2(newH2);
    // Persist penalty state to backend so progress survives screen close/reopen
    if (submitting) return;
    setSubmitting(true);
    apiUpdateScore(token!, parseInt(matchId), {
      score_p1: goals1, score_p2: goals2, football_half: half,
      football_live_state: { pen_h1: newH1, pen_h2: newH2 },
    }).then(u => { if (u) setMatch(u); }).catch(() => {}).finally(() => setSubmitting(false));
  };

  const undoPen = () => {
    if (penH2.length > penH1.length) setPenH2(prev => prev.slice(0, -1));
    else if (penH1.length > 0)       setPenH1(prev => prev.slice(0, -1));
  };

  const handleWalkover = async (pos: 1 | 2) => {
    setWalkoverVis(false);
    try { await apiWalkoverMatch(token!, parseInt(matchId), pos); await loadMatch(); }
    catch (e: any) { Alert.alert('Error', e.message); }
  };

  const halfLabel = (h: number) => {
    if (h === 1) return '1st Half';
    if (h === 2) return '2nd Half';
    if (h === 3) return 'ET 1st';
    if (h === 4) return 'ET 2nd';
    return 'Penalties';
  };

  const isDraw = goals1 === goals2;

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />
      <SafeAreaView style={{ flex: 1 }}>

        {/* Top bar */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          padding: 12, backgroundColor: C.surface, borderBottomWidth: 2, borderBottomColor: C.border }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ backgroundColor: isDone ? C.gold : isPreLive ? '#f59e0b' : C.orange,
              borderRadius: 4, paddingHorizontal: 10, paddingVertical: 4 }}>
              <Text style={{ fontSize: 10, fontWeight: '900', color: '#000', letterSpacing: 1.5, textTransform: 'uppercase' }}>
                {isDone ? 'Final' : isPreLive ? 'Ready' : halfLabel(half)}
              </Text>
            </View>
            {phase !== 'normal' && (
              <Text style={{ fontSize: 11, color: phase === 'penalties' ? C.gold : C.mutedHi, fontWeight: '700' }}>
                {phase === 'penalties' ? 'Penalties' : 'Extra Time'}
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
                  sport:        'football',
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

        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 16, gap: 14 }}>

          {/* Winner */}
          {matchWinner && (
            <Text style={{ textAlign: 'center', color: C.gold, fontWeight: '900', fontSize: 18,
              textTransform: 'uppercase', letterSpacing: 2 }}>
              {matchWinner === 1 ? p1Name : p2Name} Wins!
            </Text>
          )}

          {/* Score panels */}
          <View style={{ flexDirection: 'row', gap: 12 }}>
            {([
              { pos: 1, name: p1Name, goals: goals1 },
              { pos: 2, name: p2Name, goals: goals2 },
            ] as any[]).map(({ pos, name, goals }) => {
              const isLeading = pos === 1 ? goals1 > goals2 : goals2 > goals1;
              return (
                <View key={pos} style={{ flex: 1, alignItems: 'center', padding: 16, borderRadius: 14,
                  backgroundColor: isLeading && !isDone ? C.orange + '10' : C.surface,
                  borderWidth: 1, borderColor: isLeading && !isDone ? C.orange + '44' : C.border }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 2,
                    color: isLeading && !isDone ? C.orange : C.mutedHi, marginBottom: 4 }} numberOfLines={1}>{name}</Text>
                  <Text style={{ fontSize: 88, fontWeight: '900', lineHeight: 92,
                    color: matchWinner === pos ? C.gold : isDraw && !isDone ? C.mutedHi : C.ink }}>
                    {goals}
                  </Text>
                  {phase === 'penalties' && (
                    <Text style={{ fontSize: 12, color: C.gold, fontWeight: '700', marginTop: 4 }}>
                      ({pos === 1 ? penGoals1 : penGoals2} pens)
                    </Text>
                  )}
                </View>
              );
            })}
          </View>

          {/* Pre-live */}
          {isPreLive && (
            <TouchableOpacity onPress={handleGoLive}
              style={{ paddingVertical: 20, borderRadius: 12, alignItems: 'center', backgroundColor: C.orange }}>
              <Text style={{ fontSize: 16, fontWeight: '900', color: '#000', letterSpacing: 2, textTransform: 'uppercase' }}>
                ▶ KICK OFF
              </Text>
            </TouchableOpacity>
          )}

          {/* Goal buttons */}
          {!isDone && !isPreLive && phase !== 'penalties' && (
            <View style={{ flexDirection: 'row', gap: 10 }}>
              {([{ pos: 1, name: p1Name, goals: goals1 }, { pos: 2, name: p2Name, goals: goals2 }] as any[]).map(({ pos, name, goals }) => (
                <View key={pos} style={{ flex: 1, gap: 6 }}>
                  <TouchableOpacity onPress={() => addGoal(pos)} disabled={submitting}
                    style={{ paddingVertical: 20, borderRadius: 12, alignItems: 'center',
                      backgroundColor: C.orange, opacity: submitting ? 0.5 : 1 }}>
                    <Text style={{ fontSize: 15, fontWeight: '900', color: '#000' }}>GOAL</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => removeGoal(pos)} disabled={goals === 0 || submitting}
                    style={{ paddingVertical: 9, borderRadius: 8, alignItems: 'center',
                      borderWidth: 1, borderColor: C.border, opacity: goals === 0 ? 0.35 : 1 }}>
                    <Text style={{ color: C.muted, fontSize: 12, fontWeight: '700' }}>↩ Undo</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}

          {/* Half control */}
          {!isDone && !isPreLive && (
            <View>
              <Text style={{ fontSize: 11, fontWeight: '800', color: C.muted, textTransform: 'uppercase',
                letterSpacing: 1, marginBottom: 8 }}>Half / Phase</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {[1, 2].map(h => (
                  <TouchableOpacity key={h} onPress={() => changeHalf(h)}
                    style={{ borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8,
                      backgroundColor: half === h ? C.orange : C.surface,
                      borderWidth: 1, borderColor: half === h ? C.orange : C.border }}>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: half === h ? '#000' : C.muted }}>
                      {halfLabel(h)}
                    </Text>
                  </TouchableOpacity>
                ))}
                {/* Full time (disabled in 1st half) */}
                {half >= 2 && phase !== 'penalties' && (
                  <TouchableOpacity onPress={handleFullTime}
                    style={{ borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8,
                      backgroundColor: C.green, borderWidth: 1, borderColor: C.green }}>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: '#000' }}>
                      {isDraw && isKnockout ? 'Full Time →' : 'Full Time ✓'}
                    </Text>
                  </TouchableOpacity>
                )}
                {isKnockout && (
                  <>
                    {[3, 4].map(h => (
                      <TouchableOpacity key={h} onPress={() => changeHalf(h)}
                        style={{ borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8,
                          backgroundColor: half === h ? '#f59e0b' : C.surface,
                          borderWidth: 1, borderColor: half === h ? '#f59e0b' : C.border }}>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: half === h ? '#000' : C.muted }}>
                          {halfLabel(h)}
                        </Text>
                      </TouchableOpacity>
                    ))}
                    <TouchableOpacity onPress={() => { changeHalf(5); setPhase('penalties'); }}
                      style={{ borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8,
                        backgroundColor: phase === 'penalties' ? C.gold : C.surface,
                        borderWidth: 1, borderColor: phase === 'penalties' ? C.gold : C.border }}>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: phase === 'penalties' ? '#000' : C.muted }}>
                        Penalties
                      </Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>
            </View>
          )}

          {/* Penalties UI */}
          {!isDone && phase === 'penalties' && (
            <View style={{ gap: 14 }}>
              <Text style={{ fontSize: 14, fontWeight: '800', color: C.gold, textAlign: 'center' }}>
                Penalty Shootout — {p1Name} {penGoals1}–{penGoals2} {p2Name}
              </Text>

              {/* Pen slots */}
              <View style={{ gap: 10 }}>
                {([{ team: 1, name: p1Name, pens: penH1 }, { team: 2, name: p2Name, pens: penH2 }] as any[]).map(({ team, name, pens }) => (
                  <View key={team}>
                    <Text style={{ fontSize: 11, color: C.mutedHi, fontWeight: '700', marginBottom: 6 }}>{name}</Text>
                    <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                      {Array.from({ length: slotsToShow }).map((_, i) => (
                        <PenSlot key={i} result={pens[i] ?? ''} isCurrent={nextPenTeam === team && i === pens.length} />
                      ))}
                    </View>
                  </View>
                ))}
              </View>

              {/* Pen buttons */}
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 10, color: C.muted, textAlign: 'center', marginBottom: 4 }}>
                    {nextPenTeam === 1 ? `${p1Name} kicks` : p2Name === 'Team 2' ? 'Waiting...' : ''}
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    <TouchableOpacity onPress={() => recordPen(nextPenTeam as 1 | 2, 'H')}
                      style={{ flex: 1, paddingVertical: 14, borderRadius: 10, alignItems: 'center', backgroundColor: C.green }}>
                      <Text style={{ color: '#000', fontWeight: '900', fontSize: 14 }}>✓ Goal</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => recordPen(nextPenTeam as 1 | 2, 'M')}
                      style={{ flex: 1, paddingVertical: 14, borderRadius: 10, alignItems: 'center', backgroundColor: C.red }}>
                      <Text style={{ color: '#fff', fontWeight: '900', fontSize: 14 }}>✗ Miss</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
              <TouchableOpacity onPress={undoPen}
                style={{ paddingVertical: 10, borderRadius: 8, alignItems: 'center', borderWidth: 1, borderColor: C.border }}>
                <Text style={{ color: C.muted, fontWeight: '700', fontSize: 13 }}>↩ Undo Last Pen</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handlePenFinish}
                style={{ paddingVertical: 14, borderRadius: 12, alignItems: 'center', backgroundColor: C.gold }}>
                <Text style={{ color: '#000', fontWeight: '900', fontSize: 14 }}>Finish Penalties ✓</Text>
              </TouchableOpacity>
            </View>
          )}

          {!isDone && !isPreLive && (
            <TouchableOpacity onPress={() => setWalkoverVis(true)}
              style={{ paddingVertical: 10, borderRadius: 8, alignItems: 'center', borderWidth: 1, borderColor: C.red + '30' }}>
              <Text style={{ color: C.red, fontWeight: '700', fontSize: 13 }}>Walkover</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </SafeAreaView>

      <Modal visible={walkoverVis} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.95)',
          alignItems: 'center', justifyContent: 'center', padding: 32, gap: 20 }}>
          <Text style={{ color: C.red, fontWeight: '900', fontSize: 10, letterSpacing: 4, textTransform: 'uppercase' }}>Walkover</Text>
          <View style={{ flexDirection: 'row', gap: 14, width: '100%' }}>
            {([{ pos: 1, name: p1Name }, { pos: 2, name: p2Name }] as any[]).map(({ pos, name }) => (
              <TouchableOpacity key={pos} onPress={() => handleWalkover(pos as 1 | 2)}
                style={{ flex: 1, padding: 20, borderRadius: 12, alignItems: 'center',
                  backgroundColor: C.red + '18', borderWidth: 2, borderColor: C.red + '55' }}>
                <Text style={{ fontSize: 14, fontWeight: '800', color: C.red }}>{name}</Text>
                <Text style={{ fontSize: 10, color: C.muted, marginTop: 4 }}>wins</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity onPress={() => setWalkoverVis(false)}
            style={{ borderRadius: 7, borderWidth: 1, borderColor: C.border, paddingHorizontal: 24, paddingVertical: 10 }}>
            <Text style={{ color: C.muted, fontWeight: '700', fontSize: 12 }}>↩ Cancel</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </View>
  );
}
