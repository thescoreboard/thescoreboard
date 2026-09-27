/**
 * VenuePicker — React Native port of the web VenuePicker.
 *
 * Two modes:
 *   "search"  — debounced Photon (Komoot/OSM) geocoder, biased to India.
 *               Results rendered as an inline list below the input.
 *   "manual"  — free-text venue name + optional Google Maps URL
 *               (lat/lng extracted from the URL).
 *
 * Props
 * ─────
 *   value      – VenueValue | null  (the confirmed/selected venue)
 *   onChange   – (venue: VenueValue | null) => void
 *   colors     – theme.colors object
 */
import React, { useState, useRef, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ActivityIndicator,
  Linking, StyleSheet,
} from 'react-native';

// ── Types ─────────────────────────────────────────────────────────────────────
export interface VenueValue {
  name:  string;
  city:  string;
  state: string;
  lat:   number | null;
  lng:   number | null;
}

interface VenuePickerProps {
  value:    VenueValue | null;
  onChange: (v: VenueValue | null) => void;
  colors:   any;   // theme.colors
}

// ── Photon geocoder (OpenStreetMap) ───────────────────────────────────────────
const PHOTON_URL = 'https://photon.komoot.io/api/';

function extractAddress(props: any = {}) {
  const city  = props.city || props.district || props.county || '';
  const state = props.state || '';
  const name  = props.name || '';
  return { name, city, state };
}

function buildDetail(props: any = {}) {
  const parts: string[] = [];
  if (props.street)   parts.push(props.street);
  if (props.city)     parts.push(props.city);
  else if (props.district) parts.push(props.district);
  if (props.state)    parts.push(props.state);
  if (props.country)  parts.push(props.country);
  return parts.join(', ');
}

// ── Parse Google Maps URL for coordinates ─────────────────────────────────────
function parseGoogleMapsUrl(url: string): { lat: number | null; lng: number | null } {
  if (!url) return { lat: null, lng: null };
  // @lat,lng,zoom  (most common — place links)
  const atMatch = url.match(/@(-?\d+\.?\d*),(-?\d+\.?\d*)/);
  if (atMatch) return { lat: parseFloat(atMatch[1]), lng: parseFloat(atMatch[2]) };
  // q=lat,lng
  const qMatch = url.match(/[?&]q=(-?\d+\.?\d*),(-?\d+\.?\d*)/);
  if (qMatch) return { lat: parseFloat(qMatch[1]), lng: parseFloat(qMatch[2]) };
  // ll=lat,lng
  const llMatch = url.match(/[?&]ll=(-?\d+\.?\d*),(-?\d+\.?\d*)/);
  if (llMatch) return { lat: parseFloat(llMatch[1]), lng: parseFloat(llMatch[2]) };
  return { lat: null, lng: null };
}

