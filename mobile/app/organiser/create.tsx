/**
 * Create tournament wizard
 *
 * Single-sport path:  Type → Sport → Config → Format → Details → Review
 * Multi-sport path:   Type → Sports → Details → Review
 */
import React, { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTheme } from '../../src/hooks/useTheme';
import { useAuthStore } from '../../src/store/auth';
import { apiGetMyOrgs, apiCreateOrg, apiCreateTournament } from '../../src/api/client';
import { F } from '../../src/theme';
import VenuePicker, { type VenueValue } from '../../src/components/shared/VenuePicker';

// ── Sport definitions ─────────────────────────────────────────────────────────
const SPORTS = [
  {
    key: 'table_tennis', label: 'Table Tennis', icon: '🏓', abbrev: 'TT',
    subformats: [
      { key: 'singles', label: 'Singles', pType: 'individual' },
      { key: 'doubles', label: 'Doubles', pType: 'doubles_pair' },
    ],
    defaultConfig: { sets_to_win: 3, points_per_set: 11 },
  },
  {
    key: 'badminton', label: 'Badminton', icon: '🏸', abbrev: 'BD',
    subformats: [
      { key: 'singles',       label: 'Singles',       pType: 'individual' },
      { key: 'doubles',       label: 'Doubles',       pType: 'doubles_pair' },
      { key: 'mixed_doubles', label: 'Mixed Doubles', pType: 'doubles_pair', mixed: true },
    ],
    defaultConfig: { sets_to_win: 3, points_per_set: 21 },
  },
  {
    key: 'cricket', label: 'Cricket', icon: '🏏', abbrev: 'CR',
    subformats: [
      { key: 'standard', label: 'Standard', pType: 'team', squad_size: 11 },
    ],
    defaultConfig: { overs: 20, squad_size: 11 },
  },
  {
    key: 'football', label: 'Football', icon: '⚽', abbrev: 'FB',
    subformats: [
      { key: '11aside', label: '11-a-side', pType: 'team', squad_size: 11, team_size: 11, substitutes: 5 },
      { key: '7aside',  label: '7-a-side',  pType: 'team', squad_size: 7,  team_size: 7,  substitutes: 3 },
      { key: '5aside',  label: '5-a-side',  pType: 'team', squad_size: 5,  team_size: 5,  substitutes: 2 },
    ],
    defaultConfig: {},
  },
];

const FORMATS = [
  { key: 'direct_knockout', label: 'Direct Knockout',   desc: 'Single elimination bracket' },
  { key: 'round_robin',     label: 'Round Robin',       desc: 'Everyone plays everyone'    },
  { key: 'group_knockout',  label: 'Group + Knockout',  desc: 'Groups then knockout'       },
];

// Step labels for each path (step 0 is always "Type")
const SINGLE_STEPS = ['Type', 'Sport', 'Config', 'Format', 'Details', 'Review'];
const MULTI_STEPS  = ['Type', 'Sports', 'Details', 'Review'];

