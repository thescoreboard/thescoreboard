/**
 * Event Workspace — mirrors EventWorkspace.jsx
 * Tabs: Overview · Players/Pairs/Teams · Fixtures · Standings · Live
 * Live matches launch the dedicated scorer screen for each sport.
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  Alert, ActivityIndicator, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTheme } from '../../../../../src/hooks/useTheme';
import { useAuthStore } from '../../../../../src/store/auth';
import {
  apiGetWorkspace,
  apiCreatePlayer, apiAddPlayerToEvent, apiRemovePlayerFromEvent, apiAssignPlayerGroup,
  apiUpdateParticipantSeed, apiCreateGroup,
  apiCreateTeam, apiAddTeamToEvent, apiRemoveTeamFromEvent, apiGetEventTeams,
  apiGenerateFixtures, apiGenerateGroupMatches, apiGenerateGroups,
  apiGenerateKnockoutFromGroups, apiCreateMatch, apiDeleteMatch,
  apiUpdateMatchStatus, apiUpdateScore, apiUndoSet, apiRematchMatch,
  apiWalkoverMatch, apiGetStandings,
} from '../../../../../src/api/client';
import { SPORT_ICONS } from '../../../../../src/theme';

const SPORT_META: Record<string, { abbrev: string; label: string }> = {
  table_tennis: { abbrev: 'TT', label: 'Table Tennis' },
  badminton:    { abbrev: 'BD', label: 'Badminton'    },
  cricket:      { abbrev: 'CR', label: 'Cricket'      },
  football:     { abbrev: 'FB', label: 'Football'     },
};

const STAGE_LABELS: Record<string, string> = {
  group: 'Group', r128: 'R128', r64: 'R64', r32: 'R32',
  r16: 'R16', qf: 'QF', sf: 'SF', final: 'Final', third_place: '3rd Place',
};

export default function EventWorkspaceScreen() {
  const { id, eventId } = useLocalSearchParams<{ id: string; eventId: string }>();
  const { theme }       = useTheme();
  const router          = useRouter();
  const { token }       = useAuthStore();
  const c               = theme.colors;

  const [data,        setData]       = useState<any>(null);
  const [loading,     setLoading]    = useState(true);
  const [refreshing,  setRefreshing] = useState(false);
  const [tab,         setTab]        = useState('overview');
  const [flash,       setFlash]      = useState('');
  const [eventTeams,  setEventTeams] = useState<any[]>([]);
  const [standings,   setStandings]  = useState<any>(null);
  const [thirdPlace,  setThirdPlace] = useState(false);
  const [numGroups,   setNumGroups]  = useState(4);
  const [qpg,         setQpg]        = useState(2); // qualifiers per group

  // Add player form
  const [showAddPlayer, setShowAddPlayer] = useState(false);
  const [playerName,    setPlayerName]    = useState('');
  const [playerAge,     setPlayerAge]     = useState('');
  const [playerGender,  setPlayerGender]  = useState('Male');

  // Add team form
  const [showAddTeam,  setShowAddTeam]  = useState(false);
  const [teamName,     setTeamName]     = useState('');
  const [teamPhone,    setTeamPhone]    = useState('');
  const [teamMembers,  setTeamMembers]  = useState([{ name: '', role: 'captain' }]);

  const showFlash = (msg: string) => {
    setFlash(msg); setTimeout(() => setFlash(''), 3000);
  };

  const load = useCallback(async () => {
    try {
      const ws = await apiGetWorkspace(token!, parseInt(id));
      setData(ws);
    } catch (e: any) { Alert.alert('Error', e.message); }
    setLoading(false);
    setRefreshing(false);
  }, [id, token]);

  const loadTeams = useCallback(async () => {
    try { setEventTeams(await apiGetEventTeams(token!, parseInt(eventId)) ?? []); }
    catch {}
  }, [eventId, token]);

  const loadStandings = useCallback(async () => {
    try { setStandings(await apiGetStandings(token!, parseInt(eventId))); }
    catch {}
  }, [eventId, token]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!data) return;
    const ev = data.events?.find((e: any) => e.event_id === parseInt(eventId));
    if (ev?.participant_type === 'team' || ev?.participant_type === 'doubles_pair') loadTeams();
    if (ev?.format === 'round_robin' || ev?.format === 'group_knockout') loadStandings();
  }, [data, eventId, loadTeams, loadStandings]);

  // ── Derived state ──────────────────────────────────────────────
  const t           = data?.tournament ?? {};
  const events      = data?.events     ?? [];
  const currentEvent = events.find((e: any) => e.event_id === parseInt(eventId)) ?? events[0];

  if (loading && !data) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
        <ActivityIndicator style={{ flex: 1 }} color={c.primary} />
      </SafeAreaView>
    );
  }

  if (!currentEvent) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: c.muted }}>Event not found.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const sm         = SPORT_META[currentEvent.sport_key] ?? { abbrev: '?', label: currentEvent.sport_key };
  const pType      = currentEvent.participant_type;
  const isIndividual = pType === 'individual';
  const isDoubles    = pType === 'doubles_pair';
  const isTeam       = pType === 'team';
  const pTab         = isDoubles ? 'pairs' : isTeam ? 'teams' : 'players';
  const showStandings = currentEvent.format === 'round_robin' || currentEvent.format === 'group_knockout';

  const liveMatches     = (currentEvent.matches ?? []).filter((m: any) => m.status === 'live');
  const scheduledMatches = (currentEvent.matches ?? []).filter((m: any) => m.status === 'scheduled');
  const doneMatches      = (currentEvent.matches ?? []).filter((m: any) => m.status === 'done');
  const liveCount        = liveMatches.length;

  const allParticipants = (isTeam || isDoubles)
    ? eventTeams.map((ep: any) => { const team = ep.team ?? ep; return { id: team.team_id, name: team.name }; })
    : [
        ...((currentEvent.groups ?? []).flatMap((g: any) => (g.players ?? []).map((p: any) => ({ id: p.player_id, name: p.name })))),
        ...((currentEvent.ungrouped_players ?? []).map((p: any) => ({ id: p.player_id, name: p.name }))),
      ];

  const TABS = ['overview', pTab, 'fixtures', ...(showStandings ? ['standings'] : []), 'live'];
  const tabLabel = (tb: string) => {
    if (tb === 'players') return 'Players';
    if (tb === 'pairs')   return 'Pairs';
    if (tb === 'teams')   return 'Teams';
    if (tb === 'live' && currentEvent.sport_key === 'cricket')  return 'Innings';
    if (tb === 'live' && currentEvent.sport_key === 'football') return 'Match Day';
    return tb.charAt(0).toUpperCase() + tb.slice(1);
  };

  // ── Handlers ──────────────────────────────────────────────────

  const handleAddPlayer = async () => {
    if (!playerName.trim()) { Alert.alert('Name is required'); return; }
    try {
      const p = await apiCreatePlayer(token!, { name: playerName.trim(), age: parseInt(playerAge) || null, gender: playerGender });
      await apiAddPlayerToEvent(token!, currentEvent.event_id, p.player_id);
      setPlayerName(''); setPlayerAge(''); setShowAddPlayer(false);
      load(); showFlash('Player added!');
    } catch (e: any) { Alert.alert('Error', e.message); }
  };

  const handleRemovePlayer = (playerId: number) => {
    Alert.alert('Remove Player', 'Remove this player from the event?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => {
        try { await apiRemovePlayerFromEvent(token!, currentEvent.event_id, playerId); load(); showFlash('Player removed.'); }
        catch (e: any) { Alert.alert('Error', e.message); }
      }},
    ]);
  };

  const handleAddTeamSubmit = async () => {
    if (!teamName.trim()) { Alert.alert('Team name is required'); return; }
    try {
      const team = await apiCreateTeam(token!, t.org_id, {
        name: teamName.trim(), contact_phone: teamPhone.trim() || '',
        sport_key: currentEvent.sport_key,
        members: teamMembers.filter(m => m.name.trim()),
      });
      await apiAddTeamToEvent(token!, currentEvent.event_id, team.team_id);
      setTeamName(''); setTeamPhone(''); setTeamMembers([{ name: '', role: 'captain' }]);
      setShowAddTeam(false);
      loadTeams(); showFlash('Team added!');
    } catch (e: any) { Alert.alert('Error', e.message); }
  };

  const handleRemoveTeam = (teamId: number) => {
    Alert.alert('Remove Team', 'Remove this team from the event?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => {
        try { await apiRemoveTeamFromEvent(token!, currentEvent.event_id, teamId); loadTeams(); showFlash('Team removed.'); }
        catch (e: any) { Alert.alert('Error', e.message); }
      }},
    ]);
  };

  const handleGenerateFixtures = async () => {
    try {
      const r = await apiGenerateFixtures(token!, currentEvent.event_id, thirdPlace);
      load(); if (showStandings) loadStandings();
      showFlash(`${r.matches_created} matches created!`);
    } catch (e: any) { Alert.alert('Error', e.message); }
  };

  const handleGenerateGroups = async () => {
    try {
      const r = await apiGenerateGroups(token!, currentEvent.event_id, numGroups);
      load(); showFlash(`${r.groups_created} groups, ${r.matches_created} matches!`);
    } catch (e: any) { Alert.alert('Error', e.message); }
  };

  const handleGenerateKnockout = async () => {
    try {
      const r = await apiGenerateKnockoutFromGroups(token!, currentEvent.event_id, qpg, thirdPlace);
      load(); showFlash(`Knockout: ${r.matches_created} matches, ${r.qualifiers} qualifiers`);
    } catch (e: any) { Alert.alert('Error', e.message); }
  };

  const handleMatchAction = async (matchId: number, action: string) => {
    try {
      if (action === 'score' || action === 'start') {
        // Map sport_key to scorer directory name (table_tennis uses 'tt' dir)
        const sportDir = currentEvent.sport_key === 'table_tennis' ? 'tt' : currentEvent.sport_key;
        router.push({
          pathname: `/organiser/score/${sportDir}/${matchId}` as any,
          params: { eventId: String(currentEvent.event_id), tournamentId: String(id) },
        });
        return;
      }
      if (action === 'go_live')  await apiUpdateMatchStatus(token!, matchId, { status: 'live' });
      if (action === 'pause')    await apiUpdateMatchStatus(token!, matchId, { status: 'scheduled' });
      if (action === 'rematch')  await apiRematchMatch(token!, matchId);
      if (action === 'delete')   await apiDeleteMatch(token!, matchId);
      load();
    } catch (e: any) { Alert.alert('Error', e.message); }
  };

  const pName = (m: any) => {
    if (m.player1_name ?? m.team1_name) return m.player1_name ?? m.team1_name;
    if (m.pair1_name)  return m.pair1_name;
    return 'TBD';
  };
  const p2Name = (m: any) => {
    if (m.player2_name ?? m.team2_name) return m.player2_name ?? m.team2_name;
    if (m.pair2_name)  return m.pair2_name;
    return 'TBD';
  };
  const scoreStr = (m: any) => {
    if (m.status === 'done' || m.status === 'live') {
      return `${m.score_p1 ?? 0} – ${m.score_p2 ?? 0}`;
    }
    return 'vs';
  };

  // ── Match card component ───────────────────────────────────────
  const MatchRow = ({ m }: { m: any }) => {
    const isLive      = m.status === 'live';
    const isDone      = m.status === 'done';
    const stage       = STAGE_LABELS[m.stage] ?? m.stage ?? '';
    return (
      <View style={{ backgroundColor: c.surface, borderRadius: 12, borderWidth: 1,
        borderColor: isLive ? c.primary + '44' : c.border,
        borderLeftWidth: 3, borderLeftColor: isLive ? c.primary : isDone ? '#22c55e' : c.border,
        padding: 12, marginBottom: 8 }}>
        {stage ? (
          <Text style={{ fontSize: 9, fontWeight: '800', color: c.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>{stage}</Text>
        ) : null}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={{ flex: 1, fontSize: 14, fontWeight: '700', color: c.ink }} numberOfLines={1}>{pName(m)}</Text>
          <View style={{ alignItems: 'center', minWidth: 50 }}>
            {isLive && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginBottom: 2 }}>
                <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: c.primary }} />
                <Text style={{ fontSize: 9, color: c.primary, fontWeight: '800' }}>LIVE</Text>
              </View>
            )}
            <Text style={{ fontSize: 15, fontWeight: '900', color: isLive ? c.primary : c.muted }}>{scoreStr(m)}</Text>
          </View>
          <Text style={{ flex: 1, fontSize: 14, fontWeight: '700', color: c.ink, textAlign: 'right' }} numberOfLines={1}>{p2Name(m)}</Text>
        </View>
        {/* Action buttons */}
        <View style={{ flexDirection: 'row', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
          {(m.status === 'scheduled' || m.status === 'live') && (
            <TouchableOpacity onPress={() => handleMatchAction(m.match_id, 'score')}
              style={{ backgroundColor: c.primary, borderRadius: 7, paddingHorizontal: 12, paddingVertical: 6 }}>
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>
                {m.status === 'live' ? 'Continue' : 'Score'}
              </Text>
            </TouchableOpacity>
          )}
          {isDone && (
            <TouchableOpacity onPress={() => handleMatchAction(m.match_id, 'rematch')}
              style={{ borderRadius: 7, borderWidth: 1, borderColor: c.border, paddingHorizontal: 12, paddingVertical: 6 }}>
              <Text style={{ color: c.muted, fontWeight: '700', fontSize: 12 }}>Rematch</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={() => {
            Alert.alert('Delete Match', 'Delete this match?', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Delete', style: 'destructive', onPress: () => handleMatchAction(m.match_id, 'delete') },
            ]);
          }} style={{ borderRadius: 7, borderWidth: 1, borderColor: '#ef444444', paddingHorizontal: 10, paddingVertical: 6 }}>
            <Text style={{ color: '#ef4444', fontWeight: '700', fontSize: 12 }}>✕</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.border }}>
        <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace(`/organiser/tournament/${id}` as any)}>
          <Text style={{ color: c.muted, fontSize: 14 }}>← Back</Text>
        </TouchableOpacity>
        <View style={{ flex: 1, marginHorizontal: 10 }}>
          <Text style={{ fontSize: 13, fontWeight: '900', color: c.ink }} numberOfLines={1}>{currentEvent.name}</Text>
          <Text style={{ fontSize: 11, color: c.muted }}>{sm.label} · {(currentEvent.format ?? '').replace(/_/g, ' ')}</Text>
        </View>
        {liveCount > 0 && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4,
            backgroundColor: c.primary + '22', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: c.primary }} />
            <Text style={{ fontSize: 11, fontWeight: '800', color: c.primary }}>{liveCount} LIVE</Text>
          </View>
        )}
      </View>

      {/* Flash */}
      {!!flash && (
        <View style={{ backgroundColor: '#22c55e22', borderBottomWidth: 1, borderBottomColor: '#22c55e44',
          paddingHorizontal: 16, paddingVertical: 8 }}>
          <Text style={{ color: '#22c55e', fontSize: 13, fontWeight: '700' }}>{flash}</Text>
        </View>
      )}

      {/* Tab bar */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        style={{ borderBottomWidth: 1, borderBottomColor: c.border }}
        contentContainerStyle={{ paddingHorizontal: 12 }}>
        {TABS.map(tb => (
          <TouchableOpacity key={tb} onPress={() => setTab(tb)}
            style={{ paddingHorizontal: 14, paddingVertical: 12,
              borderBottomWidth: 2, borderBottomColor: tab === tb ? c.primary : 'transparent',
              marginRight: 4 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Text style={{ fontSize: 13, fontWeight: '700',
                color: tab === tb ? c.primary : c.muted }}>{tabLabel(tb)}</Text>
              {tb === 'live' && liveCount > 0 && (
                <View style={{ backgroundColor: c.primary, borderRadius: 10, width: 18, height: 18, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ color: '#fff', fontSize: 10, fontWeight: '900' }}>{liveCount}</Text>
                </View>
              )}
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={c.primary} />}
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
      >

        {/* ══ OVERVIEW ══════════════════════════════════════════ */}
        {tab === 'overview' && (
          <View>
            {/* Event stats */}
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
              {[
                { label: isDoubles ? 'Pairs' : isTeam ? 'Teams' : 'Players', value: currentEvent.player_count },
                { label: 'Matches', value: currentEvent.match_count },
                { label: 'Done',    value: `${currentEvent.done_count ?? 0}/${currentEvent.match_count ?? 0}` },
                { label: 'Live',    value: liveCount, highlight: liveCount > 0 },
              ].map(({ label, value, highlight }) => (
                <View key={label} style={{ flex: 1, backgroundColor: c.surface, borderRadius: 10,
                  borderWidth: 1, borderColor: c.border, padding: 10, alignItems: 'center' }}>
                  <Text style={{ fontSize: 18, fontWeight: '900', color: highlight ? c.primary : c.ink }}>{value ?? 0}</Text>
                  <Text style={{ fontSize: 10, color: c.muted, fontWeight: '600' }}>{label}</Text>
                </View>
              ))}
            </View>

            {/* Quick actions */}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
              <TouchableOpacity onPress={() => setTab(pTab)}
                style={{ backgroundColor: c.primary, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10 }}>
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>
                  {isDoubles ? 'Pairs' : isTeam ? 'Teams' : 'Players'} →
                </Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setTab('fixtures')}
                style={{ borderRadius: 10, borderWidth: 1, borderColor: c.border, paddingHorizontal: 16, paddingVertical: 10 }}>
                <Text style={{ color: c.ink, fontWeight: '700', fontSize: 13 }}>Fixtures →</Text>
              </TouchableOpacity>
              {liveCount > 0 && (
                <TouchableOpacity onPress={() => setTab('live')}
                  style={{ backgroundColor: '#ef4444', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10 }}>
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>Score Live →</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Match config summary */}
            <View style={{ backgroundColor: c.surface, borderRadius: 12, borderWidth: 1, borderColor: c.border, padding: 14 }}>
              <Text style={{ fontSize: 11, fontWeight: '800', color: c.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>Match Configuration</Text>
              <View style={{ gap: 8 }}>
                {[
                  { label: 'Format',     value: (currentEvent.format ?? '').replace(/_/g, ' ') },
                  { label: 'Type',       value: isDoubles ? 'Doubles Pairs' : isTeam ? 'Team' : 'Individual' },
                  ...(currentEvent.sport_key === 'cricket' ? [
                    { label: 'Overs',    value: String(currentEvent.sport_config?.overs ?? 20) },
                    { label: 'Squad',    value: `${currentEvent.squad_size ?? 11} players` },
                  ] : []),
                  ...(currentEvent.sport_key === 'football' ? [
                    { label: 'Format',   value: `${currentEvent.team_size ?? 11}-a-side` },
                    { label: 'Subs',     value: String(currentEvent.substitutes ?? 5) },
                  ] : []),
                  ...((currentEvent.sport_key === 'table_tennis' || currentEvent.sport_key === 'badminton') ? [
                    { label: 'Sets',     value: String(currentEvent.sport_config?.sets_to_win ?? 3) + ' to win' },
                    { label: 'Points',   value: String(currentEvent.sport_config?.points_per_set ?? 21) + '/set' },
                  ] : []),
                ].map(({ label, value }) => (
                  <View key={label} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={{ fontSize: 12, color: c.muted, fontWeight: '600' }}>{label}</Text>
                    <Text style={{ fontSize: 12, color: c.ink, fontWeight: '700' }}>{value}</Text>
                  </View>
                ))}
              </View>
            </View>
          </View>
        )}

        {/* ══ PLAYERS ══════════════════════════════════════════ */}
        {tab === 'players' && isIndividual && (
          <View>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <Text style={{ fontSize: 14, fontWeight: '800', color: c.ink }}>
                {allParticipants.length} Player{allParticipants.length !== 1 ? 's' : ''}
              </Text>
              <TouchableOpacity onPress={() => setShowAddPlayer(v => !v)}
                style={{ backgroundColor: c.primary, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 }}>
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>+ Add</Text>
              </TouchableOpacity>
            </View>

            {showAddPlayer && (
              <View style={{ backgroundColor: c.surface, borderRadius: 12, borderWidth: 1, borderColor: c.border,
                padding: 14, marginBottom: 14, gap: 10 }}>
                <TextInput
                  style={{ backgroundColor: c.elevated, borderRadius: 9, borderWidth: 1, borderColor: c.border,
                    color: c.ink, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 }}
                  placeholder="Player name *" placeholderTextColor={c.muted}
                  value={playerName} onChangeText={setPlayerName} />
                <TextInput
                  style={{ backgroundColor: c.elevated, borderRadius: 9, borderWidth: 1, borderColor: c.border,
                    color: c.ink, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 }}
                  placeholder="Age (optional)" placeholderTextColor={c.muted}
                  value={playerAge} onChangeText={setPlayerAge} keyboardType="numeric" />
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {['Male', 'Female', 'Other'].map(g => (
                    <TouchableOpacity key={g} onPress={() => setPlayerGender(g)}
                      style={{ borderRadius: 8, borderWidth: 1, borderColor: c.border, paddingHorizontal: 12, paddingVertical: 7,
                        backgroundColor: playerGender === g ? c.ink : c.elevated }}>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: playerGender === g ? c.bg : c.muted }}>{g}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TouchableOpacity onPress={handleAddPlayer}
                    style={{ flex: 1, backgroundColor: c.primary, borderRadius: 9, paddingVertical: 12, alignItems: 'center' }}>
                    <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14 }}>Add Player</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setShowAddPlayer(false)}
                    style={{ borderRadius: 9, borderWidth: 1, borderColor: c.border, paddingHorizontal: 14, paddingVertical: 12 }}>
                    <Text style={{ color: c.muted, fontWeight: '700' }}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* Player list */}
            {allParticipants.length === 0 ? (
              <Text style={{ color: c.muted, textAlign: 'center', marginTop: 24 }}>No players yet.</Text>
            ) : allParticipants.map((p: any) => (
              <View key={p.id} style={{ backgroundColor: c.surface, borderRadius: 10, borderWidth: 1, borderColor: c.border,
                padding: 12, marginBottom: 6, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: c.ink }}>{p.name}</Text>
                <TouchableOpacity onPress={() => handleRemovePlayer(p.id)}>
                  <Text style={{ color: '#ef4444', fontSize: 18, fontWeight: '700' }}>×</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {/* ══ TEAMS / PAIRS ══════════════════════════════════════ */}
        {(tab === 'teams' || tab === 'pairs') && (isTeam || isDoubles) && (
          <View>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <Text style={{ fontSize: 14, fontWeight: '800', color: c.ink }}>
                {eventTeams.length} {isDoubles ? 'Pair' : 'Team'}{eventTeams.length !== 1 ? 's' : ''}
              </Text>
              <TouchableOpacity onPress={() => setShowAddTeam(v => !v)}
                style={{ backgroundColor: c.primary, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 }}>
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>+ Add</Text>
              </TouchableOpacity>
            </View>

            {showAddTeam && (
              <View style={{ backgroundColor: c.surface, borderRadius: 12, borderWidth: 1, borderColor: c.border,
                padding: 14, marginBottom: 14, gap: 10 }}>
                <TextInput
                  style={{ backgroundColor: c.elevated, borderRadius: 9, borderWidth: 1, borderColor: c.border,
                    color: c.ink, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 }}
                  placeholder={isDoubles ? 'Pair name' : 'Team name *'} placeholderTextColor={c.muted}
                  value={teamName} onChangeText={setTeamName} />
                {!isDoubles && (
                  <TextInput
                    style={{ backgroundColor: c.elevated, borderRadius: 9, borderWidth: 1, borderColor: c.border,
                      color: c.ink, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 }}
                    placeholder="Contact phone (optional)" placeholderTextColor={c.muted}
                    value={teamPhone} onChangeText={setTeamPhone} keyboardType="phone-pad" />
                )}

                <Text style={{ fontSize: 12, fontWeight: '700', color: c.muted }}>
                  {isDoubles ? 'Players (2)' : 'Members'}
                </Text>
                {teamMembers.map((m, i) => (
                  <View key={i} style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                    <TextInput
                      style={{ flex: 1, backgroundColor: c.elevated, borderRadius: 9, borderWidth: 1, borderColor: c.border,
                        color: c.ink, paddingHorizontal: 12, paddingVertical: 9, fontSize: 14 }}
                      placeholder={isDoubles ? `Player ${i + 1}` : `Member ${i + 1} name`} placeholderTextColor={c.muted}
                      value={m.name} onChangeText={v => setTeamMembers(prev => prev.map((x, j) => j === i ? { ...x, name: v } : x))} />
                    {!isDoubles && (
                      <TouchableOpacity
                        onPress={() => setTeamMembers(prev => prev.map((x, j) => j === i
                          ? { ...x, role: x.role === 'captain' ? 'player' : x.role === 'player' ? 'vice_captain' : 'captain' }
                          : x
                        ))}
                        style={{ borderRadius: 7, borderWidth: 1, borderColor: c.border, paddingHorizontal: 8, paddingVertical: 7 }}>
                        <Text style={{ fontSize: 10, fontWeight: '700', color: c.muted }}>
                          {m.role === 'captain' ? 'CPT' : m.role === 'vice_captain' ? 'VC' : 'PLY'}
                        </Text>
                      </TouchableOpacity>
                    )}
                    {i > 0 && !isDoubles && (
                      <TouchableOpacity onPress={() => setTeamMembers(prev => prev.filter((_, j) => j !== i))}>
                        <Text style={{ color: '#ef4444', fontSize: 18 }}>×</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                ))}
                {!isDoubles && teamMembers.length < 20 && (
                  <TouchableOpacity onPress={() => setTeamMembers(prev => [...prev, { name: '', role: 'player' }])}
                    style={{ borderRadius: 9, borderWidth: 1, borderStyle: 'dashed', borderColor: c.border, padding: 10, alignItems: 'center' }}>
                    <Text style={{ color: c.muted, fontWeight: '700', fontSize: 13 }}>+ Add Member</Text>
                  </TouchableOpacity>
                )}

                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TouchableOpacity onPress={handleAddTeamSubmit}
                    style={{ flex: 1, backgroundColor: c.primary, borderRadius: 9, paddingVertical: 12, alignItems: 'center' }}>
                    <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14 }}>
                      Add {isDoubles ? 'Pair' : 'Team'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setShowAddTeam(false)}
                    style={{ borderRadius: 9, borderWidth: 1, borderColor: c.border, paddingHorizontal: 14, paddingVertical: 12 }}>
                    <Text style={{ color: c.muted, fontWeight: '700' }}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {eventTeams.length === 0 ? (
              <Text style={{ color: c.muted, textAlign: 'center', marginTop: 24 }}>No teams yet.</Text>
            ) : eventTeams.map((ep: any) => {
              const team = ep.team ?? ep;
              return (
                <View key={team.team_id} style={{ backgroundColor: c.surface, borderRadius: 10, borderWidth: 1,
                  borderColor: c.border, padding: 12, marginBottom: 6 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: c.ink }}>{team.name}</Text>
                    <TouchableOpacity onPress={() => handleRemoveTeam(team.team_id)}>
                      <Text style={{ color: '#ef4444', fontSize: 18, fontWeight: '700' }}>×</Text>
                    </TouchableOpacity>
                  </View>
                  {team.members?.length > 0 && (
                    <Text style={{ fontSize: 11, color: c.muted, marginTop: 4 }}>
                      {team.members.slice(0, 4).map((m: any) => m.name).join(', ')}
                      {team.members.length > 4 ? ` +${team.members.length - 4} more` : ''}
                    </Text>
                  )}
                </View>
              );
            })}
          </View>
        )}

        {/* ══ FIXTURES ══════════════════════════════════════════ */}
        {tab === 'fixtures' && (
          <View>
            {/* Generate buttons */}
            <View style={{ backgroundColor: c.surface, borderRadius: 12, borderWidth: 1, borderColor: c.border,
              padding: 14, marginBottom: 14, gap: 10 }}>
              <Text style={{ fontSize: 12, fontWeight: '800', color: c.muted, textTransform: 'uppercase', letterSpacing: 1 }}>
                Fixture Generation
              </Text>

              {currentEvent.format === 'direct_knockout' && (
                <>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <TouchableOpacity onPress={() => setThirdPlace(v => !v)}
                      style={{ width: 20, height: 20, borderRadius: 4, borderWidth: 2,
                        borderColor: c.primary, backgroundColor: thirdPlace ? c.primary : 'transparent',
                        alignItems: 'center', justifyContent: 'center' }}>
                      {thirdPlace && <Text style={{ color: '#fff', fontSize: 12, fontWeight: '900' }}>✓</Text>}
                    </TouchableOpacity>
                    <Text style={{ fontSize: 13, color: c.ink }}>Include 3rd place match</Text>
                  </View>
                  <TouchableOpacity onPress={handleGenerateFixtures}
                    style={{ backgroundColor: c.primary, borderRadius: 10, paddingVertical: 12, alignItems: 'center' }}>
                    <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14 }}>
                      {currentEvent.match_count ? 'Regenerate Fixtures' : 'Generate Fixtures'}
                    </Text>
                  </TouchableOpacity>
                </>
              )}

              {currentEvent.format === 'round_robin' && (
                <TouchableOpacity onPress={handleGenerateFixtures}
                  style={{ backgroundColor: c.primary, borderRadius: 10, paddingVertical: 12, alignItems: 'center' }}>
                  <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14 }}>
                    {currentEvent.match_count ? 'Regenerate Fixtures' : 'Generate All Matches'}
                  </Text>
                </TouchableOpacity>
              )}

              {currentEvent.format === 'group_knockout' && (
                <>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <Text style={{ fontSize: 13, color: c.muted }}>Groups:</Text>
                    <TouchableOpacity onPress={() => setNumGroups(v => Math.max(2, v - 1))}
                      style={{ width: 28, height: 28, borderRadius: 7, backgroundColor: c.elevated, alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ color: c.ink, fontWeight: '800' }}>−</Text>
                    </TouchableOpacity>
                    <Text style={{ fontSize: 16, fontWeight: '900', color: c.ink, minWidth: 24, textAlign: 'center' }}>{numGroups}</Text>
                    <TouchableOpacity onPress={() => setNumGroups(v => Math.min(8, v + 1))}
                      style={{ width: 28, height: 28, borderRadius: 7, backgroundColor: c.elevated, alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ color: c.ink, fontWeight: '800' }}>+</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <Text style={{ fontSize: 13, color: c.muted }}>Qualifiers/group:</Text>
                    <TouchableOpacity onPress={() => setQpg(v => Math.max(1, v - 1))}
                      style={{ width: 28, height: 28, borderRadius: 7, backgroundColor: c.elevated, alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ color: c.ink, fontWeight: '800' }}>−</Text>
                    </TouchableOpacity>
                    <Text style={{ fontSize: 16, fontWeight: '900', color: c.ink, minWidth: 24, textAlign: 'center' }}>{qpg}</Text>
                    <TouchableOpacity onPress={() => setQpg(v => Math.min(4, v + 1))}
                      style={{ width: 28, height: 28, borderRadius: 7, backgroundColor: c.elevated, alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ color: c.ink, fontWeight: '800' }}>+</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    {!currentEvent.groups?.length ? (
                      <TouchableOpacity onPress={handleGenerateGroups}
                        style={{ flex: 1, backgroundColor: c.primary, borderRadius: 10, paddingVertical: 11, alignItems: 'center' }}>
                        <Text style={{ color: '#fff', fontWeight: '800', fontSize: 13 }}>Create Groups</Text>
                      </TouchableOpacity>
                    ) : (
                      <>
                        <TouchableOpacity onPress={handleGenerateGroups}
                          style={{ flex: 1, borderRadius: 10, borderWidth: 1, borderColor: c.border, paddingVertical: 11, alignItems: 'center' }}>
                          <Text style={{ color: c.ink, fontWeight: '700', fontSize: 13 }}>Redo Groups</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={handleGenerateKnockout}
                          style={{ flex: 1, backgroundColor: c.primary, borderRadius: 10, paddingVertical: 11, alignItems: 'center' }}>
                          <Text style={{ color: '#fff', fontWeight: '800', fontSize: 13 }}>Gen Knockout</Text>
                        </TouchableOpacity>
                      </>
                    )}
                  </View>
                </>
              )}
            </View>

            {/* Match list */}
            {!currentEvent.matches?.length ? (
              <Text style={{ color: c.muted, textAlign: 'center', marginTop: 16, fontSize: 14 }}>
                No matches yet. Generate fixtures above.
              </Text>
            ) : (
              <>
                {/* Group matches */}
                {currentEvent.groups?.map((g: any) => {
                  const gMatches = (currentEvent.matches ?? []).filter((m: any) => m.group_id === g.group_id);
                  if (!gMatches.length) return null;
                  return (
                    <View key={g.group_id} style={{ marginBottom: 8 }}>
                      <Text style={{ fontSize: 11, fontWeight: '800', color: c.muted,
                        textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
                        {g.name} · {gMatches.length} matches
                      </Text>
                      {gMatches.map((m: any) => <MatchRow key={m.match_id} m={m} />)}
                    </View>
                  );
                })}
                {/* Ungrouped / knockout matches */}
                {(currentEvent.matches ?? []).filter((m: any) => !m.group_id).map((m: any) => (
                  <MatchRow key={m.match_id} m={m} />
                ))}
              </>
            )}
          </View>
        )}

        {/* ══ STANDINGS ══════════════════════════════════════════ */}
        {tab === 'standings' && (
          <View>
            {!standings ? (
              <ActivityIndicator color={c.primary} style={{ marginTop: 24 }} />
            ) : !standings.groups?.length ? (
              <Text style={{ color: c.muted, textAlign: 'center', marginTop: 24 }}>
                No standings yet. Complete some matches first.
              </Text>
            ) : standings.groups.map((group: any, gi: number) => (
              <View key={gi} style={{ marginBottom: 24 }}>
                {standings.groups.length > 1 && (
                  <Text style={{ fontSize: 11, fontWeight: '800', color: c.muted,
                    textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>{group.name}</Text>
                )}
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={{ borderRadius: 10, borderWidth: 1, borderColor: c.border, overflow: 'hidden', minWidth: 380 }}>
                    {/* Header */}
                    <View style={{ flexDirection: 'row', backgroundColor: c.elevated, paddingHorizontal: 8, paddingVertical: 8 }}>
                      {['#', 'Name', 'MP', 'W', 'L', 'Pts'].map((h, i) => (
                        <Text key={h} style={{ fontSize: 10, fontWeight: '800', color: c.muted,
                          textTransform: 'uppercase', letterSpacing: 0.5,
                          width: i === 0 ? 24 : i === 1 ? 120 : 44, textAlign: i === 1 ? 'left' : 'center' }}>
                          {h}
                        </Text>
                      ))}
                    </View>
                    {group.rows?.map((row: any, ri: number) => (
                      <View key={row.participant_id} style={{ flexDirection: 'row', paddingHorizontal: 8, paddingVertical: 10,
                        backgroundColor: ri % 2 === 0 ? 'transparent' : c.surface,
                        borderTopWidth: 1, borderTopColor: c.border }}>
                        <Text style={{ width: 24, textAlign: 'center', color: c.muted, fontWeight: '700', fontSize: 12 }}>{ri + 1}</Text>
                        <Text style={{ width: 120, color: c.ink, fontWeight: '600', fontSize: 12 }} numberOfLines={1}>{row.name}</Text>
                        <Text style={{ width: 44, textAlign: 'center', color: c.muted, fontSize: 12 }}>{row.matches_played}</Text>
                        <Text style={{ width: 44, textAlign: 'center', color: '#22c55e', fontWeight: '700', fontSize: 12 }}>{row.wins}</Text>
                        <Text style={{ width: 44, textAlign: 'center', color: '#ef4444', fontSize: 12 }}>{row.losses}</Text>
                        <Text style={{ width: 44, textAlign: 'center', color: c.primary, fontWeight: '900', fontSize: 13 }}>{row.ranking_points}</Text>
                      </View>
                    ))}
                  </View>
                </ScrollView>
                <Text style={{ fontSize: 10, color: c.muted, marginTop: 6 }}>
                  MP = Matches Played · W/L = Wins/Losses · Pts = Ranking Points
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* ══ LIVE ══════════════════════════════════════════════ */}
        {tab === 'live' && (
          <View>
            {!currentEvent.match_count ? (
              <Text style={{ color: c.muted, textAlign: 'center', marginTop: 24 }}>
                Generate fixtures first.
              </Text>
            ) : (
              <>
                {liveCount > 0 && (
                  <View style={{ marginBottom: 12 }}>
                    <Text style={{ fontSize: 11, fontWeight: '800', color: c.primary,
                      textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
                      ● Live Now ({liveCount})
                    </Text>
                    {liveMatches.map((m: any) => <MatchRow key={m.match_id} m={m} />)}
                  </View>
                )}
                {scheduledMatches.length > 0 && (
                  <View style={{ marginBottom: 12 }}>
                    <Text style={{ fontSize: 11, fontWeight: '800', color: c.muted,
                      textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
                      Scheduled ({scheduledMatches.length})
                    </Text>
                    {scheduledMatches.map((m: any) => <MatchRow key={m.match_id} m={m} />)}
                  </View>
                )}
                {doneMatches.length > 0 && (
                  <View>
                    <Text style={{ fontSize: 11, fontWeight: '800', color: c.muted,
                      textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
                      Completed ({doneMatches.length})
                    </Text>
                    {doneMatches.map((m: any) => <MatchRow key={m.match_id} m={m} />)}
                  </View>
                )}
              </>
            )}
          </View>
        )}

      </ScrollView>
    </SafeAreaView>
  );
}
