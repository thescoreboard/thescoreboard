import { useState } from "react";
import { configureEvent } from "../../api/client";

// ── Per-sport setup definitions ───────────────────────────────
// Each sport declares what the organiser must answer in the setup wizard.
// Fields are rendered in order; scoring fields are in a collapsible panel.

const FORMATS = [
  { value: "direct_knockout", label: "Direct Knockout",        sub: "Single elimination bracket"     },
  { value: "round_robin",     label: "Round Robin",            sub: "Everyone plays everyone"        },
  { value: "group_knockout",  label: "Group Stage + Knockout", sub: "Groups first, then elimination" },
];

const SPORT_SETUP = {
  table_tennis: {
    label: "Table Tennis",
    subformats: [
      { key: "singles",      label: "Singles",  participant_type: "individual",   desc: "1 vs 1 — individual players" },
      { key: "doubles",      label: "Doubles",  participant_type: "doubles_pair", desc: "2 vs 2 — pairs compete" },
    ],
    teamConfig: null,
    scoring: [
      { key: "sets_to_win",     label: "Sets to Win",    type: "select",
        options: [
          { v: 1, label: "1 set"  },
          { v: 2, label: "3 sets (first to 2)"  },
          { v: 3, label: "5 sets (first to 3)"  },
        ],
        default: 2 },
      { key: "points_per_set", label: "Points per Set",  type: "select",
        options: [{ v: 11, label: "11 points (standard)" }, { v: 21, label: "21 points" }],
        default: 11 },
    ],
  },

  badminton: {
    label: "Badminton",
    subformats: [
      { key: "singles",       label: "Singles",       participant_type: "individual",   desc: "1 vs 1" },
      { key: "doubles",       label: "Doubles",       participant_type: "doubles_pair", desc: "2 vs 2 — same gender pairs" },
      { key: "mixed_doubles", label: "Mixed Doubles", participant_type: "doubles_pair", desc: "2 vs 2 — mixed gender" },
    ],
    teamConfig: null,
    scoring: [
      { key: "sets_to_win",     label: "Sets to Win",   type: "select",
        options: [
          { v: 1, label: "Best of 1 (single set)" },
          { v: 2, label: "Best of 3 (first to 2)" },
          { v: 3, label: "Best of 5 (first to 3)" },
        ],
        default: 2 },
      { key: "points_per_set", label: "Points per Set", type: "number", default: 21, min: 11, max: 30 },
    ],
  },

  cricket: {
    label: "Cricket",
    subformats: null,             // Cricket is always team vs team
    teamConfig: [
      { key: "squad_size", label: "Squad Size", type: "number", default: 11, min: 6, max: 15,
        hint: "Players per team (wickets = squad size − 1)" },
      { key: "overs", label: "Overs per Innings", type: "number", default: 20, min: 1, max: 50,
        hint: "e.g. 5 (T5), 10 (T10), 20 (T20), 50 (ODI)" },
    ],
    scoring: [],
  },

  football: {
    label: "Football",
    subformats: null,             // Football is always team vs team
    teamConfig: [
      { key: "team_format", label: "Team Format", type: "select",
        options: [
          { v: "5_a_side",  label: "5-a-side  (Futsal)",   team_size: 5  },
          { v: "7_a_side",  label: "7-a-side",              team_size: 7  },
          { v: "11_a_side", label: "11-a-side (Standard)", team_size: 11 },
        ],
        default: "11_a_side" },
      { key: "substitutes", label: "Substitutes on Bench", type: "number", default: 5, min: 0, max: 7 },
    ],
    scoring: [
      { key: "half_duration_minutes", label: "Half Duration (mins)", type: "number", default: 45, min: 5, max: 90 },
    ],
  },

};

const SPORT_ABBREV = { table_tennis: "🏓", badminton: "🏸", cricket: "🏏", football: "⚽", };
const SPORT_LABELS = { table_tennis: "Table Tennis", badminton: "Badminton", cricket: "Cricket", football: "Football", };

function buildInitialForm(spec) {
  const form = {
    format:         "",
    subformat:      spec?.subformats?.[0]?.key || null,
    scoring:        {},
    teamConfig:     {},
    showAdvanced:   false,
  };

  // Pre-fill scoring defaults
  (spec?.scoring || []).forEach(f => { form.scoring[f.key] = f.default; });

  // Pre-fill teamConfig defaults
  (spec?.teamConfig || []).forEach(f => { form.teamConfig[f.key] = f.default; });

  return form;
}

