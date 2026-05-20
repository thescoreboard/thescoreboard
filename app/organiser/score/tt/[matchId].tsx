/**
 * Table Tennis Scorer — fullscreen mobile scorer.
 * Mirrors TTScorer.jsx: set confirmation overlay, serve tracking, swap sides.
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView,
  ActivityIndicator, Alert, Modal, StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuthStore } from '../../../../src/store/auth';
import {
  apiUpdateMatchStatus, apiUpdateScore, apiUndoSet, apiWalkoverMatch, apiGetWorkspace,
} from '../../../../src/api/client';

const C = {
  bg:       '#080b08',
  surface:  '#111711',
  surface2: '#182018',
  border:   '#1f2b1f',
  green:    '#22c55e',
  greenDim: '#16a34a',
  gold:     '#facc15',
  red:      '#ef4444',
  muted:    '#5a6e5a',
  mutedHi:  '#8aaa8a',
  ink:      '#f0fdf0',
};

export default function TTScorerScreen() {
  const params = useLocalSearchParams<{ matchId: string; eventId?: string; tournamentId?: string }>();
  const { matchId } = params;
  const router                 = useRouter();
  const { token }              = useAuthStore();

  const [match,       setMatch]       = useState<any>(null);
  const [loading,     setLoading]     = useState(true);
  const [firstServer, setFirstServer] = useState<1 | 2>(1);
  const [pendingSet,  setPendingSet]  = useState<any>(null);
  const [walkoverVisible, setWalkoverVisible] = useState(false);
  const [baseSwap,    setBaseSwap]    = useState(false);
  const [submitting,  setSubmitting]  = useState(false);

  const loadMatch = useCallback(async () => {
    if (!params.tournamentId) return;
    try {
      const ws = await apiGetWorkspace(token!, parseInt(params.tournamentId));
      const ev = (ws.events ?? []).find((e: any) =>
        e.event_id === parseInt(params.eventId ?? '0')
      );
      const m = (ev?.matches ?? []).find((m: any) => m.match_id === parseInt(matchId));
      if (m) {
        setMatch(m);
        if (m.current_server) setFirstServer(m.current_server);
      }
    } catch {}
    setLoading(false);
  }, [matchId, params.tournamentId, params.eventId, token]);

  useEffect(() => { loadMatch(); }, [loadMatch]);

  // ── Derived ───────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={C.green} size="large" />
      </View>
    );
  }

  if (!match) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Text style={{ color: C.muted, fontSize: 15 }}>Match not found.</Text>
        <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)/organiser' as any)} style={{ marginTop: 16 }}>
          <Text style={{ color: C.green, fontSize: 14 }}>← Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const sets          = (match.sets ?? []).slice().sort((a: any, b: any) => a.set_number - b.set_number);
  const currentSet    = sets.find((s: any) => !s.is_complete) ?? sets[sets.length - 1];
  const isDone        = match.status === 'done';
  const isPreLive     = match.status === 'scheduled';
  const config        = match.sport_config ?? {};

  const setsToWin = match.live_state?.sets_to_win ?? config?.sets_to_win ?? 2;
  const totalSets = setsToWin * 2 - 1;
  const pts       = config?.points_per_set ?? 11;
  const margin    = config?.win_margin ?? 2;
  const deuceAt   = config?.deuce_starts_at ?? (pts - 1);

  const s1 = currentSet?.score_p1 ?? 0;
  const s2 = currentSet?.score_p2 ?? 0;

  const setsWon1     = sets.filter((s: any) => s.is_complete && s.winner === 1).length;
  const setsWon2     = sets.filter((s: any) => s.is_complete && s.winner === 2).length;
  const completedSets = sets.filter((s: any) => s.is_complete).length;

  const autoSwap  = completedSets % 2 !== 0;
  const isSwapped = baseSwap !== autoSwap;

  const leftPos   = isSwapped ? 2 : 1;
  const rightPos  = isSwapped ? 1 : 2;
  const p1        = match.player_1 ?? {};
  const p2        = match.player_2 ?? {};
  const leftName  = isSwapped ? (p2?.name ?? 'Player 2') : (p1?.name ?? 'Player 1');
  const rightName = isSwapped ? (p1?.name ?? 'Player 1') : (p2?.name ?? 'Player 2');
  const leftScore  = isSwapped ? s2 : s1;
  const rightScore = isSwapped ? s1 : s2;

  const leftSetsWon  = isSwapped ? setsWon2 : setsWon1;
  const rightSetsWon = isSwapped ? setsWon1 : setsWon2;

  // Serve calculation
  const isDeuce = s1 >= deuceAt && s2 >= deuceAt;
  const serving: 1 | 2 | null = isDone ? null : (() => {
    const other = firstServer === 1 ? 2 : 1;
    if (isDeuce) {
      const deuceTotal = (s1 + s2) - (deuceAt * 2);
      return deuceTotal % 2 === 0 ? firstServer : other;
    }
    const interval = config?.serve_interval ?? 2;
    const flips = Math.floor((s1 + s2) / interval);
    return flips % 2 === 0 ? firstServer : other;
  })();

  const leftServing  = serving === leftPos;
  const rightServing = serving === rightPos;

  // Set winner check
  const checkSetWin = (ns1: number, ns2: number): 1 | 2 | null => {
    const d = ns1 >= deuceAt && ns2 >= deuceAt;
    if (d) {
      if (ns1 - ns2 >= margin) return 1;
      if (ns2 - ns1 >= margin) return 2;
    } else {
      if (ns1 >= pts) return 1;
      if (ns2 >= pts) return 2;
    }
    return null;
  };

  const setWinner = checkSetWin(s1, s2);
  const matchWinner = isDone ? (p1?.is_winner ? 1 : p2?.is_winner ? 2 : null) : null;

  const canSwap = s1 === 0 && s2 === 0 &&
    sets.filter((s: any) => s.is_complete).reduce((a: number, s: any) => a + s.score_p1 + s.score_p2, 0) === 0
    && !isDone;

  // ── Actions ───────────────────────────────────────────────────
  const doScore = async (ns1: number, ns2: number, srv: number | null) => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const updated = await apiUpdateScore(token!, parseInt(matchId), {
        score_p1: ns1, score_p2: ns2, current_server: srv,
      });
      setMatch(updated);
      if (updated?.current_server) setFirstServer(updated.current_server);
    } catch (e: any) { Alert.alert('Error', e.message); }
    setSubmitting(false);
  };

  const addPoint = (pos: 1 | 2) => {
    if (isDone || setWinner || pendingSet || submitting) return;
    const ns1 = pos === 1 ? s1 + 1 : s1;
    const ns2 = pos === 2 ? s2 + 1 : s2;
    const winner = checkSetWin(ns1, ns2);
    if (winner) {
      const pSW1 = setsWon1 + (winner === 1 ? 1 : 0);
      const pSW2 = setsWon2 + (winner === 2 ? 1 : 0);
      setPendingSet({
        ns1, ns2, winner,
        setNumber:    currentSet?.set_number ?? 1,
        projSetsWon1: pSW1, projSetsWon2: pSW2,
        willEndMatch: pSW1 >= setsToWin || pSW2 >= setsToWin,
      });
    } else {
      doScore(ns1, ns2, serving);
    }
  };

  const confirmSet = () => {
    if (!pendingSet) return;
    doScore(pendingSet.ns1, pendingSet.ns2, serving);
    setPendingSet(null);
  };

  const undoPoint = (pos: 1 | 2) => {
    if ((pos === 1 && s1 === 0) || (pos === 2 && s2 === 0)) return;
    doScore(pos === 1 ? s1 - 1 : s1, pos === 2 ? s2 - 1 : s2, serving);
  };

  const handleGoLive = async () => {
    try {
      const updated = await apiUpdateMatchStatus(token!, parseInt(matchId), { status: 'live' });
      setMatch(updated);
    } catch (e: any) { Alert.alert('Error', e.message); }
  };

  const handleUndoSet = async () => {
    try {
      const updated = await apiUndoSet(token!, parseInt(matchId));
      setMatch(updated);
    } catch (e: any) { Alert.alert('Error', e.message); }
  };

  const handleWalkover = async (pos: 1 | 2) => {
    setWalkoverVisible(false);
    try {
      await apiWalkoverMatch(token!, parseInt(matchId), pos);
      await loadMatch();
    } catch (e: any) { Alert.alert('Error', e.message); }
  };

  // ── Set dots ──────────────────────────────────────────────────
  const SetDots = ({ won, total }: { won: number; total: number }) => (
    <View style={{ flexDirection: 'row', gap: 5, justifyContent: 'center', marginTop: 8 }}>
      {Array.from({ length: total }).map((_, i) => (
        <View key={i} style={{ width: 9, height: 9, borderRadius: 5,
          backgroundColor: i < won ? C.green : C.border }} />
      ))}
    </View>
  );

  const leftScoreColor  = matchWinner === leftPos  ? C.gold : setWinner === leftPos  ? C.green : C.ink;
  const rightScoreColor = matchWinner === rightPos ? C.gold : setWinner === rightPos ? C.green : C.ink;

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />
      <SafeAreaView style={{ flex: 1 }}>

        {/* ── TOP BAR ── */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          padding: 12, backgroundColor: C.surface,
          borderBottomWidth: 2, borderBottomColor: C.border }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ backgroundColor: isDone ? C.gold : isPreLive ? '#f59e0b' : C.green,
              borderRadius: 4, paddingHorizontal: 10, paddingVertical: 4 }}>
              <Text style={{ fontSize: 10, fontWeight: '900', color: '#000', letterSpacing: 1.5, textTransform: 'uppercase' }}>
                {isDone ? 'Final' : isPreLive ? 'Ready' : `Set ${currentSet?.set_number ?? 1} of ${totalSets}`}
              </Text>
            </View>
            <Text style={{ fontSize: 12, color: C.muted }}>
              <Text style={{ color: C.green, fontWeight: '800' }}>{setsWon1}</Text>
              <Text> — </Text>
              <Text style={{ color: C.green, fontWeight: '800' }}>{setsWon2}</Text>
            </Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {canSwap && (
              <TouchableOpacity onPress={() => setBaseSwap(b => !b)}
                style={{ borderRadius: 7, borderWidth: 1, borderColor: C.green + '66',
                  paddingHorizontal: 10, paddingVertical: 6 }}>
                <Text style={{ color: C.green, fontSize: 12, fontWeight: '700' }}>⇌</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)/organiser' as any)}
              style={{ borderRadius: 7, borderWidth: 1, borderColor: C.border,
                paddingHorizontal: 12, paddingVertical: 6 }}>
              <Text style={{ color: C.muted, fontSize: 12, fontWeight: '700' }}>✕ Close</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Auto-swap indicator */}
        {autoSwap && !isDone && (
          <View style={{ backgroundColor: C.green + '12', borderBottomWidth: 1, borderBottomColor: C.green + '22',
            paddingVertical: 5, alignItems: 'center' }}>
            <Text style={{ color: C.greenDim, fontSize: 11, fontWeight: '600', letterSpacing: 1 }}>
              ⇌ Sides switched for Set {currentSet?.set_number ?? 1}
            </Text>
          </View>
        )}

        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 16, gap: 16 }}>

          {/* Set history chips */}
          {completedSets > 0 && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6 }}>
              {sets.filter((s: any) => s.is_complete).map((s: any) => {
                const lScore  = isSwapped ? s.score_p2 : s.score_p1;
                const rScore  = isSwapped ? s.score_p1 : s.score_p2;
                const leftWon = isSwapped ? s.winner === 2 : s.winner === 1;
                return (
                  <View key={s.set_number} style={{ borderRadius: 5, paddingHorizontal: 9, paddingVertical: 3,
                    backgroundColor: leftWon ? C.green + '18' : C.red + '18',
                    borderWidth: 1, borderColor: (leftWon ? C.green : C.red) + '33' }}>
                    <Text style={{ fontSize: 10, fontWeight: '800', letterSpacing: 1,
                      color: leftWon ? C.green : C.red }}>S{s.set_number}: {lScore}–{rScore}</Text>
                  </View>
                );
              })}
            </View>
          )}

          {/* Serve selector */}
          {!isDone && !setWinner && (
            <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
              {([{ pos: leftPos, label: leftName }, { pos: rightPos, label: rightName }] as any[]).map(({ pos, label }) => (
                <TouchableOpacity key={pos} onPress={() => setFirstServer(pos as 1 | 2)}
                  style={{ borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8,
                    borderWidth: 2,
                    borderColor: serving === pos ? C.green : C.border,
                    backgroundColor: serving === pos ? C.green + '22' : 'transparent' }}>
                  <Text style={{ fontSize: 12, fontWeight: '700',
                    color: serving === pos ? C.green : C.muted }}>{label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Score panels */}
          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'stretch' }}>
            {/* Left */}
            <View style={{ flex: 1, alignItems: 'center', padding: 16, borderRadius: 14,
              backgroundColor: leftServing && !isDone ? C.green + '0e' : C.surface,
              borderWidth: 1, borderColor: leftServing && !isDone ? C.green + '44' : C.border }}>
              <View style={{ height: 10, justifyContent: 'center', marginBottom: 8 }}>
                {leftServing && !isDone && (
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: C.green }} />
                )}
              </View>
              <Text style={{ fontSize: 11, fontWeight: '700', letterSpacing: 2, textTransform: 'uppercase',
                color: leftServing && !isDone ? C.green : C.mutedHi, marginBottom: 4 }}
                numberOfLines={1}>{leftName}</Text>
              <Text style={{ fontSize: 88, fontWeight: '900', lineHeight: 92, color: leftScoreColor }}>
                {leftScore}
              </Text>
              <SetDots won={leftSetsWon} total={setsToWin} />
            </View>

            <View style={{ alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 }}>
              <Text style={{ color: C.border, fontSize: 24, fontWeight: '900' }}>—</Text>
            </View>

            {/* Right */}
            <View style={{ flex: 1, alignItems: 'center', padding: 16, borderRadius: 14,
              backgroundColor: rightServing && !isDone ? C.green + '0e' : C.surface,
              borderWidth: 1, borderColor: rightServing && !isDone ? C.green + '44' : C.border }}>
              <View style={{ height: 10, justifyContent: 'center', marginBottom: 8 }}>
                {rightServing && !isDone && (
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: C.green }} />
                )}
              </View>
              <Text style={{ fontSize: 11, fontWeight: '700', letterSpacing: 2, textTransform: 'uppercase',
                color: rightServing && !isDone ? C.green : C.mutedHi, marginBottom: 4 }}
                numberOfLines={1}>{rightName}</Text>
              <Text style={{ fontSize: 88, fontWeight: '900', lineHeight: 92, color: rightScoreColor }}>
                {rightScore}
              </Text>
              <SetDots won={rightSetsWon} total={setsToWin} />
            </View>
          </View>

          {/* Status text */}
          {isDeuce && !setWinner && (
            <Text style={{ textAlign: 'center', fontSize: 13, fontWeight: '800', color: C.red,
              textTransform: 'uppercase', letterSpacing: 2 }}>
              {s1 === s2 ? 'Deuce' : `Adv: ${s1 > s2 ? (isSwapped ? rightName : leftName) : (isSwapped ? leftName : rightName)}`}
            </Text>
          )}
          {setWinner && !matchWinner && (
            <Text style={{ textAlign: 'center', fontSize: 14, fontWeight: '800', color: C.green,
              textTransform: 'uppercase', letterSpacing: 2 }}>
              Set {currentSet?.set_number} → {setWinner === leftPos ? leftName : rightName}
            </Text>
          )}
          {matchWinner && (
            <Text style={{ textAlign: 'center', fontSize: 18, fontWeight: '900', color: C.gold,
              textTransform: 'uppercase', letterSpacing: 2 }}>
              {matchWinner === leftPos ? leftName : rightName} Wins! 🏆
            </Text>
          )}

          {/* Pre-live GO LIVE */}
          {isPreLive && (
            <View style={{ alignItems: 'center', paddingVertical: 8 }}>
              <Text style={{ fontSize: 12, color: C.muted, marginBottom: 16, textAlign: 'center' }}>
                Select who serves first, then start.
              </Text>
              <TouchableOpacity onPress={handleGoLive}
                style={{ width: '100%', paddingVertical: 20, borderRadius: 12, alignItems: 'center',
                  backgroundColor: C.green }}>
                <Text style={{ fontSize: 16, fontWeight: '900', color: '#000', letterSpacing: 2, textTransform: 'uppercase' }}>
                  ▶ GO LIVE
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Point buttons */}
          {!isDone && !isPreLive && (
            <View style={{ flexDirection: 'row', gap: 10 }}>
              {([
                { pos: leftPos,  score: leftScore,  serving: leftServing  },
                { pos: rightPos, score: rightScore, serving: rightServing },
              ] as any[]).map(({ pos, score, serving: srv }) => {
                const disabled = !!(setWinner || pendingSet || submitting);
                return (
                  <View key={pos} style={{ flex: 1, gap: 6 }}>
                    <TouchableOpacity onPress={() => addPoint(pos)} disabled={disabled}
                      style={{ paddingVertical: 20, borderRadius: 12, alignItems: 'center',
                        backgroundColor: disabled ? C.surface2 : srv ? C.green : C.greenDim,
                        borderWidth: 3, borderColor: srv && !disabled ? C.green : 'transparent',
                        opacity: disabled ? 0.4 : 1 }}>
                      <Text style={{ fontSize: 15, fontWeight: '900', color: disabled ? C.muted : '#000' }}>
                        + Point
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => undoPoint(pos)}
                      disabled={score === 0 || !!pendingSet}
                      style={{ paddingVertical: 9, borderRadius: 8, alignItems: 'center',
                        backgroundColor: 'transparent', borderWidth: 1, borderColor: C.border,
                        opacity: score === 0 || pendingSet ? 0.35 : 1 }}>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: C.muted }}>↩ Undo</Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>
          )}

          {/* Undo last set + walkover */}
          {!isDone && !isPreLive && sets.length > 0 && !pendingSet && (
            <TouchableOpacity onPress={handleUndoSet}
              style={{ paddingVertical: 11, borderRadius: 8, alignItems: 'center',
                borderWidth: 1, borderColor: C.border }}>
              <Text style={{ color: C.muted, fontWeight: '700', fontSize: 13 }}>↩ Undo Last Set</Text>
            </TouchableOpacity>
          )}
          {!isDone && !isPreLive && !pendingSet && (
            <TouchableOpacity onPress={() => setWalkoverVisible(true)}
              style={{ paddingVertical: 11, borderRadius: 8, alignItems: 'center',
                borderWidth: 1, borderColor: C.red + '30' }}>
              <Text style={{ color: C.red, fontWeight: '700', fontSize: 13 }}>Walkover / No Show</Text>
            </TouchableOpacity>
          )}

        </ScrollView>
      </SafeAreaView>

      {/* ── Set Confirmation Overlay ── */}
      <Modal visible={!!pendingSet} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.93)',
          alignItems: 'center', justifyContent: 'center', padding: 32, gap: 20 }}>
          <Text style={{ fontSize: 10, fontWeight: '900', letterSpacing: 4, textTransform: 'uppercase',
            color: pendingSet?.willEndMatch ? C.gold : C.green }}>
            {pendingSet?.willEndMatch ? 'Match Point' : `Set ${pendingSet?.setNumber} Complete`}
          </Text>
          <View style={{ alignItems: 'center', gap: 4 }}>
            <Text style={{ fontSize: 22, fontWeight: '900', letterSpacing: -0.5,
              color: pendingSet?.winner === leftPos ? C.green : C.red }}>
              {pendingSet?.winner === leftPos ? leftName : rightName}
            </Text>
            <Text style={{ fontSize: 13, color: C.muted, fontWeight: '600' }}>
              {pendingSet?.willEndMatch ? 'wins the match' : 'wins the set'}
            </Text>
          </View>
          <View style={{ backgroundColor: C.surface2, borderRadius: 12, padding: 20,
            borderWidth: 1, borderColor: C.border, alignItems: 'center', gap: 12, width: '100%' }}>
            <Text style={{ fontSize: 34, fontWeight: '900', color: C.ink, letterSpacing: 2 }}>
              {isSwapped ? pendingSet?.ns2 : pendingSet?.ns1} – {isSwapped ? pendingSet?.ns1 : pendingSet?.ns2}
            </Text>
            <Text style={{ fontSize: 11, color: C.muted }}>Set {pendingSet?.setNumber} score</Text>
            <View style={{ borderTopWidth: 1, borderTopColor: C.border, paddingTop: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Text style={{ fontSize: 13, color: C.muted }}>Sets: </Text>
              <Text style={{ fontSize: 14, fontWeight: '900',
                color: pendingSet?.winner === leftPos ? C.green : C.ink }}>
                {isSwapped ? pendingSet?.projSetsWon2 : pendingSet?.projSetsWon1}
              </Text>
              <Text style={{ color: C.border, fontSize: 14 }}>—</Text>
              <Text style={{ fontSize: 14, fontWeight: '900',
                color: pendingSet?.winner === rightPos ? C.green : C.ink }}>
                {isSwapped ? pendingSet?.projSetsWon1 : pendingSet?.projSetsWon2}
              </Text>
              <Text style={{ fontSize: 11, color: C.muted }}>of {setsToWin}</Text>
            </View>
          </View>
          <TouchableOpacity onPress={confirmSet}
            style={{ width: '100%', paddingVertical: 16, borderRadius: 12, alignItems: 'center',
              backgroundColor: pendingSet?.willEndMatch ? C.gold : C.green }}>
            <Text style={{ fontSize: 14, fontWeight: '900', color: '#000', textTransform: 'uppercase', letterSpacing: 1 }}>
              {pendingSet?.willEndMatch ? 'Confirm Result →' : `Set ${(pendingSet?.setNumber ?? 0) + 1} →`}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setPendingSet(null)}
            style={{ borderRadius: 7, borderWidth: 1, borderColor: C.border,
              paddingHorizontal: 24, paddingVertical: 10 }}>
            <Text style={{ color: C.muted, fontWeight: '700', fontSize: 12 }}>↩ Cancel</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      {/* ── Walkover Overlay ── */}
      <Modal visible={walkoverVisible} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.95)',
          alignItems: 'center', justifyContent: 'center', padding: 32, gap: 20 }}>
          <Text style={{ fontSize: 10, fontWeight: '900', letterSpacing: 4, color: C.red, textTransform: 'uppercase' }}>
            Walkover / No Show
          </Text>
          <Text style={{ fontSize: 14, color: C.muted, textAlign: 'center' }}>
            Who wins? (opponent forfeited or did not show)
          </Text>
          <View style={{ flexDirection: 'row', gap: 14, width: '100%' }}>
            {([{ pos: leftPos, name: leftName }, { pos: rightPos, name: rightName }] as any[]).map(({ pos, name }) => (
              <TouchableOpacity key={pos} onPress={() => handleWalkover(pos as 1 | 2)}
                style={{ flex: 1, padding: 20, borderRadius: 12, alignItems: 'center',
                  backgroundColor: C.red + '18', borderWidth: 2, borderColor: C.red + '55' }}>
                <Text style={{ fontSize: 14, fontWeight: '800', color: C.red, textAlign: 'center' }}>{name}</Text>
                <Text style={{ fontSize: 10, color: C.muted, marginTop: 4 }}>wins by walkover</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity onPress={() => setWalkoverVisible(false)}
            style={{ borderRadius: 7, borderWidth: 1, borderColor: C.border, paddingHorizontal: 24, paddingVertical: 10 }}>
            <Text style={{ color: C.muted, fontWeight: '700', fontSize: 12 }}>↩ Cancel</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </View>
  );
}
