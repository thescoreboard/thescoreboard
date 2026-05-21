/**
 * Tournament registration screen — mirrors TournamentRegister.jsx
 * Steps: auth → profile → select event → form → success
 */
import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTheme } from '../../src/hooks/useTheme';
import { useAuthStore } from '../../src/store/auth';
import { F } from '../../src/theme';
import {
  apiGetTournamentBySlug, apiGetPlayerProfile, apiSavePlayerProfile,
  apiPublicRegisterIndividual, apiPublicRegisterTeam,
} from '../../src/api/client';

type Step = 'auth' | 'profile' | 'select' | 'form' | 'success';

const ROLES = ['player', 'captain', 'vice_captain'];

export default function RegisterScreen() {
  const { slug }   = useLocalSearchParams<{ slug: string }>();
  const { theme }  = useTheme();
  const router     = useRouter();
  const { token, isLoggedIn } = useAuthStore();
  const c = theme.colors;

  const [tournament, setTournament] = useState<any>(null);
  const [profile,    setProfile]    = useState<any>(null);
  const [step,       setStep]       = useState<Step>('auth');
  const [selectedEvent, setSelectedEvent] = useState<any>(null);
  const [loading,    setLoading]    = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [name,      setName]      = useState('');
  const [phone,     setPhone]     = useState('');
  const [age,       setAge]       = useState('');
  const [gender,    setGender]    = useState('Male');
  const [teamName,  setTeamName]  = useState('');
  const [members,   setMembers]   = useState([{ name:'', role:'captain', jersey_number:'', age:'' }]);

  useEffect(() => {
    (async () => {
      try {
        const data = await apiGetTournamentBySlug(slug);
        // API returns { tournament: {...}, events: [...] } — flatten so t.name / t.status work directly
        const t = data.tournament ? { ...data.tournament, events: data.events ?? [] } : data;
        setTournament(t);
        if (isLoggedIn()) {
          const p = await apiGetPlayerProfile(token!).catch(() => null);
          setProfile(p);
          if (p) {
            setName(p.name ?? '');
            setPhone(p.phone ?? '');
            setAge(p.age != null ? String(p.age) : '');
            setGender(p.gender ?? 'Male');
          }
          // If only one event — skip the select screen and go straight to the form
          const events = t.events ?? [];
          if (events.length === 1) {
            setSelectedEvent(events[0]);
            setStep('form');
          } else {
            setStep('select');
          }
        } else {
          setStep('auth');
        }
      } catch {}
      setLoading(false);
    })();
  }, [slug, token]);

  const participantType = selectedEvent?.participant_type ?? 'individual';

  // Required roster size: team_size (football) or squad_size (cricket), default 1
  const requiredSize = selectedEvent?.team_size ?? selectedEvent?.squad_size ?? 1;

  // Pre-fill the correct number of member slots when the event is selected
  React.useEffect(() => {
    if (!selectedEvent) return;
    if (participantType === 'doubles_pair') {
      setMembers([
        { name:'', role:'player1', jersey_number:'', age:'' },
        { name:'', role:'player2', jersey_number:'', age:'' },
      ]);
    } else if (participantType === 'team') {
      const slots = Math.max(requiredSize, 1);
      setMembers(Array.from({ length: slots }, (_, i) => ({
        name:'', role: i === 0 ? 'captain' : 'player', jersey_number:'', age:'',
      })));
    }
  }, [selectedEvent?.event_id]);

  const handleSubmit = async () => {
    if (!selectedEvent) return;

    // Validation
    if (participantType === 'individual' && !name.trim()) {
      return Alert.alert('Required', 'Please enter your full name.');
    }
    if (participantType === 'doubles_pair') {
      if (!members[0]?.name?.trim() || !members[1]?.name?.trim()) {
        return Alert.alert('Required', 'Please enter names for both partners.');
      }
    }
    if (participantType === 'team' && !teamName.trim()) {
      return Alert.alert('Required', 'Please enter a team name.');
    }
    if (participantType === 'team') {
      const missing = members.slice(0, requiredSize).filter(m => !m.name?.trim()).length;
      if (missing > 0) {
        return Alert.alert('Required', `Please fill in all ${requiredSize} required player names.`);
      }
    }

    setSubmitting(true);
    try {
      if (participantType === 'individual') {
        await apiPublicRegisterIndividual(tournament.tournament_id, {
          name: name.trim(), phone: phone.trim()||null,
          age: parseInt(age)||null, gender,
          event_ids: [selectedEvent.event_id],
        });
      } else {
        const isDoubles = participantType === 'doubles_pair';
        await apiPublicRegisterTeam(tournament.tournament_id, {
          name: isDoubles ? `${members[0]?.name?.trim()} / ${members[1]?.name?.trim()}` : teamName,
          contact_phone: phone.trim()||null,
          sport_key: selectedEvent.sport_key,
          ...(isDoubles ? { event_id: selectedEvent.event_id } : { event_ids: [selectedEvent.event_id] }),
          members: isDoubles
            ? members.slice(0,2).map((m, i) => ({ name: m.name.trim(), role: i===0?'player1':'player2' }))
            : members.map(m => ({ name: m.name.trim(), role: m.role, jersey_number: parseInt(m.jersey_number)||null, age: parseInt(m.age)||null })),
        });
      }
      setStep('success');
    } catch (e: any) { Alert.alert('Registration failed', e.message); }
    setSubmitting(false);
  };

  if (loading) return <SafeAreaView style={{ flex:1, backgroundColor:c.bg }}><ActivityIndicator style={{ flex:1 }} color={c.primary} /></SafeAreaView>;

  return (
    <SafeAreaView style={{ flex:1, backgroundColor:c.bg }}>
      <View style={{ flexDirection:'row', alignItems:'center', padding:16, borderBottomWidth:1, borderBottomColor:c.border }}>
        <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)' as any)}>
          <Text style={{ color:c.muted, fontSize:14 }}>← Back</Text>
        </TouchableOpacity>
        <Text style={{ fontSize:15, fontWeight:'800', color:c.ink, marginLeft:12 }} numberOfLines={1}>{tournament?.name}</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding:20 }}>
        {/* Auth step */}
        {step === 'auth' && (
          <View style={{ gap:12 }}>
            <Text style={{ fontSize:20, fontWeight:'900', color:c.ink, marginBottom:8 }}>Sign in to Register</Text>
            <TouchableOpacity onPress={() => router.push(`/(auth)/login`)}
              style={[s.btn, { backgroundColor:c.primary }]}>
              <Text style={s.btnText}>Login</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => router.push(`/(auth)/register`)}
              style={[s.btn, { backgroundColor:c.elevated, borderWidth:1.5, borderColor:c.border }]}>
              <Text style={{ fontFamily: F.bold, color:c.ink, fontSize:12, textTransform:'uppercase', letterSpacing:0.5 }}>Create Account</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Select event step */}
        {step === 'select' && (
          <View>
            <Text style={[s.heading, { color:c.ink }]}>Select Event</Text>
            {(tournament?.events ?? []).map((ev: any) => (
              <TouchableOpacity key={ev.event_id}
                onPress={() => { setSelectedEvent(ev); setStep('form'); }}
                style={[s.eventCard, { backgroundColor:c.surface, borderColor:c.border }]}>
                <Text style={{ fontSize:15, fontWeight:'700', color:c.ink }}>{ev.name}</Text>
                <Text style={{ fontSize:12, color:c.muted, marginTop:2 }}>{ev.participant_type} · {ev.format}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Form step */}
        {step === 'form' && selectedEvent && (
          <View>
            <Text style={[s.heading, { color:c.ink }]}>{selectedEvent.name}</Text>

            {participantType === 'individual' && (
              <View style={{ gap:12 }}>
                {[
                  { label:'Full Name *', value:name, set:setName, placeholder:'Rahul Sharma' },
                  { label:'Phone', value:phone, set:setPhone, placeholder:'9876543210' },
                  { label:'Age', value:age, set:setAge, placeholder:'24', numeric:true },
                ].map(f => (
                  <View key={f.label}>
                    <Text style={[s.label, { color:c.muted }]}>{f.label}</Text>
                    <TextInput style={[s.input, { backgroundColor:c.elevated, borderColor:c.border, color:c.ink }]}
                      placeholder={f.placeholder} placeholderTextColor={c.muted}
                      value={f.value} onChangeText={f.set}
                      keyboardType={f.numeric ? 'numeric' : 'default'} />
                  </View>
                ))}
                <View>
                  <Text style={[s.label, { color:c.muted }]}>Gender</Text>
                  <View style={{ flexDirection:'row', gap:8 }}>
                    {['Male','Female','Other'].map(g => (
                      <TouchableOpacity key={g} onPress={() => setGender(g)}
                        style={[s.pill, { backgroundColor: gender===g?c.ink:c.elevated, borderColor:c.border }]}>
                        <Text style={{ color: gender===g?c.bg:c.muted, fontSize:13, fontWeight:'600' }}>{g}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              </View>
            )}

            {participantType === 'doubles_pair' && (
              <View style={{ gap:12 }}>
                <Text style={{ fontSize:13, color:c.muted, marginBottom:4 }}>
                  Enter both partners' names to register as a doubles pair.
                </Text>
                {[0, 1].map(i => (
                  <View key={i}>
                    <Text style={[s.label, { color:c.muted }]}>Partner {i + 1} Name *</Text>
                    <TextInput
                      style={[s.input, { backgroundColor:c.elevated, borderColor:c.border, color:c.ink }]}
                      placeholder={i === 0 ? 'Rahul Sharma' : 'Priya Mehta'}
                      placeholderTextColor={c.muted}
                      value={members[i]?.name ?? ''}
                      onChangeText={v => setMembers(prev => {
                        const next = [...prev];
                        // Ensure slot exists
                        if (!next[i]) next[i] = { name:'', role:'player', jersey_number:'', age:'' };
                        next[i] = { ...next[i], name: v };
                        return next;
                      })}
                    />
                  </View>
                ))}
                <View>
                  <Text style={[s.label, { color:c.muted }]}>Contact Phone</Text>
                  <TextInput style={[s.input, { backgroundColor:c.elevated, borderColor:c.border, color:c.ink }]}
                    placeholder="9876543210" placeholderTextColor={c.muted}
                    value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
                </View>
              </View>
            )}

            {participantType === 'team' && (
              <View style={{ gap:12 }}>
                <View>
                  <Text style={[s.label, { color:c.muted }]}>Team Name *</Text>
                  <TextInput style={[s.input, { backgroundColor:c.elevated, borderColor:c.border, color:c.ink }]}
                    placeholder="FC Warriors" placeholderTextColor={c.muted}
                    value={teamName} onChangeText={setTeamName} />
                </View>
                <View>
                  <Text style={[s.label, { color:c.muted }]}>Contact Phone</Text>
                  <TextInput style={[s.input, { backgroundColor:c.elevated, borderColor:c.border, color:c.ink }]}
                    placeholder="9876543210" placeholderTextColor={c.muted}
                    value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
                </View>
                <View style={{ flexDirection:'row', alignItems:'center', justifyContent:'space-between', marginTop:4 }}>
                  <Text style={{ fontSize:13, fontWeight:'700', color:c.ink }}>Team Members</Text>
                  {requiredSize > 1 && (
                    <Text style={{ fontSize:11, color:c.muted }}>{requiredSize} required · {members.length} added</Text>
                  )}
                </View>
                {members.map((m, i) => {
                  const isRequired = i < requiredSize;
                  return (
                    <View key={i} style={[s.memberRow, { backgroundColor:c.elevated, borderColor:c.border }]}>
                      <View style={{ flexDirection:'row', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
                        <View style={{ flexDirection:'row', alignItems:'center', gap:6 }}>
                          <Text style={{ color:c.muted, fontSize:12, fontWeight:'700' }}>Player {i+1}</Text>
                          {isRequired && (
                            <View style={{ backgroundColor:c.primary+'22', borderRadius:4, paddingHorizontal:5, paddingVertical:1 }}>
                              <Text style={{ fontSize:9, color:c.primary, fontWeight:'800' }}>REQUIRED</Text>
                            </View>
                          )}
                        </View>
                        {!isRequired && (
                          <TouchableOpacity onPress={() => setMembers(prev => prev.filter((_,j) => j !== i))}>
                            <Text style={{ color:'#e53e3e', fontSize:18 }}>×</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                      <TextInput
                        style={[s.input, { backgroundColor:c.surface, borderColor:c.border, color:c.ink }]}
                        placeholder={`Player ${i+1} name${isRequired ? ' *' : ''}`}
                        placeholderTextColor={c.muted}
                        value={m.name}
                        onChangeText={v => setMembers(prev => prev.map((x,j) => j===i ? {...x,name:v} : x))}
                      />
                      <View style={{ flexDirection:'row', gap:6, marginTop:8, flexWrap:'wrap' }}>
                        {ROLES.map(r => (
                          <TouchableOpacity key={r}
                            onPress={() => setMembers(prev => prev.map((x,j) => j===i ? {...x,role:r} : x))}
                            style={[s.pill, { backgroundColor: m.role===r ? c.ink : c.surface, borderColor:c.border }]}>
                            <Text style={{ color: m.role===r ? c.bg : c.muted, fontSize:11 }}>{r.replace('_',' ')}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                  );
                })}
                <TouchableOpacity
                  onPress={() => setMembers(prev => [...prev, { name:'', role:'player', jersey_number:'', age:'' }])}
                  style={[s.addBtn, { borderColor:c.border }]}>
                  <Text style={{ color:c.muted, fontWeight:'700', fontSize:13 }}>+ Add Player</Text>
                </TouchableOpacity>
              </View>
            )}

            <TouchableOpacity onPress={handleSubmit} disabled={submitting}
              style={[s.btn, { backgroundColor:c.primary, opacity:submitting?0.6:1, marginTop:24 }]}>
              <Text style={s.btnText}>{submitting?'Submitting…':'Register'}</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Success step */}
        {step === 'success' && (
          <View style={{ alignItems:'center', paddingVertical:40, gap:16 }}>
            <View style={{ width:56, height:56, borderRadius:28, backgroundColor:c.primary+'22', borderWidth:2, borderColor:c.primary+'55',
              alignItems:'center', justifyContent:'center' }}>
              <Text style={{ fontSize:24, fontWeight:'900', color:c.primary }}>✓</Text>
            </View>
            <Text style={{ fontSize:22, fontWeight:'900', color:c.ink, textAlign:'center' }}>You're registered!</Text>
            <Text style={{ fontSize:14, color:c.muted, textAlign:'center' }}>Your registration for {tournament?.name} has been submitted.</Text>
            <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)' as any)}
              style={[s.btn, { backgroundColor:c.primary, width:'100%' }]}>
              <Text style={s.btnText}>Back to Tournament</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  heading:   { fontFamily: 'Unbounded_900Black', fontSize:16, letterSpacing:-0.3, marginBottom:16 },
  label:     { fontFamily: 'SpaceGrotesk_700Bold', fontSize:11, fontWeight:'700', textTransform:'uppercase', letterSpacing:0.8, marginBottom:6 },
  input:     { fontFamily: 'SpaceGrotesk_400Regular', borderRadius:8, borderWidth:1.5, paddingHorizontal:14, paddingVertical:11, fontSize:14, marginTop:2, minHeight:44 },
  btn:       { borderRadius:8, paddingVertical:14, alignItems:'center', minHeight:48 },
  btnText:   { fontFamily: 'Unbounded_900Black', color:'#fff', fontSize:11, letterSpacing:0.5, textTransform:'uppercase' },
  pill:      { borderRadius:4, borderWidth:1.5, paddingHorizontal:12, paddingVertical:6 },
  eventCard: { borderRadius:12, borderWidth:1.5, padding:14, marginBottom:10 },
  memberRow: { borderRadius:8, borderWidth:1.5, padding:12, marginBottom:8 },
  addBtn:    { borderRadius:8, borderWidth:1.5, borderStyle:'dashed', padding:12, alignItems:'center' },
});
