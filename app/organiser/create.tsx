/**
 * Create tournament wizard — mirrors CreateTournament.jsx
 * Steps: sport type → sport + subformat → match format → details → review
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

// Sport definitions
const SPORTS = [
  { key:'table_tennis', label:'Table Tennis', abbrev:'TT',
    subformats:[{ key:'singles', label:'Singles', pType:'individual' },{ key:'doubles', label:'Doubles', pType:'doubles_pair' }],
    defaultConfig:{ sets_to_win:3, points_per_set:11 }
  },
  { key:'badminton', label:'Badminton', abbrev:'BD',
    subformats:[{ key:'singles', label:'Singles', pType:'individual' },{ key:'doubles', label:'Doubles', pType:'doubles_pair' },{ key:'mixed_doubles', label:'Mixed Doubles', pType:'doubles_pair', mixed:true }],
    defaultConfig:{ sets_to_win:3, points_per_set:21 }
  },
  { key:'cricket', label:'Cricket', abbrev:'CR',
    subformats:[{ key:'standard', label:'Standard', pType:'team', squad_size:11 }],
    defaultConfig:{ overs:20, squad_size:11 }
  },
  { key:'football', label:'Football', abbrev:'FB',
    subformats:[
      { key:'11aside', label:'11-a-side', pType:'team', squad_size:11, team_size:11, substitutes:5 },
      { key:'7aside',  label:'7-a-side',  pType:'team', squad_size:7,  team_size:7,  substitutes:3 },
      { key:'5aside',  label:'5-a-side',  pType:'team', squad_size:5,  team_size:5,  substitutes:2 },
    ],
    defaultConfig:{}
  },
];

const FORMATS = [
  { key:'direct_knockout', label:'Direct Knockout', desc:'Single elimination bracket' },
  { key:'round_robin',     label:'Round Robin',     desc:'Everyone plays everyone' },
  { key:'group_knockout',  label:'Group + Knockout',desc:'Groups then knockout' },
];

export default function CreateTournamentScreen() {
  const { theme } = useTheme();
  const router = useRouter();
  const { token } = useAuthStore();
  const c = theme.colors;

  const [step,      setStep]      = useState(0); // 0=sport, 1=subformat, 2=format, 3=details, 4=review
  const [isMulti,   setIsMulti]   = useState(false);
  const [sport,     setSport]     = useState<any>(null);
  const [subformat, setSubformat] = useState<any>(null);
  const [format,    setFormat]    = useState('direct_knockout');
  const [name,      setName]      = useState('');
  const [city,      setCity]      = useState('');
  const [venue,     setVenue]     = useState('');
  const [overs,     setOvers]     = useState('20');
  const [setsToWin, setSetsToWin] = useState('3');
  const [ptsPerSet, setPtsPerSet] = useState('21');
  const [loading,   setLoading]   = useState(false);

  const handleCreate = async () => {
    if (!name.trim()) { Alert.alert('Tournament name is required'); return; }
    setLoading(true);
    try {
      // Get or create org
      const orgs = await apiGetMyOrgs(token!);
      let orgId: number;
      if (orgs.length > 0) {
        orgId = orgs[0].org_id;
      } else {
        const org = await apiCreateOrg(token!, { name: name.trim() });
        orgId = org.org_id;
      }

      const pType = subformat?.pType ?? 'individual';
      const isCricket  = sport?.key === 'cricket';
      const isFootball = sport?.key === 'football';
      const isRacket   = sport?.key === 'table_tennis' || sport?.key === 'badminton';

      const sportConfig: any = {};
      if (isRacket)   { sportConfig.sets_to_win = parseInt(setsToWin)||3; sportConfig.points_per_set = parseInt(ptsPerSet)||21; }
      if (isCricket)  { sportConfig.overs = parseInt(overs)||20; sportConfig.squad_size = subformat?.squad_size??11; }
      if (isFootball) { sportConfig.squad_size = subformat?.squad_size??11; sportConfig.team_size = subformat?.team_size??11; sportConfig.substitutes = subformat?.substitutes??5; }
      if (subformat?.mixed) sportConfig.mixed = true;

      const payload = {
        name: name.trim(), city: city.trim()||null, venue: venue.trim()||null,
        is_published: true,
        events: [{
          sport_key: sport.key,
          format,
          participant_type: pType,
          sport_config: sportConfig,
          squad_size:   subformat?.squad_size,
          team_size:    subformat?.team_size,
          substitutes:  subformat?.substitutes,
        }],
      };

      await apiCreateTournament(token!, orgId, payload);
      router.replace('/(tabs)/organiser');
    } catch (e: any) { Alert.alert('Error', e.message); }
    setLoading(false);
  };

  const steps = ['Sport', 'Format', 'Rules', 'Details', 'Review'];

  return (
    <SafeAreaView style={{ flex:1, backgroundColor:c.bg }}>
      {/* Progress bar */}
      <View style={{ paddingHorizontal:16, paddingTop:12, paddingBottom:8 }}>
        <TouchableOpacity onPress={() => step > 0 ? setStep(s => s-1) : router.back()} style={{ marginBottom:12 }}>
          <Text style={{ color:c.muted, fontSize:14 }}>← {step===0?'Cancel':'Back'}</Text>
        </TouchableOpacity>
        <View style={{ flexDirection:'row', gap:6 }}>
          {steps.map((_,i) => (
            <View key={i} style={{ flex:1, height:3, borderRadius:2, backgroundColor: i<=step ? c.primary : c.border }} />
          ))}
        </View>
        <Text style={{ fontSize:12, color:c.muted, marginTop:6 }}>Step {step+1} of {steps.length} — {steps[step]}</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding:20, flexGrow:1 }}>
        {/* Step 0: Sport */}
        {step === 0 && (
          <View>
            <Text style={[cr.heading, { color:c.ink }]}>Choose Sport</Text>
            <View style={{ gap:10 }}>
              {SPORTS.map(sp => (
                <TouchableOpacity key={sp.key}
                  onPress={() => { setSport(sp); setSubformat(sp.subformats[0]); setStep(1); }}
                  style={[cr.optCard, { backgroundColor:c.surface, borderColor: sport?.key===sp.key ? c.primary : c.border }]}>
                  <View style={{ width:44, height:44, borderRadius:10, backgroundColor: sport?.key===sp.key ? c.primary+'22' : c.elevated,
                    alignItems:'center', justifyContent:'center', borderWidth:1, borderColor: sport?.key===sp.key ? c.primary+'55' : c.border }}>
                    <Text style={{ fontSize:14, fontWeight:'900', color: sport?.key===sp.key ? c.primary : c.muted, letterSpacing:0.5 }}>{sp.abbrev}</Text>
                  </View>
                  <Text style={{ fontFamily: F.bold, fontSize:15, color:c.ink }}>{sp.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* Step 1: Subformat */}
        {step === 1 && sport && (
          <View>
            <Text style={[cr.heading, { color:c.ink }]}>{sport.label}</Text>
            <Text style={[cr.sub, { color:c.muted }]}>Select variant</Text>
            <View style={{ gap:10, marginBottom:20 }}>
              {sport.subformats.map((sf: any) => (
                <TouchableOpacity key={sf.key}
                  onPress={() => setSubformat(sf)}
                  style={[cr.optCard, { backgroundColor:c.surface, borderColor: subformat?.key===sf.key ? c.primary : c.border }]}>
                  <Text style={{ fontSize:15, fontWeight:'700', color:c.ink }}>{sf.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {/* Sport config */}
            {(sport.key==='table_tennis'||sport.key==='badminton') && (
              <View style={{ gap:12 }}>
                <Text style={{ fontSize:13, fontWeight:'700', color:c.muted, marginBottom:4 }}>MATCH CONFIG</Text>
                {[
                  { label:'Sets to Win', value:setsToWin, set:setSetsToWin, options:['1','2','3'] },
                  { label:'Points per Set', value:ptsPerSet, set:setPtsPerSet, options:['11','15','21'] },
                ].map(f => (
                  <View key={f.label}>
                    <Text style={[cr.label, { color:c.muted }]}>{f.label}</Text>
                    <View style={{ flexDirection:'row', gap:8 }}>
                      {f.options.map(o => (
                        <TouchableOpacity key={o} onPress={() => f.set(o)}
                          style={[cr.optSmall, { backgroundColor: f.value===o?c.ink:c.elevated, borderColor:c.border }]}>
                          <Text style={{ color: f.value===o?c.bg:c.muted, fontWeight:'700' }}>{o}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                ))}
              </View>
            )}
            {sport.key==='cricket' && (
              <View>
                <Text style={[cr.label, { color:c.muted }]}>Overs per Innings</Text>
                <View style={{ flexDirection:'row', gap:8, flexWrap:'wrap' }}>
                  {['5','10','15','20','25','30','40','50'].map(o => (
                    <TouchableOpacity key={o} onPress={() => setOvers(o)}
                      style={[cr.optSmall, { backgroundColor: overs===o?c.ink:c.elevated, borderColor:c.border }]}>
                      <Text style={{ color: overs===o?c.bg:c.muted, fontWeight:'700' }}>{o}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}
            <TouchableOpacity onPress={() => setStep(2)} style={[cr.btn, { backgroundColor:c.primary, marginTop:24 }]}>
              <Text style={cr.btnText}>Continue →</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Step 2: Match format */}
        {step === 2 && (
          <View>
            <Text style={[cr.heading, { color:c.ink }]}>Match Format</Text>
            <View style={{ gap:10 }}>
              {FORMATS.map(f => (
                <TouchableOpacity key={f.key}
                  onPress={() => setFormat(f.key)}
                  style={[cr.optCard, { backgroundColor:c.surface, borderColor: format===f.key?c.primary:c.border }]}>
                  <View style={{ flex:1 }}>
                    <Text style={{ fontFamily: F.bold, fontSize:14, color:c.ink }}>{f.label}</Text>
                    <Text style={{ fontFamily: F.body, fontSize:12, color:c.muted, marginTop:2 }}>{f.desc}</Text>
                  </View>
                  {format===f.key && (
                    <View style={{ width:20, height:20, borderRadius:10, backgroundColor:c.primary, alignItems:'center', justifyContent:'center' }}>
                      <Text style={{ color:'#fff', fontSize:11, fontWeight:'900' }}>✓</Text>
                    </View>
                  )}
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity onPress={() => setStep(3)} style={[cr.btn, { backgroundColor:c.primary, marginTop:24 }]}>
              <Text style={cr.btnText}>Continue →</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Step 3: Details */}
        {step === 3 && (
          <View>
            <Text style={[cr.heading, { color:c.ink }]}>Tournament Details</Text>
            {[
              { label:'Tournament Name *', value:name, set:setName, placeholder:'Mumbai Open 2026' },
              { label:'City', value:city, set:setCity, placeholder:'Mumbai' },
              { label:'Venue', value:venue, set:setVenue, placeholder:'Sports Complex, Andheri' },
            ].map(f => (
              <View key={f.label} style={{ marginBottom:14 }}>
                <Text style={[cr.label, { color:c.muted }]}>{f.label}</Text>
                <TextInput
                  style={[cr.input, { backgroundColor:c.elevated, borderColor:c.border, color:c.ink }]}
                  placeholder={f.placeholder} placeholderTextColor={c.muted}
                  value={f.value} onChangeText={f.set} />
              </View>
            ))}
            <TouchableOpacity onPress={() => { if (!name.trim()) { Alert.alert('Name required'); return; } setStep(4); }}
              style={[cr.btn, { backgroundColor:c.primary, marginTop:8 }]}>
              <Text style={cr.btnText}>Review →</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Step 4: Review */}
        {step === 4 && (
          <View>
            <Text style={[cr.heading, { color:c.ink }]}>Review & Create</Text>
            <View style={[cr.reviewBox, { backgroundColor:c.surface, borderColor:c.border }]}>
              {[
                ['Sport',    sport?.label],
                ['Variant',  subformat?.label],
                ['Format',   FORMATS.find(f=>f.key===format)?.label],
                ['Name',     name],
                city   ? ['City', city] : null,
                venue  ? ['Venue', venue] : null,
              ].filter(Boolean).map(([l,v]) => (
                <View key={l as string} style={{ flexDirection:'row', justifyContent:'space-between', paddingVertical:8, borderBottomWidth:1, borderBottomColor:c.border }}>
                  <Text style={{ color:c.muted, fontSize:13 }}>{l}</Text>
                  <Text style={{ color:c.ink, fontWeight:'700', fontSize:13 }}>{v as string}</Text>
                </View>
              ))}
            </View>
            <TouchableOpacity onPress={handleCreate} disabled={loading}
              style={[cr.btn, { backgroundColor:c.primary, opacity:loading?0.6:1, marginTop:16 }]}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={cr.btnText}>Create Tournament →</Text>}
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const cr = StyleSheet.create({
  heading:   { fontFamily: 'Unbounded_900Black', fontSize:18, letterSpacing:-0.5, marginBottom:6 },
  sub:       { fontFamily: 'SpaceGrotesk_400Regular', fontSize:14, marginBottom:16 },
  label:     { fontFamily: 'SpaceGrotesk_700Bold', fontSize:11, fontWeight:'700', textTransform:'uppercase', letterSpacing:0.8, marginBottom:6 },
  input:     { fontFamily: 'SpaceGrotesk_400Regular', borderRadius:8, borderWidth:1.5, paddingHorizontal:14, paddingVertical:11, fontSize:14, minHeight:44 },
  btn:       { borderRadius:8, paddingVertical:14, alignItems:'center', minHeight:48 },
  btnText:   { fontFamily: 'Unbounded_900Black', color:'#fff', fontSize:11, letterSpacing:0.5, textTransform:'uppercase' },
  optCard:   { flexDirection:'row', alignItems:'center', gap:14, borderRadius:12, borderWidth:1.5, padding:16 },
  optSmall:  { borderRadius:4, borderWidth:1.5, paddingHorizontal:16, paddingVertical:8 },
  reviewBox: { borderRadius:12, borderWidth:1.5, padding:4, marginBottom:8 },
});
