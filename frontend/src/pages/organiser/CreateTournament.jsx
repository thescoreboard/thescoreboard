import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { getMyOrgs, createOrg, createTournament } from "../../api/client";
import PageLoader from "../../components/shared/PageLoader";
import CitySelect, { CITY_STATE_MAP } from "../../components/shared/CitySelect";
import VenuePicker from "../../components/shared/VenuePicker";

// ── Sport definitions ─────────────────────────────────────────
const SPORTS = [
  { key: "table_tennis", label: "Table Tennis", abbrev: "🏓" },
  { key: "badminton",    label: "Badminton",    abbrev: "🏸" },
  { key: "cricket",      label: "Cricket",      abbrev: "🏏" },
  { key: "football",     label: "Football",     abbrev: "⚽" },
];

const SPORT_SUBFORMATS = {
  table_tennis: [
    { key: "singles", label: "Singles", sub: "1 vs 1 — individual players compete", participant_type: "individual", config: {} },
    { key: "doubles", label: "Doubles", sub: "2 vs 2 — pairs compete together",     participant_type: "doubles_pair", config: {} },
  ],
  badminton: [
    { key: "singles",       label: "Singles",       sub: "1 vs 1 — individual players compete",       participant_type: "individual",   config: {} },
    { key: "doubles",       label: "Doubles",        sub: "2 vs 2 — pairs compete together",            participant_type: "doubles_pair", config: {} },
    { key: "mixed_doubles", label: "Mixed Doubles",  sub: "2 vs 2 — one male, one female per pair",     participant_type: "doubles_pair", config: { mixed: true } },
  ],
  cricket: [
    {
      key: "standard", label: "Standard", sub: "Full team cricket — configure squad size below",
      participant_type: "team", config: { squad_size: 11 },
      configFields: [
        {
          key: "squad_size", label: "Squad Size", type: "stepper",
          min: 6, max: 15, default: 11,
          quickPicks: [7, 9, 11, 15],
          hint: "Total players per team including substitutes",
        },
      ],
    },
  ],
  football: [
    {
      key: "11_a_side", label: "11-a-side", sub: "Standard football — 11 players per team",
      participant_type: "team", config: { team_size: 11, substitutes: 5 },
      configFields: [{ key: "substitutes", label: "Substitutes on bench", type: "stepper", min: 0, max: 7, default: 5, quickPicks: [0, 3, 5, 7] }],
    },
    {
      key: "7_a_side",  label: "7-a-side",  sub: "7 players per team on the field",
      participant_type: "team", config: { team_size: 7, substitutes: 3 },
      configFields: [{ key: "substitutes", label: "Substitutes on bench", type: "stepper", min: 0, max: 5, default: 3, quickPicks: [0, 2, 3, 5] }],
    },
    {
      key: "5_a_side",  label: "5-a-side",  sub: "5 players per team — futsal / small-sided",
      participant_type: "team", config: { team_size: 5, substitutes: 2 },
      configFields: [{ key: "substitutes", label: "Substitutes on bench", type: "stepper", min: 0, max: 3, default: 2, quickPicks: [0, 1, 2, 3] }],
    },
    {
      key: "custom",    label: "Custom",    sub: "Set your own players-per-team and bench size",
      participant_type: "team", config: { team_size: 11, substitutes: 5 },
      configFields: [
        { key: "team_size",   label: "Players per team",     type: "number", min: 1, default: 11 },
        { key: "substitutes", label: "Substitutes on bench", type: "number", min: 0, default: 5  },
      ],
    },
  ],

};

const FORMATS = [
  { value: "group_knockout",  label: "Group Stage + Knockout", sub: "Groups then single elimination" },
  { value: "direct_knockout", label: "Direct Knockout",        sub: "Straight single elimination"   },
  { value: "round_robin",     label: "Round Robin",            sub: "Everyone plays everyone"        },
];

const STEPS_SINGLE = ["Type", "Sport & Format", "Structure", "Details", "Review"];
const STEPS_MULTI  = ["Type", "Sports",          "Details",   "Review"];
const MULTI_DISPLAY = { 1: 1, 2: 2, 4: 3, 5: 4 };

