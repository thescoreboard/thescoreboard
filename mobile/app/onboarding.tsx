/**
 * Player onboarding — 2 steps after first login.
 * Step 1: Which sports do you play? (multi-select)
 * Step 2: Which city are you in?
 * Saves to tsb_prefs, sets onboarded flag, then routes to home.
 */
import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, TextInput, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTheme } from '../src/hooks/useTheme';
import { useAuthStore } from '../src/store/auth';
import { F, SPORT_COLORS, SPORT_LABELS } from '../src/theme';

const SPORTS = ['football', 'cricket', 'table_tennis', 'badminton'];

export default function OnboardingScreen() {
  const { theme }                              = useTheme();
  const router                                 = useRouter();
  const { setPreferences, setOnboarded, user } = useAuthStore();
  const c = theme.colors;

  const [step,           setStep]           = useState<1 | 2>(1);
  const [selectedSports, setSelectedSports] = useState<string[]>([]);
  const [city,           setCity]           = useState('');
  const [saving,         setSaving]         = useState(false);

  const firstName = user?.name?.split(' ')[0] ?? 'there';

  const toggleSport = (sk: string) => {
    setSelectedSports(prev =>
      prev.includes(sk) ? prev.filter(s => s !== sk) : [...prev, sk]
    );
  };

  const goToStep2 = () => {
    if (selectedSports.length === 0) return;
    setStep(2);
  };

  const finish = async () => {
    setSaving(true);
    await setPreferences({ sports: selectedSports, city: city.trim() });
    await setOnboarded(true);
    router.replace('/(tabs)' as any);
    setSaving(false);
  };

  const skip = async () => {
    await setOnboarded(true);
    router.replace('/(tabs)' as any);
  };

  return (
    <SafeAreaView style={[{ flex:1, backgroundColor: c.bg }]}>
      <KeyboardAvoidingView behavior={Platform.OS==='ios'?'padding':'height'} style={{ flex:1 }}>
        <ScrollView contentContainerStyle={s.wrap} keyboardShouldPersistTaps="handled">

          {/* Brand */}
          <Text style={[s.brand, { color: c.ink }]}>
            THE<Text style={{ color: c.primary }}>SCORE</Text>BOARD
          </Text>

          {/* Step indicator */}
          <View style={s.stepRow}>
            <View style={[s.stepDot, { backgroundColor: c.primary }]} />
            <View style={[s.stepLine, { backgroundColor: step === 2 ? c.primary : c.border }]} />
            <View style={[s.stepDot, { backgroundColor: step === 2 ? c.primary : c.border }]} />
          </View>

          {/* ── STEP 1: Sports ─────────────────────────────────────────────── */}
          {step === 1 && (
            <>
              <Text style={[s.title, { fontFamily: F.display, color: c.ink }]}>
                Hey {firstName}!
              </Text>
              <Text style={[s.sub, { fontFamily: F.body, color: c.muted }]}>
                Which sports do you play? Pick all that apply.
              </Text>

              <View style={[s.sportsGrid, { marginTop: 28 }]}>
                {SPORTS.map(sk => {
                  const active = selectedSports.includes(sk);
                  const color  = SPORT_COLORS[sk] ?? '#888';
                  return (
                    <TouchableOpacity
                      key={sk}
                      onPress={() => toggleSport(sk)}
                      activeOpacity={0.8}
                      style={[
                        s.sportChip,
                        {
                          borderColor: active ? color : c.border,
                          backgroundColor: active ? color + '18' : c.elevated,
                        },
                      ]}
                    >
                      {/* Left accent */}
                      {active && <View style={[s.chipAccent, { backgroundColor: color }]} />}
                      <Text style={[
                        s.sportChipText,
                        { fontFamily: F.display, color: active ? color : c.muted },
                      ]}>
                        {SPORT_LABELS[sk]}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <TouchableOpacity
                onPress={goToStep2}
                disabled={selectedSports.length === 0}
                style={[s.btn, {
                  backgroundColor: c.primary,
                  opacity: selectedSports.length === 0 ? 0.4 : 1,
                  marginTop: 32,
                }]}
              >
                <Text style={[s.btnText, { fontFamily: F.display }]}>Next</Text>
              </TouchableOpacity>

              <TouchableOpacity onPress={skip} style={s.skipBtn}>
                <Text style={[s.skipText, { fontFamily: F.body, color: c.muted }]}>Skip for now</Text>
              </TouchableOpacity>
            </>
          )}

          {/* ── STEP 2: City ───────────────────────────────────────────────── */}
          {step === 2 && (
            <>
              <Text style={[s.title, { fontFamily: F.display, color: c.ink }]}>
                Where are you based?
              </Text>
              <Text style={[s.sub, { fontFamily: F.body, color: c.muted }]}>
                We'll show tournaments near you first.
              </Text>

              <View style={{ marginTop: 28 }}>
                <Text style={[s.label, { fontFamily: F.bold, color: c.muted }]}>City</Text>
                <TextInput
                  style={[s.input, {
                    fontFamily: F.body,
                    backgroundColor: c.elevated,
                    borderColor: c.border,
                    color: c.ink,
                  }]}
                  placeholder="Mumbai, Chennai, Bangalore…"
                  placeholderTextColor={c.muted}
                  value={city}
                  onChangeText={setCity}
                  autoCapitalize="words"
                  returnKeyType="done"
                  onSubmitEditing={finish}
                />
              </View>

              <TouchableOpacity
                onPress={finish}
                disabled={saving}
                style={[s.btn, { backgroundColor: c.primary, opacity: saving ? 0.6 : 1, marginTop: 28 }]}
              >
                <Text style={[s.btnText, { fontFamily: F.display }]}>
                  {saving ? 'Saving…' : 'Get Started'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity onPress={() => setStep(1)} style={s.skipBtn}>
                <Text style={[s.skipText, { fontFamily: F.body, color: c.muted }]}>← Back</Text>
              </TouchableOpacity>
            </>
          )}

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  wrap:          { padding:24, flexGrow:1 },
  brand:         { fontFamily: 'Unbounded_900Black', fontSize: 19, letterSpacing: -1, marginBottom: 28 },
  stepRow:       { flexDirection:'row', alignItems:'center', marginBottom: 32 },
  stepDot:       { width:10, height:10, borderRadius:5 },
  stepLine:      { flex:1, height:2, marginHorizontal:6 },
  title:         { fontSize: 22, fontWeight:'900', letterSpacing:-0.5, marginBottom:8 },
  sub:           { fontSize: 14, lineHeight: 21 },
  sportsGrid:    { gap: 10 },
  sportChip:     { flexDirection:'row', alignItems:'center', borderRadius:10, borderWidth:1.5, overflow:'hidden', minHeight:58 },
  chipAccent:    { width:5, alignSelf:'stretch' },
  sportChipText: { flex:1, paddingHorizontal:14, fontSize:14, fontWeight:'900', textTransform:'uppercase', letterSpacing:-0.3 },
  label:         { fontSize:11, fontWeight:'700', textTransform:'uppercase', letterSpacing:0.8, marginBottom:8 },
  input:         { borderRadius:8, borderWidth:1.5, paddingHorizontal:14, paddingVertical:12, fontSize:14, minHeight:48 },
  btn:           { borderRadius:8, paddingVertical:14, alignItems:'center', minHeight:48 },
  btnText:       { color:'#fff', fontSize:12, fontWeight:'900', textTransform:'uppercase', letterSpacing:0.5 },
  skipBtn:       { marginTop:16, alignItems:'center', paddingVertical:8 },
  skipText:      { fontSize:13 },
});
