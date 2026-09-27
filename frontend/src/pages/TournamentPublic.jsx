/**
 * TournamentPublic — public spectator page.
 * Single-scroll layout with section nav. No tabs.
 * Sections: Register | Fixtures | Leaderboard | Road to Final
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getTournamentBySlug, getSportTournament } from "../api/client";
import RoadToFinal from "../components/shared/RoadToFinal";
import PageLoader from "../components/shared/PageLoader";
import SiteFooter from "../components/shared/SiteFooter";
import { ShareButton } from "../components/shared/ShareButton";
import { useShare } from "../hooks/useShare";
import usePageMeta from "../hooks/usePageMeta";

const API_BASE = import.meta.env.VITE_API_URL || "/api";

// ── Responsive hook ───────────────────────────────────────────
function useW() {
  const [w, setW] = useState(() => typeof window !== "undefined" ? window.innerWidth : 1280);
  useEffect(() => {
    const h = () => setW(window.innerWidth);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);
  return w;
}

// ── Sport meta ────────────────────────────────────────────────
const SPORT_META = {
  table_tennis: { icon: "🏓", label: "Table Tennis" },
  badminton:    { icon: "🏸", label: "Badminton"    },
  cricket:      { icon: "🏏", label: "Cricket"      },
  football:     { icon: "⚽", label: "Football"     },
};
const sa = k => SPORT_META[k]?.icon || "🏆";
const sl = k => SPORT_META[k]?.label  || k;

function getRegMode(ev) {
  const pt = ev?.participant_type || "individual";
  if (pt === "team")         return "team";
  if (pt === "doubles_pair") return "doubles";
  return "individual";
}

async function apiPost(path, body) {
  const r = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.detail || "Request failed"); }
  return r.json();
}

const registerIndividual = (tId, p) => apiPost(`/public/tournaments/${tId}/register`, p);
const registerPair       = (tId, p) => apiPost(`/public/tournaments/${tId}/register-team`, p);
const registerTeam       = (tId, p) => apiPost(`/public/tournaments/${tId}/register-team`, p);

// ── Compute standings from match data ────────────────────────
// Builds one standings row-set per raw match list (see computeStandings below
// for the group-splitting wrapper around this).
function buildStandingsTable(matches) {
  const table = {};
  for (const m of matches) {
    if (m.status !== "done" && m.status !== "live") continue;
    const n1 = m.player_1?.name;
    const n2 = m.player_2?.name;
    if (!n1 || !n2 || n1 === "TBD" || n2 === "TBD") continue;

    if (!table[n1]) table[n1] = { name: n1, p: 0, w: 0, d: 0, l: 0, sf: 0, sa: 0, pts: 0 };
    if (!table[n2]) table[n2] = { name: n2, p: 0, w: 0, d: 0, l: 0, sf: 0, sa: 0, pts: 0 };

    table[n1].p++; table[n2].p++;
    table[n1].sf += m.player_1?.score ?? 0;
    table[n1].sa += m.player_2?.score ?? 0;
    table[n2].sf += m.player_2?.score ?? 0;
    table[n2].sa += m.player_1?.score ?? 0;

    if (m.status === "done") {
      if (m.player_1?.is_winner)      { table[n1].w++; table[n1].pts += 3; table[n2].l++; }
      else if (m.player_2?.is_winner) { table[n2].w++; table[n2].pts += 3; table[n1].l++; }
      else                            { table[n1].d++; table[n1].pts++; table[n2].d++; table[n2].pts++; }
    }
  }

  return Object.values(table).sort((a, b) =>
    b.pts - a.pts || b.w - a.w || (b.sf - b.sa) - (a.sf - a.sa)
  );
}

// group_knockout events run each group as its own mini bracket, built with
// the same generic engine as the real championship — so a group's internal
// matches can carry stage="semi"/"final" too, not just "group". Matches
// with a `group` name are what actually belong to a group stage regardless
// of their internal stage label; everything else is the championship bracket
// and is excluded from the group standings table entirely.
// Returns [{ group: "Group A" | null, rows: [...] }, ...] — one entry per
// named group (alphabetical), or a single ungrouped entry for round_robin.
function computeStandings(event) {
  const matches = event.all_matches || [];
  const isRR    = event.format === "round_robin";

  if (isRR) {
    return [{ group: null, rows: buildStandingsTable(matches) }];
  }

  const groupMatches = matches.filter(m => m.group);
  const names = [...new Set(groupMatches.map(m => m.group))]
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));

  if (!names.length) {
    // No group info on the matches (legacy data) — fall back to one flat table
    // rather than showing nothing.
    return [{ group: null, rows: buildStandingsTable(matches) }];
  }

  return names.map(name => ({
    group: name,
    rows: buildStandingsTable(groupMatches.filter(m => m.group === name)),
  }));
}

// ── Form header (shared) ──────────────────────────────────────
function FormHeader({ event, subtitle, onBack }) {
  return (
    <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:20, paddingBottom:16, borderBottom:"1px solid var(--border)" }}>
      <button onClick={onBack} style={{ background:"none", border:"none", cursor:"pointer", color:"var(--muted)", fontSize:22, padding:"0 2px", lineHeight:1 }}>←</button>
      <div style={{ width:32, height:32, borderRadius:6, background:"var(--primary-dim)", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"var(--font-display)", fontSize:11, fontWeight:900, color:"var(--primary)" }}>
        {sa(event.sport_key)}
      </div>
      <div>
        <div style={{ fontFamily:"var(--font-display)", fontSize:14, fontWeight:900, textTransform:"uppercase", letterSpacing:-0.5, color:"var(--ink)" }}>{event.name}</div>
        <div style={{ fontSize:12, color:"var(--muted)", marginTop:1 }}>{subtitle}</div>
      </div>
    </div>
  );
}

// ── Individual registration form ──────────────────────────────
function IndividualForm({ event, tournament, onSuccess, onBack }) {
  const [form,    setForm]    = useState({ name:"", phone:"", age:"", gender:"Male" });
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");

  const submit = async () => {
    if (!form.name.trim())  return setError("Name is required.");
    if (!form.phone.trim()) return setError("Phone number is required.");
    setLoading(true); setError("");
    try {
      await registerIndividual(tournament.tournament_id, {
        name: form.name.trim(), phone: form.phone.trim(),
        age: parseInt(form.age) || null, gender: form.gender,
        event_ids: [event.event_id],
      });
      onSuccess(form.name.trim());
    } catch(e) { setError(e.message); } finally { setLoading(false); }
  };

  return (
    <div>
      <FormHeader event={event} subtitle="Individual Registration" onBack={onBack} />
      {error && <div className="pub-error">{error}</div>}
      <div className="field">
        <label>Your Name *</label>
        <input className="input" autoFocus placeholder="e.g. Rahul Sharma"
          value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
      </div>
      <div className="field">
        <label>Phone *</label>
        <input className="input" type="tel" placeholder="9876543210"
          value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
      </div>
      <div className="field-row">
        <div className="field">
          <label>Age</label>
          <input className="input" type="number" placeholder="24" min="5" max="99"
            value={form.age} onChange={e => setForm(f => ({ ...f, age: e.target.value }))} />
        </div>
        <div className="field">
          <label>Gender</label>
          <select className="input" value={form.gender} onChange={e => setForm(f => ({ ...f, gender: e.target.value }))}>
            <option>Male</option><option>Female</option><option>Other</option>
          </select>
        </div>
      </div>
      <p style={{ fontSize:11, color:"var(--muted)", marginBottom:14 }}>Your details are only used for this tournament.</p>
      <button className="btn btn-gradient btn-lg" style={{ width:"100%" }} onClick={submit} disabled={loading}>
        {loading ? "Registering…" : "Register →"}
      </button>
    </div>
  );
}

// ── Doubles form ──────────────────────────────────────────────
function DoublesForm({ event, tournament, onSuccess, onBack }) {
  const isMixed = event.sport_config?.mixed;
  const [form,    setForm]    = useState({ p1:"", p2:"", phone:"" });
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");

  const submit = async () => {
    if (!form.p1.trim()) return setError(`${isMixed ? "Male player" : "Player 1"} name is required.`);
    if (!form.p2.trim()) return setError(`${isMixed ? "Female player" : "Player 2"} name is required.`);
    if (form.p1.trim().toLowerCase() === form.p2.trim().toLowerCase())
      return setError("Both players must be different people.");
    setLoading(true); setError("");
    try {
      await registerPair(tournament.tournament_id, {
        name: `${form.p1.trim()} & ${form.p2.trim()}`,
        contact_phone: form.phone.trim() || "",
        sport_key: event.sport_key, event_id: event.event_id,
        members: [
          { name: form.p1.trim(), role: isMixed ? "male"    : "player1" },
          { name: form.p2.trim(), role: isMixed ? "female"  : "player2" },
        ],
      });
      onSuccess(`${form.p1.trim()} & ${form.p2.trim()}`);
    } catch(e) { setError(e.message); } finally { setLoading(false); }
  };

  return (
    <div>
      <FormHeader event={event} subtitle={isMixed ? "Mixed Doubles" : "Doubles Pair Registration"} onBack={onBack} />
      {error && <div className="pub-error">{error}</div>}
      <div style={{ background:"var(--elevated)", border:"1px solid var(--border)", borderRadius:8, padding:"10px 14px", marginBottom:16, fontSize:12, color:"var(--muted)", lineHeight:1.5 }}>
        Enter both partners. The organiser will confirm and seed the draw.
      </div>
      <div style={{ border:"2px solid var(--border)", borderLeft:"4px solid var(--primary)", borderRadius:8, padding:"14px 16px", marginBottom:10, background:"var(--surface)" }}>
        <div style={{ fontFamily:"var(--font-display)", fontSize:10, fontWeight:800, textTransform:"uppercase", letterSpacing:2, color:"var(--primary)", marginBottom:10 }}>
          {isMixed ? "Male Player *" : "Player 1 *"}
        </div>
        <input className="input" autoFocus placeholder="Full name"
          value={form.p1} onChange={e => setForm(f => ({ ...f, p1: e.target.value }))} />
      </div>
      <div style={{ border:"2px solid var(--border)", borderLeft:"4px solid #92700A", borderRadius:8, padding:"14px 16px", marginBottom:14, background:"var(--surface)" }}>
        <div style={{ fontFamily:"var(--font-display)", fontSize:10, fontWeight:800, textTransform:"uppercase", letterSpacing:2, color:"#92700A", marginBottom:10 }}>
          {isMixed ? "Female Player *" : "Player 2 *"}
        </div>
        <input className="input" placeholder="Full name"
          value={form.p2} onChange={e => setForm(f => ({ ...f, p2: e.target.value }))} />
      </div>
      <div className="field">
        <label>Contact Phone (optional)</label>
        <input className="input" type="tel" placeholder="9876543210"
          value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
      </div>
      <button className="btn btn-gradient btn-lg" style={{ width:"100%" }} onClick={submit} disabled={loading}>
        {loading ? "Registering…" : "Register Pair →"}
      </button>
    </div>
  );
}

// ── Team registration form ────────────────────────────────────
function TeamRegistrationForm({ event, tournament, onSuccess, onBack }) {
  const cfg        = event.sport_config || {};
  const teamSize   = cfg.team_size   || 11;
  const subs       = cfg.substitutes || 0;
  const totalSlots = teamSize + subs;

  const emptyMember = (role) => ({ name: "", role, jersey: "", age: "" });
  const [teamName, setTeamName] = useState("");
  const [phone,    setPhone]    = useState("");
  const [members,  setMembers]  = useState(() => [
    emptyMember("captain"),
    emptyMember("vice_captain"),
    ...Array.from({ length: Math.max(0, Math.min(totalSlots - 2, 9)) }, () => emptyMember("player")),
  ]);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState("");

  const updateMember = (i, field, val) =>
    setMembers(prev => prev.map((m, idx) => idx === i ? { ...m, [field]: val } : m));
  const addSlot = () => setMembers(prev => [...prev, emptyMember("player")]);
  const removeSlot = (i) => setMembers(prev => prev.filter((_, idx) => idx !== i));

  const submit = async () => {
    if (!teamName.trim()) return setError("Team name is required.");
    const captain = members.find(m => m.role === "captain" && m.name.trim());
    if (!captain)         return setError("Captain name is required.");
    const valid = members
      .filter(m => m.name.trim())
      .map(m => ({
        name:          m.name.trim(),
        role:          m.role,
        jersey_number: m.jersey ? parseInt(m.jersey) || null : null,
        age:           m.age    ? parseInt(m.age)    || null : null,
      }));
    setLoading(true); setError("");
    try {
      await registerTeam(tournament.tournament_id, {
        name:          teamName.trim(),
        contact_phone: phone.trim(),
        sport_key:     event.sport_key,
        event_ids:     [event.event_id],
        members:       valid,
      });
      onSuccess(teamName.trim());
    } catch(e) { setError(e.message); } finally { setLoading(false); }
  };

  const roleLabel = r => r === "vice_captain" ? "Vice Captain" : r.charAt(0).toUpperCase() + r.slice(1);
  const roleOptions = ["captain", "vice_captain", "player"];

  return (
    <div>
      <FormHeader event={event} subtitle="Team Registration" onBack={onBack} />
      {error && <div className="pub-error">{error}</div>}

      {/* Team details */}
      <div className="field">
        <label>Team Name *</label>
        <input className="input" autoFocus placeholder="e.g. FC Rangers"
          value={teamName} onChange={e => setTeamName(e.target.value)} />
      </div>
      <div className="field">
        <label>Captain's Contact Phone</label>
        <input className="input" type="tel" placeholder="9876543210"
          value={phone} onChange={e => setPhone(e.target.value)} />
      </div>

      {/* Squad size hint */}
      <div style={{ background:"var(--elevated)", border:"1px solid var(--border)", borderRadius:8, padding:"8px 14px", marginBottom:16, fontSize:12, color:"var(--muted)", lineHeight:1.5 }}>
        {sl(event.sport_key)} · {teamSize} on field{subs > 0 ? ` + ${subs} subs` : ""} · Fill in your full squad below
      </div>

      {/* Column headers */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 58px 52px 130px 28px", gap:6, marginBottom:4 }}>
        {["Player Name","Jersey","Age","Role",""].map(h => (
          <span key={h} style={{ fontSize:10, fontWeight:800, textTransform:"uppercase", letterSpacing:1, color:"var(--muted)" }}>{h}</span>
        ))}
      </div>

      {/* Roster rows */}
      {members.map((m, i) => (
        <div key={i} style={{ display:"grid", gridTemplateColumns:"1fr 58px 52px 130px 28px", gap:6, marginBottom:6, alignItems:"center" }}>
          <input className="input"
            placeholder={i === 0 ? "Captain *" : i === 1 ? "Vice Captain" : `Player ${i + 1}`}
            value={m.name} onChange={e => updateMember(i, "name", e.target.value)} />
          <input className="input" type="number" placeholder="#" style={{ textAlign:"center" }}
            value={m.jersey} onChange={e => updateMember(i, "jersey", e.target.value)} />
          <input className="input" type="number" placeholder="Age" min="5" max="60" style={{ textAlign:"center" }}
            value={m.age} onChange={e => updateMember(i, "age", e.target.value)} />
          <select className="input" value={m.role} onChange={e => updateMember(i, "role", e.target.value)}>
            {roleOptions.map(r => <option key={r} value={r}>{roleLabel(r)}</option>)}
          </select>
          <button onClick={() => removeSlot(i)} disabled={members.length <= 1}
            style={{ background:"none", border:"none", color:"var(--muted)", cursor:"pointer", fontSize:18, padding:0, opacity: members.length <= 1 ? 0.3 : 1 }}>×</button>
        </div>
      ))}

      {members.length < totalSlots + 3 && (
        <button onClick={addSlot} style={{ width:"100%", padding:"8px 0", background:"none", border:"1.5px dashed var(--border)", borderRadius:6, color:"var(--muted)", fontFamily:"var(--font-display)", fontSize:11, fontWeight:700, letterSpacing:1, textTransform:"uppercase", cursor:"pointer", marginBottom:16, marginTop:4 }}>
          + Add Player
        </button>
      )}

      <p style={{ fontSize:11, color:"var(--muted)", marginBottom:14 }}>
        {members.filter(m => m.name.trim()).length} of {totalSlots} roster slots filled
      </p>
      <button className="btn btn-gradient btn-lg" style={{ width:"100%" }} onClick={submit} disabled={loading}>
        {loading ? "Registering…" : "Register Team →"}
      </button>
    </div>
  );
}

// ── Success screen ────────────────────────────────────────────
function SuccessView({ name, event, onBack }) {
  return (
    <div style={{ textAlign:"center", padding:"36px 0" }}>
      <div style={{ width:64, height:64, borderRadius:"50%", background:"rgba(34,197,94,0.12)", border:"2px solid rgba(34,197,94,0.3)", margin:"0 auto 16px", display:"flex", alignItems:"center", justifyContent:"center", fontSize:28 }}>✓</div>
      <div style={{ fontFamily:"var(--font-display)", fontSize:22, fontWeight:900, textTransform:"uppercase", letterSpacing:-1, color:"#16a34a", marginBottom:10 }}>
        You're In!
      </div>
      <p style={{ fontSize:14, color:"var(--muted)", lineHeight:1.7, marginBottom:24 }}>
        <strong style={{ color:"var(--ink)" }}>{name}</strong> has been registered for{" "}
        <strong style={{ color:"var(--ink)" }}>{event?.name}</strong>.
      </p>
      <div style={{ background:"rgba(34,197,94,0.08)", border:"1px solid rgba(34,197,94,0.25)", borderRadius:8, padding:"12px 18px", marginBottom:20, fontFamily:"var(--font-display)", fontSize:11, fontWeight:700, textTransform:"uppercase", letterSpacing:1, color:"#16a34a" }}>
        Share this page with other participants!
      </div>
      <button className="btn btn-outline" onClick={onBack}>← Register Someone Else</button>
    </div>
  );
}

