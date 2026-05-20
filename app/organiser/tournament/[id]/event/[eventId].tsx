/**
 * Event Workspace — mirrors EventWorkspace.jsx
 * Tabs: Overview · Players/Pairs/Teams · Fixtures · Standings · Live
 * Live matches launch the dedicated scorer screen for each sport.
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  Alert, ActivityIndicator, RefreshControl, Modal, Platform,
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

// ── Bracket template (mirrors web getBracketTemplate) ────────────────────────
function getBracketTemplate(n: number, thirdPlace = false): any {
  if (n < 2) return null;
  const bracketSize = Math.pow(2, Math.ceil(Math.log2(Math.max(n, 2))));
  const halfBracket = bracketSize / 2;
  const prelimCount = n - halfBracket;
  const byeCount    = halfBracket - prelimCount;

  const stageForCount = (count: number) => {
    if (count <= 2)  return { stage: 'final',       label: 'Final'          };
    if (count <= 4)  return { stage: 'semi',         label: 'Semi Finals'    };
    if (count <= 8)  return { stage: 'quarter',      label: 'Quarter Finals' };
    if (count <= 16) return { stage: 'r16',          label: 'Round of 16'    };
    if (count <= 32) return { stage: 'r32',          label: 'Round of 32'    };
    return { stage: 'preliminary', label: 'First Round' };
  };

  const r1 = byeCount > 0
    ? { stage: 'preliminary', label: 'Preliminary Round' }
    : stageForCount(n);

  const rounds: any[] = [{ ...r1, matchCount: Math.max(prelimCount, 1), isAssignable: true, byeCount }];
  let advancing = halfBracket;
  while (advancing > 1) {
    const info = stageForCount(advancing);
    rounds.push({ ...info, matchCount: advancing / 2, isAssignable: false, byeCount: 0 });
    advancing = advancing / 2;
  }
  if (thirdPlace) {
    rounds.push({ stage: 'third_place', label: '3rd Place', matchCount: 1, isAssignable: false, byeCount: 0 });
  }
  return { rounds, byeCount, total: rounds.reduce((s, r) => s + r.matchCount, 0) };
}

// ── Stage option lists ────────────────────────────────────────────────────────
const STAGE_OPTIONS_KNOCKOUT = [
  { value: 'preliminary', label: 'Preliminary'     },
  { value: 'r32',         label: 'Round of 32'     },
  { value: 'r16',         label: 'Round of 16'     },
  { value: 'quarter',     label: 'Quarter Final'   },
  { value: 'semi',        label: 'Semi Final'      },
  { value: 'final',       label: 'Final'           },
  { value: 'third_place', label: '3rd Place Match' },
];
const STAGE_OPTIONS_GROUP_KNOCKOUT = [
  { value: 'group',       label: 'Group Stage'     },
  { value: 'quarter',     label: 'Quarter Final'   },
  { value: 'semi',        label: 'Semi Final'      },
  { value: 'final',       label: 'Final'           },
  { value: 'third_place', label: '3rd Place Match' },
];

// ── SelectPicker ─────────────────────────────────────────────────────────────
// Cross-platform bottom-sheet-style dropdown.
function SelectPicker({
  label, value, options, onSelect, placeholder = '— Select —', colors,
}: {
  label?: string;
  value: string;
  options: { value: string; label: string }[];
  onSelect: (v: string) => void;
  placeholder?: string;
  colors: any;
}) {
  const [open, setOpen] = useState(false);
  const c = colors;
  const selected = options.find(o => o.value === value);

  return (
    <View style={{ marginBottom: 12 }}>
      {label && (
        <Text style={{ fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1.5,
          color: c.muted, marginBottom: 5 }}>
          {label}
        </Text>
      )}
      <TouchableOpacity onPress={() => setOpen(true)}
        style={{ backgroundColor: c.elevated, borderRadius: 9, borderWidth: 1.5, borderColor: c.border,
          paddingHorizontal: 12, paddingVertical: 11, flexDirection: 'row',
          alignItems: 'center', justifyContent: 'space-between', minHeight: 44 }}>
        <Text style={{ fontSize: 14, color: selected ? c.ink : c.muted, flex: 1 }}>
          {selected?.label ?? placeholder}
        </Text>
        <Text style={{ color: c.muted, fontSize: 12, marginLeft: 8 }}>▾</Text>
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' }}
          activeOpacity={1} onPress={() => setOpen(false)}>
          <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0,
            backgroundColor: c.surface, borderTopLeftRadius: 18, borderTopRightRadius: 18,
            paddingBottom: 36, maxHeight: '60%' }}>
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: c.border,
              alignSelf: 'center', marginTop: 12, marginBottom: 8 }} />
            {label && (
              <Text style={{ fontSize: 12, fontWeight: '800', color: c.muted,
                textTransform: 'uppercase', letterSpacing: 1, paddingHorizontal: 18,
                paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: c.border }}>
                {label}
              </Text>
            )}
            <ScrollView>
              {options.map(o => (
                <TouchableOpacity key={o.value} onPress={() => { onSelect(o.value); setOpen(false); }}
                  style={{ paddingHorizontal: 18, paddingVertical: 15,
                    borderBottomWidth: 1, borderBottomColor: c.border,
                    backgroundColor: o.value === value ? c.primary + '15' : 'transparent',
                    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: 15, color: o.value === value ? c.primary : c.ink,
                    fontWeight: o.value === value ? '700' : '500' }}>
                    {o.label}
                  </Text>
                  {o.value === value && <Text style={{ color: c.primary, fontSize: 16 }}>✓</Text>}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

// ── ManualMatchCreatorCard ────────────────────────────────────────────────────
// Collapsible "Add Match Manually" form using SelectPicker dropdowns.
function ManualMatchCreatorCard({
  format, groups, participants, isTeam,
  open, setOpen,
  p1, setP1, p2, setP2,
  stage, setStage,
  groupId, setGroupId,
  stageOptions, busy,
  onSubmit, onCancel, colors,
}: {
  format: string;
  groups: any[];
  participants: { id: number; name: string }[];
  isTeam: boolean;
  open: boolean;
  setOpen: (v: boolean) => void;
  p1: string; setP1: (v: string) => void;
  p2: string; setP2: (v: string) => void;
  stage: string; setStage: (v: string) => void;
  groupId: string; setGroupId: (v: string) => void;
  stageOptions: { value: string; label: string }[];
  busy: boolean;
  onSubmit: () => void;
  onCancel: () => void;
  colors: any;
}) {
  const c     = colors;
  const unit  = isTeam ? 'Team' : 'Player';
  const p1Obj = participants.find((p: any) => String(p.id) === p1);
  const p2Obj = participants.find((p: any) => String(p.id) === p2);
  const groupOptions = groups.map((g: any) => ({ value: String(g.group_id), label: g.name }));

  if (!open) {
    return (
      <TouchableOpacity onPress={() => setOpen(true)}
        style={{ borderRadius: 10, borderWidth: 1.5, borderStyle: 'dashed', borderColor: c.border,
          paddingVertical: 13, alignItems: 'center', marginBottom: 14 }}>
        <Text style={{ color: c.muted, fontWeight: '700', fontSize: 13 }}>+ Add Match Manually</Text>
      </TouchableOpacity>
    );
  }

  return (
    <View style={{ backgroundColor: c.surface, borderRadius: 12, borderWidth: 1.5,
      borderColor: c.primary + '44', padding: 14, marginBottom: 14 }}>
      <Text style={{ fontSize: 13, fontWeight: '900', color: c.ink, marginBottom: 14 }}>
        Add Match Manually
      </Text>

      {/* Stage */}
      <SelectPicker
        label="Stage"
        value={stage}
        options={stageOptions}
        onSelect={setStage}
        colors={c}
      />

      {/* Group (only when group_knockout + group stage) */}
      {format === 'group_knockout' && stage === 'group' && groupOptions.length > 0 && (
        <SelectPicker
          label="Group"
          value={groupId}
          options={groupOptions}
          onSelect={setGroupId}
          placeholder="— Select Group —"
          colors={c}
        />
      )}

      {/* Participant 1 */}
      <SelectPicker
        label={`${unit} 1`}
        value={p1}
        options={participants
          .filter((p: any) => String(p.id) !== p2)
          .map((p: any) => ({ value: String(p.id), label: p.name }))}
        onSelect={setP1}
        placeholder={`— Select ${unit} —`}
        colors={c}
      />

      {/* Participant 2 */}
      <SelectPicker
        label={`${unit} 2`}
        value={p2}
        options={participants
          .filter((p: any) => String(p.id) !== p1)
          .map((p: any) => ({ value: String(p.id), label: p.name }))}
        onSelect={setP2}
        placeholder={`— Select ${unit} —`}
        colors={c}
      />

      {/* Preview */}
      {p1Obj && p2Obj && (
        <View style={{ backgroundColor: c.elevated, borderRadius: 8, paddingVertical: 10,
          paddingHorizontal: 14, marginBottom: 12, flexDirection: 'row',
          alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: c.ink, flex: 1, textAlign: 'right' }}
            numberOfLines={1}>{p1Obj.name}</Text>
          <Text style={{ color: c.muted, fontWeight: '900', fontSize: 12 }}>vs</Text>
          <Text style={{ fontSize: 13, fontWeight: '700', color: c.ink, flex: 1 }}
            numberOfLines={1}>{p2Obj.name}</Text>
        </View>
      )}

      {/* Actions */}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <TouchableOpacity onPress={onSubmit}
          disabled={busy || !p1 || !p2}
          style={{ flex: 1, backgroundColor: c.primary, borderRadius: 10, paddingVertical: 12,
            alignItems: 'center', opacity: (busy || !p1 || !p2) ? 0.5 : 1 }}>
          {busy
            ? <ActivityIndicator color="#fff" size="small" />
            : <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14 }}>Add Match</Text>}
        </TouchableOpacity>
        <TouchableOpacity onPress={onCancel}
          style={{ borderRadius: 10, borderWidth: 1, borderColor: c.border,
            paddingHorizontal: 16, paddingVertical: 12 }}>
          <Text style={{ color: c.muted, fontWeight: '700' }}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const SPORT_META: Record<string, { abbrev: string; label: string }> = {
  table_tennis: { abbrev: 'TT', label: 'Table Tennis' },
  badminton:    { abbrev: 'BD', label: 'Badminton'    },
  cricket:      { abbrev: 'CR', label: 'Cricket'      },
  football:     { abbrev: 'FB', label: 'Football'     },
};