// ── Stepper component ─────────────────────────────────────────
function Stepper({ value, onChange, min, max, quickPicks }) {
  const dec = () => onChange(Math.max(min, value - 1));
  const inc = () => onChange(Math.min(max, value + 1));
  const btnBase = {
    width: 40, height: 40, border: "none", borderRadius: 0,
    fontSize: 20, fontWeight: 700, lineHeight: 1, transition: "background .12s",
  };
  return (
    <div>
      <div style={{ display: "inline-flex", alignItems: "center", border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
        <button type="button" onClick={dec} disabled={value <= min}
          style={{ ...btnBase, background: value <= min ? "var(--elevated)" : "var(--surface)", color: value <= min ? "var(--subtle)" : "var(--ink)", cursor: value <= min ? "not-allowed" : "pointer" }}>
          −
        </button>
        <div style={{ minWidth: 56, textAlign: "center", fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 900, color: "var(--ink)", padding: "0 12px", borderLeft: "1px solid var(--border)", borderRight: "1px solid var(--border)", lineHeight: "40px" }}>
          {value}
        </div>
        <button type="button" onClick={inc} disabled={value >= max}
          style={{ ...btnBase, background: value >= max ? "var(--elevated)" : "var(--surface)", color: value >= max ? "var(--subtle)" : "var(--ink)", cursor: value >= max ? "not-allowed" : "pointer" }}>
          +
        </button>
      </div>
      {quickPicks?.length > 0 && (
        <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
          {quickPicks.map(v => (
            <button key={v} type="button" onClick={() => onChange(v)}
              style={{
                padding: "4px 12px", borderRadius: 20, fontSize: 12, fontWeight: 700,
                fontFamily: "var(--font-display)",
                border: `1.5px solid ${value === v ? "var(--primary)" : "var(--border)"}`,
                background: value === v ? "var(--primary-dim)" : "transparent",
                color: value === v ? "var(--primary)" : "var(--muted)",
                cursor: "pointer", transition: "all .12s",
              }}>
              {v}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function CreateTournament() {
  const navigate = useNavigate();

  // ── Org state ────────────────────────────────────────────────
  const [loadingOrgs,    setLoadingOrgs]    = useState(true);
  const [activeOrg,      setActiveOrg]      = useState(null);
  const [orgGateForm,    setOrgGateForm]    = useState({ name: "", city: "" });
  const [orgGateError,   setOrgGateError]   = useState("");
  const [orgGateLoading, setOrgGateLoading] = useState(false);

  // ── Wizard state ─────────────────────────────────────────────
  const [step,         setStep]         = useState(1);
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState("");
  const [isMultiSport, setIsMultiSport] = useState(false);

  const [events, setEvents] = useState([]);

  // ── Tournament details ───────────────────────────────────────
  const [name,      setName]      = useState("");
  const [venue,     setVenue]     = useState("");
  const [city,      setCity]      = useState("");
  const [venueLat,  setVenueLat]  = useState(null);
  const [venueLng,  setVenueLng]  = useState(null);
  const [venueObj,  setVenueObj]  = useState(null);  // full picker value

  useEffect(() => {
    getMyOrgs()
      .then(orgs => { if (orgs?.length) setActiveOrg(orgs[0]); })
      .catch(console.error)
      .finally(() => setLoadingOrgs(false));
  }, []);

  const handleCreateOrgFromGate = async () => {
    if (!orgGateForm.name.trim()) return setOrgGateError("Organisation name is required.");
    setOrgGateLoading(true); setOrgGateError("");
    try {
      const autoState = CITY_STATE_MAP[orgGateForm.city] || "";
      const org = await createOrg({ name: orgGateForm.name.trim(), city: orgGateForm.city, state: autoState });
      setActiveOrg(org);
    } catch (e) {
      setOrgGateError(e.message || "Failed to create organisation.");
    } finally {
      setOrgGateLoading(false);
    }
  };

  // ── Sport helpers ────────────────────────────────────────────
  const sl = (k) => SPORTS.find(s => s.key === k)?.label || k;
  const si = (k) => SPORTS.find(s => s.key === k)?.abbrev || k.slice(0,2).toUpperCase();
  const fl = (v) => FORMATS.find(f => f.value === v)?.label || v;
  const getSubformat = (sportKey, sfKey) => SPORT_SUBFORMATS[sportKey]?.find(sf => sf.key === sfKey);

  const addSportEvent = (sportKey) => {
    const sf = SPORT_SUBFORMATS[sportKey]?.[0];
    setEvents(prev => [...prev, {
      sport_key:        sportKey,
      subformat_key:    sf?.key || "singles",
      participant_type: sf?.participant_type || "individual",
      format:           "",
      name:             "",
      sport_config:     { ...(sf?.config || {}) },
    }]);
  };

  const removeSportEvent = (i) => setEvents(prev => prev.filter((_, idx) => idx !== i));

  const updateEvent = (i, updates) =>
    setEvents(prev => prev.map((ev, idx) => idx === i ? { ...ev, ...updates } : ev));

  const setSubformat = (i, sfKey) => {
    const ev = events[i];
    const sf = getSubformat(ev.sport_key, sfKey);
    if (!sf) return;
    updateEvent(i, { subformat_key: sfKey, participant_type: sf.participant_type, sport_config: { ...(sf.config || {}) } });
  };

  const updateEventConfig = (i, key, val) =>
    setEvents(prev => prev.map((ev, idx) =>
      idx === i ? { ...ev, sport_config: { ...ev.sport_config, [key]: val } } : ev
    ));

  const toggleSport = (sportKey) => {
    if (events.some(e => e.sport_key === sportKey))
      setEvents(prev => prev.filter(e => e.sport_key !== sportKey));
    else
      addSportEvent(sportKey);
  };

  const setSingleSport = (sportKey) => {
    const sf = SPORT_SUBFORMATS[sportKey]?.[0];
    setEvents([{
      sport_key:        sportKey,
      subformat_key:    sf?.key || "singles",
      participant_type: sf?.participant_type || "individual",
      format:           "",
      name:             "",
      sport_config:     { ...(sf?.config || {}) },
    }]);
  };

  // ── Navigation ───────────────────────────────────────────────
  const canAdvance = () => {
    if (step === 2) return events.length > 0 && events.every(e => {
      const sf = getSubformat(e.sport_key, e.subformat_key);
      return !sf?.configFields?.some(f => f.type === "number" && e.sport_config?.[f.key] === "");
    });
    if (step === 3) return events.every(e => e.format !== "");
    if (step === 4) return name.trim().length > 0;
    return true;
  };

  const next = () => {
    if (!canAdvance()) return;
    setError("");
    if (isMultiSport && step === 2) setStep(4);
    else setStep(s => Math.min(s + 1, 5));
  };

  const back = () => {
    if (isMultiSport && step === 4) setStep(2);
    else setStep(s => Math.max(s - 1, 1));
  };

  // Tap a card, move on automatically — no extra "Continue" click for
  // single-choice steps (Type, Structure for single-sport).
  const pickType = (multi) => {
    setIsMultiSport(multi);
    setEvents([]);
    setError("");
    setTimeout(() => setStep(2), 280);
  };

  const pickStructure = (i, value) => {
    updateEvent(i, { format: value });
    if (!isMultiSport) setTimeout(() => setStep(4), 280);
  };

  // Called by VenuePicker when user selects a place from OSM results
  const handleVenueSelect = (v) => {
    setVenueObj(v);
    if (!v) {
      setVenue(""); setCity(""); setVenueLat(null); setVenueLng(null);
      return;
    }
    setVenue(v.name || "");
    // Only adopt the picked venue's city when it's one of our supported cities.
    if (CITY_STATE_MAP[v.city]) setCity(v.city);
    setVenueLat(v.lat ?? null);
    setVenueLng(v.lng ?? null);
  };

  // ── Create tournament ────────────────────────────────────────
  const handleCreate = async () => {
    if (!activeOrg)     return setError("No organisation found.");
    if (!name.trim())   return setError("Tournament name is required.");
    if (!events.length) return setError("Select at least one sport.");

    setLoading(true); setError("");
    try {
      const t = await createTournament(activeOrg.org_id, {
        name:           name.trim(),
        venue:          venue.trim() || null,
        city:           city  || null,
        state:          CITY_STATE_MAP[city] || null,
        venue_lat:      venueLat  ?? null,
        venue_lng:      venueLng  ?? null,
        is_multi_sport: isMultiSport,
        is_published:   true,
        events: events.map(e => {
          if (isMultiSport) {
            return {
              name:             sl(e.sport_key),
              sport_key:        e.sport_key,
              format:           null,
              participant_type: "individual",
              sport_config:     null,
              squad_size:       null,
              team_size:        null,
              substitutes:      null,
            };
          }
          // Single-sport: send exactly what the wizard collected.
          // participant_type is sent as-is — "doubles_pair" is a valid value
          // and must NOT be normalized to "team".
          const sf      = getSubformat(e.sport_key, e.subformat_key);
          const evtName = e.name.trim() || `${sl(e.sport_key)}${sf ? " " + sf.label : ""}`;
          return {
            name:             evtName,
            sport_key:        e.sport_key,
            format:           e.format,
            participant_type: e.participant_type,
            sport_config:     { ...(sf?.config || {}), ...e.sport_config },
            squad_size:       e.sport_config?.squad_size  || null,
            team_size:        e.sport_config?.team_size   || null,
            substitutes:      e.sport_config?.substitutes || null,
          };
        }),
      });
      navigate(`/organiser/tournament/${t.tournament_id}`);
    } catch (e) {
      setError(e.message || "Failed to create tournament.");
    } finally {
      setLoading(false);
    }
  };

  // ── Styles ────────────────────────────────────────────────────
  const c = {
    bg: "var(--bg)", surface: "var(--surface)", border: "var(--border)",
    orange: "var(--primary)", gold: "var(--gold)", muted: "var(--muted)",
    ink: "var(--ink)", dim: "var(--primary-dim)",
  };

  const selStyle = (selected) => ({
    border:       `2px solid ${selected ? c.orange : c.border}`,
    borderRadius: 8,
    background:   selected ? c.dim : c.surface,
    cursor:       "pointer",
    transition:   "all .15s",
    padding:      "14px 16px",
    marginBottom: 8,
  });

  const displaySteps = isMultiSport ? STEPS_MULTI : STEPS_SINGLE;
  const displayStep  = isMultiSport ? (MULTI_DISPLAY[step] || 1) : step;

  // Big headline used for every step — replaces the old "Step N — Title" card-title.
  const StepHeading = ({ text }) => (
    <h2 style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 900, letterSpacing: -0.5, color: c.ink, margin: "0 0 6px", lineHeight: 1.15 }}>
      {text}
    </h2>
  );

  // Review consolidation for single-sport (multi-sport keeps the flat rows —
  // there's no format/participant-type chosen yet to consolidate).
  const singleEv = !isMultiSport ? events[0] : null;
  const singleSf = singleEv ? getSubformat(singleEv.sport_key, singleEv.subformat_key) : null;
  const reviewRows = (!isMultiSport && singleEv)
    ? [
        ["Sport & Format", `${sl(singleEv.sport_key)}${singleSf ? " · " + singleSf.label : ""}`, 2],
        ["Structure",      singleEv.format ? fl(singleEv.format) : "—", 3],
        ["Name",           name, 4],
        ["Location",       [venue, city].filter(Boolean).join(", ") || "—", 4],
      ]
    : [
        ["Organisation", activeOrg?.name, null],
        ["Name",         name,            4],
        ["Type",         isMultiSport ? "Multi-Sport" : "Single Sport", 1],
        venue     && ["Venue",      venue + (venueLat ? ` 📍` : ""), 4],
        city      && ["City",       city, 4],
      ].filter(Boolean);

  if (loadingOrgs) return <PageLoader />;

  return (
    <div style={{ minHeight: "100vh", background: c.bg, fontFamily: "var(--font-body)" }}>

      <header className="site-header">
        <div className="header-row">
          <span className="header-brand">The<span className="accent">Score</span>Board</span>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate("/organiser")}>← Cancel</button>
        </div>
      </header>

      {!activeOrg ? (
        /* ── ORG GATE ── */
        <div style={{ maxWidth: 480, margin: "48px auto", padding: "0 24px" }} className="create-content">
          <div className="card" style={{ textAlign: "center" }}>
            <div style={{ width: 52, height: 52, borderRadius: 8, background: "var(--elevated)", margin: "0 auto 12px" }} />
            <div className="card-title" style={{ marginBottom: 8 }}>One Quick Step First</div>
            <p style={{ fontSize: 13, color: c.muted, marginBottom: 28 }}>
              Create an organisation before creating a tournament.
            </p>
            {orgGateError && (
              <div style={{ background: "var(--red-dim)", border: "1px solid rgba(229,62,62,0.3)", borderRadius: 6, padding: "10px 14px", marginBottom: 16, fontFamily: "var(--font-display)", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: .5, color: "var(--red)", textAlign: "left" }}>
                {orgGateError}
              </div>
            )}
            <div className="field" style={{ textAlign: "left" }}>
              <label>Organisation Name *</label>
              <input className="input" autoFocus placeholder="e.g. Tenx Sports Club"
                value={orgGateForm.name}
                onChange={e => setOrgGateForm(f => ({ ...f, name: e.target.value }))}
                onKeyDown={e => e.key === "Enter" && handleCreateOrgFromGate()} />
            </div>
            <div style={{ textAlign: "left" }}>
              <CitySelect city={orgGateForm.city} onChange={city => setOrgGateForm(f => ({ ...f, city }))} />
            </div>
            {orgGateForm.city && (
              <div className="field" style={{ textAlign: "left" }}>
                <label>State</label>
                <input className="input" value={CITY_STATE_MAP[orgGateForm.city] || ""} readOnly
                  style={{ color: c.muted, cursor: "default", background: "var(--elevated)" }} />
              </div>
            )}
            <button className="btn btn-gradient btn-lg" style={{ width: "100%", marginTop: 8, fontSize: 13 }}
              onClick={handleCreateOrgFromGate} disabled={orgGateLoading}>
              {orgGateLoading ? "Creating…" : "Create Organisation →"}
            </button>
            <div style={{ fontSize: 12, color: c.muted, marginTop: 16, cursor: "pointer" }}
              onClick={() => navigate("/organiser")}>
              ← Back to dashboard
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* ── PROGRESS BAR ── */}
          <div style={{ background: c.surface, borderBottom: `1px solid ${c.border}`, padding: "14px 0" }}>
            <div style={{ maxWidth: 620, margin: "0 auto", padding: "0 24px" }} className="progress-container">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
                <span style={{ fontFamily: "var(--font-display)", fontSize: 12, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase", color: c.orange }}>
                  Step {displayStep} · {displaySteps[displayStep - 1]}
                </span>
                <span style={{ fontSize: 12, fontWeight: 700, color: c.muted }}>{displayStep}/{displaySteps.length}</span>
              </div>
              <div style={{ height: 4, borderRadius: 2, background: c.border, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${(displayStep / displaySteps.length) * 100}%`, background: c.orange, transition: "width .25s" }} />
              </div>
            </div>
          </div>

          {/* ── WIZARD CONTENT ── */}
          <div style={{ maxWidth: 620, margin: "0 auto", padding: "28px 24px" }} className="create-content">
            {error && (
              <div style={{ background: "var(--red-dim)", border: "1px solid rgba(229,62,62,0.3)", borderRadius: 6, padding: "10px 14px", marginBottom: 16, fontFamily: "var(--font-display)", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: .5, color: "var(--red)" }}>
                {error}
              </div>
            )}

            {/* ── STEP 1: Type ── */}
            {step === 1 && (
              <div className="card">
                <StepHeading text="Run one sport or several?" />
                <p style={{ fontSize: 13, color: c.muted, marginBottom: 18 }}>Tap a card — we'll move you on automatically.</p>
                {[
                  { multi: false, label: "1", title: "Single Sport", sub: "One sport bracket — e.g. Football 5-a-side" },
                  { multi: true,  label: "M", title: "Multi Sport",  sub: "Multiple sports — e.g. Football + Cricket + TT" },
                ].map(({ multi, label, title, sub }) => (
                  <div key={String(multi)} style={selStyle(isMultiSport === multi)}
                    onClick={() => pickType(multi)}>
                    <div style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 900, marginBottom: 6, color: isMultiSport === multi ? c.orange : c.muted }}>{label}</div>
                    <div style={{ fontFamily: "var(--font-display)", fontSize: 14, fontWeight: 800, textTransform: "uppercase", letterSpacing: -0.5, color: isMultiSport === multi ? c.orange : c.ink }}>
                      {title}
                    </div>
                    <div style={{ fontSize: 12, color: c.muted, marginTop: 2 }}>{sub}</div>
                  </div>
                ))}
              </div>
            )}

            {/* ── STEP 2: Sport selection ── */}
            {step === 2 && (
              <div className="card">
                <StepHeading text={isMultiSport ? "Select your sports" : "Pick your sport"} />
                <p style={{ fontSize: 13, color: c.muted, marginBottom: 18 }}>
                  {isMultiSport
                    ? "Choose all sports for this tournament. Formats and detailed settings are configured after creation."
                    : "Format choices appear right below — no extra screen."}
                </p>

                {/* Sport grid */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 20 }} className="sport-selector-grid">
                  {SPORTS.map(sport => {
                    const selected = events.some(e => e.sport_key === sport.key);
                    return (
                      <div key={sport.key}
                        style={{ ...selStyle(selected), display: "flex", alignItems: "center", gap: 10, margin: 0 }}
                        onClick={() => isMultiSport ? toggleSport(sport.key) : setSingleSport(sport.key)}>
                        <div style={{
                          width: 36, height: 36, borderRadius: 8, flexShrink: 0,
                          background: selected ? c.orange : c.surface,
                          border: `1px solid ${selected ? c.orange : c.border}`,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontFamily: "var(--font-display)", fontSize: 11, fontWeight: 900,
                          color: selected ? "#fff" : c.ink,
                        }}>
                          {sport.abbrev}
                        </div>
                        <span style={{ fontFamily: "var(--font-display)", fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: -0.5, color: selected ? c.orange : c.ink }}>
                          {sport.label}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {/* Single sport: subformat + config */}
                {!isMultiSport && events.map((ev, i) => {
                  const subformats = SPORT_SUBFORMATS[ev.sport_key] || [];
                  return (
                    <div key={`sf-${ev.sport_key}-${i}`}>
                      {subformats.length > 1 && (
                        <div style={{ marginBottom: 16 }}>
                          <div style={{ fontFamily: "var(--font-display)", fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: 2, color: c.orange, marginBottom: 8 }}>
                            {si(ev.sport_key)} {sl(ev.sport_key)} — Pick Format
                          </div>
                          {subformats.map(sf => (
                            <div key={sf.key}
                              style={{ ...selStyle(ev.subformat_key === sf.key), padding: "10px 14px", marginBottom: 6 }}
                              onClick={() => setSubformat(i, sf.key)}>
                              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                <div style={{
                                  width: 20, height: 20, borderRadius: "50%", flexShrink: 0,
                                  background: ev.subformat_key === sf.key ? c.orange : "transparent",
                                  border: `2px solid ${ev.subformat_key === sf.key ? c.orange : c.border}`,
                                  display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: c.bg,
                                }}>
                                  {ev.subformat_key === sf.key && "✓"}
                                </div>
                                <div>
                                  <div style={{ fontFamily: "var(--font-display)", fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: -0.5, color: ev.subformat_key === sf.key ? c.orange : c.ink }}>
                                    {sf.label}
                                  </div>
                                  <div style={{ fontSize: 11, color: c.muted, marginTop: 1 }}>{sf.sub}</div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {(() => {
                        const sf = getSubformat(ev.sport_key, ev.subformat_key);
                        if (!sf?.configFields?.length) return null;
                        return (
                          <div style={{ background: "var(--elevated)", border: `1px solid ${c.border}`, borderRadius: 8, padding: "14px 16px", marginBottom: 12 }}>
                            <div style={{ fontFamily: "var(--font-display)", fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: 2, color: c.orange, marginBottom: 12 }}>
                              {si(ev.sport_key)} {sl(ev.sport_key)} — {sf.label} Config
                            </div>
                            {sf.configFields.map(field => (
                              <div key={field.key} style={{ marginBottom: 10 }}>
                                <label style={{ display: "block", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: c.muted, marginBottom: 8 }}>
                                  {field.label}
                                </label>
                                {field.type === "select" ? (
                                  <select className="input"
                                    value={ev.sport_config?.[field.key] ?? field.default}
                                    onChange={e => {
                                      const raw = e.target.value;
                                      const isNumeric = typeof field.options[0]?.v === "number";
                                      updateEventConfig(i, field.key, isNumeric ? parseInt(raw) : raw);
                                    }}>
                                    {field.options.map(o => <option key={o.v} value={o.v}>{o.label}</option>)}
                                  </select>
                                ) : field.type === "number" ? (
                                  <input className="input" type="number" min={field.min} style={{ width: 120 }}
                                    value={ev.sport_config?.[field.key] ?? field.default}
                                    onChange={e => {
                                      const raw = e.target.value;
                                      if (raw === "") return updateEventConfig(i, field.key, "");
                                      updateEventConfig(i, field.key, Math.max(field.min ?? 0, parseInt(raw) || 0));
                                    }} />
                                ) : (
                                  <Stepper
                                    value={ev.sport_config?.[field.key] ?? field.default}
                                    onChange={v => updateEventConfig(i, field.key, v)}
                                    min={field.min}
                                    max={field.max}
                                    quickPicks={field.quickPicks}
                                  />
                                )}
                                {field.hint && <div style={{ fontSize: 11, color: c.muted, marginTop: 6 }}>{field.hint}</div>}
                              </div>
                            ))}
                          </div>
                        );
                      })()}
                    </div>
                  );
                })}

                {/* Multi-sport: selected sports summary */}
                {isMultiSport && events.length > 0 && (
                  <div style={{ background: "var(--elevated)", border: `1px solid ${c.border}`, borderRadius: 8, padding: "12px 16px", marginBottom: 16 }}>
                    <div style={{ fontFamily: "var(--font-display)", fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: 2, color: c.muted, marginBottom: 8 }}>
                      {events.length} sport{events.length !== 1 ? "s" : ""} selected
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {events.map(ev => (
                        <span key={ev.sport_key} className="pill pill-orange">
                          {si(ev.sport_key)} {sl(ev.sport_key)}
                        </span>
                      ))}
                    </div>
                    <div style={{ fontSize: 11, color: c.muted, marginTop: 10 }}>
                      Formats and detailed settings are configured from the tournament dashboard after creation.
                    </div>
                  </div>
                )}

                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 16 }}>
                  <button className="btn btn-outline" onClick={back}>← Back</button>
                  <button className="btn btn-primary" onClick={next} disabled={!canAdvance()}>
                    {isMultiSport ? "Continue to Details →" : "Continue →"}
                  </button>
                </div>
              </div>
            )}

            {/* ── STEP 3: Match structure — single sport only ── */}
            {step === 3 && (
              <div className="card">
                <StepHeading text="How should matches run?" />
                <p style={{ fontSize: 13, color: c.muted, marginBottom: 18 }}>Tap a card — we'll move you on automatically.</p>

                {events.map((ev, i) => {
                  const sf = getSubformat(ev.sport_key, ev.subformat_key);
                  return (
                    <div key={`${ev.sport_key}-${i}`} style={{ marginBottom: 20 }}>
                      {events.length > 1 && (
                        <div style={{ fontFamily: "var(--font-display)", fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: 2, color: c.orange, marginBottom: 10, paddingTop: 10, borderTop: `1px solid ${c.border}` }}>
                          {si(ev.sport_key)} {sl(ev.sport_key)} — {sf?.label || ""}
                        </div>
                      )}
                      {FORMATS.map(f => (
                        <div key={f.value}
                          style={{ ...selStyle(ev.format === f.value), padding: "12px 14px", marginBottom: 6 }}
                          onClick={() => pickStructure(i, f.value)}>
                          <div style={{ fontFamily: "var(--font-display)", fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: -0.5, color: ev.format === f.value ? c.orange : c.ink }}>
                            {f.label}
                          </div>
                          <div style={{ fontSize: 11, color: c.muted, marginTop: 2 }}>{f.sub}</div>
                        </div>
                      ))}
                    </div>
                  );
                })}

                <div style={{ display: "flex", justifyContent: "flex-start", marginTop: 8 }}>
                  <button className="btn btn-outline" onClick={back}>← Back</button>
                </div>
              </div>
            )}

            {/* ── STEP 4: Details ── */}
            {step === 4 && (
              <div className="card">
                <StepHeading text="Name it & set the venue" />
                <p style={{ fontSize: 13, color: c.muted, marginBottom: 18 }}>Just two fields — everything else is optional.</p>

                <div className="field">
                  <label>Tournament Name *</label>
                  <input className="input" autoFocus placeholder="e.g. Tenx Championship 2026"
                    value={name} onChange={e => setName(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && name.trim() && next()} />
                </div>

                <div className="field">
                  <label>Venue</label>
                  <VenuePicker value={venueObj} onChange={handleVenueSelect} placeholder="Search venue, stadium, ground…" />
                </div>

                {/* City — dropdown of supported cities (state is derived from it) */}
                <CitySelect city={city} onChange={setCity} />

                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 16 }}>
                  <button className="btn btn-outline" onClick={back}>← Back</button>
                  <button className="btn btn-primary" onClick={next} disabled={!name.trim()}>Review →</button>
                </div>
              </div>
            )}

            {/* ── STEP 5: Review ── */}
            {step === 5 && (
              <div className="card">
                <StepHeading text="Look good?" />
                <p style={{ fontSize: 13, color: c.muted, marginBottom: 20 }}>Tap any row to jump back and change it.</p>

                {reviewRows.map(([k, v, targetStep]) => (
                  <div key={k}
                    onClick={targetStep ? () => setStep(targetStep) : undefined}
                    style={{
                      display: "flex", justifyContent: "space-between", alignItems: "flex-start",
                      padding: "8px 0", borderBottom: `1px solid ${c.border}`,
                      cursor: targetStep ? "pointer" : "default",
                    }}>
                    <span style={{ fontFamily: "var(--font-display)", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: c.muted }}>{k}</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: c.ink, textAlign: "right" }}>{v}</span>
                  </div>
                ))}

                <div
                  onClick={() => setStep(2)}
                  style={{ background: "var(--elevated)", border: `1px solid ${c.border}`, borderRadius: 8, padding: "14px 16px", marginTop: 16, cursor: "pointer" }}
                >
                  <div style={{ fontFamily: "var(--font-display)", fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: 2, color: c.orange, marginBottom: 12 }}>
                    Events ({events.length})
                  </div>

                  {events.map((ev, i) => {
                    if (isMultiSport) {
                      // Multi-sport: organiser hasn't configured anything yet.
                      // Don't show participant type or format — it's all "setup after creation".
                      return (
                        <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: i < events.length - 1 ? `1px solid ${c.border}` : "none" }}>
                          <span style={{ fontSize: 22 }}>{si(ev.sport_key)}</span>
                          <span style={{ fontFamily: "var(--font-display)", fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: -0.5, color: c.ink, flex: 1 }}>
                            {sl(ev.sport_key)}
                          </span>
                          <span className="pill pill-gray">Setup after creation</span>
                        </div>
                      );
                    }

                    // Single-sport: show full configured details
                    const sf        = getSubformat(ev.sport_key, ev.subformat_key);
                    const evName    = ev.name.trim() || `${sl(ev.sport_key)} ${sf?.label || ""}`.trim();
                    const pType     = sf?.participant_type || ev.participant_type;
                    const isDoubles = pType === "doubles_pair";
                    const isTeam    = pType === "team";
                    return (
                      <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "8px 0", borderBottom: i < events.length - 1 ? `1px solid ${c.border}` : "none" }}>
                        <div>
                          <div style={{ fontWeight: 700, color: c.ink, fontSize: 13 }}>
                            {si(ev.sport_key)} {evName}
                          </div>
                          <div style={{ display: "flex", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
                            {isDoubles && <span className="pill pill-gold">Doubles Pairs</span>}
                            {isTeam    && <span className="pill pill-orange">Team Sport</span>}
                            {!isDoubles && !isTeam && <span className="pill pill-green">Individual</span>}
                            {ev.sport_config?.squad_size  && <span className="pill pill-gray">{ev.sport_config.squad_size} per squad</span>}
                            {ev.sport_config?.team_size   && <span className="pill pill-gray">{ev.sport_config.team_size}-a-side</span>}
                            {ev.sport_config?.substitutes != null && ev.sport_config.team_size && (
                              <span className="pill pill-gray">+{ev.sport_config.substitutes} subs</span>
                            )}
                          </div>
                        </div>
                        <span style={{ fontSize: 11, color: c.muted, textAlign: "right", flexShrink: 0, marginLeft: 8 }}>
                          {ev.format ? fl(ev.format) : "—"}
                        </span>
                      </div>
                    );
                  })}

                  {isMultiSport && (
                    <div style={{ fontSize: 11, color: c.muted, marginTop: 10, paddingTop: 10, borderTop: `1px solid ${c.border}` }}>
                      ℹ️ Sport formats and participant settings are configured from the tournament dashboard after creation.
                    </div>
                  )}
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 20 }}>
                  <button className="btn btn-gradient btn-lg" style={{ fontSize: 13, width: "100%" }} onClick={handleCreate} disabled={loading}>
                    {loading ? "Creating…" : "Create Tournament →"}
                  </button>
                  <button className="btn btn-outline" style={{ width: "100%" }} onClick={back}>← Back</button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