// ── Event card (registration browse) ─────────────────────────
function EventCard({ event, onClick }) {
  const mode = getRegMode(event);
  const modeLabel = { team:"Team Sport", doubles:"Doubles Pair", individual:"Individual" }[mode];
  return (
    <div onClick={onClick} style={{ display:"flex", alignItems:"center", gap:14, padding:"14px 16px", borderRadius:14, marginBottom:8, background:"var(--surface)", border:"1.5px solid var(--border)", borderLeft:"4px solid var(--accent)", cursor:"pointer", boxShadow:"var(--sh-sm)", transition:"box-shadow .15s" }}
      onMouseEnter={e => e.currentTarget.style.boxShadow = "var(--accent-glow), var(--sh-sm)"}
      onMouseLeave={e => e.currentTarget.style.boxShadow = "var(--sh-sm)"}
    >
      <div style={{ width:44, height:44, borderRadius:12, background:"var(--accent-dim)", border:"1px solid var(--accent-border)", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, fontFamily:"var(--font-display)", fontSize:12, fontWeight:900, color:"var(--accent)" }}>
        {sa(event.sport_key)}
      </div>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontFamily:"var(--font-display)", fontSize:13, fontWeight:900, textTransform:"uppercase", letterSpacing:"-0.5px", color:"var(--ink)", marginBottom:6 }}>{event.name}</div>
        <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
          <span style={{ fontFamily:"var(--font-display)", fontSize:8, fontWeight:900, textTransform:"uppercase", letterSpacing:1, background:"var(--accent-dim)", color:"var(--accent)", border:"1px solid var(--accent-border)", padding:"2px 8px", borderRadius:20 }}>{modeLabel}</span>
          {event.format && <span style={{ fontFamily:"var(--font-display)", fontSize:8, fontWeight:900, textTransform:"uppercase", letterSpacing:1, background:"var(--elevated)", color:"var(--muted)", border:"1px solid var(--border)", padding:"2px 8px", borderRadius:20 }}>{event.format.replace(/_/g, " ")}</span>}
        </div>
      </div>
      <div style={{ color:"var(--accent)", fontSize:20, flexShrink:0 }}>›</div>
    </div>
  );
}

// ── Sport accent colours ──────────────────────────────────────
const SPORT_ACCENT_CFG = {
  cricket:      { accent:"#16a34a", rgb:"22,163,74"   },
  football:     { accent:"#2563eb", rgb:"37,99,235"   },
  badminton:    { accent:"#7c3aed", rgb:"124,58,237"  },
  table_tennis: { accent:"#0891b2", rgb:"8,145,178"   },
};
// Per-sport colors used inline (for multi-event pages)
const SPORT_ACCENT = {
  cricket:      { color:"#16a34a", dim:"rgba(22,163,74,0.12)"   },
  football:     { color:"#2563eb", dim:"rgba(37,99,235,0.12)"   },
  badminton:    { color:"#7c3aed", dim:"rgba(124,58,237,0.12)"  },
  table_tennis: { color:"#0891b2", dim:"rgba(8,145,178,0.12)"   },
};
const sAccent = (key) => SPORT_ACCENT[key] || { color:"var(--primary)", dim:"var(--primary-dim)" };

function applyAccent(sportKey) {
  const s = SPORT_ACCENT_CFG[sportKey];
  if (!s) return;
  const r = document.documentElement;
  r.style.setProperty("--accent",        s.accent);
  r.style.setProperty("--accent-dim",    `rgba(${s.rgb},.12)`);
  r.style.setProperty("--accent-border", `rgba(${s.rgb},.22)`);
  r.style.setProperty("--accent-glow",   `0 0 20px rgba(${s.rgb},.2)`);
  r.style.setProperty("--accent-rgb",    s.rgb);
}

// ── Penalty dot (public viewer) ───────────────────────────────
function PenDot({ result }) {
  const scored = result === "H";
  const missed = result === "M";
  return (
    <span style={{
      display:"inline-flex", alignItems:"center", justifyContent:"center",
      width:18, height:18, borderRadius:"50%", fontSize:9, fontWeight:900,
      background: scored ? "#16a34a" : missed ? "#dc2626" : "transparent",
      border: !scored && !missed ? "1.5px solid #444" : "none",
      color:"#fff", flexShrink:0,
    }}>
      {scored ? "✓" : missed ? "✗" : ""}
    </span>
  );
}

// Shared stage-name lookup — used by the match detail modal's header
// (a full-screen view, where the stage/round label is useful context,
// unlike the card grid where it repeated on every card).
const STAGE_CHIP_LABELS = {
  group: "Group Stage", quarter: "Quarterfinal",
  semi: "Semifinal", final: "Final", third_place: "3rd Place",
};

// ── Table/court badge ───────────────────────────────────────────
// The round/stage label used to live here too (e.g. "Group Stage · Round 1")
// but every card in a group repeated the same "Group Stage" text — the
// collapsible group header above the grid already says which group and
// round-robin round these matches belong to, so it's dropped entirely
// rather than shown on every single card.
function TableBadge({ table }) {
  if (!table) return null;
  return (
    <span style={{
      fontSize:9, fontWeight:700, color:"var(--muted)",
      background:"var(--elevated)", border:"1px solid var(--border)",
      padding:"3px 8px", borderRadius:5, whiteSpace:"nowrap",
    }}>
      Table {table}
    </span>
  );
}

// ── Live / Done status pill ───────────────────────────────────
function StatusPill({ isLive, isDone }) {
  if (isLive) return (
    <span className="pill pill-orange" style={{ fontSize:9, padding:"2px 6px", display:"flex", alignItems:"center", gap:3, whiteSpace:"nowrap" }}>
      <span className="live-dot" style={{ width:5, height:5, background:"var(--primary)" }}/>LIVE
    </span>
  );
  if (isDone) return <span className="pill pill-green" style={{ fontSize:9, padding:"2px 6px" }}>FT</span>;
  return null;
}

// ── Cricket match card ────────────────────────────────────────
function CricketCard({ m, sponsorFooter }) {
  const isLive = m.status === "live";
  const isDone = m.status === "done";
  const ls     = m.live_state || {};
  const battingFirst   = ls.batting_first   || 1;
  const soFirst        = ls.super_over_batting_first || battingFirst;
  const currentInnings = ls.current_innings || 1;
  const completedSets  = (m.sets || []).filter(s => s.is_complete).sort((a, b) => a.set_number - b.set_number);
  const p1Name = m.player_1?.name || "TBD";
  const p2Name = m.player_2?.name || "TBD";
  const maxInn = isDone ? completedSets.length : (isLive ? currentInnings : 0);
  const inningsData = Array.from({ length: maxInn }, (_, idx) => {
    const innNum         = idx + 1;
    const isSuperOverInnings = innNum >= 3;
    const effectiveBatFirst  = isSuperOverInnings ? soFirst : battingFirst;
    const battingPos     = (innNum % 2 === 1) ? effectiveBatFirst : (3 - effectiveBatFirst);
    const teamName       = battingPos === 1 ? p1Name : p2Name;
    const isP1           = battingPos === 1;
    const set            = completedSets.find(s => s.set_number === innNum);
    const isActiveLive   = isLive && innNum === currentInnings;
    const runs    = set ? set.score_p1 : (isActiveLive ? ls.runs    || 0 : 0);
    const wickets = set ? set.score_p2 : (isActiveLive ? ls.wickets || 0 : 0);
    const overs   = isActiveLive ? ls.overs : null;
    const isWinner = isDone && (isP1 ? m.player_1?.is_winner : m.player_2?.is_winner);
    return { innNum, teamName, isP1, runs, wickets, overs, isComplete: !!set, isActiveLive, isWinner, isSuperOverInnings };
  });
  const target = inningsData[0] ? inningsData[0].runs + 1 : null;

  const inn1 = completedSets.find(s => s.set_number === 1);
  const inn2 = completedSets.find(s => s.set_number === 2);
  const inn3 = completedSets.find(s => s.set_number === 3);
  const inn4 = completedSets.find(s => s.set_number === 4);
  const hasSO   = !!inn3;
  const soTied  = hasSO && inn4 && inn3.score_p1 === inn4.score_p1;

  let winMargin = null;
  if (isDone && completedSets.length >= 2) {
    if (hasSO && soTied) {
      winMargin = "🪙 Decided by Coin Toss";
    } else if (hasSO && inn4) {
      const soBat2ndWon = (soFirst === 1 ? 2 : 1) === 1 ? m.player_1?.is_winner : m.player_2?.is_winner;
      if (soBat2ndWon) { const w = 2 - inn4.score_p2; winMargin = `⚡ Super Over — Won by ${w} wicket${w !== 1 ? "s" : ""}`; }
      else              { const r = inn3.score_p1 - inn4.score_p1; winMargin = `⚡ Super Over — Won by ${r} run${r !== 1 ? "s" : ""}`; }
    } else if (inn1 && inn2) {
      const bat2ndWon = battingFirst === 1 ? m.player_2?.is_winner : m.player_1?.is_winner;
      if (bat2ndWon) { const w = 10 - inn2.score_p2; winMargin = `Won by ${w} wicket${w !== 1 ? "s" : ""}`; }
      else           { const r = inn1.score_p1 - inn2.score_p1; winMargin = `Won by ${r > 0 ? r : 0} run${r !== 1 ? "s" : ""}`; }
    }
  }

  return (
    <div className={`mc${isLive ? " live" : ""}`} style={{ flexDirection:"column", gap:0, padding:0, overflow:"hidden" }}>
      {isLive && <div className="glow-bg"/>}
      <div style={{ padding:"12px 14px" }}>
        <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:8 }}>
          <TableBadge table={m.table_number} />
          <span style={{ marginLeft:"auto" }}><StatusPill isLive={isLive} isDone={isDone} /></span>
        </div>
        {inningsData.length === 0 && (
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:8 }}>
            <span style={{ flex:1, fontSize:13, fontWeight:700, color:"var(--ink)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{p1Name}</span>
            <span style={{ fontFamily:"var(--font-display)", fontSize:12, fontWeight:800, color:"var(--muted)" }}>vs</span>
            <span style={{ flex:1, fontSize:13, fontWeight:700, color:"var(--ink)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", textAlign:"right" }}>{p2Name}</span>
          </div>
        )}
        {inningsData.map((inn, idx) => {
          const isChasing  = idx === 1 && target !== null;
          const runsNeeded = isChasing && !isDone ? target - inn.runs : null;
          const showSoLabel = inn.isSuperOverInnings && (idx === 0 || !inningsData[idx-1].isSuperOverInnings);
          const soColor = "#f59e0b";
          return (
            <div key={inn.innNum}>
              {showSoLabel && (
                <div style={{ display:"flex", alignItems:"center", gap:6, padding:"5px 0 3px", borderTop:"1px solid rgba(245,158,11,.25)" }}>
                  <span style={{ fontSize:9, fontWeight:900, textTransform:"uppercase", letterSpacing:1.5, color:soColor, fontFamily:"var(--font-display)" }}>⚡ Super Over</span>
                </div>
              )}
              <div style={{ display:"flex", alignItems:"center", gap:8, padding:"6px 0", borderTop: idx > 0 && !showSoLabel ? "1px solid var(--border)" : "none" }}>
                <span style={{ width:6, height:6, borderRadius:"50%", flexShrink:0, background: inn.isActiveLive ? "var(--primary)" : inn.isSuperOverInnings ? soColor+"66" : "transparent" }} />
                <span style={{ flex:1, fontSize:13, fontWeight: inn.isWinner ? 800 : 600, color: inn.isWinner ? "#16a34a" : "var(--ink)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{inn.teamName}</span>
                <span style={{ fontFamily:"var(--font-display)", fontSize:17, fontWeight:900, color: inn.isActiveLive ? "var(--primary)" : inn.isWinner ? "#16a34a" : inn.isSuperOverInnings ? soColor : "var(--ink)", lineHeight:1 }}>
                  {inn.runs}<span style={{ fontSize:11, fontWeight:600, color:"var(--muted)" }}>/{inn.wickets}</span>
                </span>
                <span style={{ fontSize:10, color:"var(--muted)", minWidth:40, textAlign:"right", flexShrink:0 }}>
                  {inn.overs ? `(${inn.overs})` : ""}
                  {isChasing && inn.isActiveLive && runsNeeded != null && <span style={{ display:"block", fontSize:9 }}>need {runsNeeded}</span>}
                </span>
              </div>
            </div>
          );
        })}
        {winMargin && (
          <div style={{ fontSize:11, fontWeight:700, marginTop:6, paddingTop:6, borderTop:"1px solid var(--border)", color: winMargin.includes("Coin") ? "var(--primary)" : winMargin.includes("Super") ? "#f59e0b" : "#16a34a" }}>
            {winMargin}
          </div>
        )}
      </div>
      {sponsorFooter}
    </div>
  );
}