export default function SportSetupModal({ event, onClose, onSetupComplete }) {
  const spec = SPORT_SETUP[event.sport_key] || null;
  const [form, setForm]       = useState(() => buildInitialForm(spec));
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");

  const sportAbbrev = SPORT_ABBREV[event.sport_key] || event.sport_key?.slice(0,2).toUpperCase() || "?";
  const sportLabel = SPORT_LABELS[event.sport_key] || event.sport_key;

  // ── Derived values ────────────────────────────────────────────
  const selectedSubformat = spec?.subformats?.find(sf => sf.key === form.subformat);

  const participantType = selectedSubformat
    ? selectedSubformat.participant_type
    : "team"; // cricket / football are always team

  const teamFormatOption = spec?.teamConfig?.find(f => f.key === "team_format")
    ?.options?.find(o => o.v === form.teamConfig["team_format"]);

  // ── Submit ────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!form.format) return setError("Please select a tournament format.");
    if (spec?.subformats && !form.subformat) return setError("Please select a participant format.");

    setLoading(true); setError("");
    try {
      const payload = {
        format:           form.format,
        participant_type: participantType,
        sport_config:     { ...form.scoring },
      };

      // Cricket
      if (event.sport_key === "cricket") {
        const squadSize = parseInt(form.teamConfig["squad_size"] ?? 11);
        const overs     = parseInt(form.teamConfig["overs"]      ?? 20);
        payload.squad_size   = squadSize;
        payload.sport_config = { overs, wickets: squadSize - 1 };
      }

      // Football
      if (event.sport_key === "football") {
        const tfOpt = spec.teamConfig.find(f => f.key === "team_format")
          ?.options?.find(o => o.v === form.teamConfig["team_format"]);
        payload.team_size   = tfOpt?.team_size ?? 11;
        payload.substitutes = parseInt(form.teamConfig["substitutes"] ?? 5);
      }

      const updated = await configureEvent(event.event_id, payload);
      onSetupComplete(updated);
    } catch (e) {
      setError(e.message || "Failed to save configuration.");
    } finally {
      setLoading(false);
    }
  };

  // ── Styles ────────────────────────────────────────────────────
  const c = {
    orange: "var(--primary)", dim: "var(--primary-dim)", border: "var(--border)",
    ink: "var(--ink)", muted: "var(--muted)", surface: "var(--surface)",
    elevated: "var(--elevated)", gold: "var(--gold)",
  };

  const selStyle = (selected) => ({
    border:       `2px solid ${selected ? c.orange : c.border}`,
    borderRadius: 8,
    background:   selected ? c.dim : c.surface,
    cursor:       "pointer",
    transition:   "all .15s",
    padding:      "12px 14px",
    marginBottom: 8,
  });

  const renderScoring = () => {
    if (!spec?.scoring?.length) return null;
    return (spec.scoring || []).map(field => (
      <div key={field.key} className="field">
        <label>{field.label}</label>
        {field.type === "select" ? (
          <select className="input" value={form.scoring[field.key] ?? field.default}
            onChange={e => setForm(f => ({ ...f, scoring: { ...f.scoring, [field.key]: field.options[0]?.v !== undefined ? (typeof field.options[0].v === "number" ? parseInt(e.target.value) : e.target.value) : e.target.value } }))}>
            {field.options.map(o => <option key={o.v} value={o.v}>{o.label}</option>)}
          </select>
        ) : (
          <input className="input" type="number" min={field.min} max={field.max}
            value={form.scoring[field.key] ?? field.default}
            onChange={e => setForm(f => ({ ...f, scoring: { ...f.scoring, [field.key]: parseInt(e.target.value) || field.default } }))}
            style={{ width: 120 }} />
        )}
      </div>
    ));
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div
        style={{ background: c.surface, border: "1px solid var(--border-mid)", borderRadius: 14,
          padding: "28px 28px 24px", width: "100%", maxWidth: 520, animation: "fadeIn .18s ease",
          maxHeight: "90vh", overflowY: "auto" }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 48, height: 48, borderRadius: 12, background: c.dim, border: `1px solid rgba(255,107,53,.2)`,
              display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 900, color: c.orange, flexShrink: 0 }}>
              {sportAbbrev}
            </div>
            <div>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 9, fontWeight: 800, textTransform: "uppercase",
                letterSpacing: 3, color: c.orange, marginBottom: 2 }}>Sport Setup</div>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 900,
                textTransform: "uppercase", letterSpacing: -0.5, color: c.ink }}>{event.name}</div>
            </div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 22,
            cursor: "pointer", color: c.muted, lineHeight: 1, padding: "0 4px", flexShrink: 0 }}>×</button>
        </div>

        {error && (
          <div style={{ background: "var(--red-dim)", border: "1px solid rgba(229,62,62,.3)", borderRadius: 6,
            padding: "10px 14px", marginBottom: 16, fontFamily: "var(--font-display)", fontSize: 11,
            fontWeight: 700, textTransform: "uppercase", letterSpacing: .5, color: "var(--red)" }}>
            {error}
          </div>
        )}

        {/* ── Participant format (subformats: TT, Badminton) */}
        {spec?.subformats && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 10, fontWeight: 800,
              textTransform: "uppercase", letterSpacing: 2, color: c.orange, marginBottom: 10 }}>
              Participant Format
            </div>
            {spec.subformats.map(sf => (
              <div key={sf.key} style={selStyle(form.subformat === sf.key)}
                onClick={() => setForm(f => ({ ...f, subformat: sf.key }))}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontFamily: "var(--font-display)", fontSize: 11, fontWeight: 900, color: form.subformat === sf.key ? c.orange : c.muted }}>{sf.key === "singles" ? "1v1" : sf.key === "doubles" ? "2v2" : sf.key === "mixed_doubles" ? "Mix" : sf.label.slice(0,3).toUpperCase()}</span>
                  <div>
                    <div style={{ fontFamily: "var(--font-display)", fontSize: 13, fontWeight: 800,
                      textTransform: "uppercase", letterSpacing: -0.5,
                      color: form.subformat === sf.key ? c.orange : c.ink }}>
                      {sf.label}
                    </div>
                    <div style={{ fontSize: 11, color: c.muted, marginTop: 1 }}>{sf.desc}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Team configuration (Cricket: squad size | Football: 5/7/11 + subs) */}
        {spec?.teamConfig && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 10, fontWeight: 800,
              textTransform: "uppercase", letterSpacing: 2, color: c.orange, marginBottom: 10 }}>
              Team Setup
            </div>
            {spec.teamConfig.map(field => (
              <div key={field.key} className="field">
                <label>{field.label}</label>
                {field.type === "select" ? (
                  <select className="input" value={form.teamConfig[field.key] ?? field.default}
                    onChange={e => setForm(f => ({ ...f, teamConfig: { ...f.teamConfig, [field.key]: e.target.value } }))}>
                    {field.options.map(o => <option key={o.v} value={o.v}>{o.label}</option>)}
                  </select>
                ) : (
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <input className="input" type="number" min={field.min} max={field.max} style={{ width: 100 }}
                      value={form.teamConfig[field.key] ?? field.default}
                      onChange={e => setForm(f => ({ ...f, teamConfig: { ...f.teamConfig, [field.key]: parseInt(e.target.value) || field.default } }))} />
                    {field.hint && <span style={{ fontSize: 12, color: c.muted }}>{field.hint}</span>}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ── Tournament bracket format */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 10, fontWeight: 800,
            textTransform: "uppercase", letterSpacing: 2, color: c.orange, marginBottom: 10 }}>
            Tournament Format
          </div>
          {FORMATS.map(f => (
            <div key={f.value} style={{ ...selStyle(form.format === f.value), padding: "10px 14px" }}
              onClick={() => setForm(fm => ({ ...fm, format: f.value }))}>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 13, fontWeight: 800,
                textTransform: "uppercase", letterSpacing: -0.5,
                color: form.format === f.value ? c.orange : c.ink }}>
                {f.label}
              </div>
              <div style={{ fontSize: 11, color: c.muted, marginTop: 1 }}>{f.sub}</div>
            </div>
          ))}
        </div>

        {/* ── Advanced / scoring (collapsible) */}
        {spec?.scoring?.length > 0 && (
          <div style={{ borderTop: `1px solid ${c.border}`, paddingTop: 14, marginBottom: 20 }}>
            <div
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
                cursor: "pointer", marginBottom: form.showAdvanced ? 14 : 0 }}
              onClick={() => setForm(f => ({ ...f, showAdvanced: !f.showAdvanced }))}
            >
              <div style={{ fontFamily: "var(--font-display)", fontSize: 10, fontWeight: 800,
                textTransform: "uppercase", letterSpacing: 2, color: c.muted }}>
                Scoring Rules (optional)
              </div>
              <span style={{ fontSize: 13, color: c.muted }}>
                {form.showAdvanced ? "▲ Hide" : "▼ Show"}
              </span>
            </div>
            {form.showAdvanced && (
              <div style={{ background: c.elevated, borderRadius: 8, padding: "14px 16px" }}>
                {renderScoring()}
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button className="btn btn-outline" onClick={onClose}>Cancel</button>
          <button
            className="btn btn-gradient"
            style={{ fontSize: 13, fontWeight: 800 }}
            onClick={handleSubmit}
            disabled={loading || !form.format}
          >
            {loading ? "Saving…" : "Save Setup →"}
          </button>
        </div>
      </div>
    </div>
  );
}
