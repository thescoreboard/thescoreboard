/**
 * Tournament Overview — mirrors TournamentOverview.jsx
 * Lifecycle stepper, phase transitions, stats, events grid, share link.
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Alert,
  ActivityIndicator, Share, RefreshControl, TextInput, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTheme } from '../../../../src/hooks/useTheme';
import { useAuthStore } from '../../../../src/store/auth';
import {
  apiGetWorkspace, apiTransitionTournament, apiUpdateTournament, apiDeleteTournament,
} from '../../../../src/api/client';
import { F, STATUS_LABELS, STATUS_COLORS } from '../../../../src/theme';

const LIFECYCLE = ['draft', 'registration', 'fixtures', 'live', 'completed'];
const LIFECYCLE_LABELS: Record<string, string> = {
  draft: 'Draft', registration: 'Reg', fixtures: 'Fixtures', live: 'Live', completed: 'Done',
};

const SPORT_META: Record<string, { abbrev: string; label: string; type: string }> = {
  table_tennis: { abbrev: 'T', label: 'Table Tennis', type: 'individual' },
  badminton:    { abbrev: 'B', label: 'Badminton',    type: 'individual' },
  cricket:      { abbrev: 'C', label: 'Cricket',      type: 'team'       },
  football:     { abbrev: 'F', label: 'Football',     type: 'team'       },
};

export default function TournamentOverviewScreen() {
  const { id }      = useLocalSearchParams<{ id: string }>();
  const { theme }   = useTheme();
  const router      = useRouter();
  const { token }   = useAuthStore();
  const c           = theme.colors;

  const [data,        setData]        = useState<any>(null);
  const [loading,     setLoading]     = useState(true);
  const [refreshing,  setRefreshing]  = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const [flash,       setFlash]       = useState('');
  const [editingInfo, setEditingInfo] = useState(false);
  const [infoForm,    setInfoForm]    = useState({ overview: '', rules: '', prize_pool: '', contact: '' });

  const showFlash = (msg: string) => {
    setFlash(msg);
    setTimeout(() => setFlash(''), 3000);
  };

  const load = useCallback(async () => {
    try {
      const ws = await apiGetWorkspace(token!, parseInt(id));
      setData(ws);
      const info = ws.tournament?.tournament_info ?? {};
      // prize_pool is an array [{category,position,amount}], contact is an object
      // — stringify them so they're safe to store in string-typed form state
      setInfoForm({
        overview:   typeof info.overview === 'string' ? info.overview : '',
        rules:      typeof info.rules    === 'string' ? info.rules    : '',
        prize_pool: info.prize_pool
          ? (typeof info.prize_pool === 'string' ? info.prize_pool : JSON.stringify(info.prize_pool))
          : '',
        contact: info.contact
          ? (typeof info.contact === 'string' ? info.contact : JSON.stringify(info.contact))
          : '',
      });
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
    setLoading(false);
    setRefreshing(false);
  }, [id, token]);

  useEffect(() => { load(); }, [load]);

  const handleTransition = async (status: string) => {
    if (transitioning) return;
    setTransitioning(true);
    try {
      await apiTransitionTournament(token!, parseInt(id), status);
      await load();
      showFlash(`Phase → ${LIFECYCLE_LABELS[status] ?? status}`);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
    setTransitioning(false);
  };

  const handleShare = async () => {
    if (!data?.tournament?.slug) return;
    try {
      await Share.share({
        message: `${data.tournament.name} — Live on TheScoreBoard\nhttps://thescoreboard.in/t/${data.tournament.slug}`,
        url: `https://thescoreboard.in/t/${data.tournament.slug}`,
      });
    } catch {}
  };

  const handleSaveInfo = async () => {
    try {
      // prize_pool and contact are stored as JSON strings in the form;
      // parse them back to structured objects before sending to the API.
      const tryParse = (v: string) => { try { return JSON.parse(v); } catch { return v || undefined; } };
      await apiUpdateTournament(token!, data.tournament.org_id, parseInt(id), {
        tournament_info: {
          overview:   infoForm.overview   || undefined,
          rules:      infoForm.rules      || undefined,
          prize_pool: infoForm.prize_pool ? tryParse(infoForm.prize_pool) : undefined,
          contact:    infoForm.contact    ? tryParse(infoForm.contact)    : undefined,
        },
      });
      showFlash('Info saved!');
      setEditingInfo(false);
      load();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  const handleDelete = () => {
    Alert.alert(
      'Delete Tournament',
      `Delete "${t?.name ?? 'this tournament'}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: async () => {
            try {
              await apiDeleteTournament(token!, t.org_id, parseInt(id));
              router.replace('/(tabs)/organiser' as any);
            } catch (e: any) {
              Alert.alert('Error', e.message);
            }
          },
        },
      ]
    );
  };

  if (loading && !data) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
        <ActivityIndicator style={{ flex: 1 }} color={c.primary} />
      </SafeAreaView>
    );
  }

  const t           = data?.tournament ?? {};
  const events      = data?.events     ?? [];
  const stats       = data?.stats      ?? {};
  const currentIdx  = LIFECYCLE.indexOf(t.status ?? 'draft');

  const unconfigured  = events.filter((ev: any) => ev.is_configured === false).length;
  const isTeamSport   = events.some((ev: any) => ev.participant_type === 'team');
  const participantLbl = isTeamSport ? 'Teams' : 'Players';

  const statCards = [
    ...(t.is_multi_sport ? [{ label: 'Events',  value: stats.total_events }] : []),
    { label: participantLbl,       value: stats.total_players },
    { label: 'Matches',            value: stats.total_matches },
    { label: 'Live',               value: stats.live_matches, highlight: stats.live_matches > 0 },
  ];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.border }}>
        <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)/organiser' as any)}>
          <Text style={{ color: c.muted, fontSize: 14 }}>← Back</Text>
        </TouchableOpacity>
        <Text style={{ fontSize: 14, fontWeight: '800', color: c.ink, flex: 1, marginHorizontal: 12 }}
          numberOfLines={1}>{t.name}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {t.status === 'live' && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5,
              backgroundColor: c.primary + '22', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: c.primary }} />
              <Text style={{ fontSize: 11, fontWeight: '800', color: c.primary }}>LIVE</Text>
            </View>
          )}
          {/* Delete button in header */}
          <TouchableOpacity
            onPress={handleDelete}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={{ borderRadius: 8, borderWidth: 1, borderColor: '#ef444444',
              paddingHorizontal: 10, paddingVertical: 6, backgroundColor: '#ef444410' }}>
            <Text style={{ color: '#ef4444', fontSize: 12, fontWeight: '700' }}>Delete</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Flash */}
      {!!flash && (
        <View style={{ backgroundColor: '#22c55e22', borderBottomWidth: 1, borderBottomColor: '#22c55e44',
          paddingHorizontal: 16, paddingVertical: 10 }}>
          <Text style={{ color: '#22c55e', fontSize: 13, fontWeight: '700' }}>{flash}</Text>
        </View>
      )}

      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={c.primary} />}
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
      >
        {/* Tournament title + meta */}
        <View style={{ marginBottom: 20 }}>
          <Text style={{ fontFamily: F.display, fontSize: 18, color: c.ink, letterSpacing: -0.5, marginBottom: 6 }}>{(t.name ?? '').toUpperCase()}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            {t.city && <Text style={{ fontSize: 12, color: c.muted }}>{[t.venue, t.city].filter(Boolean).join(', ')}</Text>}
            {t.start_date && <Text style={{ fontSize: 12, color: c.muted }}>{t.start_date}</Text>}
            <View style={{ borderRadius: 999, backgroundColor: (STATUS_COLORS[t.status] ?? '#888') + '22',
              paddingHorizontal: 10, paddingVertical: 3 }}>
              <Text style={{ fontSize: 11, fontWeight: '800', color: STATUS_COLORS[t.status] ?? '#888' }}>
                {STATUS_LABELS[t.status] ?? t.status}
              </Text>
            </View>
          </View>
        </View>

        {/* Setup warning */}
        {unconfigured > 0 && (
          <View style={{ backgroundColor: 'rgba(255,204,0,0.12)', borderWidth: 1, borderColor: 'rgba(255,204,0,0.4)',
            borderRadius: 10, padding: 14, marginBottom: 16, flexDirection: 'row', gap: 12, alignItems: 'center' }}>
            <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: '#ffcc00',
              alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 12, fontWeight: '900', color: '#1a1a1a' }}>!</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 12, fontWeight: '800', color: '#b8860b', marginBottom: 2 }}>
                {unconfigured} sport{unconfigured !== 1 ? 's' : ''} need setup
              </Text>
              <Text style={{ fontSize: 12, color: c.muted }}>
                Tap each sport card below to configure it.
              </Text>
            </View>
          </View>
        )}

        {/* Stats */}
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 20 }}>
          {statCards.map(({ label, value, highlight }) => (
            <View key={label} style={{ flex: 1, backgroundColor: c.surface, borderRadius: 10,
              borderWidth: 1, borderColor: c.border, padding: 10, alignItems: 'center' }}>
              <Text style={{ fontFamily: F.display, fontSize: 18, color: highlight ? c.primary : c.ink }}>{value ?? 0}</Text>
              <Text style={{ fontFamily: F.bold, fontSize: 9, color: c.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 2 }}>{label}</Text>
            </View>
          ))}
        </View>

        {/* Phase control */}
        <View style={{ backgroundColor: c.surface, borderRadius: 14, borderWidth: 1, borderColor: c.border,
          padding: 16, marginBottom: 16 }}>
          <Text style={{ fontFamily: F.bold, fontSize: 11, fontWeight: '700', color: c.muted, textTransform: 'uppercase',
            letterSpacing: 1, marginBottom: 14 }}>Tournament Phase</Text>

          {/* Stepper */}
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
            {LIFECYCLE.map((phase, i) => {
              const state = i < currentIdx ? 'done' : i === currentIdx ? 'active' : 'pending';
              return (
                <React.Fragment key={phase}>
                  <TouchableOpacity
                    onPress={() => handleTransition(phase)}
                    style={{ alignItems: 'center', opacity: transitioning ? 0.6 : 1 }}
                  >
                    <View style={{
                      width: 28, height: 28, borderRadius: 14,
                      backgroundColor: state === 'pending' ? c.elevated : c.primary,
                      borderWidth: state === 'pending' ? 2 : 0, borderColor: c.border,
                      alignItems: 'center', justifyContent: 'center',
                      // cross-platform glow on active step
                      ...Platform.select({
                        web:     state === 'active' ? { boxShadow: `0 0 8px ${c.primary}99` } : {},
                        default: state === 'active' ? { shadowColor: c.primary, shadowOpacity: 0.5, shadowRadius: 6, elevation: 4 } : {},
                      }),
                    }}>
                      <Text style={{ fontSize: 10, fontWeight: '900',
                        color: state === 'pending' ? c.muted : c.bg }}>
                        {state === 'done' ? '✓' : String(i + 1)}
                      </Text>
                    </View>
                    <Text style={{ fontSize: 8, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5,
                      color: state === 'pending' ? c.muted : c.primary, marginTop: 4 }}>
                      {LIFECYCLE_LABELS[phase]}
                    </Text>
                  </TouchableOpacity>
                  {i < LIFECYCLE.length - 1 && (
                    <View style={{ flex: 1, height: 2, marginHorizontal: 2, marginBottom: 18,
                      backgroundColor: i < currentIdx ? c.primary : c.border }} />
                  )}
                </React.Fragment>
              );
            })}
          </View>

          {/* Quick buttons */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {LIFECYCLE.map(phase => (
              <TouchableOpacity key={phase}
                onPress={() => handleTransition(phase)}
                disabled={transitioning}
                style={{ borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7,
                  backgroundColor: t.status === phase ? c.primary : c.elevated,
                  borderWidth: 1, borderColor: t.status === phase ? c.primary : c.border }}>
                <Text style={{ fontSize: 12, fontWeight: '700',
                  color: t.status === phase ? '#fff' : c.muted }}>
                  {LIFECYCLE_LABELS[phase]}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Share */}
        <View style={{ backgroundColor: c.surface, borderRadius: 14, borderWidth: 1, borderColor: c.border,
          padding: 16, marginBottom: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={{ fontFamily: F.bold, fontSize: 11, fontWeight: '700', color: c.muted, textTransform: 'uppercase', letterSpacing: 1 }}>
            Share Tournament
          </Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity onPress={handleShare}
              style={{ backgroundColor: c.primary, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 }}>
              <Text style={{ fontFamily: F.bold, color: '#fff', fontWeight: '700', fontSize: 12 }}>Share ↗</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => router.push(`/t/${t.slug}`)}
              style={{ borderRadius: 8, borderWidth: 1, borderColor: c.border, paddingHorizontal: 14, paddingVertical: 8 }}>
              <Text style={{ color: c.ink, fontWeight: '700', fontSize: 13 }}>View ↗</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Tournament Info / Rules Editor */}
        <View style={{ backgroundColor: c.surface, borderRadius: 14, borderWidth: 1, borderColor: c.border,
          padding: 16, marginBottom: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <Text style={{ fontFamily: F.display, fontSize: 12, color: c.ink, letterSpacing: -0.3 }}>Tournament Info</Text>
            <TouchableOpacity onPress={() => setEditingInfo(v => !v)}>
              <Text style={{ color: c.primary, fontSize: 13, fontWeight: '700' }}>
                {editingInfo ? 'Cancel' : 'Edit'}
              </Text>
            </TouchableOpacity>
          </View>

          {editingInfo ? (
            <View style={{ gap: 12 }}>
              {([
                { key: 'overview',   label: 'Overview' },
                { key: 'rules',      label: 'Rules' },
                { key: 'prize_pool', label: 'Prize Pool' },
                { key: 'contact',    label: 'Contact' },
              ] as const).map(f => (
                <View key={f.key}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: c.muted,
                    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>{f.label}</Text>
                  <TextInput
                    style={{ backgroundColor: c.elevated, borderRadius: 10, borderWidth: 1, borderColor: c.border,
                      color: c.ink, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14,
                      minHeight: 70, textAlignVertical: 'top' }}
                    value={infoForm[f.key]}
                    onChangeText={v => setInfoForm(prev => ({ ...prev, [f.key]: v }))}
                    multiline
                    placeholder={f.label}
                    placeholderTextColor={c.muted}
                  />
                </View>
              ))}
              <TouchableOpacity onPress={handleSaveInfo}
                style={{ backgroundColor: c.primary, borderRadius: 10, paddingVertical: 13, alignItems: 'center' }}>
                <Text style={{ fontFamily: F.display, color: '#fff', fontSize: 11, letterSpacing: 0.5, textTransform: 'uppercase' }}>Save Info</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={{ gap: 10 }}>
              {/* Overview */}
              {!!infoForm.overview && (
                <View>
                  <Text style={{ fontSize: 10, fontWeight: '800', color: c.muted, textTransform: 'uppercase', letterSpacing: 0.5 }}>Overview</Text>
                  <Text style={{ fontSize: 13, color: c.ink, marginTop: 3, lineHeight: 18 }}>{infoForm.overview}</Text>
                </View>
              )}
              {/* Rules */}
              {!!infoForm.rules && (
                <View>
                  <Text style={{ fontSize: 10, fontWeight: '800', color: c.muted, textTransform: 'uppercase', letterSpacing: 0.5 }}>Rules</Text>
                  <Text style={{ fontSize: 13, color: c.ink, marginTop: 3, lineHeight: 18 }}>{infoForm.rules}</Text>
                </View>
              )}
              {/* Prize Pool — parse JSON array [{category,position,amount}] */}
              {!!infoForm.prize_pool && (() => {
                try {
                  const arr = JSON.parse(infoForm.prize_pool);
                  if (Array.isArray(arr) && arr.length > 0) return (
                    <View>
                      <Text style={{ fontSize: 10, fontWeight: '800', color: c.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Prize Pool</Text>
                      {arr.map((p: any, i: number) => (
                        <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between',
                          paddingVertical: 5, borderTopWidth: i > 0 ? 1 : 0, borderTopColor: c.border }}>
                          <Text style={{ fontSize: 13, color: c.muted }}>{p.category ?? ''} · {p.position ?? ''}</Text>
                          <Text style={{ fontSize: 13, color: c.ink, fontWeight: '700' }}>{p.amount ?? ''}</Text>
                        </View>
                      ))}
                    </View>
                  );
                } catch {}
                return (
                  <View>
                    <Text style={{ fontSize: 10, fontWeight: '800', color: c.muted, textTransform: 'uppercase', letterSpacing: 0.5 }}>Prize Pool</Text>
                    <Text style={{ fontSize: 13, color: c.ink, marginTop: 3 }}>{infoForm.prize_pool}</Text>
                  </View>
                );
              })()}
              {/* Contact — parse JSON object {entry_fee,reg_deadline,persons} */}
              {!!infoForm.contact && (() => {
                try {
                  const obj = JSON.parse(infoForm.contact);
                  if (obj && typeof obj === 'object') return (
                    <View>
                      <Text style={{ fontSize: 10, fontWeight: '800', color: c.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Contact</Text>
                      {!!obj.entry_fee    && <Text style={{ fontSize: 13, color: c.ink }}>Entry: {obj.entry_fee}</Text>}
                      {!!obj.reg_deadline && <Text style={{ fontSize: 13, color: c.muted, marginTop: 2 }}>Deadline: {obj.reg_deadline}</Text>}
                      {(obj.persons ?? []).map((p: any, i: number) => (
                        <Text key={i} style={{ fontSize: 13, color: c.muted, marginTop: 2 }}>
                          {p.name}{p.phone ? ` · ${p.phone}` : ''}
                        </Text>
                      ))}
                    </View>
                  );
                } catch {}
                return (
                  <View>
                    <Text style={{ fontSize: 10, fontWeight: '800', color: c.muted, textTransform: 'uppercase', letterSpacing: 0.5 }}>Contact</Text>
                    <Text style={{ fontSize: 13, color: c.ink, marginTop: 3 }}>{infoForm.contact}</Text>
                  </View>
                );
              })()}
              {!Object.values(infoForm).some(Boolean) && (
                <Text style={{ color: c.muted, fontSize: 13 }}>No info added yet. Tap Edit to add details.</Text>
              )}
            </View>
          )}
        </View>

        {/* Events grid */}
        {t.is_multi_sport && (
          <Text style={{ fontSize: 11, fontWeight: '800', color: c.muted,
            textTransform: 'uppercase', letterSpacing: 2, marginBottom: 12 }}>Sports</Text>
        )}

        {events.length === 0 ? (
          <View style={{ backgroundColor: c.surface, borderRadius: 14, borderWidth: 1, borderColor: c.border,
            padding: 40, alignItems: 'center' }}>
            <Text style={{ fontSize: 15, fontWeight: '800', color: c.ink }}>No Events Yet</Text>
            <Text style={{ fontSize: 13, color: c.muted, marginTop: 4 }}>This tournament has no events configured.</Text>
          </View>
        ) : (
          <View style={{ gap: 12 }}>
            {events.map((ev: any) => {
              const sm     = SPORT_META[ev.sport_key] ?? { abbrev: (ev.sport_key ?? '?').slice(0, 2).toUpperCase(), label: ev.sport_key, type: 'individual' };
              const needs  = ev.is_configured === false;
              return (
                <TouchableOpacity
                  key={ev.event_id}
                  activeOpacity={0.8}
                  onPress={() => {
                    if (needs) {
                      Alert.alert(
                        'Setup Required',
                        `${ev.name} needs to be configured on the web app first. Event setup wizard is not yet available on mobile.`,
                      );
                    } else {
                      router.push(`/organiser/tournament/${id}/event/${ev.event_id}`);
                    }
                  }}
                  style={{ backgroundColor: c.surface, borderRadius: 14, borderWidth: 1,
                    borderColor: needs ? 'rgba(255,204,0,0.5)' : c.border,
                    borderTopWidth: 3, borderTopColor: needs ? '#ffcc00' : c.primary,
                    padding: 16 }}
                >
                  {needs && (
                    <View style={{ position: 'absolute', top: 10, right: 10, backgroundColor: '#ffcc00',
                      borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
                      <Text style={{ fontSize: 9, fontWeight: '900', color: '#1a1a1a' }}>SETUP REQUIRED</Text>
                    </View>
                  )}

                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12,
                    paddingRight: needs ? 100 : 0 }}>
                    <View style={{ width: 44, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
                      backgroundColor: needs ? 'rgba(255,204,0,0.12)' : c.primary + '22',
                      borderWidth: 1, borderColor: needs ? 'rgba(255,204,0,0.3)' : c.primary + '44' }}>
                      <Text style={{ fontSize: 18, fontWeight: '900', color: needs ? '#b8860b' : c.primary }}>{sm.abbrev}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontFamily: F.display, fontSize: 12, color: c.ink, letterSpacing: -0.3 }}>{ev.name}</Text>
                      <Text style={{ fontFamily: F.body, fontSize: 12, color: c.muted, marginTop: 2 }}>
                        {needs ? 'Tap to configure' : `${sm.label} · ${(ev.format ?? '').replace(/_/g, ' ')}`}
                      </Text>
                    </View>
                  </View>

                  {/* Type badge */}
                  <View style={{ alignSelf: 'flex-start', borderRadius: 999,
                    backgroundColor: needs ? '#ffcc0022' : (sm.type === 'team' ? '#f59e0b22' : '#22c55e22'),
                    paddingHorizontal: 10, paddingVertical: 3, marginBottom: 12 }}>
                    <Text style={{ fontSize: 11, fontWeight: '700',
                      color: needs ? '#b8860b' : (sm.type === 'team' ? '#f59e0b' : '#22c55e') }}>
                      {needs ? 'Pending Setup' : (sm.type === 'team' ? 'Team Sport' : 'Individual')}
                    </Text>
                  </View>

                  {/* Stats */}
                  {!needs && (
                    <View style={{ flexDirection: 'row', gap: 20, paddingTop: 12,
                      borderTopWidth: 1, borderTopColor: c.border }}>
                      {[
                        { label: ev.participant_type === 'team' ? 'Teams' : 'Players', value: ev.player_count },
                        { label: 'Matches', value: ev.match_count },
                        { label: 'Done',    value: `${ev.done_count ?? 0}/${ev.match_count}` },
                        ...(ev.live_count > 0 ? [{ label: 'Live', value: ev.live_count, color: c.primary }] : []),
                      ].map(({ label, value, color }) => (
                        <View key={label}>
                          <Text style={{ fontSize: 20, fontWeight: '900', color: color ?? c.ink, lineHeight: 22 }}>{value}</Text>
                          <Text style={{ fontSize: 10, color: c.muted, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</Text>
                        </View>
                      ))}
                    </View>
                  )}

                  <Text style={{ marginTop: 10, textAlign: 'right', fontSize: 11, fontWeight: '800',
                    textTransform: 'uppercase', letterSpacing: 1,
                    color: needs ? '#b8860b' : c.primary }}>
                    {needs ? 'Configure →' : 'Manage →'}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
