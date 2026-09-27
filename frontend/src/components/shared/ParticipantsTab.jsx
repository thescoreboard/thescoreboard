/**
 * ParticipantsTab — renders the correct participant management UI
 * based on event.participant_type:
 *
 *   "individual"    → add single players, assign to groups
 *   "doubles_pair"  → register pairs (captain + partner names)
 *   "team"          → register teams with full roster
 *
 * Import this in EventWorkspace and render it in the players/teams tab.
 */

import { useState, useEffect } from "react";

function useIsMobile() {
  const [mobile, setMobile] = useState(() => typeof window !== "undefined" && window.innerWidth < 640);
  useEffect(() => {
    const handler = () => setMobile(window.innerWidth < 640);
    window.addEventListener("resize", handler, { passive: true });
    return () => window.removeEventListener("resize", handler);
  }, []);
  return mobile;
}

// ── Individual Players ────────────────────────────────────────
const SEED_LEVELS = [
  { value: "",             label: "No seed"      },
  { value: "beginner",     label: "Beginner"     },
  { value: "intermediate", label: "Intermediate" },
  { value: "advanced",     label: "Advanced"     },
  { value: "pro",          label: "Pro"          },
];

const SEED_COLOR = { beginner: "#64b5f6", intermediate: "#81c784", advanced: "#ffb74d", pro: "#e57373" };

const AGE_GROUPS = [
  { value: "",      label: "All ages"  },
  { value: "u18",   label: "Under 18"  },
  { value: "18-30", label: "18 – 30"   },
  { value: "31-45", label: "31 – 45"   },
  { value: "45+",   label: "45+"       },
];

function matchesAgeGroup(age, group) {
  if (!group) return true;
  const a = parseInt(age);
  if (isNaN(a)) return group === "";   // no age set → only shown on "All ages"
  if (group === "u18")   return a < 18;
  if (group === "18-30") return a >= 18 && a <= 30;
  if (group === "31-45") return a >= 31 && a <= 45;
  if (group === "45+")   return a > 45;
  return true;
}