// ─────────────────────────────────────────────────────────────────────────────
export default function VenuePicker({ value, onChange, colors: c }: VenuePickerProps) {
  const [mode,     setMode]     = useState<'search' | 'manual'>('search');
  const [query,    setQuery]    = useState(value?.name || '');
  const [results,  setResults]  = useState<any[]>([]);
  const [loading,  setLoading]  = useState(false);
  const [open,     setOpen]     = useState(false);

  // Manual mode state
  const [manualName,    setManualName]    = useState('');
  const [manualMapsUrl, setManualMapsUrl] = useState('');

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isConfirmed = !!value?.name;
  const hasCoords   = isConfirmed && value?.lat != null;

  // ── Search ────────────────────────────────────────────────────────────────
  const search = useCallback(async (q: string) => {
    if (!q || q.length < 2) { setResults([]); setOpen(false); return; }
    setLoading(true);
    try {
      // Biased to India bounding box
      const url = `${PHOTON_URL}?q=${encodeURIComponent(q)}&limit=7&lang=en&bbox=68.1,6.5,97.4,35.7`;
      const res  = await fetch(url);
      const data = await res.json();
      const features = (data.features || []).filter((f: any) => f.properties?.name);
      setResults(features);
      setOpen(features.length > 0);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleQueryChange = (text: string) => {
    setQuery(text);
    if (value) onChange(null);   // clear confirmed selection on re-type
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(text), 350);
  };

  const handleSelect = (feature: any) => {
    const props = feature.properties || {};
    const coords = feature.geometry?.coordinates || [];
    const { name, city, state } = extractAddress(props);
    const displayName = name || query;
    onChange({
      name:  displayName,
      city,
      state,
      lat:   coords[1] ?? null,  // Photon: [lng, lat]
      lng:   coords[0] ?? null,
    });
    setQuery(displayName);
    setResults([]);
    setOpen(false);
  };

  const handleClear = () => {
    setQuery('');
    setResults([]);
    setOpen(false);
    setManualName('');
    setManualMapsUrl('');
    onChange(null);
  };

  // ── Manual mode ───────────────────────────────────────────────────────────
  const handleManualSave = () => {
    if (!manualName.trim()) return;
    const { lat, lng } = parseGoogleMapsUrl(manualMapsUrl);
    onChange({ name: manualName.trim(), city: '', state: '', lat, lng });
  };

  const switchToManual = () => {
    setMode('manual');
    setOpen(false);
    if (!manualName && query) setManualName(query);
  };

  const switchToSearch = () => {
    setMode('search');
    setQuery('');
    onChange(null);
  };

  const openInMaps = () => {
    if (!value?.lat || !value?.lng) return;
    Linking.openURL(`https://www.google.com/maps?q=${value.lat},${value.lng}`);
  };

  // ─────────────────────────────────────────────────────────────────────────
  // MANUAL MODE
  // ─────────────────────────────────────────────────────────────────────────
  if (mode === 'manual') {
    const { lat, lng } = parseGoogleMapsUrl(manualMapsUrl);
    const validCoords  = lat !== null && lng !== null;

    return (
      <View>
        {/* Manual entry card */}
        <View style={[vp.manualCard, { backgroundColor: c.elevated, borderColor: c.border }]}>
          {/* Header */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <Text style={{ fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, color: c.muted }}>
              Manual Venue Entry
            </Text>
            <TouchableOpacity onPress={switchToSearch}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: c.primary }}>← Back to Search</Text>
            </TouchableOpacity>
          </View>

          {/* Venue name */}
          <Text style={[vp.fieldLabel, { color: c.muted }]}>Venue / Ground Name *</Text>
          <TextInput
            style={[vp.input, { backgroundColor: c.surface, borderColor: c.border, color: c.ink }]}
            placeholder="e.g. Green Turf Andheri"
            placeholderTextColor={c.muted}
            value={manualName}
            onChangeText={setManualName}
            autoFocus
          />

          {/* Google Maps URL */}
          <Text style={[vp.fieldLabel, { color: c.muted, marginTop: 12 }]}>
            Google Maps Link{' '}
            <Text style={{ fontWeight: '400', textTransform: 'none' }}>(optional)</Text>
          </Text>
          <View style={{ position: 'relative' }}>
            <TextInput
              style={[vp.input, {
                backgroundColor: c.surface,
                borderColor: validCoords ? '#16a34a' : (manualMapsUrl ? '#ef4444' : c.border),
                color: c.ink,
                paddingRight: validCoords ? 110 : 12,
              }]}
              placeholder="Paste a Google Maps URL…"
              placeholderTextColor={c.muted}
              value={manualMapsUrl}
              onChangeText={setManualMapsUrl}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {!!manualMapsUrl && (
              <View style={{ position: 'absolute', right: 10, top: 0, bottom: 0, justifyContent: 'center' }}>
                <Text style={{ fontSize: 11, fontWeight: '700',
                  color: validCoords ? '#16a34a' : '#ef4444' }}>
                  {validCoords
                    ? `✓ ${lat!.toFixed(3)}, ${lng!.toFixed(3)}`
                    : 'No coords'}
                </Text>
              </View>
            )}
          </View>
          <Text style={{ fontSize: 11, color: c.muted, marginTop: 5, lineHeight: 16 }}>
            Open Google Maps → find your venue → copy the URL from the address bar
          </Text>

          {/* Buttons */}
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
            <TouchableOpacity
              onPress={handleManualSave}
              disabled={!manualName.trim()}
              style={{ flex: 1, borderRadius: 8, paddingVertical: 12, alignItems: 'center',
                backgroundColor: manualName.trim() ? c.primary : c.elevated }}>
              <Text style={{ fontWeight: '700', fontSize: 13,
                color: manualName.trim() ? '#fff' : c.muted }}>
                Save Venue →
              </Text>
            </TouchableOpacity>
            {value && (
              <TouchableOpacity
                onPress={handleClear}
                style={{ borderRadius: 8, paddingVertical: 12, paddingHorizontal: 16, alignItems: 'center',
                  borderWidth: 1, borderColor: c.border }}>
                <Text style={{ fontWeight: '700', fontSize: 13, color: c.muted }}>Clear</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Confirmed chip */}
        {isConfirmed && <ConfirmedChip value={value!} hasCoords={hasCoords} c={c} onMaps={openInMaps} onClear={handleClear} />}
      </View>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SEARCH MODE (default)
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <View>
      {/* Search input row */}
      <View style={[vp.searchRow, { backgroundColor: c.elevated,
        borderColor: open ? c.primary : c.border }]}>
        <Text style={{ fontSize: 16, color: isConfirmed ? c.primary : c.muted, paddingLeft: 12 }}>📍</Text>
        <TextInput
          style={{ flex: 1, fontSize: 14, color: c.ink, paddingHorizontal: 10,
            paddingVertical: 12, minHeight: 46 }}
          placeholder="Search venue, turf, stadium, ground…"
          placeholderTextColor={c.muted}
          value={query}
          onChangeText={handleQueryChange}
          onFocus={() => { if (results.length > 0) setOpen(true); }}
          autoCorrect={false}
          autoCapitalize="words"
        />
        {loading && (
          <ActivityIndicator size="small" color={c.muted} style={{ marginRight: 10 }} />
        )}
        {(!!query || !!value) && !loading && (
          <TouchableOpacity onPress={handleClear} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={{ paddingRight: 12, paddingLeft: 4 }}>
            <Text style={{ fontSize: 20, color: c.muted, lineHeight: 24 }}>×</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Confirmed venue chip */}
      {isConfirmed && !open && (
        <ConfirmedChip value={value!} hasCoords={hasCoords} c={c} onMaps={openInMaps} onClear={handleClear} />
      )}

      {/* Inline results list */}
      {open && (results.length > 0 || (!loading && query.length >= 2)) && (
        <View style={[vp.resultList, { backgroundColor: c.surface, borderColor: c.border }]}>

          {results.map((feature, i) => {
            const props  = feature.properties || {};
            const name   = props.name;
            const detail = buildDetail(props);
            return (
              <TouchableOpacity
                key={`${props.osm_id ?? i}`}
                onPress={() => handleSelect(feature)}
                style={[vp.resultRow, {
                  borderBottomWidth: i < results.length - 1 ? 1 : 0,
                  borderBottomColor: c.border,
                }]}
              >
                <Text style={{ fontSize: 14, flexShrink: 0, marginTop: 1 }}>📍</Text>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: c.ink }} numberOfLines={1}>{name}</Text>
                  {!!detail && (
                    <Text style={{ fontSize: 11, color: c.muted, marginTop: 2 }} numberOfLines={1}>{detail}</Text>
                  )}
                </View>
              </TouchableOpacity>
            );
          })}

          {results.length === 0 && !loading && (
            <View style={{ padding: 14, alignItems: 'center' }}>
              <Text style={{ fontSize: 13, color: c.muted }}>No results for "{query}"</Text>
            </View>
          )}

          {/* Manual entry CTA — always at bottom of list */}
          <TouchableOpacity
            onPress={switchToManual}
            style={[vp.manualCta, { backgroundColor: c.elevated, borderTopColor: c.border }]}
          >
            <Text style={{ fontSize: 14 }}>✏️</Text>
            <View>
              <Text style={{ fontSize: 12, fontWeight: '700', color: c.ink }}>Can't find your venue?</Text>
              <Text style={{ fontSize: 11, color: c.muted }}>Add it manually or paste a Maps link</Text>
            </View>
          </TouchableOpacity>
        </View>
      )}

      {/* Manual entry link — shown below input when dropdown is closed */}
      {!open && !isConfirmed && (
        <TouchableOpacity onPress={switchToManual} style={{ marginTop: 6 }}>
          <Text style={{ fontSize: 12, color: c.muted, textDecorationLine: 'underline' }}>
            Can't find your venue? Add manually
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ── Confirmed chip ────────────────────────────────────────────────────────────
function ConfirmedChip({ value, hasCoords, c, onMaps, onClear }: {
  value: VenueValue; hasCoords: boolean; c: any; onMaps: () => void; onClear: () => void;
}) {
  return (
    <View style={[vp.confirmedChip, { backgroundColor: c.primary + '10', borderColor: c.primary + '33' }]}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: 13, fontWeight: '700', color: c.ink }} numberOfLines={1}>
          ✓ {value.name}
        </Text>
        {(value.city || value.state) && (
          <Text style={{ fontSize: 11, color: c.muted, marginTop: 2 }} numberOfLines={1}>
            {[value.city, value.state].filter(Boolean).join(', ')}
            {!hasCoords ? '  ·  no map pin' : ''}
          </Text>
        )}
        {!value.city && !value.state && !hasCoords && (
          <Text style={{ fontSize: 11, color: '#f59e0b', marginTop: 2 }}>no map pin</Text>
        )}
      </View>
      <View style={{ flexDirection: 'row', gap: 6, flexShrink: 0 }}>
        {hasCoords && (
          <TouchableOpacity onPress={onMaps}
            style={{ borderRadius: 6, borderWidth: 1, borderColor: c.primary + '55',
              paddingHorizontal: 8, paddingVertical: 4 }}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: c.primary }}>Maps ↗</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity onPress={onClear}
          style={{ borderRadius: 6, borderWidth: 1, borderColor: c.border,
            paddingHorizontal: 8, paddingVertical: 4 }}>
          <Text style={{ fontSize: 11, fontWeight: '700', color: c.muted }}>Change</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const vp = StyleSheet.create({
  searchRow: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 10, borderWidth: 1.5, overflow: 'hidden',
  },
  resultList: {
    borderRadius: 10, borderWidth: 1.5, marginTop: 4,
    overflow: 'hidden',
  },
  resultRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    paddingHorizontal: 14, paddingVertical: 12,
  },
  manualCta: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 14, paddingVertical: 10,
    borderTopWidth: 1,
  },
  manualCard: {
    borderRadius: 10, borderWidth: 1.5, padding: 14,
  },
  fieldLabel: {
    fontSize: 11, fontWeight: '700', textTransform: 'uppercase',
    letterSpacing: 0.6, marginBottom: 6,
  },
  input: {
    borderRadius: 8, borderWidth: 1.5,
    paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 14, minHeight: 44,
  },
  confirmedChip: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    gap: 8, borderRadius: 8, borderWidth: 1,
    paddingHorizontal: 12, paddingVertical: 8, marginTop: 6,
  },
});