export default function CreateTournamentScreen() {
  const { theme } = useTheme();
  const router    = useRouter();
  const { token } = useAuthStore();
  const c         = theme.colors;

  // ── Wizard navigation ─────────────────────────────────────────────────────
  const [step,    setStep]    = useState(0);
  const [isMulti, setIsMulti] = useState(false);

  // ── Single-sport state ────────────────────────────────────────────────────
  const [sport,     setSport]     = useState<any>(null);
  const [subformat, setSubformat] = useState<any>(null);
  const [format,    setFormat]    = useState('direct_knockout');
  const [overs,     setOvers]     = useState('20');
  const [setsToWin, setSetsToWin] = useState('3');
  const [ptsPerSet, setPtsPerSet] = useState('21');

  // ── Multi-sport state ─────────────────────────────────────────────────────
  const [selectedSports, setSelectedSports] = useState<string[]>([]);

  // ── Shared details ────────────────────────────────────────────────────────
  const [name,      setName]      = useState('');
  const [venueObj,  setVenueObj]  = useState<VenueValue | null>(null);
  const [loading,   setLoading]   = useState(false);

  const steps = isMulti ? MULTI_STEPS : SINGLE_STEPS;

  // ── Toggle sport for multi-sport selection ────────────────────────────────
  const toggleSport = (key: string) => {
    setSelectedSports(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key],
    );
  };

  // ── Create tournament ─────────────────────────────────────────────────────
  const handleCreate = async () => {
    if (!name.trim()) { Alert.alert('Tournament name is required'); return; }
    if (isMulti && selectedSports.length < 2) { Alert.alert('Select at least 2 sports'); return; }
    setLoading(true);
    try {
      const orgs = await apiGetMyOrgs(token!);
      let orgId: number;
      if (orgs.length > 0) {
        orgId = orgs[0].org_id;
      } else {
        const org = await apiCreateOrg(token!, { name: name.trim() });
        orgId = org.org_id;
      }

      let events: any[];

      if (isMulti) {
        // Multi-sport: stubs only — each sport configured later via SportSetupModal
        events = selectedSports.map(key => {
          const sp = SPORTS.find(s => s.key === key)!;
          return {
            name:             sp.label,
            sport_key:        key,
            format:           null,
            participant_type: 'individual',
            sport_config:     null,
            squad_size:       null,
            team_size:        null,
            substitutes:      null,
          };
        });
      } else {
        // Single-sport: fully configured at creation
        const pType      = subformat?.pType ?? 'individual';
        const isCricket  = sport?.key === 'cricket';
        const isFootball = sport?.key === 'football';
        const isRacket   = sport?.key === 'table_tennis' || sport?.key === 'badminton';

        const sportConfig: any = {};
        if (isRacket)   { sportConfig.sets_to_win = parseInt(setsToWin) || 3; sportConfig.points_per_set = parseInt(ptsPerSet) || 21; }
        if (isCricket)  { sportConfig.overs = parseInt(overs) || 20; sportConfig.squad_size = subformat?.squad_size ?? 11; }
        if (isFootball) { sportConfig.squad_size = subformat?.squad_size ?? 11; sportConfig.team_size = subformat?.team_size ?? 11; sportConfig.substitutes = subformat?.substitutes ?? 5; }
        if (subformat?.mixed) sportConfig.mixed = true;

        const eventName = subformat?.label
          ? `${sport.label} — ${subformat.label}`
          : sport.label;

        events = [{
          name:             eventName,
          sport_key:        sport.key,
          format,
          participant_type: pType,
          sport_config:     sportConfig,
          squad_size:       subformat?.squad_size,
          team_size:        subformat?.team_size,
          substitutes:      subformat?.substitutes,
        }];
      }

      const payload = {
        name:           name.trim(),
        city:           venueObj?.city  || null,
        venue:          venueObj?.name  || null,
        venue_lat:      venueObj?.lat   ?? null,
        venue_lng:      venueObj?.lng   ?? null,
        is_published:   true,
        is_multi_sport: isMulti,
        events,
      };

      await apiCreateTournament(token!, orgId, payload);
      router.replace('/(tabs)/organiser');
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
    setLoading(false);
  };

  const goBack = () => {
    if (step === 0) router.back();
    else setStep(s => s - 1);
  };

  // ── Details step index differs per path ───────────────────────────────────
  const detailsStep = isMulti ? 2 : 4;
  const reviewStep  = isMulti ? 3 : 5;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>

      {/* ── Progress bar ──────────────────────────────────────────────────── */}
      <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 }}>
        <TouchableOpacity onPress={goBack} style={{ marginBottom: 12 }}>
          <Text style={{ color: c.muted, fontSize: 14 }}>← {step === 0 ? 'Cancel' : 'Back'}</Text>
        </TouchableOpacity>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {steps.map((_, i) => (
            <View key={i} style={{ flex: 1, height: 3, borderRadius: 2,
              backgroundColor: i <= step ? c.primary : c.border }} />
          ))}
        </View>
        <Text style={{ fontSize: 12, color: c.muted, marginTop: 6 }}>
          Step {step + 1} of {steps.length} — {steps[step]}
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, flexGrow: 1 }}>

        {/* ═══ STEP 0: Tournament type ════════════════════════════════════════ */}
        {step === 0 && (
          <View>
            <Text style={[cr.heading, { color: c.ink }]}>Tournament Type</Text>
            <Text style={[cr.sub, { color: c.muted }]}>Choose your tournament structure</Text>

            <View style={{ gap: 14 }}>
              {/* Single sport */}
              <TouchableOpacity
                onPress={() => { setIsMulti(false); setStep(1); }}
                style={[cr.typeCard, { backgroundColor: c.surface, borderColor: c.border }]}
                activeOpacity={0.8}
              >
                <View style={[cr.typeIcon, { backgroundColor: c.primary + '22', borderColor: c.primary + '44' }]}>
                  <Text style={{ fontSize: 24 }}>🏆</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: F.bold, fontSize: 16, color: c.ink, marginBottom: 4 }}>Single Sport</Text>
                  <Text style={{ fontFamily: F.body, fontSize: 12, color: c.muted, lineHeight: 18 }}>
                    One sport, fully configured at creation. Pick the draw format, rules, and scoring upfront.
                  </Text>
                </View>
                <Text style={{ fontSize: 18, color: c.muted }}>›</Text>
              </TouchableOpacity>

              {/* Multi sport */}
              <TouchableOpacity
                onPress={() => { setIsMulti(true); setStep(1); }}
                style={[cr.typeCard, { backgroundColor: c.surface, borderColor: c.border }]}
                activeOpacity={0.8}
              >
                <View style={[cr.typeIcon, { backgroundColor: '#8b5cf622', borderColor: '#8b5cf633' }]}>
                  <Text style={{ fontSize: 24 }}>🎯</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: F.bold, fontSize: 16, color: c.ink, marginBottom: 4 }}>Multi Sport</Text>
                  <Text style={{ fontFamily: F.body, fontSize: 12, color: c.muted, lineHeight: 18 }}>
                    Multiple sports under one event. Each sport is configured separately after creation.
                  </Text>
                </View>
                <Text style={{ fontSize: 18, color: c.muted }}>›</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ═══ STEP 1 (Single): Sport selection ══════════════════════════════ */}
        {step === 1 && !isMulti && (
          <View>
            <Text style={[cr.heading, { color: c.ink }]}>Choose Sport</Text>
            <View style={{ gap: 10 }}>
              {SPORTS.map(sp => (
                <TouchableOpacity key={sp.key}
                  onPress={() => { setSport(sp); setSubformat(sp.subformats[0]); setStep(2); }}
                  style={[cr.optCard, { backgroundColor: c.surface, borderColor: sport?.key === sp.key ? c.primary : c.border }]}
                  activeOpacity={0.8}
                >
                  <View style={{ width: 44, height: 44, borderRadius: 10,
                    backgroundColor: sport?.key === sp.key ? c.primary + '22' : c.elevated,
                    alignItems: 'center', justifyContent: 'center',
                    borderWidth: 1, borderColor: sport?.key === sp.key ? c.primary + '55' : c.border }}>
                    <Text style={{ fontSize: 22 }}>{sp.icon}</Text>
                  </View>
                  <Text style={{ fontFamily: F.bold, fontSize: 15, color: c.ink, flex: 1 }}>{sp.label}</Text>
                  <Text style={{ fontSize: 16, color: c.muted }}>›</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* ═══ STEP 1 (Multi): Sports multi-select ═══════════════════════════ */}
        {step === 1 && isMulti && (
          <View>
            <Text style={[cr.heading, { color: c.ink }]}>Select Sports</Text>
            <Text style={[cr.sub, { color: c.muted }]}>Choose 2 or more sports for this tournament</Text>

            <View style={{ gap: 10 }}>
              {SPORTS.map(sp => {
                const selected = selectedSports.includes(sp.key);
                return (
                  <TouchableOpacity key={sp.key}
                    onPress={() => toggleSport(sp.key)}
                    activeOpacity={0.8}
                    style={[cr.optCard, {
                      borderColor: selected ? '#8b5cf6' : c.border,
                      backgroundColor: selected ? '#8b5cf611' : c.surface,
                    }]}
                  >
                    <View style={{ width: 44, height: 44, borderRadius: 10,
                      backgroundColor: selected ? '#8b5cf622' : c.elevated,
                      alignItems: 'center', justifyContent: 'center',
                      borderWidth: 1, borderColor: selected ? '#8b5cf633' : c.border }}>
                      <Text style={{ fontSize: 22 }}>{sp.icon}</Text>
                    </View>
                    <Text style={{ fontFamily: F.bold, fontSize: 15, color: c.ink, flex: 1 }}>{sp.label}</Text>
                    {/* Checkbox */}
                    <View style={{ width: 24, height: 24, borderRadius: 6,
                      borderWidth: 2,
                      borderColor: selected ? '#8b5cf6' : c.border,
                      backgroundColor: selected ? '#8b5cf6' : 'transparent',
                      alignItems: 'center', justifyContent: 'center' }}>
                      {selected && <Text style={{ color: '#fff', fontSize: 13, fontWeight: '900', lineHeight: 16 }}>✓</Text>}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Selection counter */}
            <Text style={{ fontSize: 12, marginTop: 14, textAlign: 'center', fontWeight: '700',
              color: selectedSports.length >= 2 ? '#8b5cf6' : c.muted }}>
              {selectedSports.length === 0
                ? 'Select at least 2 sports'
                : selectedSports.length === 1
                  ? '1 sport selected — select at least 1 more'
                  : `${selectedSports.length} sports selected ✓`}
            </Text>

            <TouchableOpacity
              onPress={() => {
                if (selectedSports.length < 2) { Alert.alert('Select at least 2 sports'); return; }
                setStep(2);
              }}
              style={[cr.btn, { backgroundColor: '#8b5cf6', marginTop: 20,
                opacity: selectedSports.length < 2 ? 0.45 : 1 }]}
            >
              <Text style={cr.btnText}>Continue →</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ═══ STEP 2 (Single): Subformat + sport config ══════════════════════ */}
        {step === 2 && !isMulti && sport && (
          <View>
            <Text style={[cr.heading, { color: c.ink }]}>{sport.label}</Text>
            <Text style={[cr.sub, { color: c.muted }]}>Select variant</Text>

            {/* Subformat selection */}
            <View style={{ gap: 10, marginBottom: 20 }}>
              {sport.subformats.map((sf: any) => (
                <TouchableOpacity key={sf.key}
                  onPress={() => setSubformat(sf)}
                  style={[cr.optCard, { backgroundColor: c.surface,
                    borderColor: subformat?.key === sf.key ? c.primary : c.border }]}
                >
                  <View style={{ width: 36, height: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center',
                    backgroundColor: subformat?.key === sf.key ? c.primary + '22' : c.elevated }}>
                    <Text style={{ fontSize: 11, fontWeight: '900',
                      color: subformat?.key === sf.key ? c.primary : c.muted }}>
                      {sf.key === 'singles' ? '1v1' : sf.key === 'doubles' ? '2v2' : sf.key === 'mixed_doubles' ? 'MIX' : sf.key.slice(0, 3).toUpperCase()}
                    </Text>
                  </View>
                  <Text style={{ fontFamily: F.bold, fontSize: 15, color: c.ink, flex: 1 }}>{sf.label}</Text>
                  {subformat?.key === sf.key && (
                    <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: c.primary,
                      alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ color: '#fff', fontSize: 10, fontWeight: '900' }}>✓</Text>
                    </View>
                  )}
                </TouchableOpacity>
              ))}
            </View>

            {/* Racket sport config */}
            {(sport.key === 'table_tennis' || sport.key === 'badminton') && (
              <View style={{ gap: 14, marginBottom: 4 }}>
                <Text style={{ fontSize: 11, fontWeight: '800', color: c.muted, textTransform: 'uppercase', letterSpacing: 1 }}>
                  Match Config
                </Text>
                {[
                  { label: 'Sets to Win',   value: setsToWin, set: setSetsToWin, options: ['1', '2', '3'] },
                  { label: 'Points per Set', value: ptsPerSet, set: setPtsPerSet, options: ['11', '15', '21'] },
                ].map(f => (
                  <View key={f.label}>
                    <Text style={[cr.label, { color: c.muted }]}>{f.label}</Text>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      {f.options.map(o => (
                        <TouchableOpacity key={o} onPress={() => f.set(o)}
                          style={[cr.optSmall, { backgroundColor: f.value === o ? c.ink : c.elevated, borderColor: c.border }]}>
                          <Text style={{ color: f.value === o ? c.bg : c.muted, fontWeight: '700', fontSize: 14 }}>{o}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                ))}
              </View>
            )}

            {/* Cricket config */}
            {sport.key === 'cricket' && (
              <View style={{ marginBottom: 4 }}>
                <Text style={[cr.label, { color: c.muted }]}>Overs per Innings</Text>
                <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                  {['5', '10', '15', '20', '25', '30', '40', '50'].map(o => (
                    <TouchableOpacity key={o} onPress={() => setOvers(o)}
                      style={[cr.optSmall, { backgroundColor: overs === o ? c.ink : c.elevated, borderColor: c.border }]}>
                      <Text style={{ color: overs === o ? c.bg : c.muted, fontWeight: '700', fontSize: 14 }}>{o}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            <TouchableOpacity onPress={() => setStep(3)}
              style={[cr.btn, { backgroundColor: c.primary, marginTop: 24 }]}>
              <Text style={cr.btnText}>Continue →</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ═══ STEP 3 (Single): Match format ══════════════════════════════════ */}
        {step === 3 && !isMulti && (
          <View>
            <Text style={[cr.heading, { color: c.ink }]}>Match Format</Text>
            <View style={{ gap: 10 }}>
              {FORMATS.map(f => (
                <TouchableOpacity key={f.key}
                  onPress={() => setFormat(f.key)}
                  style={[cr.optCard, { backgroundColor: c.surface,
                    borderColor: format === f.key ? c.primary : c.border }]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: F.bold, fontSize: 14, color: c.ink }}>{f.label}</Text>
                    <Text style={{ fontFamily: F.body, fontSize: 12, color: c.muted, marginTop: 2 }}>{f.desc}</Text>
                  </View>
                  {format === f.key && (
                    <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: c.primary,
                      alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ color: '#fff', fontSize: 11, fontWeight: '900' }}>✓</Text>
                    </View>
                  )}
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity onPress={() => setStep(4)}
              style={[cr.btn, { backgroundColor: c.primary, marginTop: 24 }]}>
              <Text style={cr.btnText}>Continue →</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ═══ STEP 4 (Single) / STEP 2 (Multi): Details ═════════════════════ */}
        {step === detailsStep && (
          <View>
            <Text style={[cr.heading, { color: c.ink }]}>Tournament Details</Text>

            {/* Tournament name */}
            <View style={{ marginBottom: 18 }}>
              <Text style={[cr.label, { color: c.muted }]}>Tournament Name *</Text>
              <TextInput
                style={[cr.input, { backgroundColor: c.elevated, borderColor: c.border, color: c.ink }]}
                placeholder="Mumbai Open 2026"
                placeholderTextColor={c.muted}
                value={name}
                onChangeText={setName}
              />
            </View>

            {/* Venue picker — search + manual + Google Maps URL */}
            <View style={{ marginBottom: 18 }}>
              <Text style={[cr.label, { color: c.muted }]}>Venue / Location</Text>
              <VenuePicker
                value={venueObj}
                onChange={setVenueObj}
                colors={c}
              />
            </View>

            <TouchableOpacity
              onPress={() => {
                if (!name.trim()) { Alert.alert('Name required'); return; }
                setStep(reviewStep);
              }}
              style={[cr.btn, { backgroundColor: isMulti ? '#8b5cf6' : c.primary, marginTop: 8 }]}
            >
              <Text style={cr.btnText}>Review →</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ═══ STEP 5 (Single) / STEP 3 (Multi): Review ══════════════════════ */}
        {step === reviewStep && (
          <View>
            <Text style={[cr.heading, { color: c.ink }]}>Review & Create</Text>

            {/* Multi-sport badge */}
            {isMulti && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16,
                backgroundColor: '#8b5cf622', borderRadius: 10, padding: 12,
                borderWidth: 1, borderColor: '#8b5cf633' }}>
                <Text style={{ fontSize: 18 }}>🎯</Text>
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#8b5cf6' }}>
                  Multi-Sport — {selectedSports.length} Sports
                </Text>
              </View>
            )}

            {/* Summary table */}
            <View style={[cr.reviewBox, { backgroundColor: c.surface, borderColor: c.border }]}>
              {([
                ['Tournament', name],
                venueObj?.name  ? ['Venue',    venueObj.name]  : null,
                venueObj?.city  ? ['City',     venueObj.city]  : null,
                venueObj?.lat   ? ['Map Pin',  `${venueObj.lat.toFixed(4)}, ${venueObj.lng?.toFixed(4)}`] : null,
                ...(isMulti
                  ? [['Sports', selectedSports.map(k => SPORTS.find(s => s.key === k)?.label ?? k).join(', ')]]
                  : [
                    ['Event',  subformat?.label ? `${sport?.label} — ${subformat.label}` : sport?.label],
                    ['Format', FORMATS.find(f => f.key === format)?.label],
                  ]
                ),
              ] as [string, string][]).filter(Boolean).map(([l, v]) => (
                <View key={l} style={{ flexDirection: 'row', justifyContent: 'space-between',
                  alignItems: 'flex-start', paddingVertical: 10,
                  borderBottomWidth: 1, borderBottomColor: c.border }}>
                  <Text style={{ fontFamily: F.bold, color: c.muted, fontSize: 11,
                    textTransform: 'uppercase', letterSpacing: 0.5, flexShrink: 0 }}>{l}</Text>
                  <Text style={{ fontFamily: F.bold, color: c.ink, fontSize: 13,
                    flex: 1, textAlign: 'right', marginLeft: 16 }}>{v}</Text>
                </View>
              ))}
            </View>

            {/* Multi-sport info banner */}
            {isMulti && (
              <View style={{ backgroundColor: '#8b5cf611', borderRadius: 10, borderWidth: 1,
                borderColor: '#8b5cf633', padding: 14, marginTop: 4, marginBottom: 4 }}>
                <Text style={{ fontSize: 12, color: '#8b5cf6', fontWeight: '800', marginBottom: 4 }}>
                  ℹ️ After creation
                </Text>
                <Text style={{ fontSize: 12, color: c.muted, lineHeight: 18 }}>
                  Each sport card in the tournament overview will show a "Setup Required" badge. Tap each card to set up its draw format, bracket type, and scoring rules.
                </Text>
              </View>
            )}

            <TouchableOpacity onPress={handleCreate} disabled={loading}
              style={[cr.btn, {
                backgroundColor: isMulti ? '#8b5cf6' : c.primary,
                opacity: loading ? 0.6 : 1, marginTop: 16,
              }]}
            >
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text style={cr.btnText}>Create Tournament →</Text>
              }
            </TouchableOpacity>
          </View>
        )}

      </ScrollView>
    </SafeAreaView>
  );
}

const cr = StyleSheet.create({
  heading:   { fontFamily: 'Unbounded_900Black', fontSize: 18, letterSpacing: -0.5, marginBottom: 6 },
  sub:       { fontFamily: 'SpaceGrotesk_400Regular', fontSize: 14, marginBottom: 16 },
  label:     { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 },
  input:     { fontFamily: 'SpaceGrotesk_400Regular', borderRadius: 8, borderWidth: 1.5, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, minHeight: 44 },
  btn:       { borderRadius: 8, paddingVertical: 14, alignItems: 'center', minHeight: 48 },
  btnText:   { fontFamily: 'Unbounded_900Black', color: '#fff', fontSize: 11, letterSpacing: 0.5, textTransform: 'uppercase' },
  optCard:   { flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: 12, borderWidth: 1.5, padding: 16 },
  optSmall:  { borderRadius: 6, borderWidth: 1.5, paddingHorizontal: 16, paddingVertical: 9 },
  reviewBox: { borderRadius: 12, borderWidth: 1.5, padding: 4, marginBottom: 8 },
  typeCard:  { flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: 14, borderWidth: 2, padding: 18 },
  typeIcon:  { width: 52, height: 52, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1, flexShrink: 0 },
});