export function IndividualTab({ event, onAddPlayer, onCreateGroup, onAssignGroup, onRemovePlayer, onUpdateSeed, flash }) {
  const isMobile = useIsMobile();
  const [pForm, setPForm] = useState({ name: "", age: "", gender: "Male", seed_level: "" });

  const [fName,     setFName]     = useState("");
  const [fGender,   setFGender]   = useState("");
  const [fSeed,     setFSeed]     = useState("");
  const [fAge,      setFAge]      = useState("");

  const handleAdd = () => {
    if (!pForm.name.trim()) return flash("Name required.");
    onAddPlayer({ ...pForm, seed_level: pForm.seed_level || null, group_id: null });
    setPForm({ name: "", age: "", gender: "Male", seed_level: "" });
  };

  // All enrolled players (grouped + ungrouped)
  const allGrouped = (event.groups || []).flatMap(g => (g.players || []));
  const ungrouped  = event.ungrouped_players || [];
  const allPlayers = [...allGrouped, ...ungrouped];

  const hasFilter = fName || fGender || fSeed || fAge;
  const clearFilters = () => { setFName(""); setFGender(""); setFSeed(""); setFAge(""); };

  const filtered = allPlayers.filter(p => {
    if (fName   && !p.name.toLowerCase().includes(fName.toLowerCase())) return false;
    if (fGender && (p.gender || "").toLowerCase() !== fGender.toLowerCase()) return false;
    if (fSeed   && (p.seed_level || "") !== fSeed) return false;
    if (fAge    && !matchesAgeGroup(p.age, fAge)) return false;
    return true;
  });

  return (
    <div>
      {/* Add player */}
      <div className="card">
        <div className="card-title">Add Player</div>
        {isMobile ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <input className="input" placeholder="Player name" style={{ width: "100%" }}
              value={pForm.name} onChange={e => setPForm(f => ({ ...f, name: e.target.value }))}
              onKeyDown={e => e.key === "Enter" && handleAdd()} />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
              <input className="input" placeholder="Age" type="number"
                value={pForm.age} onChange={e => setPForm(f => ({ ...f, age: e.target.value }))} />
              <select className="input" value={pForm.gender}
                onChange={e => setPForm(f => ({ ...f, gender: e.target.value }))}>
                <option>Male</option><option>Female</option>
              </select>
              <select className="input" value={pForm.seed_level}
                onChange={e => setPForm(f => ({ ...f, seed_level: e.target.value }))}>
                <option value="">No seed</option>
                <option value="beginner">Beginner</option>
                <option value="intermediate">Intermediate</option>
                <option value="advanced">Advanced</option>
                <option value="pro">Pro</option>
              </select>
            </div>
            <button className="btn btn-primary btn-lg" style={{ width: "100%" }} onClick={handleAdd}>Add Player</button>
          </div>
        ) : (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input className="input" placeholder="Player name" style={{ flex: 2, minWidth: 140 }}
              value={pForm.name} onChange={e => setPForm(f => ({ ...f, name: e.target.value }))}
              onKeyDown={e => e.key === "Enter" && handleAdd()} />
            <input className="input" placeholder="Age" type="number" style={{ width: 72 }}
              value={pForm.age} onChange={e => setPForm(f => ({ ...f, age: e.target.value }))} />
            <select className="input" style={{ width: 100 }} value={pForm.gender}
              onChange={e => setPForm(f => ({ ...f, gender: e.target.value }))}>
              <option>Male</option><option>Female</option>
            </select>
            <select className="input" style={{ width: 120 }} value={pForm.seed_level}
              onChange={e => setPForm(f => ({ ...f, seed_level: e.target.value }))}>
              <option value="">No seed</option>
              <option value="beginner">Beginner</option>
              <option value="intermediate">Intermediate</option>
              <option value="advanced">Advanced</option>
              <option value="pro">Pro</option>
            </select>
            <button className="btn btn-primary" onClick={handleAdd}>Add</button>
          </div>
        )}
      </div>


      {/* Player list — detailed rows for all formats */}
      <div className="card">
        {/* ── Header row: title + count ── */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <div className="card-title" style={{ marginBottom: 0 }}>
            Players
            <span style={{ marginLeft: 8, fontFamily: "var(--font-body)", fontSize: 13, fontWeight: 400, color: "var(--muted)", textTransform: "none", letterSpacing: 0 }}>
              {hasFilter
                ? `${filtered.length} of ${allPlayers.length}`
                : allPlayers.length}
            </span>
          </div>
          {hasFilter && (
            <button onClick={clearFilters}
              style={{ fontSize: 11, fontWeight: 700, color: "var(--primary)", background: "none", border: "none", cursor: "pointer", padding: 0, textDecoration: "underline" }}>
              Clear filters
            </button>
          )}
        </div>

        {/* ── Filter bar ── */}
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "2fr 1fr 1fr 1fr", gap: 8, marginBottom: 14 }}>
          {/* Name search — spans full width on mobile */}
          <div style={{ position: "relative", gridColumn: isMobile ? "1 / -1" : undefined }}>
            <span style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", fontSize: 13, color: "var(--muted)", pointerEvents: "none" }}>🔍</span>
            <input
              className="input"
              placeholder="Search name…"
              value={fName}
              onChange={e => setFName(e.target.value)}
              style={{ paddingLeft: 28, width: "100%", boxSizing: "border-box" }}
            />
          </div>

          <select className="input" value={fGender} onChange={e => setFGender(e.target.value)}>
            <option value="">All genders</option>
            <option value="Male">Male</option>
            <option value="Female">Female</option>
          </select>

          <select className="input" value={fAge} onChange={e => setFAge(e.target.value)}>
            {AGE_GROUPS.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
          </select>

          <select className="input" value={fSeed} onChange={e => setFSeed(e.target.value)}>
            <option value="">All levels</option>
            <option value="beginner">Beginner</option>
            <option value="intermediate">Intermediate</option>
            <option value="advanced">Advanced</option>
            <option value="pro">Pro</option>
          </select>
        </div>

        {allPlayers.length === 0 ? (
          <div style={{ fontSize: 13, color: "var(--muted)" }}>No players added yet.</div>
        ) : filtered.length === 0 ? (
          <div style={{ fontSize: 13, color: "var(--muted)", padding: "16px 0", textAlign: "center" }}>
            No players match the current filters.
          </div>
        ) : isMobile ? (
          /* ── Mobile: card per player ── */
          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            {filtered.map((p, idx) => (
              <div key={p.player_id} style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "10px 4px",
                borderBottom: idx < filtered.length - 1 ? "1px solid var(--border)" : "none",
              }}>
                {/* Name + meta */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: "var(--ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {p.name}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 1 }}>
                    {[p.age ? `Age ${p.age}` : null, p.gender].filter(Boolean).join(" · ") || "—"}
                  </div>
                </div>

                {/* Seed select */}
                <select
                  value={p.seed_level || ""}
                  onChange={e => onUpdateSeed && onUpdateSeed(p.player_id, e.target.value)}
                  style={{
                    padding: "4px 6px", borderRadius: 6, fontSize: 11, fontWeight: 600,
                    border: "1px solid var(--border)", background: "var(--surface)",
                    color: p.seed_level ? SEED_COLOR[p.seed_level] || "var(--ink)" : "var(--muted)",
                    cursor: onUpdateSeed ? "pointer" : "default",
                    flexShrink: 0, maxWidth: 100,
                  }}
                >
                  {SEED_LEVELS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>

                {/* Remove */}
                {onRemovePlayer && (
                  <button onClick={() => onRemovePlayer(p.player_id)}
                    style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer", padding: "0 2px", fontSize: 18, lineHeight: 1, opacity: 0.5, flexShrink: 0 }}
                    title="Remove player">×</button>
                )}
              </div>
            ))}
          </div>
        ) : (
          /* ── Desktop: table grid ── */
          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            {/* Column headers */}
            <div style={{
              display: "grid", gridTemplateColumns: "1fr 56px 80px 130px auto",
              gap: 8, padding: "6px 8px",
              fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: 1,
              color: "var(--muted)", borderBottom: "1px solid var(--border)",
            }}>
              <span>Name</span>
              <span>Age</span>
              <span>Gender</span>
              <span>Skill Level</span>
              <span></span>
            </div>

            {filtered.map((p, idx) => (
              <div key={p.player_id} style={{
                display: "grid", gridTemplateColumns: "1fr 56px 80px 130px auto",
                gap: 8, padding: "9px 8px", alignItems: "center",
                borderBottom: idx < filtered.length - 1 ? "1px solid var(--border)" : "none",
                background: idx % 2 === 0 ? "transparent" : "rgba(0,0,0,0.015)",
              }}>
                <span style={{ fontWeight: 700, fontSize: 14, color: "var(--ink)" }}>{p.name}</span>
                <span style={{ fontSize: 13, color: "var(--muted)" }}>{p.age || "—"}</span>
                <span style={{ fontSize: 12, color: "var(--muted)", textTransform: "capitalize" }}>{p.gender || "—"}</span>
                <select
                  value={p.seed_level || ""}
                  onChange={e => onUpdateSeed && onUpdateSeed(p.player_id, e.target.value)}
                  style={{
                    padding: "4px 8px", borderRadius: 6, fontSize: 12, fontWeight: 600,
                    border: "1px solid var(--border)", background: "var(--surface)",
                    color: p.seed_level ? SEED_COLOR[p.seed_level] || "var(--ink)" : "var(--muted)",
                    cursor: onUpdateSeed ? "pointer" : "default",
                  }}
                >
                  {SEED_LEVELS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
                {onRemovePlayer && (
                  <button onClick={() => onRemovePlayer(p.player_id)}
                    style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer", padding: "0 4px", fontSize: 16, lineHeight: 1, opacity: 0.6 }}
                    title="Remove player">×</button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Doubles Pairs ─────────────────────────────────────────────
export function DoublesTab({ event, onAddPair, onRemovePair, pairs, flash, numGroups, setNumGroups, onGenerateGroups }) {
  const [form, setForm] = useState({
    pair_name:       "",
    player1_name:    "",
    player2_name:    "",
    contact_phone:   "",
    seed_level:      "",
  });

  const handleAdd = () => {
    if (!form.player1_name.trim()) return flash("Player 1 name required.");
    if (!form.player2_name.trim()) return flash("Player 2 name required.");
    const pairName = form.pair_name.trim() ||
      `${form.player1_name.trim()} & ${form.player2_name.trim()}`;
    onAddPair({ ...form, pair_name: pairName, seed_level: form.seed_level || null });
    setForm({ pair_name: "", player1_name: "", player2_name: "", contact_phone: "", seed_level: "" });
  };

  const isMixed        = event.sport_config?.mixed;
  const isGroupKnockout = event.format === "group_knockout";
  const groups          = event.groups || [];
  const hasGroups       = groups.length > 0;

  return (
    <div>
      {/* Info banner */}
      <div style={{
        background: "var(--gold-dim)", border: "1px solid rgba(255,204,0,0.25)",
        borderRadius: 8, padding: "10px 14px", marginBottom: 14,
        fontFamily: "var(--font-display)", fontSize: 11, fontWeight: 700,
        textTransform: "uppercase", letterSpacing: 1, color: "var(--gold)",
      }}>
        {isMixed ? "Mixed Doubles" : "Doubles"} — Enter both partners together
      </div>

      {/* Add pair form */}
      <div className="card">
        <div className="card-title">Register a Pair</div>

        <div className="field">
          <label>Pair Name (optional)</label>
          <input className="input" placeholder={`e.g. ${form.player1_name || "Rahul"} & ${form.player2_name || "Priya"}`}
            value={form.pair_name} onChange={e => setForm(f => ({ ...f, pair_name: e.target.value }))} />
          <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>
            Leave blank to auto-generate from player names
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>{isMixed ? "Male Player *" : "Player 1 *"}</label>
            <input className="input" placeholder="Name"
              value={form.player1_name} onChange={e => setForm(f => ({ ...f, player1_name: e.target.value }))} />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>{isMixed ? "Female Player *" : "Player 2 *"}</label>
            <input className="input" placeholder="Name"
              value={form.player2_name} onChange={e => setForm(f => ({ ...f, player2_name: e.target.value }))} />
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Contact Phone (optional)</label>
            <input className="input" placeholder="9876543210" type="tel"
              value={form.contact_phone} onChange={e => setForm(f => ({ ...f, contact_phone: e.target.value }))} />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Skill Level (optional)</label>
            <select className="input" value={form.seed_level}
              onChange={e => setForm(f => ({ ...f, seed_level: e.target.value }))}>
              <option value="">No seed</option>
              <option value="beginner">Beginner</option>
              <option value="intermediate">Intermediate</option>
              <option value="advanced">Advanced</option>
              <option value="pro">Pro</option>
            </select>
          </div>
        </div>

        <div style={{ textAlign: "right" }}>
          <button className="btn btn-primary" onClick={handleAdd}>Add Pair</button>
        </div>
      </div>

      {/* ── Groups section (group_knockout only) ──────────────── */}
      {isGroupKnockout && (
        <div className="card">
          <div className="card-title">Groups</div>

          {!hasGroups ? (
            <div>
              <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 14 }}>
                Pairs are randomly divided into groups. Each group runs its own knockout bracket.
                Winners and runners-up advance to the championship bracket.
              </div>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 12, flexWrap: "wrap" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: "var(--muted)" }}>
                    Number of Groups
                  </span>
                  <input
                    type="number"
                    value={numGroups}
                    min={2} max={16}
                    onChange={e => setNumGroups(Math.max(2, Math.min(16, parseInt(e.target.value) || 2)))}
                    style={{ width: 60, padding: "6px 8px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--ink)", fontSize: 15, fontWeight: 700, textAlign: "center" }}
                  />
                  <span style={{ fontSize: 10, color: "var(--muted)" }}>Min 2 · Standard 4</span>
                </div>
                <button
                  className="btn btn-primary"
                  style={{ height: 36 }}
                  disabled={pairs.length < numGroups * 2}
                  onClick={onGenerateGroups}
                >
                  Generate Groups
                </button>
              </div>
              {pairs.length < numGroups * 2 && pairs.length > 0 && (
                <div style={{ marginTop: 10, fontSize: 11, color: "var(--gold)", fontWeight: 600 }}>
                  Need at least {numGroups * 2} pairs for {numGroups} groups (currently {pairs.length}).
                </div>
              )}
              {pairs.length === 0 && (
                <div style={{ marginTop: 10, fontSize: 11, color: "var(--muted)" }}>
                  Register pairs above first.
                </div>
              )}
            </div>
          ) : (
            <div>
              <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 12 }}>
                {groups.length} group{groups.length !== 1 ? "s" : ""} created — go to{" "}
                <strong>Fixtures</strong> to manage matches.
              </div>
              {groups.map(g => {
                const groupPairs = (g.players || g.participants || []);
                return (
                  <div key={g.group_id} className="group-box" style={{ marginBottom: 10 }}>
                    <div className="group-title">
                      {g.name}
                      <span style={{ fontWeight: 400, fontSize: 11, color: "var(--muted)", textTransform: "none", marginLeft: 6 }}>
                        ({groupPairs.length} pairs)
                      </span>
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {groupPairs.map((p, i) => (
                        <span key={p.team_id || p.ep_id || i} className="player-chip">
                          {p.name}
                        </span>
                      ))}
                      {groupPairs.length === 0 && (
                        <span style={{ fontSize: 12, color: "var(--muted)", fontStyle: "italic" }}>Empty</span>
                      )}
                    </div>
                  </div>
                );
              })}
              <button className="btn btn-sm btn-outline" style={{ marginTop: 4, fontSize: 11 }} onClick={onGenerateGroups}>
                Reset &amp; Regenerate Groups
              </button>
            </div>
          )}
        </div>
      )}

      {/* Registered pairs */}
      <div className="section-label">{pairs.length} pair{pairs.length !== 1 ? "s" : ""} registered</div>

      {pairs.length === 0 ? (
        <div className="empty">
          <div className="empty-icon"></div>
          No pairs registered yet.
        </div>
      ) : (
        pairs.map((ep, i) => {
          const team = ep.team || ep;
          const members = team.members || [];
          const p1 = members.find(m => m.role === "player1") || members[0];
          const p2 = members.find(m => m.role === "player2") || members[1];
          return (
            <div key={team.team_id || i} className="team-card">
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <div style={{
                    fontFamily: "var(--font-display)", fontSize: 16, fontWeight: 900,
                    textTransform: "uppercase", letterSpacing: -0.5, color: "var(--ink)",
                  }}>
                    {p1?.name || "—"} & {p2?.name || "—"}
                  </div>
                  {(team.contact_phone || team.seed_level) && (
                    <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2, display: "flex", gap: 8 }}>
                      {team.contact_phone && <span>📞 {team.contact_phone}</span>}
                      {team.seed_level && (
                        <span style={{ fontWeight: 700, textTransform: "capitalize", color: "var(--gold)" }}>
                          {team.seed_level}
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <button className="btn btn-sm btn-outline" style={{ color: "var(--red)", borderColor: "var(--red)" }}
                  onClick={() => onRemovePair(team.team_id)}>
                  Remove
                </button>
              </div>
              {team.name && team.name !== `${p1?.name} & ${p2?.name}` && (
                <div style={{ marginTop: 6 }}>
                  <span className="pill pill-gold">{team.name}</span>
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}

// ── Team Sport ────────────────────────────────────────────────
export function TeamTab({ event, onAddTeam, onRemoveTeam, teams, flash }) {
  const squadSize    = event.squad_size   || event.sport_config?.squad_size  || 11;
  const teamSize     = event.team_size    || event.sport_config?.team_size   || 11;
  const substitutes  = event.substitutes  || event.sport_config?.substitutes || 0;
  const totalRoster  = (event.sport_key === "football") ? (teamSize + substitutes) : squadSize;
  const sportKey     = event.sport_key;

  const [teamForm,    setTeamForm]    = useState({ name: "", contact_name: "", contact_phone: "" });
  const [teamMembers, setTeamMembers] = useState(() => {
    const slots = Math.min(totalRoster, 15);
    return Array.from({ length: slots }, (_, i) => ({
      name: "", role: i === 0 ? "captain" : i === 1 ? "vice_captain" : "player",
      jersey: "", age: "",
    }));
  });

  const updateMember = (i, field, val) =>
    setTeamMembers(prev => prev.map((m, idx) => idx === i ? { ...m, [field]: val } : m));

  const addSlot = () => setTeamMembers(prev => [...prev, { name: "", role: "player", jersey: "", age: "" }]);
  const removeSlot = (i) => setTeamMembers(prev => prev.filter((_, idx) => idx !== i));

  const handleAdd = () => {
    if (!teamForm.name.trim()) return flash("Team name required.");
    const validMembers = teamMembers.filter(m => m.name.trim());
    if (!validMembers.length) return flash("Add at least one player.");
    onAddTeam(teamForm, validMembers.map(m => ({
      name: m.name.trim(),
      role: m.role,
      jersey_number: m.jersey ? parseInt(m.jersey) || null : null,
      age: m.age ? parseInt(m.age) || null : null,
    })));
    setTeamForm({ name: "", contact_name: "", contact_phone: "" });
    setTeamMembers(Array.from({ length: Math.min(totalRoster, 15) }, (_, i) => ({
      name: "", role: i === 0 ? "captain" : i === 1 ? "vice_captain" : "player",
      jersey: "", age: "",
    })));
  };

  const roleOptions = sportKey === "football"
    ? ["captain", "vice_captain", "player"]
    : sportKey === "cricket"
    ? ["captain", "vice_captain", "player", "wicketkeeper", "bowler"]
    : ["captain", "player"];

  return (
    <div>
      {/* Squad size info banner */}
      <div style={{
        background: "var(--primary-dim)", border: "1px solid rgba(255,107,53,0.2)",
        borderRadius: 8, padding: "10px 14px", marginBottom: 14,
        display: "flex", gap: 16, flexWrap: "wrap",
      }}>
        {sportKey === "football" && (
          <>
            <div>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 900, color: "var(--primary)", lineHeight: 1 }}>{teamSize}</div>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: "var(--muted)" }}>On Field</div>
            </div>
            <div>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 900, color: "var(--gold)", lineHeight: 1 }}>{substitutes}</div>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: "var(--muted)" }}>Substitutes</div>
            </div>
            <div>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 900, color: "var(--ink)", lineHeight: 1 }}>{totalRoster}</div>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: "var(--muted)" }}>Total Squad</div>
            </div>
          </>
        )}
        {sportKey === "cricket" && (
          <div>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 900, color: "var(--primary)", lineHeight: 1 }}>{squadSize}</div>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: "var(--muted)" }}>Squad Size</div>
          </div>
        )}
      </div>

      {/* Add team form */}
      <div className="card">
        <div className="card-title">Register a Team</div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
          <input className="input" placeholder="Team name *" style={{ flex: 2, minWidth: 140 }}
            value={teamForm.name} onChange={e => setTeamForm(f => ({ ...f, name: e.target.value }))} />
          <input className="input" placeholder="Contact name" style={{ flex: 1, minWidth: 110 }}
            value={teamForm.contact_name} onChange={e => setTeamForm(f => ({ ...f, contact_name: e.target.value }))} />
          <input className="input" placeholder="Phone" style={{ flex: 1, minWidth: 100 }}
            value={teamForm.contact_phone} onChange={e => setTeamForm(f => ({ ...f, contact_phone: e.target.value }))} />
        </div>

        <div style={{ fontFamily: "var(--font-display)", fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: 2, color: "var(--muted)", marginBottom: 10 }}>
          Squad Roster ({teamMembers.filter(m => m.name.trim()).length}/{totalRoster})
        </div>

        {/* Column headers */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 60px 52px 140px 32px", gap: 6, marginBottom: 4 }}>
          {["Name", "Jersey", "Age", "Role", ""].map(h => (
            <span key={h} style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: 1, color: "var(--muted)" }}>{h}</span>
          ))}
        </div>

        {teamMembers.map((m, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 60px 52px 140px 32px", gap: 6, marginBottom: 6, alignItems: "center" }}>
            <input className="input"
              placeholder={i === 0 ? "Captain *" : i === 1 ? "Vice Captain" : `Player ${i + 1}`}
              value={m.name} onChange={e => updateMember(i, "name", e.target.value)} />
            <input className="input" type="number" placeholder="#"
              value={m.jersey} onChange={e => updateMember(i, "jersey", e.target.value)}
              style={{ textAlign: "center" }} />
            <input className="input" type="number" placeholder="Age" min="5" max="60"
              value={m.age} onChange={e => updateMember(i, "age", e.target.value)}
              style={{ textAlign: "center" }} />
            <select className="input" value={m.role} onChange={e => updateMember(i, "role", e.target.value)}>
              {roleOptions.map(r => (
                <option key={r} value={r}>
                  {r === "vice_captain" ? "Vice Captain" : r.charAt(0).toUpperCase() + r.slice(1)}
                </option>
              ))}
            </select>
            <button onClick={() => removeSlot(i)} disabled={teamMembers.length === 1}
              style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer", fontSize: 18, padding: 0 }}>×</button>
          </div>
        ))}

        {teamMembers.length < totalRoster + 3 && (
          <button onClick={addSlot}
            style={{ background: "none", border: "1.5px dashed var(--border)", color: "var(--muted)", borderRadius: 6, padding: 8, cursor: "pointer", fontFamily: "var(--font-display)", fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", width: "100%", marginTop: 4 }}>
            + Add Player
          </button>
        )}

        <div style={{ textAlign: "right", marginTop: 14 }}>
          <button className="btn btn-primary" onClick={handleAdd}>Register Team</button>
        </div>
      </div>

      {/* Enrolled teams */}
      <div className="section-label">{teams.length} team{teams.length !== 1 ? "s" : ""} registered</div>

      {teams.length === 0 ? (
        <div className="empty">
          <div className="empty-icon"></div>
          No teams registered yet.
        </div>
      ) : teams.map((ep, i) => {
        const team = ep.team || ep;
        return (
          <div key={team.team_id || i} className="team-card">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div className="team-name">{team.name}</div>
                <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
                  {team.contact_name}{team.contact_phone ? ` · ${team.contact_phone}` : ""} · {team.member_count} players
                </div>
              </div>
              <button className="btn btn-sm btn-outline" style={{ color: "var(--red)", borderColor: "var(--red)" }}
                onClick={() => onRemoveTeam(team.team_id)}>
                Remove
              </button>
            </div>
            <div className="roster">
              {(team.members || []).map(m => (
                <span key={m.tm_id} className={`roster-chip${m.role === "captain" ? " captain" : m.role === "vice_captain" ? " vc" : ""}`}>
                  {m.role === "captain" ? "© " : m.role === "vice_captain" ? "VC " : ""}
                  {m.name}
                  {m.jersey_number != null ? ` #${m.jersey_number}` : ""}
                </span>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}