const STAGE_LABELS: Record<string, string> = {
  group: 'Group', r128: 'R128', r64: 'R64', r32: 'R32',
  r16: 'R16', qf: 'QF', sf: 'SF', final: 'Final', third_place: '3rd Place',
  preliminary: 'Prelim', quarter: 'Quarter Final', semi: 'Semi Final',
};

// ── MatchRow ──────────────────────────────────────────────────────────────────
// Defined OUTSIDE EventWorkspaceScreen so React never sees a new component type
// on re-render (which would unmount/remount the component and break touches).
function MatchRow({
  m, colors, onScore, onRematch, onDelete,
}: {
  m: any;
  colors: any;
  onScore:   (id: number) => void;
  onRematch: (id: number) => void;
  onDelete:  (id: number) => void;
}) {
  const c       = colors;
  const isLive  = m.status === 'live';
  const isDone  = m.status === 'done';
  const stage   = STAGE_LABELS[m.stage] ?? m.stage ?? '';

  const pName = (match: any) => {
    if (match.player_1?.name) return match.player_1.name;
    if (match.team_1?.name)   return match.team_1.name;
    if (match.player1_name)   return match.player1_name;
    if (match.team1_name)     return match.team1_name;
    if (match.pair1_name)     return match.pair1_name;
    return 'TBD';
  };
  const p2Name = (match: any) => {
    if (match.player_2?.name) return match.player_2.name;
    if (match.team_2?.name)   return match.team_2.name;
    if (match.player2_name)   return match.player2_name;
    if (match.team2_name)     return match.team2_name;
    if (match.pair2_name)     return match.pair2_name;
    return 'TBD';
  };
  const scoreStr = (match: any) =>
    (match.status === 'done' || match.status === 'live')
      ? `${match.score_p1 ?? 0} – ${match.score_p2 ?? 0}`
      : 'vs';

  return (
    <View style={{ backgroundColor: c.surface, borderRadius: 12, borderWidth: 1,
      borderColor: isLive ? c.primary + '44' : c.border,
      borderLeftWidth: 3, borderLeftColor: isLive ? c.primary : isDone ? '#22c55e' : c.border,
      padding: 12, marginBottom: 8 }}>
      {!!stage && (
        <Text style={{ fontSize: 9, fontWeight: '800', color: c.muted,
          textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>{stage}</Text>
      )}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text style={{ flex: 1, fontSize: 14, fontWeight: '700', color: c.ink }}
          numberOfLines={1}>{pName(m)}</Text>
        <View style={{ alignItems: 'center', minWidth: 50 }}>
          {isLive && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginBottom: 2 }}>
              <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: c.primary }} />
              <Text style={{ fontSize: 9, color: c.primary, fontWeight: '800' }}>LIVE</Text>
            </View>
          )}
          <Text style={{ fontSize: 15, fontWeight: '900', color: isLive ? c.primary : c.muted }}>
            {scoreStr(m)}
          </Text>
        </View>
        <Text style={{ flex: 1, fontSize: 14, fontWeight: '700', color: c.ink, textAlign: 'right' }}
          numberOfLines={1}>{p2Name(m)}</Text>
      </View>

      {/* Action buttons */}
      <View style={{ flexDirection: 'row', gap: 6, marginTop: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        {(m.status === 'scheduled' || m.status === 'live') && (
          <TouchableOpacity onPress={() => onScore(m.match_id)}
            style={{ backgroundColor: c.primary, borderRadius: 7,
              paddingHorizontal: 14, paddingVertical: 8, minHeight: 36,
              justifyContent: 'center' }}>
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>
              {m.status === 'live' ? 'Continue' : 'Score'}
            </Text>
          </TouchableOpacity>
        )}
        {isDone && (
          <TouchableOpacity onPress={() => onRematch(m.match_id)}
            style={{ borderRadius: 7, borderWidth: 1, borderColor: c.border,
              paddingHorizontal: 14, paddingVertical: 8, minHeight: 36,
              justifyContent: 'center' }}>
            <Text style={{ color: c.muted, fontWeight: '700', fontSize: 12 }}>Rematch</Text>
          </TouchableOpacity>
        )}
        {/* Delete — large touch target, no Alert wrapper so gesture fires reliably */}
        <TouchableOpacity
          onPress={() => onDelete(m.match_id)}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={{ borderRadius: 7, borderWidth: 1, borderColor: '#ef444466',
            width: 36, height: 36, alignItems: 'center', justifyContent: 'center',
            backgroundColor: '#ef444410' }}>
          <Text style={{ color: '#ef4444', fontWeight: '800', fontSize: 16, lineHeight: 18 }}>✕</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

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

  // Add match manually (when fixtures already exist)
  const [showAddMatch,  setShowAddMatch]  = useState(false);
  const [matchP1Id,     setMatchP1Id]     = useState('');
  const [matchP2Id,     setMatchP2Id]     = useState('');
  const [matchStage,    setMatchStage]    = useState('semi');
  const [matchGroupId,  setMatchGroupId]  = useState('');
  const [addMatchBusy,  setAddMatchBusy]  = useState(false);

  // Fixture setup flow (when no fixtures yet) — 'suggestion' | 'manual_slots'
  const [fixMode,       setFixMode]       = useState<'suggestion' | 'manual_slots'>('suggestion');
  const [slots,         setSlots]         = useState<{ p1: string; p2: string }[]>([]);
  const [slotsBusy,     setSlotsBusy]     = useState(false);

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

  const handleAddMatch = async () => {
    if (!matchP1Id || !matchP2Id) { Alert.alert('Select both participants'); return; }
    if (matchP1Id === matchP2Id)  { Alert.alert('Pick two different participants'); return; }
    setAddMatchBusy(true);
    try {
      const isGroupStage = matchStage === 'group' && currentEvent.format === 'group_knockout';
      const body: any = {
        stage:    matchStage || 'semi',
        round:    1,
        group_id: isGroupStage && matchGroupId ? parseInt(matchGroupId) : null,
        ...(isTeam || isDoubles
          ? { team1_id:   parseInt(matchP1Id), team2_id:   parseInt(matchP2Id) }
          : { player1_id: parseInt(matchP1Id), player2_id: parseInt(matchP2Id) }),
      };
      await apiCreateMatch(token!, currentEvent.event_id, body);
      setMatchP1Id(''); setMatchP2Id(''); setMatchGroupId('');
      setShowAddMatch(false);
      load(); showFlash('Match added!');
    } catch (e: any) { Alert.alert('Error', e.message); }
    setAddMatchBusy(false);
  };

  // Bulk-create first-round slots + TBD later rounds (mirrors web handleBulkCreateMatches)
  const handleBulkCreateMatches = async (template: any) => {
    const incomplete = slots.some(s => !s.p1 || !s.p2);
    if (incomplete) { Alert.alert('Fill all match slots before creating.'); return; }
    setSlotsBusy(true);
    try {
      const first    = template.rounds.find((r: any) => r.isAssignable);
      const usedIds  = new Set(slots.flatMap(s => [s.p1, s.p2].filter(Boolean)));
      const byePart  = template.byeCount > 0
        ? allParticipants.find((p: any) => !usedIds.has(String(p.id)))
        : null;

      // First round — real participants
      for (const slot of slots) {
        await apiCreateMatch(token!, currentEvent.event_id, {
          stage: first.stage, round: 1,
          ...(isTeam || isDoubles
            ? { team1_id:   parseInt(slot.p1), team2_id:   parseInt(slot.p2) }
            : { player1_id: parseInt(slot.p1), player2_id: parseInt(slot.p2) }),
        });
      }

      // Later rounds — TBD placeholders; bye player pre-seeded into first next-round slot
      let roundNum = 2; let byePlaced = false;
      for (const round of template.rounds.filter((r: any) => !r.isAssignable)) {
        for (let i = 0; i < round.matchCount; i++) {
          const body: any = { stage: round.stage, round: roundNum };
          if (!byePlaced && byePart) {
            if (isTeam || isDoubles) body.team1_id   = byePart.id;
            else                     body.player1_id = byePart.id;
            byePlaced = true;
          }
          await apiCreateMatch(token!, currentEvent.event_id, body);
        }
        roundNum++;
      }

      load();
      showFlash(`${template.total} match${template.total !== 1 ? 'es' : ''} created!`);
      setFixMode('suggestion');
    } catch (e: any) { Alert.alert('Error', e.message); }
    setSlotsBusy(false);
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

  // ── Delete handler ────────────────────────────────────────────────────────────
  // On web, window.confirm() is often silently blocked by the browser, so we
  // skip Alert.alert entirely and delete immediately.  On native we show the
  // standard confirmation dialog.
  const handleDeleteMatch = (matchId: number) => {
    if (Platform.OS === 'web') {
      handleMatchAction(matchId, 'delete');
    } else {
      Alert.alert('Delete Match', 'Delete this match?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive',
          onPress: () => handleMatchAction(matchId, 'delete') },
      ]);
    }
  };

  // Shorthand so every <MatchRow> call stays concise
  const MR = (m: any) => (
    <MatchRow
      key={m.match_id}
      m={m}
      colors={c}
      onScore={(id)   => handleMatchAction(id, 'score')}
      onRematch={(id) => handleMatchAction(id, 'rematch')}
      onDelete={handleDeleteMatch}
    />
  );

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

      {/* Tab bar — wrapped in View so horizontal ScrollView doesn't steal vertical space */}
      <View style={{ height: 44, borderBottomWidth: 1, borderBottomColor: c.border }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 12, alignItems: 'center', height: 44 }}>
          {TABS.map(tb => (
            <TouchableOpacity key={tb} onPress={() => setTab(tb)}
              style={{ paddingHorizontal: 14, height: 44, justifyContent: 'center',
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
      </View>

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
                    { label: 'Team Size', value: `${currentEvent.team_size ?? 11}-a-side` },
                    { label: 'Subs',      value: String(currentEvent.substitutes ?? 5) },
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
        {tab === 'fixtures' && (() => {
          const hasMatches   = (currentEvent.matches?.length ?? 0) > 0;
          const n            = allParticipants.length;
          const unit         = isTeam ? 'team' : isDoubles ? 'pair' : 'player';
          const Unit         = isTeam ? 'Team' : isDoubles ? 'Pair' : 'Player';
          const stageOptions = currentEvent.format === 'group_knockout'
            ? STAGE_OPTIONS_GROUP_KNOCKOUT : STAGE_OPTIONS_KNOCKOUT;

          // ── round_robin: simple generate only ──────────────────────────────
          if (currentEvent.format === 'round_robin') return (
            <View>
              <View style={{ backgroundColor: c.surface, borderRadius: 12, borderWidth: 1, borderColor: c.border, padding: 14, marginBottom: 14, gap: 10 }}>
                <Text style={{ fontSize: 12, fontWeight: '800', color: c.muted, textTransform: 'uppercase', letterSpacing: 1 }}>
                  Fixture Generation
                </Text>
                <TouchableOpacity onPress={handleGenerateFixtures}
                  style={{ backgroundColor: c.primary, borderRadius: 10, paddingVertical: 13, alignItems: 'center' }}>
                  <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14 }}>
                    {hasMatches ? '↺ Regenerate All Matches' : 'Generate All Matches'}
                  </Text>
                </TouchableOpacity>
              </View>
              {hasMatches && (currentEvent.matches ?? []).map((m: any) => MR(m))}
            </View>
          );

          // ── group_knockout: groups panel ───────────────────────────────────
          if (currentEvent.format === 'group_knockout') return (
            <View>
              <View style={{ backgroundColor: c.surface, borderRadius: 12, borderWidth: 1, borderColor: c.border, padding: 14, marginBottom: 14, gap: 10 }}>
                <Text style={{ fontSize: 11, fontWeight: '900', color: c.ink }}>Group + Knockout Setup</Text>
                <Text style={{ fontSize: 12, color: c.muted }}>{n} {unit}{n !== 1 ? 's' : ''} · Group stage + bracket</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Text style={{ fontSize: 13, color: c.muted }}>Groups:</Text>
                  <TouchableOpacity onPress={() => setNumGroups(v => Math.max(2, v - 1))}
                    style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: c.elevated, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: c.border }}>
                    <Text style={{ color: c.ink, fontWeight: '800', fontSize: 16 }}>−</Text>
                  </TouchableOpacity>
                  <Text style={{ fontSize: 18, fontWeight: '900', color: c.primary, minWidth: 28, textAlign: 'center' }}>{numGroups}</Text>
                  <TouchableOpacity onPress={() => setNumGroups(v => Math.min(8, v + 1))}
                    style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: c.elevated, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: c.border }}>
                    <Text style={{ color: c.ink, fontWeight: '800', fontSize: 16 }}>+</Text>
                  </TouchableOpacity>
                  <Text style={{ fontSize: 12, color: c.muted }}>≈ {n > 0 ? Math.ceil(n / numGroups) : 0} {unit}s/group</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Text style={{ fontSize: 13, color: c.muted }}>Qualify/group:</Text>
                  <TouchableOpacity onPress={() => setQpg(v => Math.max(1, v - 1))}
                    style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: c.elevated, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: c.border }}>
                    <Text style={{ color: c.ink, fontWeight: '800', fontSize: 16 }}>−</Text>
                  </TouchableOpacity>
                  <Text style={{ fontSize: 18, fontWeight: '900', color: c.primary, minWidth: 28, textAlign: 'center' }}>{qpg}</Text>
                  <TouchableOpacity onPress={() => setQpg(v => Math.min(4, v + 1))}
                    style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: c.elevated, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: c.border }}>
                    <Text style={{ color: c.ink, fontWeight: '800', fontSize: 16 }}>+</Text>
                  </TouchableOpacity>
                </View>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {!currentEvent.groups?.length ? (
                    <TouchableOpacity onPress={handleGenerateGroups}
                      style={{ flex: 1, backgroundColor: c.primary, borderRadius: 10, paddingVertical: 12, alignItems: 'center' }}>
                      <Text style={{ color: '#fff', fontWeight: '800' }}>Create Groups</Text>
                    </TouchableOpacity>
                  ) : (
                    <>
                      <TouchableOpacity onPress={handleGenerateGroups}
                        style={{ flex: 1, borderRadius: 10, borderWidth: 1.5, borderColor: c.border, paddingVertical: 12, alignItems: 'center' }}>
                        <Text style={{ color: c.ink, fontWeight: '700' }}>↺ Redo Groups</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={handleGenerateKnockout}
                        style={{ flex: 1, backgroundColor: c.primary, borderRadius: 10, paddingVertical: 12, alignItems: 'center' }}>
                        <Text style={{ color: '#fff', fontWeight: '800' }}>Gen Knockout →</Text>
                      </TouchableOpacity>
                    </>
                  )}
                </View>
              </View>
              {/* Add Match Manually (when matches exist) */}
              {hasMatches && <ManualMatchCreatorCard
                format={currentEvent.format} groups={currentEvent.groups ?? []}
                participants={allParticipants} isTeam={isTeam || isDoubles}
                open={showAddMatch} setOpen={setShowAddMatch}
                p1={matchP1Id} setP1={setMatchP1Id}
                p2={matchP2Id} setP2={setMatchP2Id}
                stage={matchStage} setStage={(v) => { setMatchStage(v); setMatchGroupId(''); }}
                groupId={matchGroupId} setGroupId={setMatchGroupId}
                stageOptions={stageOptions} busy={addMatchBusy}
                onSubmit={handleAddMatch} colors={c}
                onCancel={() => { setShowAddMatch(false); setMatchP1Id(''); setMatchP2Id(''); }}
              />}
              {hasMatches && <>
                {(currentEvent.groups ?? []).map((g: any) => {
                  const gm = (currentEvent.matches ?? []).filter((m: any) => m.group_id === g.group_id);
                  if (!gm.length) return null;
                  return <View key={g.group_id} style={{ marginBottom: 8 }}>
                    <Text style={{ fontSize: 10, fontWeight: '800', color: c.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>{g.name} · {gm.length} matches</Text>
                    {gm.map((m: any) => MR(m))}
                  </View>;
                })}
                {(currentEvent.matches ?? []).filter((m: any) => !m.group_id).map((m: any) => MR(m))}
              </>}
            </View>
          );

          // ── direct_knockout ────────────────────────────────────────────────
          const template = getBracketTemplate(n, thirdPlace);

          // No matches yet → Suggestion panel or Manual slot setup
          if (!hasMatches) {
            if (fixMode === 'manual_slots') {
              // Ensure slots array is sized correctly
              const firstRound = template?.rounds?.find((r: any) => r.isAssignable);
              const needed = firstRound?.matchCount ?? 0;
              if (slots.length !== needed) {
                setSlots(Array.from({ length: needed }, () => ({ p1: '', p2: '' })));
              }
              const usedSet = new Set(slots.flatMap(s => [s.p1, s.p2].filter(Boolean)));
              const autoFill = () => {
                const shuffled = [...allParticipants].sort(() => Math.random() - 0.5);
                setSlots(Array.from({ length: needed }, (_, i) => ({
                  p1: String(shuffled[i * 2]?.id ?? ''),
                  p2: String(shuffled[i * 2 + 1]?.id ?? ''),
                })));
              };
              return (
                <View>
                  <View style={{ backgroundColor: c.surface, borderRadius: 12, borderWidth: 1.5,
                    borderColor: c.primary + '44', padding: 14, marginBottom: 14 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 14, fontWeight: '900', color: c.ink }}>Manual Setup — {firstRound?.label}</Text>
                        <Text style={{ fontSize: 12, color: c.muted, marginTop: 2 }}>
                          Assign {needed} first-round match{needed !== 1 ? 'es' : ''}.
                          {template.byeCount > 0 ? ` ${template.byeCount} ${unit}${template.byeCount !== 1 ? 's' : ''} will get a bye.` : ''}
                        </Text>
                      </View>
                      <TouchableOpacity onPress={() => setFixMode('suggestion')}
                        style={{ borderRadius: 7, borderWidth: 1, borderColor: c.border, paddingHorizontal: 10, paddingVertical: 5, marginLeft: 8 }}>
                        <Text style={{ color: c.muted, fontSize: 12, fontWeight: '700' }}>← Back</Text>
                      </TouchableOpacity>
                    </View>
                    <TouchableOpacity onPress={autoFill}
                      style={{ alignSelf: 'flex-start', borderRadius: 7, borderWidth: 1, borderColor: c.border,
                        paddingHorizontal: 12, paddingVertical: 6, marginTop: 10, marginBottom: 14 }}>
                      <Text style={{ color: c.ink, fontWeight: '700', fontSize: 12 }}>Auto-fill All</Text>
                    </TouchableOpacity>

                    {slots.map((slot, idx) => (
                      <View key={idx} style={{ marginBottom: 14, paddingBottom: 14,
                        borderBottomWidth: idx < slots.length - 1 ? 1 : 0, borderBottomColor: c.border }}>
                        <Text style={{ fontSize: 10, fontWeight: '800', color: c.muted,
                          textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 8 }}>
                          Match {idx + 1}
                        </Text>
                        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
                          <View style={{ flex: 1 }}>
                            <SelectPicker
                              label={`${Unit} 1`}
                              value={slot.p1}
                              options={allParticipants
                                .filter((p: any) => String(p.id) === slot.p1 || !usedSet.has(String(p.id)))
                                .filter((p: any) => String(p.id) !== slot.p2)
                                .map((p: any) => ({ value: String(p.id), label: p.name }))}
                              onSelect={v => setSlots(prev => prev.map((s, i) => i === idx ? { ...s, p1: v } : s))}
                              placeholder="— Select —"
                              colors={c}
                            />
                          </View>
                          <Text style={{ color: c.muted, fontWeight: '900', fontSize: 12, paddingBottom: 22, paddingHorizontal: 2 }}>vs</Text>
                          <View style={{ flex: 1 }}>
                            <SelectPicker
                              label={`${Unit} 2`}
                              value={slot.p2}
                              options={allParticipants
                                .filter((p: any) => String(p.id) === slot.p2 || !usedSet.has(String(p.id)))
                                .filter((p: any) => String(p.id) !== slot.p1)
                                .map((p: any) => ({ value: String(p.id), label: p.name }))}
                              onSelect={v => setSlots(prev => prev.map((s, i) => i === idx ? { ...s, p2: v } : s))}
                              placeholder="— Select —"
                              colors={c}
                            />
                          </View>
                        </View>
                      </View>
                    ))}

                    <TouchableOpacity onPress={() => handleBulkCreateMatches(template)}
                      disabled={slotsBusy || slots.some(s => !s.p1 || !s.p2)}
                      style={{ backgroundColor: c.primary, borderRadius: 10, paddingVertical: 13,
                        alignItems: 'center', opacity: (slotsBusy || slots.some(s => !s.p1 || !s.p2)) ? 0.5 : 1 }}>
                      {slotsBusy
                        ? <ActivityIndicator color="#fff" />
                        : <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14 }}>
                            ✓ Create All {template?.total} Matches
                          </Text>}
                    </TouchableOpacity>
                  </View>
                </View>
              );
            }

            // Suggestion overview
            return (
              <View>
                <View style={{ backgroundColor: c.surface, borderRadius: 12, borderWidth: 1, borderColor: c.border, padding: 16, marginBottom: 14 }}>
                  <Text style={{ fontSize: 15, fontWeight: '900', color: c.ink, marginBottom: 2 }}>Tournament Setup</Text>
                  <Text style={{ fontSize: 12, color: c.muted, marginBottom: 16 }}>{n} {unit}{n !== 1 ? 's' : ''} · Direct Knockout</Text>

                  {n < 2 ? (
                    <Text style={{ color: c.muted, fontSize: 13 }}>Add at least 2 {unit}s to set up the bracket.</Text>
                  ) : (
                    <>
                      {/* 3rd place toggle */}
                      <TouchableOpacity onPress={() => setThirdPlace(v => !v)}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                        <View style={{ width: 22, height: 22, borderRadius: 5, borderWidth: 2,
                          borderColor: c.primary, backgroundColor: thirdPlace ? c.primary : 'transparent',
                          alignItems: 'center', justifyContent: 'center' }}>
                          {thirdPlace && <Text style={{ color: '#fff', fontSize: 13, fontWeight: '900' }}>✓</Text>}
                        </View>
                        <Text style={{ fontSize: 13, color: c.ink }}>Include 3rd place match</Text>
                      </TouchableOpacity>

                      {/* Bracket rounds flow */}
                      {template && (
                        <View style={{ marginBottom: 18 }}>
                          <Text style={{ fontSize: 10, fontWeight: '800', color: c.muted,
                            textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 10 }}>
                            Bracket — {template.total} match{template.total !== 1 ? 'es' : ''} total
                          </Text>
                          <ScrollView horizontal showsHorizontalScrollIndicator={false}
                            contentContainerStyle={{ gap: 4, alignItems: 'center' }}>
                            {template.rounds.map((r: any, i: number) => (
                              <React.Fragment key={r.stage + i}>
                                {i > 0 && <Text style={{ color: c.muted, fontSize: 14, paddingHorizontal: 2 }}>→</Text>}
                                <View style={{ backgroundColor: r.isAssignable ? c.primary + '18' : c.elevated,
                                  borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8,
                                  borderWidth: 1, borderColor: r.isAssignable ? c.primary + '55' : c.border,
                                  alignItems: 'center', minWidth: 80 }}>
                                  <Text style={{ fontSize: 11, fontWeight: '800', letterSpacing: 0.3,
                                    color: r.isAssignable ? c.primary : c.ink, textTransform: 'uppercase' }}>
                                    {r.label}
                                  </Text>
                                  <Text style={{ fontSize: 11, color: c.muted, marginTop: 2 }}>
                                    {r.matchCount} match{r.matchCount !== 1 ? 'es' : ''}
                                  </Text>
                                </View>
                              </React.Fragment>
                            ))}
                          </ScrollView>
                          {template.byeCount > 0 && (
                            <View style={{ backgroundColor: c.elevated, borderRadius: 8, padding: 8, marginTop: 10 }}>
                              <Text style={{ fontSize: 11, color: c.muted }}>
                                ℹ {template.byeCount} {unit}{template.byeCount !== 1 ? 's' : ''} will get a bye to the next round.
                              </Text>
                            </View>
                          )}
                        </View>
                      )}

                      <View style={{ flexDirection: 'row', gap: 10 }}>
                        <TouchableOpacity onPress={handleGenerateFixtures}
                          style={{ flex: 1, backgroundColor: c.primary, borderRadius: 10, paddingVertical: 13, alignItems: 'center' }}>
                          <Text style={{ color: '#fff', fontWeight: '800', fontSize: 13 }}>Auto Generate</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => {
                          const first = template?.rounds?.find((r: any) => r.isAssignable);
                          setSlots(Array.from({ length: first?.matchCount ?? 0 }, () => ({ p1: '', p2: '' })));
                          setFixMode('manual_slots');
                        }} style={{ flex: 1, borderRadius: 10, borderWidth: 1.5, borderColor: c.border, paddingVertical: 13, alignItems: 'center' }}>
                          <Text style={{ color: c.ink, fontWeight: '700', fontSize: 13 }}>Set Up Manually</Text>
                        </TouchableOpacity>
                      </View>
                    </>
                  )}
                </View>
              </View>
            );
          }

          // Matches exist → control bar + Add Match + list
          return (
            <View>
              {/* Regenerate + 3rd place controls */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                <TouchableOpacity onPress={() => setThirdPlace(v => !v)}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 6,
                    borderRadius: 8, borderWidth: 1, borderColor: c.border,
                    paddingHorizontal: 10, paddingVertical: 7 }}>
                  <View style={{ width: 16, height: 16, borderRadius: 3, borderWidth: 2,
                    borderColor: c.primary, backgroundColor: thirdPlace ? c.primary : 'transparent',
                    alignItems: 'center', justifyContent: 'center' }}>
                    {thirdPlace && <Text style={{ color: '#fff', fontSize: 10, fontWeight: '900' }}>✓</Text>}
                  </View>
                  <Text style={{ fontSize: 12, color: c.muted }}>3rd place</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleGenerateFixtures}
                  style={{ flex: 1, backgroundColor: c.elevated, borderRadius: 8, borderWidth: 1, borderColor: c.border, paddingVertical: 8, alignItems: 'center' }}>
                  <Text style={{ color: c.ink, fontWeight: '700', fontSize: 12 }}>↺ Regenerate Fixtures</Text>
                </TouchableOpacity>
              </View>

              {/* Add Match Manually */}
              <ManualMatchCreatorCard
                format={currentEvent.format} groups={currentEvent.groups ?? []}
                participants={allParticipants} isTeam={isTeam || isDoubles}
                open={showAddMatch} setOpen={setShowAddMatch}
                p1={matchP1Id} setP1={setMatchP1Id}
                p2={matchP2Id} setP2={setMatchP2Id}
                stage={matchStage} setStage={(v) => { setMatchStage(v); setMatchGroupId(''); }}
                groupId={matchGroupId} setGroupId={setMatchGroupId}
                stageOptions={stageOptions} busy={addMatchBusy}
                onSubmit={handleAddMatch} colors={c}
                onCancel={() => { setShowAddMatch(false); setMatchP1Id(''); setMatchP2Id(''); }}
              />

              {/* Match list */}
              {(currentEvent.groups ?? []).map((g: any) => {
                const gm = (currentEvent.matches ?? []).filter((m: any) => m.group_id === g.group_id);
                if (!gm.length) return null;
                return <View key={g.group_id} style={{ marginBottom: 8 }}>
                  <Text style={{ fontSize: 10, fontWeight: '800', color: c.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
                    {g.name} · {gm.length} matches
                  </Text>
                  {gm.map((m: any) => MR(m))}
                </View>;
              })}
              {(currentEvent.matches ?? []).filter((m: any) => !m.group_id).map((m: any) => MR(m))}
            </View>
          );
        })()}

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
                    {liveMatches.map((m: any) => MR(m))}
                  </View>
                )}
                {scheduledMatches.length > 0 && (
                  <View style={{ marginBottom: 12 }}>
                    <Text style={{ fontSize: 11, fontWeight: '800', color: c.muted,
                      textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
                      Scheduled ({scheduledMatches.length})
                    </Text>
                    {scheduledMatches.map((m: any) => MR(m))}
                  </View>
                )}
                {doneMatches.length > 0 && (
                  <View>
                    <Text style={{ fontSize: 11, fontWeight: '800', color: c.muted,
                      textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
                      Completed ({doneMatches.length})
                    </Text>
                    {doneMatches.map((m: any) => MR(m))}
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
