import { useState } from "react";
import { updateTournament } from "../../api/client";
import SetupSection from "./SetupSection";
import VenuePicker from "../shared/VenuePicker";
import CitySelect, { CITY_STATE_MAP } from "../shared/CitySelect";
import { isSectionComplete } from "../../utils/tournamentCompleteness";

const labelStyle = { fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: 2, color: "var(--muted)", fontFamily: "var(--font-display)", marginBottom: 4, display: "block" };
const inputStyle = { background: "var(--elevated)", border: "1px solid var(--border-mid)", borderRadius: 6, padding: "7px 10px", fontSize: 13, color: "var(--ink)", width: "100%", outline: "none", fontFamily: "inherit" };
const fieldStyle = { marginBottom: 14 };

/**
 * Shared "Basic Info" checklist section — venue/city — used by
 * the single-event workspace.
 *
 * Like PrizePoolSection/RulesSection, this always shows the editable form
 * directly when expanded (no separate read-only view) — consistent with
 * every other Setup Progress section.
 *
 * `extras` optionally folds caller-specific blocks (e.g. per-event Format &
 * Play settings, or Registration & Contact) into this same section instead
 * of separate ones. Each entry:
 *   statusSections: string[]     — checklist sections (beyond "basic") that must
 *                                   also be complete for the status pill to read "Complete"
 *   initExtra: () => object      — seeds this extra's slice of the extra-form on mount
 *   editableFields: (form, setForm) => ReactNode — extra editable fields
 *                                   (form/setForm cover the whole merged extra-form — keep to
 *                                   non-colliding keys, e.g. a dedicated `contact` sub-object)
 *   onSaveExtra: async (extraForm) => void        — persists this extra's fields on Save
 */
export default function TournamentBasicInfoSection({ t, checklist, defaultOpen, onSaved, flash, extras = [] }) {
  const [form, setForm] = useState(() => ({
    name:      t.name || "",
    venue:     t.venue || "",
    city:      t.city || "",
    venue_lat: t.venue_lat ?? null,
    venue_lng: t.venue_lng ?? null,
  }));
  const [extraForm, setExtraForm] = useState(() => Object.assign({}, ...extras.map(ex => ex.initExtra?.() || {})));
  const [saving, setSaving] = useState(false);

  const statusSections = ["basic", ...extras.flatMap(ex => ex.statusSections || [])];
  const status = statusSections.every(s => isSectionComplete(checklist, s)) ? "complete" : "not_started";

  const handleVenuePick = (v) => {
    if (!v) { setForm(f => ({ ...f, venue: "", venue_lat: null, venue_lng: null })); return; }
    setForm(f => ({
      ...f,
      venue: v.name || "",
      // Only adopt the picked venue's city when it's one of our supported cities.
      city:  CITY_STATE_MAP[v.city] ? v.city : f.city,
      venue_lat: v.lat ?? null,
      venue_lng: v.lng ?? null,
    }));
  };

  const save = async () => {
    setSaving(true);
    try {
      const payload = {};
      Object.entries(form).forEach(([k, v]) => { payload[k] = v || null; });
      // State is derived from the city — never asked for separately.
      payload.state = CITY_STATE_MAP[form.city] || null;
      await updateTournament(t.org_id, t.tournament_id, payload);
      for (const ex of extras) {
        if (ex.onSaveExtra) await ex.onSaveExtra(extraForm);
      }
      onSaved?.();
      flash?.("Basic info updated!");
    } catch (e) { flash?.("Error: " + e.message); }
    finally { setSaving(false); }
  };

  return (
    <SetupSection icon="📍" title="Basic Info" status={status} defaultOpen={defaultOpen}>
      <div style={fieldStyle}>
        <label style={labelStyle}>Tournament Name</label>
        <input style={inputStyle} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
      </div>
      <div style={fieldStyle}>
        <label style={labelStyle}>Venue</label>
        <VenuePicker
          value={form.venue ? { name: form.venue, city: form.city, state: CITY_STATE_MAP[form.city] || "", lat: form.venue_lat, lng: form.venue_lng } : null}
          onChange={handleVenuePick}
          placeholder="Search venue, stadium, ground…"
        />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 20px" }}>
        <div style={fieldStyle}>
          <label style={labelStyle}>City</label>
          <select style={inputStyle} value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))}>
            <option value="">Select city…</option>
            {form.city && !CITY_STATE_MAP[form.city] && <option value={form.city}>{form.city}</option>}
            {Object.keys(CITY_STATE_MAP).map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        {extras.map((ex, i) => ex.editableFields && (
          <div key={i} style={{ display: "contents" }}>{ex.editableFields(extraForm, setExtraForm)}</div>
        ))}
      </div>
      <div style={{ marginTop: 14 }}>
        <button className="btn btn-primary btn-sm" disabled={saving} onClick={save}>{saving ? "Saving…" : "Save Changes"}</button>
      </div>
    </SetupSection>
  );
}
