/**
 * Badminton Scorer — fullscreen mobile scorer.
 * Rally scoring: winner of every rally becomes the server.
 * No set-confirmation overlay (points go straight to backend).
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
  apiUpdateMatchStatus, apiUpdateScore, apiUndoSet, apiWalkoverMatch, apiGetWorkspace,
} from '../../../../src/api/client';

const C = {
  bg:       '#0d0d0d',
  surface:  '#1a1a1a',
  border:   '#2a2a2a',
  blue:     '#3b82f6',
  blueDim:  '#1d4ed8',
  gold:     '#facc15',
  red:      '#ef4444',
  green:    '#22c55e',
  muted:    '#666',
  mutedHi:  '#999',
  ink:      '#fff',
};

export default function BadmintonScorerScreen() {
  const params   = useLocalSearchParams<{ matchId: string; eventId?: string; tournamentId?: string }>();
  const { matchId } = params;
  const router       = useRouter();
  const { token }    = useAuthStore();

  const [match,       setMatch]      = useState<any>(null);
  const [loading,     setLoading]    = useState(true);
  const [walkoverVis, setWalkoverVis] = useState(false);
  const [submitting,  setSubmitting]  = useState(false);

  const loadMatch = useCallback(async () => {
    if (!params.tournamentId) return;
    try {
      const ws = await apiGetWorkspace(token!, parseInt(params.tournamentId));
      const ev = (ws.events ?? []).find((e: any) => e.event_id === parseInt(params.eventId ?? '0'));
      const m  = (ev?.matches ?? []).find((m: any) => m.match_id === parseInt(matchId));
      if (m) setMatch(m);
    } catch {}
    setLoading(false);
  }, [matchId, params.tournamentId, params.eventId, token]);

  useFocusEffect(useCallback(() => { loadMatch(); }, [loadMatch]));

  if (loading) return (
    <View style={{ flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator color={C.blue} size="large" />
    </View>
  );
  if (!match) return (
    <View style={{ flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: C.muted }}>Match not found.</Text>
      <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)/organiser' as any)} style={{ marginTop: 12 }}>
        <Text style={{ color: C.blue, fontSize: 14 }}>← Back</Text>
      </TouchableOpacity>
    </View>
  );

  const sets       = (match.sets ?? []).slice().sort((a: any, b: any) => a.set_number - b.set_number);
  const currentSet = sets.find((s: any) => !s.is_complete) ?? sets[sets.length - 1];
  const isDone     = match.status === 'done';
  const isPreLive  = match.status === 'scheduled';
  const config     = match.sport_config ?? {};

  const pts     = config.points_per_set ?? 21;
  const margin  = config.win_margin     ?? 2;
  const maxPts  = config.max_points     ?? 30;
  const deuceAt = config.deuce_starts_at ?? (pts - 1);

  const s1 = currentSet?.score_p1 ?? 0;
  const s2 = currentSet?.score_p2 ?? 0;

  const isDeuce   = s1 >= deuceAt && s2 >= deuceAt;
  const isCap     = s1 >= maxPts - 1 || s2 >= maxPts - 1;

  const setWinner: 1 | 2 | null = (() => {
    if (s1 >= maxPts && s1 > s2) return 1;
    if (s2 >= maxPts && s2 > s1) return 2;
    if (s1 >= pts && s1 - s2 >= margin) return 1;
    if (s2 >= pts && s2 - s1 >= margin) return 2;
    return null;
  })();

  const setsWon1   = sets.filter((s: any) => s.is_complete && (s.winner_position === 1 || s.winner === 1)).length;
  const setsWon2   = sets.filter((s: any) => s.is_complete && (s.winner_position === 2 || s.winner === 2)).length;
  const setsToWin  = config.sets_to_win ?? 2;
  const matchWinner = isDone ? (match.player_1?.is_winner ? 1 : match.player_2?.is_winner ? 2 : null) : null;

  const serving    = isDone ? null : (match.current_server ?? 1);
  const p1Name     = match.player_1?.name ?? 'Player 1';
  const p2Name     = match.player_2?.name ?? 'Player 2';

  const doScore = async (ns1: number, ns2: number, srv: number) => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const updated = await apiUpdateScore(token!, parseInt(matchId), {
        score_p1: ns1, score_p2: ns2, current_server: srv,
      });
      setMatch(updated);
    } catch (e: any) { Alert.alert('Error', e.message); }
    setSubmitting(false);
  };

  const addPoint = (pos: 1 | 2) => {
    if (isDone || setWinner || submitting) return;
    const ns1 = pos === 1 ? s1 + 1 : s1;
    const ns2 = pos === 2 ? s2 + 1 : s2;
    doScore(ns1, ns2, pos); // winner of rally serves next
  };

  const undoPoint = (pos: 1 | 2) => {
    if ((pos === 1 && s1 === 0) || (pos === 2 && s2 === 0)) return;
    doScore(pos === 1 ? s1 - 1 : s1, pos === 2 ? s2 - 1 : s2, serving ?? 1);
  };

  const handleGoLive = async () => {
    try { const u = await apiUpdateMatchStatus(token!, parseInt(matchId), { status: 'live' }); setMatch(u); }
    catch (e: any) { Alert.alert('Error', e.message); }
  };

  const handleUndoSet = async () => {
    try { const u = await apiUndoSet(token!, parseInt(matchId)); setMatch(u); }
    catch (e: any) { Alert.alert('Error', e.message); }
  };

  const handleWalkover = async (pos: 1 | 2) => {
    setWalkoverVis(false);
    try { await apiWalkoverMatch(token!, parseInt(matchId), pos); await loadMatch(); }
    catch (e: any) { Alert.alert('Error', e.message); }
  };

  const SetDots = ({ won, total }: { won: number; total: number }) => (
    <View style={{ flexDirection: 'row', gap: 5, justifyContent: 'center', marginTop: 8 }}>
      {Array.from({ length: total }).map((_, i) => (
        <View key={i} style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: i < won ? C.blue : C.border }} />
      ))}
    </View>
  );

  const scColor1 = matchWinner === 1 ? C.gold : setWinner === 1 ? C.green : C.ink;
  const scColor2 = matchWinner === 2 ? C.gold : setWinner === 2 ? C.green : C.ink;

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />
      <SafeAreaView style={{ flex: 1 }}>

        {/* Top bar */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          padding: 12, backgroundColor: C.surface, borderBottomWidth: 2, borderBottomColor: C.border }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ backgroundColor: isDone ? C.gold : isPreLive ? '#f59e0b' : C.blue,
              borderRadius: 4, paddingHorizontal: 10, paddingVertical: 4 }}>
              <Text style={{ fontSize: 10, fontWeight: '900', color: isDone ? '#000' : '#fff',
                letterSpacing: 1.5, textTransform: 'uppercase' }}>
                {isDone ? 'Final' : isPreLive ? 'Ready' : `Game ${currentSet?.set_number ?? 1}`}
              </Text>
            </View>
            <Text style={{ fontSize: 12, color: C.muted }}>
              <Text style={{ color: C.blue, fontWeight: '800' }}>{setsWon1}</Text>
              {' — '}
              <Text style={{ color: C.blue, fontWeight: '800' }}>{setsWon2}</Text>
            </Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity
              onPress={() => router.push({
                pathname: '/organiser/score/stream/[matchId]',
                params: {
                  matchId,
                  eventId:      params.eventId ?? '',
                  tournamentId: params.tournamentId ?? '',
                  sport:        'badminton',
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

        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 16, gap: 16 }}>

          {/* Completed games */}
          {sets.filter((s: any) => s.is_complete).length > 0 && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6 }}>
              {sets.filter((s: any) => s.is_complete).map((s: any) => {
                const w = s.winner_position ?? s.winner;
                return (
                  <View key={s.set_number} style={{ borderRadius: 5, paddingHorizontal: 9, paddingVertical: 3,
                    backgroundColor: (w === 1 ? C.blue : C.red) + '18',
                    borderWidth: 1, borderColor: (w === 1 ? C.blue : C.red) + '33' }}>
                    <Text style={{ fontSize: 10, fontWeight: '800', letterSpacing: 1,
                      color: w === 1 ? C.blue : C.red }}>
                      G{s.set_number}: {s.score_p1}–{s.score_p2}
                    </Text>
                  </View>
                );
              })}
            </View>
          )}

          {/* Status + deuce indicator */}
          {isDeuce && !setWinner && (
            <Text style={{ textAlign: 'center', color: C.gold, fontWeight: '900', fontSize: 13,
              textTransform: 'uppercase', letterSpacing: 2 }}>
              {s1 === s2 ? 'Deuce' : `Advantage ${s1 > s2 ? p1Name : p2Name}`}
            </Text>
          )}
          {isCap && !setWinner && (
            <Text style={{ textAlign: 'center', color: C.red, fontWeight: '700', fontSize: 11 }}>
              Cap point — next point wins
            </Text>
          )}
          {setWinner && !matchWinner && (
            <Text style={{ textAlign: 'center', color: C.green, fontWeight: '900', fontSize: 14,
              textTransform: 'uppercase', letterSpacing: 2 }}>
              Game {currentSet?.set_number} → {setWinner === 1 ? p1Name : p2Name}
            </Text>
          )}
          {matchWinner && (
            <Text style={{ textAlign: 'center', color: C.gold, fontWeight: '900', fontSize: 18,
              textTransform: 'uppercase', letterSpacing: 2 }}>
              {matchWinner === 1 ? p1Name : p2Name} Wins!
            </Text>
          )}

          {/* Score panels */}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {([
              { pos: 1, name: p1Name, score: s1, scCol: scColor1 },
              { pos: 2, name: p2Name, score: s2, scCol: scColor2 },
            ] as any[]).map(({ pos, name, score, scCol }) => {
              const srv = serving === pos;
              return (
                <View key={pos} style={{ flex: 1, alignItems: 'center', padding: 16, borderRadius: 14,
                  backgroundColor: srv && !isDone ? C.blue + '12' : C.surface,
                  borderWidth: 1, borderColor: srv && !isDone ? C.blue + '55' : C.border }}>
                  <View style={{ height: 10, justifyContent: 'center', marginBottom: 8 }}>
                    {srv && !isDone && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: C.blue }} />}
                  </View>
                  <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 2, textTransform: 'uppercase',
                    color: srv && !isDone ? C.blue : C.mutedHi, marginBottom: 4 }} numberOfLines={1}>{name}</Text>
                  <Text style={{ fontSize: 88, fontWeight: '900', lineHeight: 92, color: scCol }}>{score}</Text>
                  <SetDots won={pos === 1 ? setsWon1 : setsWon2} total={setsToWin} />
                </View>
              );
            })}
          </View>

          {/* Pre-live */}
          {isPreLive && (
            <TouchableOpacity onPress={handleGoLive}
              style={{ paddingVertical: 20, borderRadius: 12, alignItems: 'center', backgroundColor: C.blue }}>
              <Text style={{ fontSize: 16, fontWeight: '900', color: '#fff', letterSpacing: 2, textTransform: 'uppercase' }}>
                ▶ GO LIVE
              </Text>
            </TouchableOpacity>
          )}

          {/* Point buttons */}
          {!isDone && !isPreLive && (
            <View style={{ flexDirection: 'row', gap: 10 }}>
              {([{ pos: 1, name: p1Name }, { pos: 2, name: p2Name }] as any[]).map(({ pos, name }) => {
                const score  = pos === 1 ? s1 : s2;
                const srv    = serving === pos;
                const disabled = !!(setWinner || submitting);
                return (
                  <View key={pos} style={{ flex: 1, gap: 6 }}>
                    <TouchableOpacity onPress={() => addPoint(pos)} disabled={disabled}
                      style={{ paddingVertical: 20, borderRadius: 12, alignItems: 'center',
                        backgroundColor: disabled ? '#111' : srv ? C.blue : C.blueDim,
                        borderWidth: 3, borderColor: srv && !disabled ? C.blue : 'transparent',
                        opacity: disabled ? 0.4 : 1 }}>
                      <Text style={{ fontSize: 15, fontWeight: '900', color: disabled ? C.muted : '#fff' }}>+ Point</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => undoPoint(pos)} disabled={score === 0 || submitting}
                      style={{ paddingVertical: 9, borderRadius: 8, alignItems: 'center',
                        borderWidth: 1, borderColor: C.border, opacity: score === 0 ? 0.35 : 1 }}>
                      <Text style={{ color: C.muted, fontSize: 12, fontWeight: '700' }}>↩ Undo</Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>
          )}

          {!isDone && !isPreLive && sets.length > 0 && (
            <TouchableOpacity onPress={handleUndoSet}
              style={{ paddingVertical: 11, borderRadius: 8, alignItems: 'center', borderWidth: 1, borderColor: C.border }}>
              <Text style={{ color: C.muted, fontWeight: '700', fontSize: 13 }}>↩ Undo Last Game</Text>
            </TouchableOpacity>
          )}
          {!isDone && !isPreLive && (
            <TouchableOpacity onPress={() => setWalkoverVis(true)}
              style={{ paddingVertical: 11, borderRadius: 8, alignItems: 'center', borderWidth: 1, borderColor: C.red + '30' }}>
              <Text style={{ color: C.red, fontWeight: '700', fontSize: 13 }}>Walkover / No Show</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </SafeAreaView>

      {/* Walkover */}
      <Modal visible={walkoverVis} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.95)',
          alignItems: 'center', justifyContent: 'center', padding: 32, gap: 20 }}>
          <Text style={{ color: C.red, fontWeight: '900', fontSize: 10, letterSpacing: 4, textTransform: 'uppercase' }}>
            Walkover / No Show
          </Text>
          <Text style={{ color: C.muted, fontSize: 14, textAlign: 'center' }}>Who wins?</Text>
          <View style={{ flexDirection: 'row', gap: 14, width: '100%' }}>
            {([{ pos: 1, name: p1Name }, { pos: 2, name: p2Name }] as any[]).map(({ pos, name }) => (
              <TouchableOpacity key={pos} onPress={() => handleWalkover(pos as 1 | 2)}
                style={{ flex: 1, padding: 20, borderRadius: 12, alignItems: 'center',
                  backgroundColor: C.red + '18', borderWidth: 2, borderColor: C.red + '55' }}>
                <Text style={{ fontSize: 14, fontWeight: '800', color: C.red }}>{name}</Text>
                <Text style={{ fontSize: 10, color: C.muted, marginTop: 4 }}>wins by walkover</Text>
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
