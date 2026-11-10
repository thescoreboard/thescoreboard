import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Image, Alert } from 'react-native';
import { useTheme } from '../../hooks/useTheme';
import { F } from '../../theme';
import { apiCreateSponsor, apiUpdateSponsor, apiDeleteSponsor } from '../../api/client';
import LogoUpload from './LogoUpload';

const TIERS = [
  { value: 'title',   label: 'Title Sponsor', color: '#f59e0b' },
  { value: 'gold',    label: 'Gold',          color: '#d97706' },
  { value: 'silver',  label: 'Silver',        color: '#6b7280' },
  { value: 'bronze',  label: 'Bronze',        color: '#92400e' },
  { value: 'partner', label: 'Partner',       color: '#888888' },
];

const BLANK = { name: '', tier: 'partner', website: '', contact_phone: '', contact_email: '', description: '', logo_url: '' };

interface Props {
  token: string;
  tournamentId: number;
  sponsors: any[];
  onRefresh: () => void | Promise<void>;
  flash: (msg: string) => void;
}

/** Sponsor CRUD — mirrors web SponsorsSection.jsx. */
export default function SponsorsSection({ token, tournamentId, sponsors, onRefresh, flash }: Props) {
  const { theme } = useTheme();
  const c = theme.colors;
  const [showForm, setShowForm] = useState(false);
  const [editing,  setEditing]  = useState<number | null>(null);
  const [form,     setForm]     = useState({ ...BLANK });
  const [saving,   setSaving]   = useState(false);
  // Stable per-form storage path so re-picking a logo replaces the same object.
  const [stamp,    setStamp]    = useState(() => Date.now());

  const input = {
    backgroundColor: c.elevated, borderRadius: 10, borderWidth: 1, borderColor: c.border,
    color: c.ink, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14,
  } as const;
  const label = { fontFamily: F.bold, fontSize: 11, fontWeight: '700', color: c.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 } as const;

  const set = (k: keyof typeof BLANK, v: string) => setForm(f => ({ ...f, [k]: v }));

  const openAdd = () => { setForm({ ...BLANK }); setEditing(null); setStamp(Date.now()); setShowForm(true); };
  const openEdit = (s: any) => {
    setForm({
      name: s.name, tier: s.tier,
      website: s.website || '', contact_phone: s.contact_phone || '', contact_email: s.contact_email || '',
      description: s.description || '', logo_url: s.logo_url || '',
    });
    setEditing(s.sponsor_id); setStamp(Date.now()); setShowForm(true);
  };
  const closeForm = () => { setShowForm(false); setEditing(null); };

  const save = async () => {
    if (!form.name.trim()) { Alert.alert('Sponsor name is required'); return; }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(), tier: form.tier,
        logo_url:      form.logo_url || null,
        website:       form.website.trim() || null,
        contact_phone: form.contact_phone.trim() || null,
        contact_email: form.contact_email.trim() || null,
        description:   form.description.trim() || null,
      };
      if (editing) { await apiUpdateSponsor(token, tournamentId, editing, payload); flash('Sponsor updated!'); }
      else         { await apiCreateSponsor(token, tournamentId, payload);          flash('Sponsor added!'); }
      closeForm();
      await onRefresh();
    } catch (e: any) { Alert.alert('Error', e.message); }
    setSaving(false);
  };

  const remove = (s: any) => Alert.alert('Remove sponsor', `Remove "${s.name}"?`, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Remove', style: 'destructive', onPress: async () => {
      try { await apiDeleteSponsor(token, tournamentId, s.sponsor_id); flash('Sponsor removed.'); await onRefresh(); }
      catch (e: any) { Alert.alert('Error', e.message); }
    } },
  ]);

  return (
    <View style={{ backgroundColor: c.surface, borderRadius: 14, borderWidth: 1, borderColor: c.border, padding: 16, marginBottom: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <Text style={{ fontFamily: F.display, fontSize: 12, color: c.ink, letterSpacing: -0.3 }}>Sponsors</Text>
        <TouchableOpacity onPress={openAdd} style={{ backgroundColor: c.primary, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 }}>
          <Text style={{ fontFamily: F.bold, color: '#fff', fontWeight: '700', fontSize: 12 }}>+ Add Sponsor</Text>
        </TouchableOpacity>
      </View>

      {sponsors.length === 0 && !showForm && (
        <Text style={{ fontSize: 13, color: c.muted, textAlign: 'center', paddingVertical: 16 }}>
          No sponsors yet. Add your first sponsor to display them on the public tournament page.
        </Text>
      )}

      {TIERS.map(({ value, label: tierLabel, color }) => {
        const list = sponsors.filter(s => s.tier === value);
        if (!list.length) return null;
        return (
          <View key={value} style={{ marginBottom: 12 }}>
            <Text style={{ fontFamily: F.bold, fontSize: 10, fontWeight: '800', color, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 8 }}>{tierLabel}</Text>
            {list.map(s => (
              <View key={s.sponsor_id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: c.elevated,
                borderRadius: 10, borderWidth: 1, borderColor: c.border, padding: 10, marginBottom: 8 }}>
                <View style={{ width: 44, height: 44, borderRadius: 8, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border,
                  overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
                  {s.logo_url
                    ? <Image source={{ uri: s.logo_url }} style={{ width: '100%', height: '100%' }} resizeMode="contain" />
                    : <Text style={{ fontFamily: F.display, fontSize: 14, color: c.primary }}>{(s.name?.[0] ?? '?').toUpperCase()}</Text>}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: F.bold, fontSize: 13, fontWeight: '700', color: c.ink }}>{s.name}</Text>
                  {!!s.description && <Text numberOfLines={1} style={{ fontSize: 11, color: c.muted, marginTop: 2 }}>{s.description}</Text>}
                </View>
                <TouchableOpacity onPress={() => openEdit(s)} style={{ paddingHorizontal: 8, paddingVertical: 6 }}>
                  <Text style={{ color: c.primary, fontSize: 13, fontWeight: '700' }}>Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => remove(s)} style={{ borderRadius: 8, borderWidth: 1, borderColor: '#ef444444', backgroundColor: '#ef444410', paddingHorizontal: 10, paddingVertical: 6 }}>
                  <Text style={{ color: '#ef4444', fontSize: 13, fontWeight: '700' }}>✕</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        );
      })}

      {showForm && (
        <View style={{ marginTop: 8, borderWidth: 2, borderColor: c.primary, borderRadius: 12, padding: 16, gap: 14 }}>
          <Text style={{ fontFamily: F.display, fontSize: 12, color: c.primary, textTransform: 'uppercase', letterSpacing: 1 }}>
            {editing ? 'Edit Sponsor' : 'New Sponsor'}
          </Text>

          <View>
            <Text style={label}>Sponsor Name *</Text>
            <TextInput style={input} value={form.name} onChangeText={v => set('name', v)} placeholder="e.g. Acme Corp" placeholderTextColor={c.muted} />
          </View>

          <View>
            <Text style={label}>Tier</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {TIERS.map(t => {
                const on = form.tier === t.value;
                return (
                  <TouchableOpacity key={t.value} onPress={() => set('tier', t.value)}
                    style={{ paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, borderWidth: 1.5,
                      borderColor: on ? t.color : c.border, backgroundColor: on ? t.color : c.surface }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: on ? '#fff' : c.muted }}>{t.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <View>
            <Text style={label}>Logo</Text>
            <LogoUpload token={token} bucket="logos" path={`sponsors/${tournamentId}/sponsor-${stamp}.jpg`}
              maxWidth={600} imageUrl={form.logo_url} onUploaded={url => set('logo_url', url)} />
          </View>

          <View>
            <Text style={label}>Website</Text>
            <TextInput style={input} value={form.website} onChangeText={v => set('website', v)} placeholder="https://example.com"
              placeholderTextColor={c.muted} autoCapitalize="none" keyboardType="url" />
          </View>
          <View>
            <Text style={label}>Contact Number</Text>
            <TextInput style={input} value={form.contact_phone} onChangeText={v => set('contact_phone', v)} placeholder="+91 98765 43210"
              placeholderTextColor={c.muted} keyboardType="phone-pad" />
          </View>
          <View>
            <Text style={label}>Contact Email</Text>
            <TextInput style={input} value={form.contact_email} onChangeText={v => set('contact_email', v)} placeholder="contact@sponsor.com"
              placeholderTextColor={c.muted} autoCapitalize="none" keyboardType="email-address" />
          </View>
          <View>
            <Text style={label}>About the Sponsor</Text>
            <TextInput style={[input, { minHeight: 70, textAlignVertical: 'top' }]} value={form.description} onChangeText={v => set('description', v)}
              multiline placeholder="Brief description shown on the tournament page…" placeholderTextColor={c.muted} />
          </View>

          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity onPress={closeForm} style={{ flex: 1, borderRadius: 10, borderWidth: 1, borderColor: c.border, paddingVertical: 12, alignItems: 'center' }}>
              <Text style={{ color: c.ink, fontWeight: '700' }}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={save} disabled={saving} style={{ flex: 1, borderRadius: 10, backgroundColor: c.primary, paddingVertical: 12, alignItems: 'center', opacity: saving ? 0.6 : 1 }}>
              <Text style={{ color: '#fff', fontWeight: '700' }}>{saving ? 'Saving…' : editing ? 'Save Changes' : 'Add Sponsor'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}