// ── Football match card ───────────────────────────────────────
function FootballCard({ m, sponsorFooter }) {
  const isLive = m.status === "live";
  const isDone = m.status === "done";
  const ls     = m.live_state || {};

  const penH1     = ls.pen_h1 || [];
  const penH2     = ls.pen_h2 || [];
  const hasPens   = penH1.length > 0 || penH2.length > 0;
  const penScore1 = penH1.filter(r => r === "H").length;
  const penScore2 = penH2.filter(r => r === "H").length;
  const penSlots  = Math.max(5, penH1.length, penH2.length);

  const fbHalf = ls.half;
  const phaseLabel = (() => {
    if (!fbHalf) return null;
    if (fbHalf >= 5) return "Penalties";
    if (fbHalf >= 3) return "Extra Time";
    return null;
  })();

  const score1 = m.player_1?.score ?? 0;
  const score2 = m.player_2?.score ?? 0;
  const p1Win  = m.player_1?.is_winner;
  const p2Win  = m.player_2?.is_winner;

  return (
    <div className={`mc${isLive ? " live" : ""}`} style={{ flexDirection:"column", gap:0, padding:0, overflow:"hidden" }}>
      {isLive && <div className="glow-bg"/>}
      <div style={{ padding:"12px 14px", display:"flex", flexDirection:"column", gap:8 }}>
        {m.table_number && (
          <div style={{ display:"flex" }}><TableBadge table={m.table_number} /></div>
        )}
        {/* Score row */}
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          {/* Team 1 */}
          <span style={{ flex:1, fontSize:13, fontWeight: p1Win ? 800 : 700, color: p1Win ? "#2563eb" : "var(--ink)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", textAlign:"right" }}>
            {m.player_1?.name || "TBD"}
          </span>

          {/* Central score block */}
          <div style={{ textAlign:"center", flexShrink:0, minWidth:60 }}>
            <div style={{ fontFamily:"var(--font-display)", fontSize: isLive || isDone ? 22 : 14, fontWeight:900, lineHeight:1, color: isLive ? "var(--primary)" : isDone ? "var(--ink)" : "var(--muted)" }}>
              {isLive || isDone ? `${score1}–${score2}` : "vs"}
            </div>
            {isLive && phaseLabel && (
              <div style={{ fontSize:8, fontWeight:800, color:"var(--muted)", textTransform:"uppercase", letterSpacing:0.5, marginTop:2 }}>{phaseLabel}</div>
            )}
          </div>

          {/* Team 2 */}
          <span style={{ flex:1, fontSize:13, fontWeight: p2Win ? 800 : 700, color: p2Win ? "#2563eb" : "var(--ink)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
            {m.player_2?.name || "TBD"}
          </span>

          <div style={{ flexShrink:0, width:40, display:"flex", justifyContent:"flex-end" }}>
            <StatusPill isLive={isLive} isDone={isDone} />
          </div>
        </div>

        {/* Penalty summary (no breakdown — tap card for details) */}
        {hasPens && isDone && (
          <div style={{ fontSize:10, fontWeight:700, color:"#3b82f6" }}>
            {penScore1}–{penScore2} on penalties
          </div>
        )}
      </div>
      {sponsorFooter}
    </div>
  );
}

// ── Default match card (Badminton / Table Tennis) ─────────────
function DefaultCard({ m, sportKey, sponsorFooter }) {
  const isLive = m.status === "live";
  const isDone = m.status === "done";
  const completedSets = (m.sets || [])
    .filter(s => s.is_complete)
    .sort((a, b) => a.set_number - b.set_number);
  const currentSet = (m.sets || []).find(s => !s.is_complete);
  const liveS1  = currentSet?.score_p1 ?? 0;
  const liveS2  = currentSet?.score_p2 ?? 0;
  const p1Win   = m.player_1?.is_winner;
  const p2Win   = m.player_2?.is_winner;
  const ac      = sAccent(sportKey);
  const server  = m.current_server;
  const deuceAt = sportKey === "badminton" ? 20 : 10;
  const inDeuce = isLive && liveS1 >= deuceAt && liveS2 >= deuceAt;
  const dcIsDeuce = inDeuce && liveS1 === liveS2;
  const dcAdvFor  = inDeuce && Math.abs(liveS1 - liveS2) === 1 ? (liveS1 > liveS2 ? 1 : 2) : null;

  const SetChip = ({ val, isWinner, isLiveChip }) => (
    <span style={{
      display:"inline-flex", alignItems:"center", justifyContent:"center",
      minWidth:24, height:22, borderRadius:4, fontSize:12, fontWeight:800,
      fontFamily:"var(--font-display)",
      background: isLiveChip ? "var(--primary-dim)" : isWinner ? ac.color : "var(--elevated)",
      color:      isLiveChip ? "var(--primary)"    : isWinner ? "#fff"    : "var(--muted)",
      border:     isLiveChip ? "1px solid rgba(255,107,53,0.4)" : "none",
    }}>
      {val}
    </span>
  );

  // Matches without a granular per-set breakdown (e.g. seeded/legacy data
  // that only recorded the final tally) would otherwise show no score at
  // all — fall back to the aggregate sets-won count on player_1/player_2.
  const showAggregateFallback = isDone && completedSets.length === 0
    && m.player_1?.score != null && m.player_2?.score != null;

  return (
    <div className={`mc${isLive ? " live" : ""}`} style={{ flexDirection:"column", gap:0, padding:0, overflow:"hidden" }}>
      {isLive && <div className="glow-bg"/>}
      <div style={{ padding:"12px 14px" }}>
        <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:8 }}>
          <TableBadge table={m.table_number} />
          <span style={{ marginLeft:"auto" }}><StatusPill isLive={isLive} isDone={isDone} /></span>
        </div>

        {/* Two-row player layout */}
        <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
          {/* Player 1 */}
          <div style={{ display:"flex", alignItems:"center", gap:5 }}>
            <div style={{ flex:1, display:"flex", alignItems:"center", gap:4, minWidth:0 }}>
              {isLive && server === 1 && <span style={{ fontSize:7, color:"var(--primary)", flexShrink:0, lineHeight:1 }}>●</span>}
              <span style={{ fontSize:13, fontWeight: p1Win ? 800 : 700, color: p1Win ? "var(--green)" : "var(--ink)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                {m.player_1?.name || "TBD"}
              </span>
            </div>
            <div style={{ display:"flex", gap:3 }}>
              {completedSets.map(s => (
                <SetChip key={s.set_number} val={s.score_p1} isWinner={s.score_p1 > s.score_p2} />
              ))}
              {isLive && <SetChip val={liveS1} isLiveChip />}
              {showAggregateFallback && <SetChip val={m.player_1.score} isWinner={p1Win} />}
            </div>
          </div>
          {/* Player 2 */}
          <div style={{ display:"flex", alignItems:"center", gap:5 }}>
            <div style={{ flex:1, display:"flex", alignItems:"center", gap:4, minWidth:0 }}>
              {isLive && server === 2 && <span style={{ fontSize:7, color:"var(--primary)", flexShrink:0, lineHeight:1 }}>●</span>}
              <span style={{ fontSize:13, fontWeight: p2Win ? 800 : 700, color: p2Win ? "var(--green)" : "var(--ink)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                {m.player_2?.name || "TBD"}
              </span>
            </div>
            <div style={{ display:"flex", gap:3 }}>
              {completedSets.map(s => (
                <SetChip key={s.set_number} val={s.score_p2} isWinner={s.score_p2 > s.score_p1} />
              ))}
              {isLive && <SetChip val={liveS2} isLiveChip />}
              {showAggregateFallback && <SetChip val={m.player_2.score} isWinner={p2Win} />}
            </div>
          </div>
          {/* Deuce / Advantage state */}
          {isLive && (dcIsDeuce || dcAdvFor) && (
            <div style={{ textAlign:"right", marginTop:2 }}>
              <span style={{ fontSize:9, fontWeight:900, color:"var(--primary)", letterSpacing:0.5 }}>
                {dcIsDeuce ? "DEUCE" : `ADV ${dcAdvFor === 1 ? (m.player_1?.name||"P1").split(" ")[0] : (m.player_2?.name||"P2").split(" ")[0]}`}
              </span>
            </div>
          )}
        </div>
      </div>
      {sponsorFooter}
    </div>
  );
}

// ── Sport-aware match card dispatcher ─────────────────────────
function MatchCard({ match: m, sportKey, sponsorFooter }) {
  if (sportKey === "cricket")  return <CricketCard  m={m} sponsorFooter={sponsorFooter} />;
  if (sportKey === "football") return <FootballCard m={m} sponsorFooter={sponsorFooter} />;
  return <DefaultCard m={m} sportKey={sportKey} sponsorFooter={sponsorFooter} />;
}

// ── Card sponsor footer strip ─────────────────────────────────
function CardSponsorFooter({ sponsor }) {
  if (!sponsor) return null;
  return (
    <div style={{ borderTop:"1px solid var(--border)", padding:"6px 14px", display:"flex", alignItems:"center", gap:7, background:"rgba(245,158,11,.03)" }}>
      <span style={{ fontFamily:"var(--font-display)", fontSize:6.5, fontWeight:800, textTransform:"uppercase", letterSpacing:1.5, color:"var(--muted)", whiteSpace:"nowrap" }}>Powered by</span>
      <div style={{ width:16, height:16, borderRadius:3, flexShrink:0, background:"var(--elevated)", border:"1px solid var(--border)", overflow:"hidden", display:"flex", alignItems:"center", justifyContent:"center" }}>
        {sponsor.logo_url
          ? <img src={sponsor.logo_url} alt={sponsor.name} style={{ width:"100%", height:"100%", objectFit:"contain" }} />
          : <span style={{ fontFamily:"var(--font-display)", fontSize:4.5, fontWeight:900, color:"var(--primary)" }}>{sponsor.name[0].toUpperCase()}</span>
        }
      </div>
      <span style={{ fontSize:10, fontWeight:600, color:"var(--muted)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{sponsor.name}</span>
    </div>
  );
}

// ── Tiered sponsor display wall ───────────────────────────────
const TIER_ORDER = ["title", "gold", "silver", "bronze", "partner"];

// Renders a sponsor card as a link when the sponsor has a website
function SponsorLink({ s, style, children }) {
  if (!s.website) return <div style={style}>{children}</div>;
  return (
    <a
      href={s.website}
      target="_blank"
      rel="noopener noreferrer"
      style={{ ...style, textDecoration: "none", cursor: "pointer" }}
    >
      {children}
    </a>
  );
}
function SponsorDisplay({ sponsors, showTitle = true, bordered = true }) {
  if (!sponsors?.length) return null;
  const byTier = (tier) => sponsors.filter(s => s.tier === tier);
  const titleSponsors = showTitle ? byTier("title") : [];
  const goldSponsors  = byTier("gold");
  const others = TIER_ORDER.slice(2).flatMap(t => byTier(t));

  if (!titleSponsors.length && !goldSponsors.length && !others.length) return null;

  const LogoBox = ({ s, size = 40, radius = 8 }) => (
    <div style={{ width:size, height:size, borderRadius:radius, flexShrink:0, background:"var(--surface)", border:"1px solid var(--border)", overflow:"hidden", display:"flex", alignItems:"center", justifyContent:"center" }}>
      {s.logo_url
        ? <img src={s.logo_url} alt={s.name} style={{ width:"100%", height:"100%", objectFit:"contain" }} />
        : <span style={{ fontFamily:"var(--font-display)", fontSize:size * 0.28, fontWeight:900, color:"var(--primary)" }}>{s.name[0].toUpperCase()}</span>
      }
    </div>
  );

  return (
    <div style={bordered ? { marginTop:16, paddingTop:14, borderTop:"1px solid var(--border)" } : undefined}>
      <div style={{ fontSize:9, fontWeight:800, textTransform:"uppercase", letterSpacing:2, color:"var(--muted)", fontFamily:"var(--font-display)", marginBottom:10 }}>Our Sponsors</div>

      {/* Title sponsors — gold gradient card */}
      {titleSponsors.map(s => (
        <SponsorLink s={s} key={s.sponsor_id || s.name} style={{ marginBottom:8, background:"linear-gradient(135deg, rgba(245,158,11,.12) 0%, rgba(217,119,6,.06) 100%)", border:"1px solid rgba(245,158,11,.35)", borderRadius:12, padding:"12px 14px", display:"flex", alignItems:"center", gap:12 }}>
          <LogoBox s={s} size={48} radius={10} />
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontSize:9, fontWeight:800, textTransform:"uppercase", letterSpacing:2, color:"#d97706", fontFamily:"var(--font-display)", marginBottom:2 }}>Title Sponsor</div>
            <div style={{ fontSize:15, fontWeight:900, color:"var(--ink)", fontFamily:"var(--font-display)" }}>{s.name}</div>
            {s.description && <div style={{ fontSize:11, color:"var(--muted)", marginTop:2, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{s.description}</div>}
          </div>
          {s.website && <span style={{ fontSize:11, color:"var(--muted)", flexShrink:0 }}>↗</span>}
        </SponsorLink>
      ))}

      {/* Gold sponsors — accent-border card */}
      {goldSponsors.map(s => (
        <SponsorLink s={s} key={s.sponsor_id || s.name} style={{ marginBottom:8, background:"var(--elevated)", borderLeft:"3px solid #d97706", borderTop:"1px solid var(--border)", borderRight:"1px solid var(--border)", borderBottom:"1px solid var(--border)", borderRadius:"0 10px 10px 0", padding:"10px 12px", display:"flex", alignItems:"center", gap:10 }}>
          <LogoBox s={s} size={36} radius={8} />
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontSize:9, fontWeight:800, textTransform:"uppercase", letterSpacing:1.5, color:"#d97706", fontFamily:"var(--font-display)", marginBottom:1 }}>Gold</div>
            <div style={{ fontSize:13, fontWeight:700, color:"var(--ink)" }}>{s.name}</div>
          </div>
          {s.website && <span style={{ fontSize:11, color:"var(--muted)", flexShrink:0 }}>↗</span>}
        </SponsorLink>
      ))}

      {/* Silver / Bronze / Partner — 2-col compact grid */}
      {others.length > 0 && (
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6 }}>
          {others.map(s => (
            <SponsorLink s={s} key={s.sponsor_id || s.name} style={{ background:"var(--elevated)", border:"1px solid var(--border)", borderRadius:8, padding:"8px 10px", display:"flex", alignItems:"center", gap:8 }}>
              <LogoBox s={s} size={28} radius={6} />
              <div style={{ minWidth:0 }}>
                <div style={{ fontSize:9, fontWeight:700, textTransform:"uppercase", letterSpacing:1, color:"var(--muted)", fontFamily:"var(--font-display)" }}>{s.tier}</div>
                <div style={{ fontSize:11, fontWeight:700, color:"var(--ink)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{s.name}</div>
              </div>
            </SponsorLink>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Sticky sponsor bar ────────────────────────────────────────
// ── Match detail modal ────────────────────────────────────────

function parseCricketOvers(raw) {
  if (raw == null) return 0;
  const str = String(raw);
  const [whole, balls] = str.split(".").map(Number);
  return (whole || 0) + ((balls || 0) / 6);
}

function MatchDetailModal({ match: m, onClose }) {
  const [copied, setCopied] = useState(false);
  const { share, copyLink } = useShare({
    type: "match", matchId: m.match_id,
    title: `${m.player_1?.name || "TBD"} vs ${m.player_2?.name || "TBD"} — TheScoreBoard`,
  });

  const handleCopy = async () => {
    await copyLink();
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isLive     = m.status === "live";
  const isDone     = m.status === "done";
  const sportKey   = m.sport_key || "default";
  const ls         = m.live_state || {};
  const isCricket  = sportKey === "cricket";
  const isFootball = sportKey === "football";
  const isRacket   = sportKey === "badminton" || sportKey === "table_tennis";

  let stageLabel = null;
  if (m.stage) stageLabel = m.stage === "group" && m.round != null
    ? `Group Stage · Round ${m.round}` : (STAGE_CHIP_LABELS[m.stage] || null);
  if (!stageLabel && m.round != null) stageLabel = `Round ${m.round}`;

  // Football
  const penH1     = ls.pen_h1 || [];
  const penH2     = ls.pen_h2 || [];
  const hasPens   = penH1.length > 0 || penH2.length > 0;
  const penScore1 = penH1.filter(r => r === "H").length;
  const penScore2 = penH2.filter(r => r === "H").length;
  const penSlots  = Math.max(5, penH1.length, penH2.length);
  const fbHalf    = ls.half;

  const phaseText = (() => {
    if (isFootball) {
      if (isDone && hasPens)      return "Full Time (Penalties)";
      if (isDone && fbHalf >= 3)  return "Full Time (AET)";
      if (isDone)                 return "Full Time";
      if (!isLive)                return null;
      if (fbHalf >= 5) return "Penalties";
      if (fbHalf >= 3) return "Extra Time";
      return "Live";
    }
    return isDone ? "Full Time" : isLive ? "Live" : null;
  })();

  const p1Win   = m.player_1?.is_winner;
  const p2Win   = m.player_2?.is_winner;
  const p1Score = m.player_1?.score ?? 0;
  const p2Score = m.player_2?.score ?? 0;

  // Racket
  const completedSets = (m.sets || []).filter(s => s.is_complete).sort((a,b) => a.set_number - b.set_number);
  const currentSetLive = (m.sets || []).find(s => !s.is_complete);
  const liveS1    = currentSetLive?.score_p1 ?? 0;
  const liveS2    = currentSetLive?.score_p2 ?? 0;
  const p1SetWins = completedSets.filter(s => s.score_p1 > s.score_p2).length;
  const p2SetWins = completedSets.filter(s => s.score_p2 > s.score_p1).length;
  const server    = m.current_server; // 1 or 2
  const deuceAt   = sportKey === "badminton" ? 20 : 10;
  const inDeuce   = isRacket && isLive && liveS1 >= deuceAt && liveS2 >= deuceAt;
  const mdIsDeuce = inDeuce && liveS1 === liveS2;
  const mdAdvFor  = inDeuce && Math.abs(liveS1 - liveS2) === 1 ? (liveS1 > liveS2 ? 1 : 2) : null;

  // Cricket
  const battingFirst   = ls.batting_first   || 1;
  const soFirst        = ls.super_over_batting_first || battingFirst;
  const currentInnings = ls.current_innings || 1;
  const maxInn = isDone ? completedSets.length : (isLive ? currentInnings : 0);
  const inningsData = Array.from({ length: maxInn }, (_, idx) => {
    const innNum         = idx + 1;
    const isSuperOverInnings = innNum >= 3;
    const effectiveBatFirst  = isSuperOverInnings ? soFirst : battingFirst;
    const battingPos     = innNum % 2 === 1 ? effectiveBatFirst : (3 - effectiveBatFirst);
    const isP1           = battingPos === 1;
    const set            = completedSets.find(s => s.set_number === innNum);
    const isActiveLive   = isLive && innNum === currentInnings;
    const runs    = set ? set.score_p1 : (isActiveLive ? ls.runs    ?? 0 : 0);
    const wickets = set ? set.score_p2 : (isActiveLive ? ls.wickets ?? 0 : 0);
    const overs   = isActiveLive ? ls.overs : (isDone && innNum === maxInn && ls.overs ? ls.overs : null);
    const isWinner = isDone && (isP1 ? p1Win : p2Win);
    return { innNum, teamName: isP1 ? (m.player_1?.name||"TBD") : (m.player_2?.name||"TBD"), isP1, runs, wickets, overs, isComplete: !!set, isActiveLive, isWinner, isSuperOverInnings };
  });

  const mdInn1 = completedSets.find(s => s.set_number === 1);
  const mdInn2 = completedSets.find(s => s.set_number === 2);
  const mdInn3 = completedSets.find(s => s.set_number === 3);
  const mdInn4 = completedSets.find(s => s.set_number === 4);
  const hasSO  = !!mdInn3;
  const soTied = hasSO && mdInn4 && mdInn3.score_p1 === mdInn4.score_p1;

  let winMargin = null;
  if (isCricket && isDone && completedSets.length >= 2) {
    if (hasSO && soTied) {
      winMargin = "🪙 Decided by Coin Toss";
    } else if (hasSO && mdInn4) {
      const soBat2ndWon = (soFirst === 1 ? 2 : 1) === 1 ? p1Win : p2Win;
      if (soBat2ndWon) { const w = 2 - mdInn4.score_p2; winMargin = `⚡ Super Over — Won by ${w} wicket${w !== 1 ? "s" : ""}`; }
      else              { const r = mdInn3.score_p1 - mdInn4.score_p1; winMargin = `⚡ Super Over — Won by ${r} run${r !== 1 ? "s" : ""}`; }
    } else if (mdInn1 && mdInn2) {
      const bat2ndWon = battingFirst === 1 ? p2Win : p1Win;
      if (bat2ndWon) { const w = 10 - mdInn2.score_p2; winMargin = `Won by ${w} wicket${w !== 1 ? "s" : ""}`; }
      else           { const r = mdInn1.score_p1 - mdInn2.score_p1; winMargin = `Won by ${r > 0 ? r : 0} run${r !== 1 ? "s" : ""}`; }
    }
  }

  const accentColor = isLive ? "var(--primary)" : isDone ? "#16a34a" : "var(--border)";
  const abbr = (name) => (name || "?").split(" ").filter(Boolean).slice(0,2).map(w => w[0]).join("").toUpperCase();

  const SHARE_CHANNELS = [
    { id:"whatsapp", color:"#25D366", icon:<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg> },
    { id:"twitter",  color:"#000",    icon:<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg> },
    { id:"facebook", color:"#1877F2", icon:<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg> },
  ];

  return (
    <>
      <style>{`
        .mdl-ov   { position:fixed; inset:0; background:rgba(0,0,0,.65); z-index:500; display:flex; align-items:flex-end; justify-content:center; }
        .mdl-wrap { background:var(--surface); border-radius:24px 24px 0 0; width:100%; max-height:92vh; display:flex; flex-direction:column; box-shadow:0 -16px 48px rgba(0,0,0,.4); }
        .mdl-body { flex:1; overflow-y:auto; padding:0 20px 8px; min-height:0; }
        .mdl-foot { padding:14px 20px 28px; flex-shrink:0; border-top:1px solid var(--border); display:flex; align-items:center; justify-content:center; gap:8px; }
        @media(min-width:600px){
          .mdl-ov   { align-items:center; }
          .mdl-wrap { border-radius:20px; width:460px; max-height:85vh; }
          .mdl-foot { padding:14px 20px 20px; }
        }
      `}</style>
      <div className="mdl-ov" onClick={onClose}>
        <div className="mdl-wrap" onClick={e => e.stopPropagation()}>
          {/* Colored accent stripe */}
          <div style={{ height:4, background:accentColor, borderRadius:"24px 24px 0 0", flexShrink:0 }} />
          {/* Drag handle */}
          <div style={{ width:36, height:4, borderRadius:2, background:"var(--border)", margin:"10px auto 0", flexShrink:0 }} />

          <div className="mdl-body">
            {/* Chips + close */}
            <div style={{ display:"flex", alignItems:"center", gap:6, padding:"14px 0 10px", flexWrap:"wrap" }}>
              <span style={{ fontFamily:"var(--font-display)", fontSize:8, fontWeight:900, textTransform:"uppercase", letterSpacing:2, padding:"3px 10px", borderRadius:20, background:"var(--accent-dim)", color:"var(--accent)", border:"1px solid var(--accent-border)" }}>
                {SPORT_META[sportKey]?.label || sportKey}
              </span>
              {stageLabel && (
                <span style={{ fontFamily:"var(--font-display)", fontSize:8, fontWeight:900, textTransform:"uppercase", letterSpacing:1.5, padding:"3px 10px", borderRadius:20, background:"var(--primary-dim)", color:"var(--primary)" }}>
                  {stageLabel}
                </span>
              )}
              {(isLive || isDone) && (
                <span style={{ fontSize:8, fontWeight:900, padding:"3px 8px", borderRadius:20, display:"flex", alignItems:"center", gap:3,
                  background: isLive ? "var(--primary-dim)" : "rgba(22,163,74,.1)",
                  color: isLive ? "var(--primary)" : "#16a34a",
                  border:`1px solid ${isLive ? "rgba(255,107,53,.3)" : "rgba(22,163,74,.3)"}` }}>
                  {isLive && <span className="live-dot" style={{ width:5, height:5, background:"var(--primary)" }}/>}
                  {isLive ? "LIVE" : "FT"}
                </span>
              )}
              <button onClick={onClose} style={{ marginLeft:"auto", background:"var(--elevated)", border:"1px solid var(--border)", borderRadius:8, width:28, height:28, cursor:"pointer", color:"var(--muted)", fontSize:18, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>×</button>
            </div>

            {/* Hero score card */}
            <div style={{ background: isLive ? "linear-gradient(135deg,rgba(255,107,53,.08) 0%,transparent 65%)" : "var(--elevated)",
              border:`1px solid ${isLive ? "rgba(255,107,53,.2)" : "var(--border)"}`,
              borderRadius:16, padding:"18px 14px", marginBottom:14 }}>
              <div style={{ display:"flex", alignItems:"flex-start", gap:8 }}>
                {/* Team 1 */}
                <div style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"flex-start", gap:6 }}>
                  <div style={{ width:52, height:52, borderRadius:14, flexShrink:0,
                    background: p1Win ? "rgba(22,163,74,.12)" : "var(--surface)",
                    border:`2px solid ${p1Win ? "#16a34a" : "var(--border)"}`,
                    display:"flex", alignItems:"center", justifyContent:"center" }}>
                    <span style={{ fontFamily:"var(--font-display)", fontSize:17, fontWeight:900, color: p1Win ? "#16a34a" : "var(--muted)", lineHeight:1 }}>{abbr(m.player_1?.name)}</span>
                  </div>
                  <div style={{ display:"flex", alignItems:"center", gap:4 }}>
                    {isRacket && isLive && server === 1 && <span style={{ fontSize:8, color:"var(--primary)", lineHeight:1 }}>●</span>}
                    <div style={{ fontSize:13, fontWeight:700, color: p1Win ? "#16a34a" : "var(--ink)", lineHeight:1.3, wordBreak:"break-word" }}>{m.player_1?.name || "TBD"}</div>
                  </div>
                  {p1Win && <span style={{ fontSize:8, fontWeight:900, textTransform:"uppercase", letterSpacing:1.5, color:"#16a34a", background:"rgba(22,163,74,.1)", padding:"2px 7px", borderRadius:4 }}>Winner</span>}
                </div>

                {/* Score center — cricket shows VS/status only; innings section carries the scores */}
                <div style={{ display:"flex", flexDirection:"column", alignItems:"center", padding:"2px 0 0", flexShrink:0 }}>
                  {isCricket ? (
                    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:4, padding:"8px 4px" }}>
                      {isLive && <span className="live-dot" style={{ width:8, height:8, background:"var(--primary)" }}/>}
                      {phaseText && <div style={{ fontSize:9, color: isLive ? "var(--primary)" : "var(--muted)", fontWeight:700, textTransform:"uppercase", letterSpacing:0.5, textAlign:"center" }}>{phaseText}</div>}
                      {!isLive && !isDone && <div style={{ fontFamily:"var(--font-display)", fontSize:18, fontWeight:900, color:"var(--muted)", letterSpacing:2 }}>VS</div>}
                    </div>
                  ) : (isLive || isDone) ? (
                    <>
                      <div style={{ fontFamily:"var(--font-display)", fontSize:40, fontWeight:900, lineHeight:1, letterSpacing:-1,
                        color: isLive ? "var(--primary)" : "var(--ink)" }}>
                        {isRacket ? `${p1SetWins}–${p2SetWins}` : `${p1Score}–${p2Score}`}
                      </div>
                      {hasPens && isDone && isFootball && (
                        <div style={{ fontSize:11, fontWeight:800, color:"#3b82f6", marginTop:3 }}>({penScore1}–{penScore2} pens)</div>
                      )}
                      {phaseText && <div style={{ fontSize:9, color:"var(--muted)", fontWeight:700, textTransform:"uppercase", letterSpacing:0.5, marginTop:4, textAlign:"center" }}>{phaseText}</div>}
                    </>
                  ) : (
                    <div style={{ fontFamily:"var(--font-display)", fontSize:20, fontWeight:900, color:"var(--muted)", letterSpacing:2, padding:"12px 4px" }}>VS</div>
                  )}
                </div>

                {/* Team 2 */}
                <div style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"flex-end", gap:6 }}>
                  <div style={{ width:52, height:52, borderRadius:14, flexShrink:0,
                    background: p2Win ? "rgba(22,163,74,.12)" : "var(--surface)",
                    border:`2px solid ${p2Win ? "#16a34a" : "var(--border)"}`,
                    display:"flex", alignItems:"center", justifyContent:"center" }}>
                    <span style={{ fontFamily:"var(--font-display)", fontSize:17, fontWeight:900, color: p2Win ? "#16a34a" : "var(--muted)", lineHeight:1 }}>{abbr(m.player_2?.name)}</span>
                  </div>
                  <div style={{ display:"flex", alignItems:"center", gap:4, justifyContent:"flex-end" }}>
                    <div style={{ fontSize:13, fontWeight:700, color: p2Win ? "#16a34a" : "var(--ink)", lineHeight:1.3, textAlign:"right", wordBreak:"break-word" }}>{m.player_2?.name || "TBD"}</div>
                    {isRacket && isLive && server === 2 && <span style={{ fontSize:8, color:"var(--primary)", lineHeight:1 }}>●</span>}
                  </div>
                  {p2Win && <span style={{ fontSize:8, fontWeight:900, textTransform:"uppercase", letterSpacing:1.5, color:"#16a34a", background:"rgba(22,163,74,.1)", padding:"2px 7px", borderRadius:4 }}>Winner</span>}
                </div>
              </div>
            </div>

            {/* Football: Penalty shootout section */}
            {isFootball && hasPens && (
              <div style={{ background:"#0d1b2a", border:"1px solid #1e3a5f", borderRadius:14, padding:"14px 16px", marginBottom:14 }}>
                <div style={{ fontSize:10, fontWeight:800, textTransform:"uppercase", letterSpacing:1.5, color:"#60a5fa", marginBottom:12, textAlign:"center" }}>
                  Penalty Shootout
                </div>
                <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:11, fontWeight:700, color:"rgba(255,255,255,.55)", marginBottom:6 }}>{m.player_1?.name || "Team 1"}</div>
                    <div style={{ display:"flex", gap:4, flexWrap:"wrap" }}>
                      {Array.from({ length: penSlots }, (_, i) => <PenDot key={i} result={penH1[i]} />)}
                    </div>
                  </div>
                  <div style={{ fontFamily:"var(--font-display)", fontSize:26, fontWeight:900, color:"#fff", flexShrink:0, minWidth:52, textAlign:"center" }}>
                    {penScore1}–{penScore2}
                  </div>
                  <div style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"flex-end" }}>
                    <div style={{ fontSize:11, fontWeight:700, color:"rgba(255,255,255,.55)", marginBottom:6 }}>{m.player_2?.name || "Team 2"}</div>
                    <div style={{ display:"flex", gap:4, flexWrap:"wrap", justifyContent:"flex-end" }}>
                      {Array.from({ length: penSlots }, (_, i) => <PenDot key={i} result={penH2[i]} />)}
                    </div>
                  </div>
                </div>
                {isDone && (
                  <div style={{ marginTop:12, paddingTop:10, borderTop:"1px solid rgba(255,255,255,.08)", textAlign:"center", fontSize:11, fontWeight:800, color:"#60a5fa" }}>
                    {p1Win ? (m.player_1?.name||"Team 1") : (m.player_2?.name||"Team 2")} win on penalties
                  </div>
                )}
              </div>
            )}

            {/* Racket: set breakdown */}
            {isRacket && completedSets.length > 0 && (
              <div style={{ marginBottom:14 }}>
                <div style={{ fontSize:10, fontWeight:800, textTransform:"uppercase", letterSpacing:1.5, color:"var(--muted)", marginBottom:8 }}>Sets</div>
                <div style={{ display:"grid", gridTemplateColumns:`repeat(${completedSets.length + (isLive ? 1 : 0)}, 1fr)`, gap:6 }}>
                  {completedSets.map(s => {
                    const w1 = s.score_p1 > s.score_p2;
                    const w2 = s.score_p2 > s.score_p1;
                    return (
                      <div key={s.set_number} style={{ background:"var(--elevated)", border:"1px solid var(--border)", borderRadius:10, padding:"10px 6px", textAlign:"center" }}>
                        <div style={{ fontSize:9, color:"var(--muted)", fontWeight:700, marginBottom:5 }}>Set {s.set_number}</div>
                        <div style={{ fontFamily:"var(--font-display)", fontSize:16, fontWeight:900, color: w1 ? "#16a34a" : "var(--ink)" }}>{s.score_p1}</div>
                        <div style={{ fontFamily:"var(--font-display)", fontSize:16, fontWeight:900, color: w2 ? "#16a34a" : "var(--ink)" }}>{s.score_p2}</div>
                      </div>
                    );
                  })}
                  {isLive && (
                    <div style={{ background:"var(--primary-dim)", border:"1px solid rgba(255,107,53,.3)", borderRadius:10, padding:"10px 6px", textAlign:"center" }}>
                      <div style={{ fontSize:9, color:"var(--primary)", fontWeight:700, marginBottom:5 }}>Now</div>
                      <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:3 }}>
                        {server === 1 && <span style={{ fontSize:7, color:"var(--primary)", lineHeight:1 }}>●</span>}
                        <div style={{ fontFamily:"var(--font-display)", fontSize:16, fontWeight:900, color:"var(--primary)" }}>{liveS1}</div>
                      </div>
                      <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:3 }}>
                        {server === 2 && <span style={{ fontSize:7, color:"var(--primary)", lineHeight:1 }}>●</span>}
                        <div style={{ fontFamily:"var(--font-display)", fontSize:16, fontWeight:900, color:"var(--primary)" }}>{liveS2}</div>
                      </div>
                      {mdIsDeuce && <div style={{ fontSize:7, color:"var(--primary)", fontWeight:900, marginTop:4, letterSpacing:0.5 }}>DEUCE</div>}
                      {mdAdvFor  && <div style={{ fontSize:7, color:"var(--primary)", fontWeight:900, marginTop:4, letterSpacing:0.5 }}>ADV {mdAdvFor === 1 ? (m.player_1?.name||"P1").split(" ")[0] : (m.player_2?.name||"P2").split(" ")[0]}</div>}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Cricket: match narrative */}
            {isCricket && isDone && mdInn1 && mdInn2 && (() => {
              const bat1stName  = battingFirst === 1 ? m.player_1?.name : m.player_2?.name;
              const bat2ndName  = battingFirst === 1 ? m.player_2?.name : m.player_1?.name;
              const regularTied = mdInn1.score_p1 === mdInn2.score_p1;
              const bat2ndWon   = !hasSO && (battingFirst === 1 ? p2Win : p1Win);
              const target      = mdInn1.score_p1 + 1;
              const shortfall   = target - 1 - mdInn2.score_p1;
              const wktsLeft    = 10 - mdInn2.score_p2;
              const soBat1stName = soFirst === 1 ? m.player_1?.name : m.player_2?.name;
              const soBat2ndName = soFirst === 1 ? m.player_2?.name : m.player_1?.name;
              const winnerName   = p1Win ? m.player_1?.name : p2Win ? m.player_2?.name : null;
              const soWinnerResult = hasSO && mdInn4 && !soTied && (() => {
                const soBat2ndWon = (soFirst === 1 ? 2 : 1) === 1 ? p1Win : p2Win;
                if (soBat2ndWon) { const w = 2 - mdInn4.score_p2; return `by ${w} wicket${w !== 1 ? "s" : ""}`; }
                const r = mdInn3.score_p1 - mdInn4.score_p1;
                return `by ${r} run${r !== 1 ? "s" : ""}`;
              })();

              return (
                <div style={{ marginBottom:14, display:"flex", flexDirection:"column", gap:6 }}>
                  {/* Regular innings summary */}
                  <div style={{ padding:"10px 13px", background:"var(--elevated)", border:"1px solid var(--border)", borderRadius:10, fontSize:12, color:"var(--muted)", lineHeight:1.6 }}>
                    <strong style={{ color:"var(--ink)" }}>{bat1stName}</strong>{" batted first — scored "}
                    <strong style={{ color:"var(--ink)" }}>{mdInn1.score_p1}/{mdInn1.score_p2}</strong>
                    {". "}
                    <strong style={{ color:"var(--ink)" }}>{bat2ndName}</strong>{" replied with "}
                    <strong style={{ color:"var(--ink)" }}>{mdInn2.score_p1}/{mdInn2.score_p2}</strong>
                    {regularTied
                      ? " — match tied after regulation."
                      : bat2ndWon
                      ? <>{"."} <span style={{ color:"#16a34a" }}>{bat2ndName} won with {wktsLeft} wicket{wktsLeft !== 1 ? "s" : ""} to spare.</span></>
                      : <>{"."} <span style={{ color:"var(--primary)" }}>{bat1stName} defended — {bat2ndName} fell short by {shortfall} run{shortfall !== 1 ? "s" : ""}.</span></>}
                  </div>

                  {/* Super over */}
                  {hasSO && mdInn3 && (
                    <div style={{ padding:"10px 13px", background:"rgba(245,158,11,.06)", border:"1px solid rgba(245,158,11,.25)", borderRadius:10, fontSize:12, color:"var(--muted)", lineHeight:1.6 }}>
                      <div style={{ fontSize:10, fontWeight:900, textTransform:"uppercase", letterSpacing:1.5, color:"#f59e0b", marginBottom:5, fontFamily:"var(--font-display)" }}>⚡ Super Over</div>
                      <strong style={{ color:"var(--ink)" }}>{soBat1stName}</strong>{" scored "}
                      <strong style={{ color:"#f59e0b" }}>{mdInn3.score_p1}/{mdInn3.score_p2}</strong>
                      {mdInn4 ? (
                        <>{". "}<strong style={{ color:"var(--ink)" }}>{soBat2ndName}</strong>{" replied with "}
                        <strong style={{ color:"#f59e0b" }}>{mdInn4.score_p1}/{mdInn4.score_p2}</strong>
                        {soTied ? " — super over tied." : "."}</>
                      ) : "."}
                    </div>
                  )}

                  {/* Final result */}
                  {winnerName && (
                    <div style={{ padding:"10px 13px", background: soTied ? "rgba(249,115,22,.07)" : "rgba(22,163,74,.06)", border:`1px solid ${soTied ? "rgba(249,115,22,.3)" : "rgba(22,163,74,.2)"}`, borderRadius:10, fontSize:12, lineHeight:1.6 }}>
                      <strong style={{ color: soTied ? "var(--primary)" : "#16a34a", fontSize:13 }}>{winnerName}</strong>
                      {soTied
                        ? " won by Coin Toss 🪙"
                        : hasSO && soWinnerResult
                        ? <>{" won "}<strong>{soWinnerResult}</strong>{" in the Super Over"}</>
                        : " won"}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Cricket: innings breakdown */}
            {isCricket && inningsData.length > 0 && (
              <div style={{ marginBottom:14 }}>
                <div style={{ fontSize:10, fontWeight:800, textTransform:"uppercase", letterSpacing:1.5, color:"var(--muted)", marginBottom:8 }}>Innings</div>
                <div style={{ background:"var(--elevated)", border:"1px solid var(--border)", borderRadius:12, overflow:"hidden" }}>
                  {inningsData.map((inn, idx) => {
                    const showSoHeader = inn.isSuperOverInnings && (idx === 0 || !inningsData[idx-1].isSuperOverInnings);
                    const soC = "#f59e0b";
                    return (
                      <div key={inn.innNum}>
                        {showSoHeader && (
                          <div style={{ padding:"7px 14px", background:"rgba(245,158,11,.07)", borderTop:"1px solid rgba(245,158,11,.2)", borderBottom:"1px solid rgba(245,158,11,.15)" }}>
                            <span style={{ fontSize:9, fontWeight:900, textTransform:"uppercase", letterSpacing:1.5, color:soC, fontFamily:"var(--font-display)" }}>⚡ Super Over</span>
                          </div>
                        )}
                        <div style={{ display:"flex", alignItems:"center", gap:12, padding:"12px 14px",
                          borderBottom: idx < inningsData.length - 1 ? `1px solid ${inn.isSuperOverInnings ? "rgba(245,158,11,.15)" : "var(--border)"}` : "none",
                          background: inn.isActiveLive ? "var(--primary-dim)" : inn.isSuperOverInnings ? "rgba(245,158,11,.03)" : "transparent" }}>
                          <div style={{ width:22, height:22, borderRadius:"50%", flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center",
                            background: inn.isActiveLive ? "var(--primary)" : inn.isSuperOverInnings ? "rgba(245,158,11,.15)" : "var(--elevated)",
                            border:`1px solid ${inn.isActiveLive ? "var(--primary)" : inn.isSuperOverInnings ? "rgba(245,158,11,.4)" : "var(--border)"}` }}>
                            <span style={{ fontSize:8, fontWeight:900, color: inn.isActiveLive ? "#fff" : inn.isSuperOverInnings ? soC : "var(--muted)" }}>
                              {inn.isSuperOverInnings ? "SO" : inn.innNum}
                            </span>
                          </div>
                          <div style={{ flex:1 }}>
                            <div style={{ fontSize:13, fontWeight: inn.isWinner ? 800 : 600, color: inn.isWinner ? "#16a34a" : "var(--ink)" }}>{inn.teamName}</div>
                            {inn.overs != null && <div style={{ fontSize:10, color:"var(--muted)", marginTop:1 }}>{inn.overs} overs</div>}
                          </div>
                          <div style={{ textAlign:"right" }}>
                            <div style={{ fontFamily:"var(--font-display)", fontSize:22, fontWeight:900, lineHeight:1,
                              color: inn.isActiveLive ? "var(--primary)" : inn.isSuperOverInnings ? soC : "var(--ink)" }}>
                              {inn.runs}<span style={{ fontSize:12, color:"var(--muted)", fontWeight:600 }}>/{inn.wickets}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {winMargin && (
                  <div style={{ marginTop:8, borderRadius:8, padding:"8px 12px", textAlign:"center", fontSize:12, fontWeight:700,
                    background: winMargin.includes("Coin") ? "rgba(249,115,22,.08)" : winMargin.includes("Super") ? "rgba(245,158,11,.08)" : "rgba(22,163,74,.08)",
                    border: winMargin.includes("Coin") ? "1px solid rgba(249,115,22,.25)" : winMargin.includes("Super") ? "1px solid rgba(245,158,11,.25)" : "1px solid rgba(22,163,74,.25)",
                    color: winMargin.includes("Coin") ? "var(--primary)" : winMargin.includes("Super") ? "#f59e0b" : "#16a34a" }}>
                    {winMargin}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer: inline share — outside overflow so nothing is clipped */}
          <div className="mdl-foot">
            {SHARE_CHANNELS.map(ch => (
              <button key={ch.id} onClick={() => share(ch.id)} style={{
                width:42, height:42, borderRadius:12, border:"none", cursor:"pointer",
                background:ch.color, color:"#fff",
                display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0,
              }}>
                {ch.icon}
              </button>
            ))}
            <button onClick={handleCopy} style={{
              flex:1, height:42, borderRadius:12, cursor:"pointer",
              border:`1px solid ${copied ? "rgba(22,163,74,.4)" : "var(--border)"}`,
              background: copied ? "rgba(22,163,74,.08)" : "var(--elevated)",
              color: copied ? "#16a34a" : "var(--ink)", fontSize:13, fontWeight:600,
              display:"flex", alignItems:"center", justifyContent:"center", gap:6,
            }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                {copied
                  ? <polyline points="20 6 9 17 4 12"/>
                  : <><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></>}
              </svg>
              {copied ? "Copied!" : "Copy link"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// BracketCard removed — bracket rendering handled by RoadToFinal component

// ── Section wrapper ───────────────────────────────────────────
function Section({ id, title, count, accent, children, wide, action }) {
  return (
    <section id={id} style={{ padding:"24px 20px 4px", scrollMarginTop:52 }}>
      <div style={{ maxWidth: wide ? 1280 : 640, margin:"0 auto" }}>
        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:16, paddingBottom:12, borderBottom:"1px solid var(--border)" }}>
          <div style={{ width:3, height:20, borderRadius:2, background: accent || "var(--primary)", flexShrink:0 }}/>
          <h2 style={{ fontFamily:"var(--font-display)", fontSize:15, fontWeight:900, textTransform:"uppercase", letterSpacing:"-0.5px", color:"var(--ink)", flex:1, margin:0 }}>{title}</h2>
          {count > 0 && <span style={{ fontFamily:"var(--font-display)", fontSize:9, fontWeight:900, color:"var(--muted)", background:"var(--elevated)", border:"1px solid var(--border)", borderRadius:10, padding:"2px 8px" }}>{count}</span>}
          {action}
        </div>
        {children}
      </div>
    </section>
  );
}

// ── Ticker Bar ────────────────────────────────────────────────
// Scrolling scores strip at the very top of the tournament page.
function TickerBar({ allMatches }) {
  if (!allMatches.length) return null;
  // Double items for seamless infinite scroll
  const items = [...allMatches, ...allMatches];
  const STAGE_SHORT = { group:"GROUP", quarter:"QF", semi:"SEMI", final:"FINAL", third_place:"3RD" };
  const getPrefix = (m) => {
    const stagePart = STAGE_SHORT[m.stage] || (m.round != null ? `ROUND ${m.round}` : "");
    if (m.status === "live")  return `LIVE · ${stagePart}`.replace(/ · $/, "");
    if (m.status === "done")  return `FT · ${stagePart}`.replace(/ · $/, "");
    return stagePart ? `UPCOMING · ${stagePart}` : "UPCOMING";
  };
  // Abbreviate long team names to last word or first 8 chars
  const abbrev = (name) => {
    if (!name || name === "TBD") return name || "TBD";
    const parts = name.trim().split(/\s+/);
    return parts.length > 1 ? parts[parts.length - 1].toUpperCase().slice(0, 6) : name.slice(0, 6).toUpperCase();
  };

  return (
    <div style={{ background:"var(--primary)", overflow:"hidden", height:34, display:"flex", alignItems:"center", position:"relative", zIndex:300 }}>
      {/* Static "SCORES" label */}
      <div style={{ flexShrink:0, display:"flex", alignItems:"center", gap:8, padding:"0 16px", borderRight:"1px solid rgba(0,0,0,.15)", height:"100%", background:"rgba(0,0,0,.18)", zIndex:2 }}>
        <span style={{ width:7, height:7, borderRadius:"50%", background:"#fff", display:"inline-block", animation:"livePulse 1.4s ease-in-out infinite" }}/>
        <span style={{ fontFamily:"var(--font-display)", fontSize:7, fontWeight:900, letterSpacing:3, color:"#fff", whiteSpace:"nowrap" }}>SCORES</span>
      </div>
      {/* Scrolling track */}
      <div style={{ flex:1, overflow:"hidden", position:"relative" }}>
        <div style={{ display:"flex", alignItems:"center", animation:"ticker 40s linear infinite", width:"max-content" }}>
          {items.map((m, i) => {
            const isLive = m.status === "live";
            const isDone = m.status === "done";
            const prefix = getPrefix(m);
            return (
              <div key={i} style={{ display:"flex", alignItems:"center", height:34, flexShrink:0 }}>
                <span style={{ width:1, height:16, background:"rgba(255,255,255,.25)", display:"inline-block", margin:"0 20px" }}/>
                {isLive && <span style={{ width:6, height:6, borderRadius:"50%", background:"#fff", display:"inline-block", marginRight:8, animation:"livePulse 1.4s ease-in-out infinite" }}/>}
                <span style={{ fontFamily:"var(--font-display)", fontSize:6.5, fontWeight:800, letterSpacing:1.5, color: isLive ? "#fff" : "rgba(255,255,255,.65)", marginRight:12, whiteSpace:"nowrap" }}>{prefix}</span>
                <span style={{ fontFamily:"var(--font-display)", fontSize:11, fontWeight:900, color:"#fff", whiteSpace:"nowrap" }}>
                  {abbrev(m.player_1?.name)}
                  <span style={{ color:"rgba(255,255,255,.6)", margin:"0 7px", fontSize:10 }}>
                    {isDone || isLive ? `${m.player_1?.score ?? 0} – ${m.player_2?.score ?? 0}` : "vs"}
                  </span>
                  {abbrev(m.player_2?.name)}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Hero Band (broadcast-style dark hero) ─────────────────────
function HeroBand({ tournament, totalPlayers, doneMatches, totalMatches, sportKey, events, slug }) {
  const sportEmoji = sa(sportKey);
  const sportLabel = sl(sportKey);

  const locationStr = [tournament.city, tournament.state].filter(Boolean).join(", ") || null;
  const teamCount   = events.reduce((n, ev) => n + (ev.participants || []).length, 0);

  // Sport + format eyebrow
  const formatLabel = events[0]?.format ? events[0].format.replace(/_/g, " ") : null;

  // Organiser identity — initials avatar (no logo upload yet, no verification concept)
  const orgInitials = tournament.org_name
    ? tournament.org_name.trim().split(/\s+/).slice(0, 2).map(w => w[0] || "").join("").toUpperCase()
    : null;

  // Team abbreviation helper
  const teamAbbr = (name) => {
    if (!name || name === "TBD") return name || "?";
    const words = name.trim().split(/\s+/);
    if (words.length === 1) return name.slice(0, 3).toUpperCase();
    return words.slice(0, 3).map(w => w[0]).join("").toUpperCase();
  };

  // Right panel: what to show when no live match
  const w = useW();
  const isMobile = w < 768;

  return (
    <div style={{
      minHeight: isMobile ? "auto" : 320,
      borderBottom:"3px solid var(--primary)"
    }}>

      {/* ── LEFT PANEL — light background ─────────────────────── */}
      <div style={{ background:"var(--bg)", padding: isMobile ? "28px 20px 24px" : "44px 48px 40px", display:"flex", flexDirection:"column", justifyContent:"space-between", gap: isMobile ? 16 : 24, position:"relative", overflow:"hidden" }}>

        {/* Poster background (if present, darken left side too) */}
        {tournament.poster_url && (
          <>
            <img src={tournament.poster_url} alt="" style={{ position:"absolute", inset:0, width:"100%", height:"100%", objectFit:"cover", objectPosition:"center", zIndex:0 }}/>
            <div style={{ position:"absolute", inset:0, background:"rgba(0,0,0,.65)", zIndex:1 }}/>
          </>
        )}

        <div style={{ position:"relative", zIndex:2 }}>
          {/* Sport + format eyebrow */}
          {(sportLabel || formatLabel) && (
            <div style={{
              fontFamily:"var(--font-display)", fontSize:11, fontWeight:800,
              letterSpacing:2, textTransform:"uppercase", color:"var(--primary)",
              marginBottom:10,
            }}>
              {[sportLabel, formatLabel].filter(Boolean).join(" · ")}
            </div>
          )}

          {/* Tournament name */}
          <h1 style={{
            fontFamily:"var(--font-display)",
            fontSize:"clamp(28px, 3.5vw, 60px)",
            fontWeight:900, lineHeight:1, letterSpacing:-1.5,
            color: tournament.poster_url ? "#fff" : "var(--ink)",
            textTransform:"uppercase", margin:"0 0 16px",
          }}>
            {tournament.name}
          </h1>

          {/* Description */}
          {tournament.description && (
            <p style={{ fontSize:14, color: tournament.poster_url ? "rgba(255,255,255,.65)" : "var(--muted)", lineHeight:1.65, marginBottom:16, maxWidth:480 }}>
              {tournament.description}
            </p>
          )}

          {/* Location */}
          <div style={{ display:"flex", gap:20, color: tournament.poster_url ? "rgba(255,255,255,.5)" : "var(--muted)", fontSize:13, flexWrap:"wrap", alignItems:"center" }}>
            {locationStr && (
              <span style={{ display:"flex", alignItems:"center", gap:5 }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                {locationStr}
              </span>
            )}
          </div>

          {/* Organiser identity — initials avatar + club name (no logo/verification yet) */}
          {tournament.org_name && (
            <div style={{ display:"flex", alignItems:"center", gap:9, marginTop:14 }}>
              <div style={{
                width:30, height:30, borderRadius:"50%", flexShrink:0,
                background:"var(--primary)", color:"#fff",
                display:"flex", alignItems:"center", justifyContent:"center",
                fontFamily:"var(--font-display)", fontSize:11, fontWeight:900,
              }}>
                {orgInitials}
              </div>
              <span style={{ fontSize:13, fontWeight:700, color: tournament.poster_url ? "#fff" : "var(--ink)" }}>
                {tournament.org_name}
              </span>
            </div>
          )}

          {/* Share */}
          <div style={{ display:"flex", gap:10, marginTop:18, flexWrap:"wrap" }}>
            {slug && (
              <ShareButton
                type="tournament"
                slug={slug}
                title={`${tournament.name} — Live on TheScoreBoard`}
              />
            )}
          </div>

          {/* Sponsor credit strip — presented-by + other tiers, visible on every tab */}
          <HeroSponsorStrip sponsors={tournament.sponsors} dark={!!tournament.poster_url} />
        </div>
      </div>

      {false && <div style={{ display:"none" }}>

        {/* Subtle sport emoji watermark */}
        {sportEmoji && (
          <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center", fontSize:320, opacity:.03, userSelect:"none", pointerEvents:"none", fontFamily:"sans-serif" }}>
            {sportEmoji}
          </div>
        )}

        {liveMatch ? (
          /* ── Live match carousel ── */
          <div style={{ position:"relative", zIndex:1, width:"100%", userSelect:"none" }}>

            {/* ── Arrow nav buttons (only when >1 match) ── */}
            {liveMatches?.length > 1 && (
              <>
                <button
                  onClick={() => setLiveIdx(i => (i - 1 + liveMatches.length) % liveMatches.length)}
                  style={{
                    position:"absolute", left:-8, top:"50%", transform:"translateY(-50%)",
                    zIndex:10, width:32, height:32, borderRadius:"50%", border:"1px solid rgba(255,255,255,.12)",
                    background:"rgba(255,255,255,.07)", backdropFilter:"blur(4px)",
                    color:"rgba(255,255,255,.7)", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center",
                    transition:"all .2s", fontSize:14, lineHeight:1,
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background="rgba(255,255,255,.15)"; e.currentTarget.style.color="#fff"; }}
                  onMouseLeave={e => { e.currentTarget.style.background="rgba(255,255,255,.07)"; e.currentTarget.style.color="rgba(255,255,255,.7)"; }}
                >‹</button>
                <button
                  onClick={() => setLiveIdx(i => (i + 1) % liveMatches.length)}
                  style={{
                    position:"absolute", right:-8, top:"50%", transform:"translateY(-50%)",
                    zIndex:10, width:32, height:32, borderRadius:"50%", border:"1px solid rgba(255,255,255,.12)",
                    background:"rgba(255,255,255,.07)", backdropFilter:"blur(4px)",
                    color:"rgba(255,255,255,.7)", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center",
                    transition:"all .2s", fontSize:14, lineHeight:1,
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background="rgba(255,255,255,.15)"; e.currentTarget.style.color="#fff"; }}
                  onMouseLeave={e => { e.currentTarget.style.background="rgba(255,255,255,.07)"; e.currentTarget.style.color="rgba(255,255,255,.7)"; }}
                >›</button>
              </>
            )}

            {/* ── Slide track (all matches rendered, CSS translate) ── */}
            <div style={{ overflow:"hidden", width:"100%" }}>
              <div style={{
                display:"flex",
                transform:`translateX(-${safeIdx * 100}%)`,
                transition:"transform .38s cubic-bezier(.4,0,.2,1)",
                willChange:"transform",
              }}>
                {liveMatches.map((m, mi) => {
                  const mls  = m.live_state || {};
                  const mOvr = mls.overs != null ? `${mls.overs}th Over` : mls.over_display || "";
                  const mProg = mOvr ? `${mOvr} in Progress` : "In Progress";
                  const STAGE_L = { group:"Group Stage", quarter:"Quarterfinal", semi:"Semi Final", final:"Final", third_place:"3rd Place" };
                  const mRound = STAGE_L[m.stage] || (m.round != null ? `Round ${m.round}` : "");

                  return (
                    <div key={m.match_id || mi} style={{ minWidth:"100%", textAlign:"center", padding:"0 28px", boxSizing:"border-box" }}>

                      {/* LIVE NOW + round */}
                      <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:4, marginBottom:24 }}>
                        <span style={{ display:"inline-flex", alignItems:"center", gap:7, color:"var(--primary)", fontFamily:"var(--font-display)", fontSize:8, fontWeight:800, letterSpacing:2.5 }}>
                          <span className="live-dot" style={{ background:"var(--primary)", color:"var(--primary)", width:7, height:7 }}/>LIVE NOW
                        </span>
                        {mRound && (
                          <span style={{ fontFamily:"var(--font-display)", fontSize:9, fontWeight:700, color:"rgba(255,255,255,.35)", letterSpacing:2, textTransform:"uppercase" }}>
                            {mRound}
                          </span>
                        )}
                      </div>

                      {/* Teams + Score */}
                      <div style={{ display:"grid", gridTemplateColumns:"1fr auto 1fr", alignItems:"center", gap:16 }}>
                        <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:10 }}>
                          <div style={{ width:76, height:76, borderRadius:20, background:"rgba(255,255,255,.08)", border:"1px solid rgba(255,255,255,.1)", display:"flex", alignItems:"center", justifyContent:"center" }}>
                            <span style={{ fontFamily:"var(--font-display)", fontSize:17, fontWeight:900, color:"rgba(255,255,255,.85)", letterSpacing:-1 }}>{teamAbbr(m.player_1?.name)}</span>
                          </div>
                          <span style={{ fontSize:12, fontWeight:600, color:"#fff", textAlign:"center", lineHeight:1.3 }}>{m.player_1?.name || "TBD"}</span>
                        </div>

                        <div style={{ textAlign:"center" }}>
                          <div style={{ fontFamily:"var(--font-display)", fontSize:"clamp(32px,3.5vw,52px)", fontWeight:900, color:"#fff", letterSpacing:-2, lineHeight:1 }}>
                            {m.player_1?.score ?? 0}—{m.player_2?.score ?? 0}
                          </div>
                          {/* Current set point score for TT / Badminton */}
                          {(m.sport_key === "table_tennis" || m.sport_key === "badminton") && (() => {
                            const heroCS = (m.sets || []).find(s => !s.is_complete);
                            if (!heroCS) return null;
                            const hDeuceAt = m.sport_key === "badminton" ? 20 : 10;
                            const hS1 = heroCS.score_p1, hS2 = heroCS.score_p2;
                            const hInDeuce = hS1 >= hDeuceAt && hS2 >= hDeuceAt;
                            const hLabel = hInDeuce && hS1 === hS2 ? "DEUCE"
                              : hInDeuce && Math.abs(hS1 - hS2) === 1 ? `ADV ${hS1 > hS2 ? (m.player_1?.name||"P1").split(" ")[0] : (m.player_2?.name||"P2").split(" ")[0]}`
                              : null;
                            return (
                              <div style={{ marginTop:8, display:"flex", alignItems:"center", justifyContent:"center", gap:8, flexWrap:"wrap" }}>
                                {m.current_server === 1 && <span style={{ fontSize:9, color:"rgba(255,107,53,.8)" }}>●</span>}
                                <span style={{ fontFamily:"var(--font-display)", fontSize:"clamp(13px,1.4vw,18px)", fontWeight:900, color:"rgba(255,107,53,.85)", letterSpacing:-0.5 }}>
                                  {hS1}–{hS2}
                                </span>
                                {m.current_server === 2 && <span style={{ fontSize:9, color:"rgba(255,107,53,.8)" }}>●</span>}
                                <span style={{ fontFamily:"var(--font-display)", fontSize:7, fontWeight:800, color:"rgba(255,255,255,.3)", letterSpacing:1.5, textTransform:"uppercase" }}>pts</span>
                                {hLabel && <span style={{ fontFamily:"var(--font-display)", fontSize:7, fontWeight:900, color:"rgba(255,107,53,.9)", letterSpacing:1 }}>{hLabel}</span>}
                              </div>
                            );
                          })()}
                          {mOvr && (
                            <div style={{ fontFamily:"var(--font-display)", fontSize:7.5, color:"rgba(255,255,255,.3)", letterSpacing:1.5, marginTop:8, textTransform:"uppercase" }}>
                              {mOvr}
                            </div>
                          )}
                        </div>

                        <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:10 }}>
                          <div style={{ width:76, height:76, borderRadius:20, background:"rgba(255,255,255,.08)", border:"1px solid rgba(255,255,255,.1)", display:"flex", alignItems:"center", justifyContent:"center" }}>
                            <span style={{ fontFamily:"var(--font-display)", fontSize:17, fontWeight:900, color:"rgba(255,255,255,.85)", letterSpacing:-1 }}>{teamAbbr(m.player_2?.name)}</span>
                          </div>
                          <span style={{ fontSize:12, fontWeight:600, color:"#fff", textAlign:"center", lineHeight:1.3 }}>{m.player_2?.name || "TBD"}</span>
                        </div>
                      </div>

                      {/* Progress pill */}
                      <div style={{ marginTop:24, display:"inline-flex", alignItems:"center", gap:8, background:"rgba(255,107,53,.18)", border:"1px solid rgba(255,107,53,.3)", borderRadius:8, padding:"8px 20px" }}>
                        <span className="live-dot" style={{ background:"var(--primary)", color:"var(--primary)", width:7, height:7 }}/>
                        <span style={{ fontFamily:"var(--font-display)", fontSize:8.5, fontWeight:800, color:"var(--primary)", letterSpacing:1.5 }}>{mProg.toUpperCase()}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ── Indicator bar: dots + "X of N" counter ── */}
            {liveMatches?.length > 1 && (
              <div style={{ marginTop:20, display:"flex", flexDirection:"column", alignItems:"center", gap:8 }}>
                {/* Dot pills */}
                <div style={{ display:"flex", alignItems:"center", gap:5 }}>
                  {liveMatches.map((_, i) => (
                    <button key={i} onClick={() => setLiveIdx(i)} style={{
                      width: i === safeIdx ? 22 : 6,
                      height: 6,
                      borderRadius: 3,
                      border: "none",
                      padding: 0,
                      cursor: "pointer",
                      background: i === safeIdx ? "var(--primary)" : "rgba(255,255,255,.18)",
                      transition: "all .35s cubic-bezier(.4,0,.2,1)",
                    }}/>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          /* ── No live match — just the dark panel (watermark emoji shows through) ── */
          null
        )}
      </div>}
    </div>
  );
}

// ── Legacy alias kept for DraftView path ──────────────────────
function TournamentHero({ tournament, liveCount, totalPlayers, doneMatches, totalMatches, sportKey, darkMode, onToggleDark, slug, onRegister }) {
  const sportLabel = SPORT_META[sportKey]?.label;
  const status = tournament.status || "draft";

  const locationStr = [tournament.city, tournament.state].filter(Boolean).join(", ") || null;

  const hasBanner = !!tournament.poster_url;
  const hasLogo   = !!tournament.logo_url;
  const initials  = tournament.name.split(" ").slice(0, 2).map(w => w[0] || "").join("").toUpperCase() || "T";

  // On glass (banner) vs flat (no banner) styles
  const glass = hasBanner;
  const textC  = glass ? "#fff"                   : "var(--ink)";
  const mutedC = glass ? "rgba(255,255,255,.72)"  : "var(--muted)";
  const chipBg = glass ? "rgba(255,255,255,.15)"  : "var(--elevated)";
  const chipBd = glass ? "rgba(255,255,255,.25)"  : "var(--border)";
  const chipC  = glass ? "rgba(255,255,255,.92)"  : "var(--muted)";

  const darkBtn = (
    <button onClick={onToggleDark} style={{
      background: glass ? "rgba(255,255,255,.15)" : "var(--elevated)",
      border: glass ? "1px solid rgba(255,255,255,.25)" : "1px solid var(--border)",
      backdropFilter: glass ? "blur(8px)" : "none",
      borderRadius:8, width:34, height:34, cursor:"pointer",
      color: glass ? "#fff" : "var(--ink)",
      display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0,
    }}>
      {!darkMode
        ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
        : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
      }
    </button>
  );

  return (
    <div style={{ borderBottom:"1px solid var(--border)" }}>

      {/* ══ Hero band ══════════════════════════════════════════ */}
      <div style={{ position:"relative", overflow:"hidden" }}>

        {/* Background — poster or accent gradient */}
        {hasBanner ? (
          <>
            <img src={tournament.poster_url} alt=""
              style={{ position:"absolute", inset:0, width:"100%", height:"100%", objectFit:"cover", objectPosition:"center top", display:"block", zIndex:0 }} />
            <div style={{ position:"absolute", inset:0, zIndex:1,
              background:"linear-gradient(170deg, rgba(0,0,0,.62) 0%, rgba(0,0,0,.38) 50%, rgba(0,0,0,.68) 100%)" }} />
          </>
        ) : (
          <div style={{ position:"absolute", inset:0, zIndex:0,
            background:"linear-gradient(160deg, rgba(var(--accent-rgb),.13) 0%, rgba(var(--accent-rgb),.04) 55%, transparent 100%)" }} />
        )}

        {/* Content */}
        <div style={{ position:"relative", zIndex:2, maxWidth:900, margin:"0 auto" }}>

          {/* Top bar: brand + dark toggle */}
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"14px 20px" }}>
            <span style={{ fontFamily:"var(--font-display)", fontSize:11, fontWeight:900, textTransform:"uppercase", letterSpacing:2, lineHeight:1 }}>
              <span style={{ color:"var(--primary)" }}>The</span>
              <span style={{ color: glass ? "#fff" : "var(--ink)" }}>Score</span>
              <span style={{ color:"var(--primary)" }}>Board</span>
            </span>
            {darkBtn}
          </div>

          {/* Main hero content */}
          <div style={{ padding:"4px 20px 28px", display:"flex", alignItems:"flex-start", gap:16 }}>

            {/* Tournament logo / emblem */}
            <div style={{
              flexShrink:0, width:72, height:72, borderRadius:16,
              background: glass ? "rgba(255,255,255,.14)" : "var(--surface)",
              border: glass ? "2px solid rgba(255,255,255,.28)" : "2px solid var(--border)",
              backdropFilter: glass ? "blur(12px)" : "none",
              boxShadow: glass ? "0 8px 32px rgba(0,0,0,.28)" : "0 2px 12px rgba(0,0,0,.08)",
              overflow:"hidden", display:"flex", alignItems:"center", justifyContent:"center",
            }}>
              {hasLogo
                ? <img src={tournament.logo_url} alt="logo" style={{ width:"100%", height:"100%", objectFit:"cover", display:"block" }} />
                : <span style={{ fontFamily:"var(--font-display)", fontSize:22, fontWeight:900, color:"var(--primary)", lineHeight:1, userSelect:"none" }}>{initials}</span>
              }
            </div>

            {/* Right side: chips → name → meta */}
            <div style={{ flex:1, minWidth:0 }}>

              {/* Sport chips */}
              <div style={{ display:"flex", gap:5, marginBottom:9, flexWrap:"wrap" }}>
                {sportLabel && (
                  <span style={{
                    display:"inline-flex", alignItems:"center",
                    background: glass ? "rgba(255,255,255,.12)" : "var(--accent-dim)",
                    backdropFilter: glass ? "blur(8px)" : "none",
                    color: glass ? "rgba(255,255,255,.9)" : "var(--accent)",
                    border:`1px solid ${glass ? "rgba(255,255,255,.2)" : "var(--accent-border)"}`,
                    fontFamily:"var(--font-display)", fontSize:8, fontWeight:900,
                    textTransform:"uppercase", letterSpacing:1, padding:"3px 10px", borderRadius:20,
                  }}>
                    {SPORT_META[sportKey]?.icon && <span style={{ fontSize:9, marginRight:3 }}>{SPORT_META[sportKey].icon}</span>}
                    {sportLabel}
                  </span>
                )}
              </div>

              {/* Tournament name — the hero centrepiece */}
              <h1 style={{
                fontFamily:"var(--font-display)", fontWeight:900, lineHeight:1.0,
                letterSpacing:"-1.5px", textTransform:"uppercase",
                color: textC,
                textShadow: glass ? "0 2px 10px rgba(0,0,0,.5)" : "none",
                margin:"0 0 10px 0",
                fontSize:"clamp(18px, 5.5vw, 34px)",
                wordBreak:"break-word",
              }}>
                {tournament.name}
              </h1>

              {/* Compact meta: location · venue */}
              {(locationStr || tournament.venue) && (
                <div style={{ display:"flex", flexWrap:"wrap", gap:"5px 14px" }}>
                  {(locationStr || tournament.venue) && (
                    <span style={{ display:"inline-flex", alignItems:"center", gap:4, fontSize:12, color:mutedC }}>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                      {[tournament.venue, locationStr].filter(Boolean).join(" · ")}
                    </span>
                  )}
                  {/* Google Maps button — only shown when coordinates are saved */}
                  {tournament.venue_lat && tournament.venue_lng && (
                    <a
                      href={`https://www.google.com/maps?q=${tournament.venue_lat},${tournament.venue_lng}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display:"inline-flex", alignItems:"center", gap:4,
                        fontSize:11, fontWeight:700,
                        color: primaryC || "var(--primary, #FF6B35)",
                        textDecoration:"none",
                        padding:"3px 8px", borderRadius:6,
                        border:`1px solid ${primaryC || "var(--primary, #FF6B35)"}44`,
                        background:`${primaryC || "var(--primary, #FF6B35)"}10`,
                      }}
                    >
                      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                      Open in Maps
                    </a>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ══ Below-fold ══════════════════════════════════════════ */}
      <div style={{ maxWidth:900, margin:"0 auto", padding:"20px 20px 32px" }}>

        {/* Description */}
        {tournament.description && (
          <p style={{ fontSize:13, color:"var(--muted)", lineHeight:1.6, margin:"0 0 16px", maxWidth:560 }}>
            {tournament.description}
          </p>
        )}

        {/* Register CTA — full-width prominent button, separate from stats */}
        {status === "registration" && onRegister && (
          <button onClick={onRegister} style={{
            display:"flex", alignItems:"center", justifyContent:"center", gap:8,
            width:"100%", padding:"13px 20px", borderRadius:12, border:"none",
            cursor:"pointer", background:"var(--primary)", color:"#fff",
            fontFamily:"var(--font-display)", fontSize:13, fontWeight:900,
            textTransform:"uppercase", letterSpacing:1.2,
            boxShadow:"0 4px 16px rgba(255,107,53,.35)",
            marginBottom:24,
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <line x1="19" y1="8" x2="19" y2="14"/>
              <line x1="22" y1="11" x2="16" y2="11"/>
            </svg>
            Register Now
          </button>
        )}

        {/* Sponsors */}
        {tournament.sponsors?.length > 0 && <SponsorDisplay sponsors={tournament.sponsors} />}
      </div>
    </div>
  );
}

// ── Live strip ────────────────────────────────────────────────
function LiveStrip({ liveMatches }) {
  if (!liveMatches.length) return null;
  const m  = liveMatches[0];
  const ls = m.live_state || {};
  const STAGE_LABELS = { group:"Group Stage", quarter:"Quarterfinal", semi:"Semi Final", final:"Final", third_place:"3rd Place" };
  const roundPart = m.stage ? (STAGE_LABELS[m.stage] || m.stage) : m.round != null ? `Round ${m.round}` : "";
  const infoPart  = ls.overs != null ? `${ls.overs}th Over` : ls.over_display || "";
  const infoStr   = [roundPart, infoPart].filter(Boolean).join(" · ");
  const w = useW();
  const isMobile = w < 640;

  // Truncate name for mobile
  const abbr = (name) => {
    if (!name || name === "TBD") return name || "TBD";
    if (!isMobile) return name;
    const parts = name.trim().split(/\s+/);
    return parts.length > 1 ? parts.map(p => p[0]).join("").toUpperCase().slice(0,3) : name.slice(0,6).toUpperCase();
  };

  return (
    <div style={{ background:"var(--primary)" }}>
      <div style={{ maxWidth:1240, margin:"0 auto", padding: isMobile ? "0 16px" : "0 40px", height: isMobile ? 44 : 52, display:"flex", alignItems:"center", gap: isMobile ? 12 : 24 }}>
        {/* LIVE badge */}
        <div style={{ display:"flex", alignItems:"center", gap:6, flexShrink:0 }}>
          <span className="live-dot" style={{ background:"#fff", color:"#fff", width:7, height:7 }}/>
          <span style={{ fontFamily:"var(--font-display)", fontSize:7, fontWeight:800, letterSpacing:3, color:"#fff" }}>LIVE</span>
        </div>
        <div style={{ width:1, height:22, background:"rgba(255,255,255,.25)", flexShrink:0 }}/>

        {/* Match */}
        <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", gap: isMobile ? 10 : 28 }}>
          <span style={{ color:"#fff", fontSize: isMobile ? 12 : 15, fontWeight:700, textAlign:"right", flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{abbr(m.player_1?.name) || "TBD"}</span>
          <div style={{ background:"rgba(0,0,0,.18)", borderRadius:7, padding: isMobile ? "4px 14px" : "5px 22px", flexShrink:0 }}>
            <span style={{ fontFamily:"var(--font-display)", fontSize: isMobile ? 18 : 24, fontWeight:900, color:"#fff", letterSpacing:-1 }}>
              {m.player_1?.score ?? 0} — {m.player_2?.score ?? 0}
            </span>
          </div>
          <span style={{ color:"#fff", fontSize: isMobile ? 12 : 15, fontWeight:700, flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{abbr(m.player_2?.name) || "TBD"}</span>
        </div>

        {infoStr && !isMobile && (
          <>
            <div style={{ width:1, height:26, background:"rgba(255,255,255,.25)", flexShrink:0 }}/>
            <span style={{ fontFamily:"var(--font-display)", fontSize:7, fontWeight:800, color:"rgba(255,255,255,.78)", letterSpacing:1.5, flexShrink:0, textTransform:"uppercase" }}>{infoStr}</span>
          </>
        )}
        {liveMatches.length > 1 && (
          <span style={{ fontFamily:"var(--font-display)", fontSize:7, fontWeight:800, color:"rgba(255,255,255,.55)", letterSpacing:1, flexShrink:0 }}>+{liveMatches.length - 1}</span>
        )}
      </div>
    </div>
  );
}

// ── Top bar (broadcast style: logo + utilities only) ──────────
// Reuses the exact classes OrgHeader uses (.site-header / .header-row /
// .header-brand) so the public tournament header and the organiser header
// look like the same product. Sits above the hero — tabs come AFTER the
// hero (see TabBar below), matching the reference layout: identity block
// first, tab bar underneath it, not fused into the same sticky strip.
function TopBar({ darkMode, onToggleDark }) {
  return (
    <header className="site-header public-tournament-header">
      <div className="header-row">
        <span className="header-brand">
          The<span className="accent">Score</span>Board
        </span>

        <button onClick={onToggleDark} style={{ background:"var(--elevated)", border:"1px solid var(--border)", borderRadius:6, width:34, height:34, cursor:"pointer", color:"var(--muted)", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
          {darkMode
            ? <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.79"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
            : <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
          }
        </button>
      </div>
    </header>
  );
}

// ── Tab bar — sits below the hero (tournament identity block), sticky
// under the top bar so it stays reachable while scrolling tab content. ──
function TabBar({ sections, activeId, onNav }) {
  const w = useW();
  const isMobile = w < 640;
  const topBarHeight = isMobile ? 52 : 56;
  return (
    <div
      className="breadcrumb-row"
      style={{
        height: "auto", padding: isMobile ? "0 12px" : "0 24px",
        position: "sticky", top: topBarHeight, zIndex: 190,
        background: "var(--surface)", borderBottom: "1px solid var(--border)",
      }}
    >
      {sections.map(s => {
        const active = activeId === s.id;
        return (
          <button key={s.id} onClick={() => onNav(s.id)} style={{
            padding: isMobile ? "10px 8px" : "10px 16px", border:"none",
            borderBottom: active ? "3px solid var(--primary)" : "3px solid transparent",
            marginBottom:"-1px",
            cursor:"pointer", background:"transparent",
            color: active ? "var(--primary)" : "var(--muted)",
            fontFamily:"var(--font-display)", fontSize: isMobile ? 9 : 10, fontWeight:800, letterSpacing:1,
            display:"flex", alignItems:"center", gap:4,
            transition:"color .15s", flexShrink:0, textTransform:"uppercase", whiteSpace:"nowrap",
          }}>
            {s.label.toUpperCase()}
            {s.count != null && s.count > 0 && (
              <span style={{
                background: active ? "var(--primary)" : "var(--elevated)",
                color: active ? "#fff" : "var(--muted)",
                borderRadius:3, padding:"1px 5px", fontSize:8, fontWeight:800,
                transition:"all .15s",
              }}>
                {s.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ── Register section ──────────────────────────────────────────
function RegisterSection({ events, tournament }) {
  const [phase,   setPhase]   = useState("browse");
  const [selEvt,  setSelEvt]  = useState(null);
  const [regName, setRegName] = useState("");

  const open = events.filter(ev => ev.is_configured !== false);
  const handleBack = () => { setPhase("browse"); setSelEvt(null); };

  return (
    <Section id="register" title="Register Now" accent="var(--accent)">
      {phase === "success" && <SuccessView name={regName} event={selEvt} onBack={handleBack} />}
      {phase === "form" && selEvt && (() => {
        const mode = getRegMode(selEvt);
        if (mode === "team")    return <TeamRegistrationForm event={selEvt} tournament={tournament} onSuccess={n => { setRegName(n); setPhase("success"); }} onBack={handleBack} />;
        if (mode === "doubles") return <DoublesForm  event={selEvt} tournament={tournament} onSuccess={n => { setRegName(n); setPhase("success"); }} onBack={handleBack} />;
        return                         <IndividualForm event={selEvt} tournament={tournament} onSuccess={n => { setRegName(n); setPhase("success"); }} onBack={handleBack} />;
      })()}
      {phase === "browse" && (
        open.length === 0 ? (
          <div className="empty">
            <div className="empty-title">Registration Closed</div>
            <p style={{ fontSize:13, color:"var(--muted)", marginTop:8 }}>No events are currently open for registration.</p>
          </div>
        ) : (
          <div>
            <p style={{ fontSize:13, color:"var(--muted)", marginBottom:16 }}>
              {open.length} event{open.length !== 1 ? "s" : ""} available — tap to register
            </p>
            {open.map(ev => <EventCard key={ev.event_id} event={ev} onClick={() => { setSelEvt(ev); setPhase("form"); }} />)}
          </div>
        )
      )}
    </Section>
  );
}

// ── Hero sponsor strip — "presented by" credit line shown at the top
// of the page (hero band), visible on every tab, not just Info. ──
function HeroSponsorStrip({ sponsors, dark }) {
  if (!sponsors?.length) return null;
  const title  = sponsors.find(s => s.tier === "title");
  const others = sponsors.filter(s => s.tier !== "title");
  const dim    = dark ? "rgba(255,255,255,.5)"  : "var(--muted)";
  const ink    = dark ? "#fff"                  : "var(--ink)";
  const chipBg = dark ? "rgba(255,255,255,.08)" : "var(--elevated)";
  const chipBd = dark ? "rgba(255,255,255,.15)" : "var(--border)";

  const Logo = ({ s, size }) => (
    <div style={{ width:size, height:size, borderRadius:6, flexShrink:0, background:chipBg, border:`1px solid ${chipBd}`, overflow:"hidden", display:"flex", alignItems:"center", justifyContent:"center" }}>
      {s.logo_url
        ? <img src={s.logo_url} alt={s.name} style={{ width:"100%", height:"100%", objectFit:"contain" }} />
        : <span style={{ fontFamily:"var(--font-display)", fontSize:size * 0.42, fontWeight:900, color:"var(--primary)" }}>{s.name[0].toUpperCase()}</span>
      }
    </div>
  );

  return (
    <div style={{ marginTop:18, paddingTop:16, borderTop:`1px solid ${chipBd}`, display:"flex", alignItems:"center", gap:14, flexWrap:"wrap" }}>
      {title && (
        <a href={title.website || undefined} target={title.website ? "_blank" : undefined} rel="noopener noreferrer"
          style={{ display:"flex", alignItems:"center", gap:8, textDecoration:"none" }}>
          <Logo s={title} size={28} />
          <div>
            <div style={{ fontSize:8, fontWeight:800, letterSpacing:1.5, textTransform:"uppercase", color:dim }}>Presented By</div>
            <div style={{ fontSize:12, fontWeight:800, color:ink, fontFamily:"var(--font-display)" }}>{title.name}</div>
          </div>
        </a>
      )}
      {others.length > 0 && (
        <div style={{ display:"flex", alignItems:"center", gap:6 }}>
          {others.map(s => (
            s.website
              ? <a key={s.sponsor_id || s.name} href={s.website} target="_blank" rel="noopener noreferrer" title={s.name}><Logo s={s} size={24} /></a>
              : <div key={s.sponsor_id || s.name} title={s.name}><Logo s={s} size={24} /></div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Fixtures section ──────────────────────────────────────────
// ── Broadcast section header helper ──────────────────────────
function BroadcastSectionHeader({ title, count }) {
  return (
    <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:24, paddingBottom:16, borderBottom:"1px solid var(--border)" }}>
      <div style={{ width:3, height:18, borderRadius:2, background:"var(--primary)", flexShrink:0 }}/>
      <span style={{ fontFamily:"var(--font-display)", fontSize:10, fontWeight:900, letterSpacing:2, color:"var(--ink)" }}>{title}</span>
      {count != null && count > 0 && (
        <span style={{ fontFamily:"var(--font-display)", fontSize:9, fontWeight:800, color:"var(--muted)", background:"var(--elevated)", border:"1px solid var(--border)", borderRadius:4, padding:"1px 8px" }}>{count}</span>
      )}
    </div>
  );
}

// ── Collapsible group header — click to expand/collapse a group's card grid.
// Own useState per instance, so it must be a real component (not inlined in
// a .map callback) to keep hook rules intact across multiple groups.
function CollapsibleGroup({ title, count, defaultOpen = true, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ marginBottom:20, border:"1px solid var(--border)", borderRadius:12, overflow:"hidden" }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width:"100%", display:"flex", alignItems:"center", justifyContent:"space-between",
          padding:"12px 18px", background:"var(--primary-dim)", border:"none", cursor:"pointer",
          fontFamily:"var(--font-display)", fontSize:11, fontWeight:800, letterSpacing:1.5,
          textTransform:"uppercase", color:"var(--ink)",
        }}
      >
        <span style={{ display:"flex", alignItems:"center", gap:8 }}>
          {title}
          {count != null && (
            <span style={{ fontSize:9, fontWeight:800, color:"var(--primary)", background:"var(--surface)", borderRadius:4, padding:"1px 7px" }}>{count}</span>
          )}
        </span>
        <span style={{ fontSize:11, color:"var(--primary)", transform: open ? "rotate(0deg)" : "rotate(-90deg)", transition:"transform .15s" }}>▾</span>
      </button>
      {open && <div style={{ padding:16, background:"var(--bg)" }}>{children}</div>}
    </div>
  );
}

// ── Responsive card grid — reuses the sport-aware MatchCard (Cricket/
// Football/Default) so each card shows the right score format for its
// sport. Column count is CSS-driven (auto-fill), so it naturally collapses
// to 1 column on mobile without a separate JS-branched layout.
function MatchCardGrid({ matches, onSelect }) {
  return (
    <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(280px, 1fr))", gap:14 }}>
      {matches.map(m => (
        <div key={m.match_id} onClick={() => onSelect?.(m)} style={{ cursor: onSelect ? "pointer" : "default" }}>
          <MatchCard match={m} sportKey={m.sport_key} />
        </div>
      ))}
    </div>
  );
}

// ── Fixtures section (card grid layout) ────────────────────────
function FixturesSection({ events, onSelect }) {
  const w = useW();
  const isMobile = w < 640;

  // ── Active filter ──────────────────────────────────────────────
  // "all" | "live" | "upcoming" | "done" | stage key
  const [filter, setFilter] = useState("all");
  const [stageMenuOpen, setStageMenuOpen] = useState(false);
  const stageMenuRef = useRef(null);
  useEffect(() => {
    if (!stageMenuOpen) return;
    const onClick = (e) => { if (stageMenuRef.current && !stageMenuRef.current.contains(e.target)) setStageMenuOpen(false); };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [stageMenuOpen]);

  // group_knockout events run each group as its OWN mini single-elimination
  // bracket, built with the exact same generic bracket engine as the real
  // championship — so a group's internal decider match also carries
  // stage="final" (and "semi"/"quarter" for bigger groups). Raw m.stage
  // alone can't tell a group semifinal from the tournament semifinal; the
  // presence of group_id is what disambiguates them. Every group match
  // collapses to a single "group" bucket — the round-by-round shape of each
  // group's internal bracket isn't meaningful to a spectator, only "which
  // group is this" is (shown elsewhere on the row).
  const effectiveStage = (m) => (m.group_id != null ? "group" : (m.stage || ""));

  const STAGE_LABELS = {
    group:"Group Stage", preliminary:"Preliminary", round_of_32:"Round of 32",
    r16:"Round of 16", round_of_16:"Round of 16", quarter:"Quarterfinal",
    semi:"Semifinal", final:"Final", third_place:"3rd Place",
  };
  // ── Match sort order ─────────────────────────────────────────
  // Priority: live → group → preliminary → r32 → r16 → quarter → semi → final → 3rd_place → done
  const STAGE_ORDER = {
    group:1, preliminary:2, round_of_32:3, r16:4, round_of_16:4,
    quarter:5, semi:6, final:7, third_place:8,
  };

  function sortMatches(matches) {
    return [...matches].sort((a, b) => {
      const aLive = a.status === "live" ? 0 : 1;
      const bLive = b.status === "live" ? 0 : 1;
      if (aLive !== bLive) return aLive - bLive;
      const aDone = a.status === "done" ? 1 : 0;
      const bDone = b.status === "done" ? 1 : 0;
      if (aDone !== bDone) return aDone - bDone;
      const aStage = STAGE_ORDER[effectiveStage(a)] ?? 0;
      const bStage = STAGE_ORDER[effectiveStage(b)] ?? 0;
      if (aStage !== bStage) return aStage - bStage;
      return (a.round ?? 0) - (b.round ?? 0);
    });
  }

  // ── Apply filter ──────────────────────────────────────────────
  function applyFilter(matches) {
    if (filter === "all")      return matches;
    if (filter === "live")     return matches.filter(m => m.status === "live");
    if (filter === "upcoming") return matches.filter(m => m.status !== "live" && m.status !== "done");
    if (filter === "done")     return matches.filter(m => m.status === "done");
    // stage key
    return matches.filter(m => effectiveStage(m) === filter);
  }

  const multiEvent = events.length > 1;
  const allMatches = events.flatMap(ev => ev.all_matches || []);

  // ── Build filter pills from actual data ───────────────────────
  const hasLive     = allMatches.some(m => m.status === "live");
  const hasUpcoming = allMatches.some(m => m.status !== "live" && m.status !== "done");
  const hasDone     = allMatches.some(m => m.status === "done");

  // Collect stages that actually have matches, in display order
  const STAGE_ORDER_ARR = ["group","preliminary","round_of_32","r16","quarter","semi","final","third_place"];
  const presentStages = STAGE_ORDER_ARR.filter(s => allMatches.some(m => effectiveStage(m) === s));

  // Status quick-pills — All / Live / Upcoming / Completed. Stage selection
  // is a separate dropdown below (cleaner than a long row of stage pills
  // once a tournament has group/quarter/semi/final all at once).
  const pills = [
    { id:"all",      label:"All",         count: allMatches.length },
    ...(hasLive     ? [{ id:"live",      label:"🔴 Live",     count: allMatches.filter(m => m.status === "live").length }] : []),
    ...(hasUpcoming ? [{ id:"upcoming",  label:"Upcoming",    count: allMatches.filter(m => m.status !== "live" && m.status !== "done").length }] : []),
    ...(hasDone     ? [{ id:"done",      label:"Completed",   count: allMatches.filter(m => m.status === "done").length }] : []),
  ];

  const isStageFilterActive = presentStages.includes(filter);

  if (allMatches.length === 0) {
    return (
      <div style={{ maxWidth:1240, margin:"0 auto", padding: isMobile ? "28px 16px" : "44px 40px" }}>
        <BroadcastSectionHeader title="FIXTURES" />
        <div style={{ textAlign:"center", padding:"60px 0", color:"var(--muted)", fontSize:14 }}>
          Fixtures will be published here once the draw is set.
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth:1240, margin:"0 auto", padding: isMobile ? "28px 16px" : "44px 40px" }}>

      {/* ── Filter bar: status pills + a stage dropdown ─────────── */}
      {(pills.length > 1 || presentStages.length > 1) && (
        <div style={{ display:"flex", gap:10, alignItems:"center", flexWrap:"wrap", paddingBottom:16 }}>
          {pills.length > 1 && (
            <div style={{
              display:"flex", gap:6, overflowX:"auto",
              scrollbarWidth:"none", msOverflowStyle:"none",
              flexWrap: isMobile ? "nowrap" : "wrap",
            }}>
              {pills.map((pill) => {
                const active = filter === pill.id;
                return (
                  <button
                    key={pill.id}
                    onClick={() => setFilter(pill.id)}
                    style={{
                      display:"inline-flex", alignItems:"center", gap:5, flexShrink:0,
                      padding: isMobile ? "6px 12px" : "7px 14px",
                      borderRadius:999,
                      border: active ? "none" : "1.5px solid var(--border)",
                      // Always orange when active — var(--ink) used to be
                      // white-on-white in dark mode (ink flips to white
                      // there), making the active pill invisible.
                      background: active ? "var(--primary)" : "var(--surface)",
                      color: active ? "#fff" : "var(--muted)",
                      fontFamily:"var(--font-display)", fontSize: isMobile ? 9 : 10,
                      fontWeight:800, letterSpacing:1, textTransform:"uppercase",
                      cursor:"pointer", transition:"all .15s", whiteSpace:"nowrap",
                    }}
                  >
                    {pill.label}
                    {pill.count > 0 && (
                      <span style={{
                        fontSize: isMobile ? 8 : 9, fontWeight:800,
                        background: active ? "rgba(255,255,255,.25)" : "var(--elevated)",
                        color: active ? "#fff" : "var(--muted)",
                        borderRadius:4, padding:"0px 5px",
                      }}>
                        {pill.count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* Stage dropdown — custom-built rather than a native <select>,
              since the native option list can't be restyled (it shows the
              browser/OS's own colors — a system-blue highlight in light
              mode, an unreadable render in dark mode — regardless of any
              CSS applied to the closed control). */}
          {presentStages.length > 1 && (
            <div ref={stageMenuRef} style={{ position:"relative", flexShrink:0 }}>
              <button
                onClick={() => setStageMenuOpen(o => !o)}
                style={{
                  display:"inline-flex", alignItems:"center", gap:6,
                  padding: isMobile ? "7px 12px" : "8px 14px",
                  borderRadius:999, border: isStageFilterActive ? "none" : "1.5px solid var(--border)",
                  background: isStageFilterActive ? "var(--primary)" : "var(--surface)",
                  color: isStageFilterActive ? "#fff" : "var(--muted)",
                  fontFamily:"var(--font-display)", fontSize: isMobile ? 9 : 10,
                  fontWeight:800, letterSpacing:1, textTransform:"uppercase",
                  cursor:"pointer", outline:"none", whiteSpace:"nowrap",
                }}
              >
                {isStageFilterActive
                  ? `${(STAGE_LABELS[filter] || filter).toUpperCase()} (${allMatches.filter(m => effectiveStage(m) === filter).length})`
                  : "All Stages"}
                <span style={{ fontSize:9 }}>▾</span>
              </button>

              {stageMenuOpen && (
                <div style={{
                  position:"absolute", top:"calc(100% + 6px)", left:0, zIndex:50,
                  minWidth:200, background:"var(--surface)", border:"1.5px solid var(--border)",
                  borderRadius:10, boxShadow:"0 8px 24px rgba(0,0,0,.14)", overflow:"hidden",
                }}>
                  <button
                    onClick={() => { setFilter("all"); setStageMenuOpen(false); }}
                    style={{
                      display:"block", width:"100%", textAlign:"left", padding:"10px 14px", border:"none",
                      background: !isStageFilterActive ? "var(--primary-dim)" : "transparent",
                      color: !isStageFilterActive ? "var(--primary)" : "var(--ink)",
                      fontFamily:"var(--font-display)", fontSize:10, fontWeight:800, letterSpacing:1,
                      textTransform:"uppercase", cursor:"pointer",
                    }}
                  >
                    All Stages
                  </button>
                  {presentStages.map(s => {
                    const active = filter === s;
                    return (
                      <button
                        key={s}
                        onClick={() => { setFilter(s); setStageMenuOpen(false); }}
                        style={{
                          display:"block", width:"100%", textAlign:"left", padding:"10px 14px", border:"none",
                          borderTop:"1px solid var(--border)",
                          background: active ? "var(--primary-dim)" : "transparent",
                          color: active ? "var(--primary)" : "var(--ink)",
                          fontFamily:"var(--font-display)", fontSize:10, fontWeight:800, letterSpacing:1,
                          textTransform:"uppercase", cursor:"pointer",
                        }}
                      >
                        {(STAGE_LABELS[s] || s).toUpperCase()} ({allMatches.filter(m => effectiveStage(m) === s).length})
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {events.map((ev) => {
        const sorted   = sortMatches(ev.all_matches || []);
        const matches  = applyFilter(sorted);
        if (!matches.length && multiEvent) return null;
        // If this event has no matches after filter, skip silently
        if (!matches.length) return (
          <div key={ev.event_id} style={{ textAlign:"center", padding:"40px 0", color:"var(--muted)", fontSize:13 }}>
            No matches match this filter.
          </div>
        );

        // Split into per-group buckets (Group A, Group B, ...) vs the
        // championship/ungrouped bracket — a flat list mixing both reads as
        // cluttered once there are 30+ group matches. Alphabetical, same
        // convention as the Players and Table tabs.
        const groupNames = [...new Set(matches.filter(m => m.group).map(m => m.group))]
          .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));
        const champMatches  = matches.filter(m => !m.group);
        const hasGroupSplit = groupNames.length > 0;

        return (
          <div key={ev.event_id} style={{ marginBottom: multiEvent ? 48 : 0 }}>
            <BroadcastSectionHeader
              title={multiEvent ? ev.name.toUpperCase() : "FIXTURES"}
              count={matches.length}
            />
            {hasGroupSplit ? (
              <>
                {groupNames.map(name => {
                  const groupMatches = matches.filter(m => m.group === name);
                  return (
                    <CollapsibleGroup key={name} title={name} count={groupMatches.length}>
                      <MatchCardGrid matches={groupMatches} onSelect={onSelect} />
                    </CollapsibleGroup>
                  );
                })}
                {champMatches.length > 0 && (
                  <CollapsibleGroup title="Championship" count={champMatches.length}>
                    <MatchCardGrid matches={champMatches} onSelect={onSelect} />
                  </CollapsibleGroup>
                )}
              </>
            ) : (
              <MatchCardGrid matches={matches} onSelect={onSelect} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Leaderboard section (broadcast standings table) ───────────
const RANK_MEDAL = ["#f59e0b","#94a3b8","#b45309","var(--muted)"];

function StandingsTable({ rows, isMobile, advancesCount }) {
  if (!rows.length) {
    return <div style={{ textAlign:"center", padding:"60px 0", color:"var(--muted)", fontSize:14 }}>No matches played yet.</div>;
  }
  return (
    <div style={{ border:"1px solid var(--border)", borderRadius:12, overflow: isMobile ? "visible" : "hidden", boxShadow:"0 1px 4px rgba(0,0,0,.06)" }}>
      {/* Scrollable wrapper on mobile */}
      <div style={{ overflowX: isMobile ? "auto" : "visible", WebkitOverflowScrolling:"touch" }}>
      <div style={{ minWidth: isMobile ? 420 : "auto" }}>
      {/* Headers */}
      <div style={{ display:"grid", gridTemplateColumns:"36px 1fr 40px 40px 40px 40px 52px 60px", padding:"11px 16px", background:"var(--elevated)", borderBottom:"1px solid var(--border)" }}>
        {["#","Name","P","W","D","L","GD","Pts"].map((h, j) => (
          <div key={h} style={{ fontFamily:"var(--font-display)", fontSize:7, fontWeight:800, color:"var(--muted)", letterSpacing:1.5, textAlign: j === 1 ? "left" : "center" }}>{h}</div>
        ))}
      </div>

      {rows.map((row, i) => {
        const gd       = (row.sf || 0) - (row.sa || 0);
        const rc       = RANK_MEDAL[i] ?? RANK_MEDAL[3];
        const advances = advancesCount != null && i < advancesCount;

        return (
          <div key={row.name} style={{ display:"grid", gridTemplateColumns:"36px 1fr 40px 40px 40px 40px 52px 60px", padding:"12px 16px", borderBottom: i < rows.length - 1 ? "1px solid var(--border)" : "none", alignItems:"center", background: advances ? "rgba(22,163,74,.02)" : "transparent" }}>
            {/* Rank */}
            <div style={{ fontFamily:"var(--font-display)", fontSize: isMobile ? 14 : 18, fontWeight:900, color:rc, textAlign:"center", lineHeight:1 }}>{i + 1}</div>

            {/* Name — no avatar, just the name */}
            <div style={{ fontSize: isMobile ? 12 : 13, fontWeight:700, color:"var(--ink)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{row.name}</div>

            {/* P W D L */}
            {[row.p, row.w, row.d, row.l].map((v, j) => (
              <div key={j} style={{ textAlign:"center", fontSize: isMobile ? 12 : 14, fontWeight:600, color:"var(--ink)" }}>{v}</div>
            ))}

            {/* GD */}
            <div style={{ textAlign:"center", fontSize: isMobile ? 12 : 14, fontWeight:700, color: gd > 0 ? "#16a34a" : gd < 0 ? "#dc2626" : "var(--muted)" }}>
              {gd > 0 ? "+" : ""}{gd}
            </div>

            {/* Pts */}
            <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:3 }}>
              <span style={{ fontFamily:"var(--font-display)", fontSize: isMobile ? 15 : 20, fontWeight:900, color:"var(--ink)", lineHeight:1 }}>{row.pts}</span>
            </div>
          </div>
        );
      })}
      </div>
      </div>
    </div>
  );
}

function LeaderboardSection({ events }) {
  const w = useW();
  const isMobile = w < 640;
  const relevant = events.filter(ev => ev.format === "round_robin" || ev.format === "group_knockout");
  if (!relevant.length) return null;

  return (
    <div style={{ maxWidth:1240, margin:"0 auto", padding: isMobile ? "28px 16px" : "44px 40px" }}>
      {relevant.map((ev) => {
        const groups = computeStandings(ev);
        const isGK   = ev.format === "group_knockout";
        const hasNamedGroups = groups.length > 1 || !!groups[0]?.group;

        return (
          <div key={ev.event_id} style={{ marginBottom: relevant.length > 1 ? 48 : 0 }}>
            <BroadcastSectionHeader title={relevant.length > 1 ? ev.name.toUpperCase() : "GROUP STANDINGS"} />

            {groups.map(({ group, rows }) => (
              <div key={group || "all"} style={{ marginBottom: 24 }}>
                {hasNamedGroups && (
                  <div style={{ fontFamily:"var(--font-display)", fontSize:10, fontWeight:800, letterSpacing:1.5, color:"var(--primary)", textTransform:"uppercase", marginBottom:10 }}>
                    {group || "Ungrouped"}
                  </div>
                )}
                <StandingsTable rows={rows} isMobile={isMobile} advancesCount={isGK ? 2 : null} />
                {isGK && rows.length >= 2 && (
                  <p style={{ fontSize:11, color:"var(--muted)", marginTop:10, paddingLeft:2 }}>
                    <span style={{ color:"#16a34a", marginRight:4 }}>●</span>Top 2 advance to knockout round
                  </p>
                )}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}


// ── Teams section (broadcast grid cards) ─────────────────────
// Groups participants by their `group` field (named groups sorted
// alphabetically, ungrouped participants last), and sorts names
// alphabetically within each group.
function groupAndSortParticipants(ps) {
  const buckets = new Map();
  for (const p of ps) {
    const key = p.group || "Ungrouped";
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(p);
  }
  const keys = [...buckets.keys()].sort((a, b) => {
    if (a === "Ungrouped") return 1;
    if (b === "Ungrouped") return -1;
    return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
  });
  return keys.map(key => ({
    group: key,
    participants: buckets.get(key).sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
    ),
  }));
}

function TeamsSection({ events, isIndividual }) {
  const w = useW();
  const isMobile = w < 640;
  const eventsWithParticipants = events.filter(ev => (ev.participants || []).length > 0);
  if (!eventsWithParticipants.length) return null;
  const multiEvent = eventsWithParticipants.length > 1;
  const sectionTitle = isIndividual ? "PARTICIPATING PLAYERS" : "PARTICIPATING TEAMS";

  return (
    <div style={{ maxWidth:1240, margin:"0 auto", padding: isMobile ? "28px 16px" : "44px 40px" }}>
      {eventsWithParticipants.map((ev) => {
        const ps = ev.participants || [];
        const groups = groupAndSortParticipants(ps);
        const hasRealGroups = groups.length > 1 || groups[0]?.group !== "Ungrouped";
        return (
          <div key={ev.event_id} style={{ marginBottom: multiEvent ? 48 : 0 }}>
            <BroadcastSectionHeader title={multiEvent ? ev.name.toUpperCase() : sectionTitle} count={ps.length} />
            {groups.map(({ group, participants }) => (
              <div key={group} style={{ marginBottom: 24 }}>
                {hasRealGroups && (
                  <div style={{ fontFamily:"var(--font-display)", fontSize:10, fontWeight:800, letterSpacing:1.5, color:"var(--primary)", textTransform:"uppercase", marginBottom:10 }}>
                    {group}
                  </div>
                )}
                <div style={{ display:"grid", gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : "repeat(auto-fill, minmax(160px, 1fr))", gap: isMobile ? 8 : 10 }}>
                  {participants.map((p) => (
                    <div key={p.id} style={{ background:"var(--surface)", border:"1px solid var(--border)", borderRadius:10, padding:"14px 16px", display:"flex", alignItems:"center", gap:10, boxShadow:"0 1px 4px rgba(0,0,0,.06)" }}>
                      {p.logo_url && (
                        <div style={{ width:32, height:32, borderRadius:8, overflow:"hidden", flexShrink:0, border:"1px solid var(--border)" }}>
                          <img src={p.logo_url} alt={p.name} style={{ width:"100%", height:"100%", objectFit:"contain" }}/>
                        </div>
                      )}
                      <div style={{ fontSize:13, fontWeight:700, color:"var(--ink)", lineHeight:1.4, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{p.name}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

// ── Bracket section (Road to Final) ──────────────────────────
// The section itself is the ONLY horizontal scroll boundary.
// RoadToFinal's desktop brackets no longer have their own inner scroll wrappers,
// so the bracket renders at its natural pixel width and this container catches any overflow.
function BracketSection({ events }) {
  const w = useW();
  const isMobile = w < 640;
  const hPad = isMobile ? "16px" : "40px";
  return (
    <div style={{ paddingTop: isMobile ? 28 : 44, paddingBottom: isMobile ? 16 : 32, overflowX: "auto" }}>
      {/* Header keeps side padding so it aligns with the rest of the page */}
      <div style={{ paddingLeft: hPad, paddingRight: hPad, marginBottom: 24 }}>
        <BroadcastSectionHeader title="ROAD TO FINAL" />
      </div>
      {/* Bracket: padded so cards don't touch screen edges, but unconstrained in width */}
      <div style={{ paddingLeft: hPad, paddingRight: hPad }}>
        <RoadToFinal events={events} isMobile={isMobile} />
      </div>
    </div>
  );
}

// ── Draft view ────────────────────────────────────────────────
function DraftView({ tournament }) {
  return (
    <div style={{ maxWidth:480, margin:"72px auto", padding:"0 24px", textAlign:"center" }}>
      <h2 style={{ fontFamily:"var(--font-display)", fontSize:22, fontWeight:900, textTransform:"uppercase", letterSpacing:-1, marginBottom:12 }}>Coming Soon</h2>
      <p style={{ fontSize:14, color:"var(--muted)", lineHeight:1.7, marginBottom:28 }}>
        <strong style={{ color:"var(--ink)" }}>{tournament.name}</strong> is still being set up. Check back soon.
      </p>
      {tournament.org_name && (
        <div style={{ display:"inline-flex", alignItems:"center", gap:8, background:"var(--elevated)", border:"1px solid var(--border)", borderRadius:8, padding:"8px 16px", fontSize:13, color:"var(--muted)" }}>
          Organised by <strong style={{ color:"var(--ink)" }}>{tournament.org_name}</strong>
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────
export default function TournamentPublic() {
  const { slug, sportUrl } = useParams();
  const navigate = useNavigate();

  const [data,          setData]          = useState(null);
  const [error,         setError]         = useState(null);
  const [activeId,      setActiveId]      = useState(null);
  const [lastUpdated,   setLastUpdated]   = useState(null);
  const [selectedMatch, setSelectedMatch] = useState(null);
  const [darkMode,      setDarkMode]      = useState(
    () => (localStorage.getItem("theme") || "light") === "dark"
  );
  const fetchingRef = useRef(false);

  usePageMeta(
    data?.tournament?.name ? `${data.tournament.name} — Live Scores & Fixtures` : null,
    data?.tournament?.name
      ? `Live scores, fixtures, brackets and results for ${data.tournament.name} on TheScoreBoard.`
      : null
  );

  const toggleDark = () => {
    const next = !darkMode;
    setDarkMode(next);
    document.documentElement.setAttribute("data-theme", next ? "dark" : "light");
    localStorage.setItem("theme", next ? "dark" : "light");
  };

  const fetchData = useCallback(async () => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    try {
      const d = sportUrl
        ? await getSportTournament(sportUrl, slug)
        : await getTournamentBySlug(slug);
      setData(d);
      setLastUpdated(new Date());
    } catch(e) {
      setError(e.message || "Tournament not found.");
    } finally {
      fetchingRef.current = false;
    }
  }, [slug, sportUrl]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Live updates ──────────────────────────────────────────
  // Primary: WebSocket push from the backend (sub-second score updates).
  // Fallback: 10s polling whenever the socket is down (also covers dev
  // setups where the WS proxy isn't configured). The backend warms its HTTP
  // cache before every WS push, so fallback polls always see fresh data.
  useEffect(() => {
    let ws = null, retryId = null, pollId = null, pingId = null, alive = true;

    const apiBase = import.meta.env.VITE_API_URL || "/api";
    const absBase = apiBase.startsWith("http") ? apiBase : window.location.origin + apiBase;
    const wsUrl   = absBase.replace(/^http/, "ws") + `/ws/tournament/${slug}`;

    const startPolling = () => {
      if (!pollId) pollId = setInterval(() => { if (!document.hidden) fetchData(); }, 10_000);
    };
    const stopPolling = () => { if (pollId) { clearInterval(pollId); pollId = null; } };

    const connect = () => {
      if (!alive) return;
      try { ws = new WebSocket(wsUrl); } catch { startPolling(); return; }

      ws.onopen = () => {
        stopPolling();
        pingId = setInterval(() => { if (ws?.readyState === 1) ws.send("ping"); }, 20_000);
      };
      ws.onmessage = (e) => {
        if (e.data === "ping" || e.data === "pong") return;
        try {
          const d = JSON.parse(e.data);
          if (!d?.tournament) return;
          if (sportUrl) fetchData();   // sport-filtered page has a different payload shape
          else { setData(d); setLastUpdated(new Date()); }
        } catch { /* ignore malformed frames */ }
      };
      ws.onclose = () => {
        if (pingId) { clearInterval(pingId); pingId = null; }
        if (alive) { startPolling(); retryId = setTimeout(connect, 5_000); }
      };
      ws.onerror = () => { try { ws.close(); } catch { /* already closed */ } };
    };

    connect();
    return () => {
      alive = false;
      if (retryId) clearTimeout(retryId);
      if (pingId)  clearInterval(pingId);
      stopPolling();
      try { ws?.close(); } catch { /* noop */ }
    };
  }, [slug, sportUrl, fetchData]);

  // Apply sport accent + set default active tab when data first loads
  useEffect(() => {
    if (!data) return;
    const firstSportKey = data.events?.[0]?.sport_key;
    if (firstSportKey) applyAccent(firstSportKey);
    const t = data.tournament;
    const evs = data.events || [];
    const status = t?.status || "draft";
    setActiveId(prev => {
      if (prev) return prev;
      return "fixtures";
    });
  }, [data]);


  const switchTab = (id) => {
    setActiveId(id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // ── Loading ──
  if (!data && !error) return <PageLoader />;

  // ── Error ──
  if (error) return (
    <div className="auth-wrap">
      <div className="auth-card" style={{ textAlign:"center" }}>
        <div className="auth-logo">The<span className="accent">Score</span>Board</div>
        <div style={{ fontSize:40, margin:"20px 0 12px", color:"var(--muted)" }}>:(</div>
        <p style={{ color:"var(--muted)", marginBottom:20, fontSize:14 }}>{error}</p>
        <button className="btn btn-primary" onClick={() => navigate("/")}>Go Home</button>
      </div>
    </div>
  );

  const { tournament: t, events = [] } = data;
  const status = t.status || "draft";

  const allMatches  = events.flatMap(ev => ev.all_matches || []);
  const doneCt      = allMatches.filter(m => m.status === "done").length;
  const totalPlayers = events.reduce((s, ev) => s + (ev.player_count ?? 0), 0);

  const hasBoard   = events.some(ev => ev.format === "round_robin"     || ev.format === "group_knockout");
  const hasTeams   = events.some(ev => (ev.participants || []).length > 0);
  const teamCount  = events.reduce((n, ev) => n + (ev.participants || []).length, 0);
  // Show bracket tab when tournament has a knockout format with at least one real stage match
  const BRACKET_STAGES = new Set(["quarter","semi","final","third_place"]);
  const hasBracket = events.some(ev =>
    (ev.format === "direct_knockout" || ev.format === "group_knockout") &&
    (ev.all_matches || []).some(m => BRACKET_STAGES.has(m.stage))
  );

  const primarySportKey = events[0]?.sport_key;

  // Individual sports (badminton / table tennis single play) → label tabs "Players"
  const isIndividualSport = (primarySportKey === "badminton" || primarySportKey === "table_tennis") &&
    events.every(ev => ev.participant_type === "individual");
  const teamsLabel = isIndividualSport ? "Players" : "Teams";

  if (status === "draft") return (
    <div className="app">
      <TickerBar allMatches={[]} />
      <TopBar darkMode={darkMode} onToggleDark={toggleDark} />
      <HeroBand tournament={t} totalPlayers={0} doneMatches={0} totalMatches={0} sportKey={primarySportKey} events={events} slug={slug} />
      <DraftView tournament={t} />
      <SiteFooter />
    </div>
  );

  // Build section list — order: Matches | Knockout | Table | Players
  const sections = [
    { id:"fixtures",    label:"Matches",      count: allMatches.length },
    ...(hasBracket ? [{ id:"bracket",    label:"Knockout"                        }] : []),
    ...(hasBoard   ? [{ id:"leaderboard", label:"Table"                           }] : []),
    ...(hasTeams   ? [{ id:"teams",       label: teamsLabel,     count: teamCount }] : []),
  ];

  // Default landing tab is Matches (live scores) — spectators want to see the action first.
  const effectiveActive = activeId || "fixtures";

  return (
    <div className="app">

      {/* ── Scrolling scores ticker — only in fixtures/live status, no TBD matches ── */}
      <TickerBar allMatches={
        status === "live"
          ? allMatches.filter(m =>
              m.player_1?.name && m.player_1.name !== "TBD" &&
              m.player_2?.name && m.player_2.name !== "TBD"
            )
          : []
      } />

      {/* ── Top bar (brand + theme toggle only) ── */}
      <TopBar darkMode={darkMode} onToggleDark={toggleDark} />

      {/* ── Hero band (tournament identity) ── */}
      <HeroBand
        tournament={t}
        totalPlayers={totalPlayers}
        doneMatches={doneCt}
        totalMatches={allMatches.length}
        sportKey={primarySportKey}
        events={events}
        slug={slug}
      />

      {/* ── Tab bar — below the hero, sticky under the top bar ── */}
      <TabBar sections={sections} activeId={effectiveActive} onNav={switchTab} />

      {/* ── Tab content ── */}
      <div style={{ minHeight:"50vh" }}>
        {effectiveActive === "fixtures" && (
          <>
            <FixturesSection events={events} onSelect={setSelectedMatch} />
            {t.sponsors?.length > 0 && (
              <div style={{ maxWidth:1240, margin:"0 auto", padding:"0 16px" }}>
                <SponsorDisplay sponsors={t.sponsors} />
              </div>
            )}
          </>
        )}
        {effectiveActive === "teams"       && hasTeams  && <TeamsSection events={events} isIndividual={isIndividualSport} />}
        {effectiveActive === "leaderboard" && hasBoard  && <LeaderboardSection events={events} />}
        {effectiveActive === "bracket"     && hasBracket && <BracketSection events={events} />}
      </div>

      {/* ── Footer ── */}
      <div style={{ marginTop:40 }}>
        <SiteFooter />
      </div>

      {selectedMatch && <MatchDetailModal match={selectedMatch} onClose={() => setSelectedMatch(null)} />}
    </div>
  );
}
