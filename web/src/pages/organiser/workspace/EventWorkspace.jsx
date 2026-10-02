import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  getWorkspace,
  createPlayer, addPlayerToEvent, assignPlayerGroup, removePlayerFromEvent,
  updateParticipantSeed,
  createGroup, generateFixtures, createMatch, generateGroupMatches,
  updateMatchStatus, updateScore, undoSet, rematchMatch, deleteMatch, walkoverMatch,
  getMe, clearToken, configureEvent, updateTournament, updateEvent,
  transitionTournament,
} from "../../../api/client";
import PageLoader from "../../../components/shared/PageLoader";
import { useIsMobile } from "../../../hooks/useIsMobile";
import TTScorer        from "../../../components/scoring/TTScorer";
import BadmintonScorer from "../../../components/scoring/BadmintonScorer";
import CricketScorer   from "../../../components/scoring/CricketScorer";
import FootballScorer  from "../../../components/scoring/FootballScorer";
import OrgHeader            from "../../../components/shared/OrgHeader";
import { IndividualTab, DoublesTab, TeamTab } from "../../../components/shared/ParticipantsTab";
import SponsorsSection      from "../../../components/organiser/SponsorsSection";
import { MediaUpload }      from "../../../components/shared/MediaUpload";
import TournamentBasicInfoSection from "../../../components/organiser/TournamentBasicInfoSection";
import SetupSection         from "../../../components/organiser/SetupSection";
import { getEventSetupChecklist, summarizeChecklist, isSectionComplete } from "../../../utils/tournamentCompleteness";

const SPORT_META = {
  table_tennis: { abbrev: "🏓", label: "Table Tennis" },
  badminton:    { abbrev: "🏸", label: "Badminton"    },
  cricket:      { abbrev: "🏏", label: "Cricket"      },
  football:     { abbrev: "⚽", label: "Football"     },
};

const API = import.meta.env.VITE_API_URL || "/api";
const tok = () => localStorage.getItem("tsb_token");
const apiFetch = (path, opts = {}) =>
  fetch(`${API}${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok()}`, ...(opts.headers || {}) },
  }).then(async r => {
    if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.detail || r.status); }
    return r.status === 204 ? null : r.json();
  });

const createTeamAPI       = (orgId, d) => apiFetch(`/orgs/${orgId}/teams`, { method: "POST", body: JSON.stringify(d) });
const addTeamToEvent      = (eId, tId) => apiFetch(`/events/${eId}/teams?team_id=${tId}`, { method: "POST" });
const removeTeamFromEvent = (eId, tId) => apiFetch(`/events/${eId}/teams/${tId}`, { method: "DELETE" });
const getEventTeams       = (eId)      => apiFetch(`/events/${eId}/teams`);
const finishMatchAPI      = (mId, body) => apiFetch(`/matches/${mId}/finish`, { method: "POST", body: JSON.stringify(typeof body === "object" && body !== null && !Array.isArray(body) && "winner_position" in body ? body : { winner_position: body }) });

export default function EventWorkspace() {
  const { tournamentId, eventId } = useParams();
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  const [data,               setData]               = useState(null);
  const [user,               setUser]               = useState(null);
  const [tab,                setTab]                = useState("overview");
  const [msg,                setMsg]                = useState("");
  const [activeMatch,        setActiveMatch]        = useState(null);
  const [eventTeams,         setEventTeams]         = useState([]);
  const [standings,          setStandings]          = useState(null);
  const [numGroups,          setNumGroups]          = useState(4);
  const [qualifiersPerGroup, setQualifiersPerGroup] = useState(2);
  const [editingOvers,       setEditingOvers]       = useState(false);
  const [oversVal,           setOversVal]           = useState(null);

  const flash = (txt) => { setMsg(txt); setTimeout(() => setMsg(""), 3000); };

  const loadData = useCallback(async () => {
    try { setData(await getWorkspace(tournamentId)); }
    catch (e) { console.error(e); }
  }, [tournamentId]);

  // Surgically update one match in local state — avoids a full workspace reload
  // on every score tap. Falls back to loadData() is called by the caller when needed.
  const patchMatchInData = useCallback((updatedMatch) => {
    if (!updatedMatch) return;
    setData(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        events: prev.events.map(ev => ({
          ...ev,
          matches: (ev.matches || []).map(m =>
            m.match_id === updatedMatch.match_id ? updatedMatch : m
          ),
        })),
      };
    });
  }, []);

  const loadTeams = useCallback(async () => {
    try { setEventTeams(await getEventTeams(eventId) || []); }
    catch (e) { console.error(e); }
  }, [eventId]);

  const loadStandings = useCallback(async () => {
    try { setStandings(await apiFetch(`/orgs/events/${eventId}/standings`)); }
    catch (e) { console.error(e); }
  }, [eventId]);

  useEffect(() => {
    getMe().then(setUser).catch(() => { clearToken(); navigate("/login"); });
    loadData();
  }, [loadData]);
  
  // ── FIX: derive participant_type from raw data, NOT from currentEvent ──
  useEffect(() => {
    if (!data) return;
    const ev = data.events?.find(e => e.event_id === parseInt(eventId));
    if (ev?.participant_type === "team" || ev?.participant_type === "doubles_pair") loadTeams();
    if (ev?.format === "round_robin") loadStandings();
  }, [data, eventId, loadTeams, loadStandings]);

  if (!data) return <PageLoader />;

  const { tournament: t, events } = data;
  const currentEvent = events.find(e => e.event_id === parseInt(eventId)) || events[0];

  if (!currentEvent) return (
    <div className="auth-wrap">
      <div style={{ color: "var(--muted)" }}>Event not found.</div>
    </div>
  );

  const sm         = SPORT_META[currentEvent.sport_key] || { abbrev: currentEvent.sport_key?.slice(0,2).toUpperCase() || "?", label: currentEvent.sport_key };
  const pType      = currentEvent.participant_type;       // "individual" | "doubles_pair" | "team"
  const isIndividual = pType === "individual";
  const isDoubles    = pType === "doubles_pair";
  const isTeam       = pType === "team";

  // Tab label for participant slot: pairs / teams / players
  const pTab = isDoubles ? "pairs" : isTeam ? "teams" : "players";
  const showStandings = currentEvent.format === "round_robin";
  const TABS = ["overview", pTab, "fixtures", ...(showStandings ? ["standings"] : []), "live"];

  const tabLabel = (tb) => {
    if (tb === "overview")   return "Info";
    if (tb === "players")    return "Players";
    if (tb === "pairs")      return "Pairs";
    if (tb === "teams")      return "Teams";
    if (tb === "fixtures")   return "Fixtures";
    if (tb === "standings")  return "Standings";
    if (tb === "live"       && currentEvent.sport_key === "cricket")  return "Innings";
    if (tb === "live"       && currentEvent.sport_key === "football") return "Match Day";
    if (tb === "live")       return "Live";
    return tb.charAt(0).toUpperCase() + tb.slice(1);
  };

  const liveCount       = currentEvent.matches?.filter(m => m.status === "live").length || 0;
  const activeMatchData = activeMatch ? currentEvent.matches?.find(m => m.match_id === activeMatch) : null;

  // ── Setup checklist — decides which Basic Info section opens by default ──
  const setupChecklist  = getEventSetupChecklist(t, currentEvent);
  const setupSummary    = summarizeChecklist(setupChecklist);

  // ── My role on this tournament — gates the danger zone (publish/delete/
  // members). Old backends don't send my_role; anyone with access then was
  // an owner, so default to admin.
  const myRole  = data.my_role || "admin";
  const isAdmin = myRole === "admin";

  // ── Participant handlers ──────────────────────────────────

  const handleAddPlayer = async (form) => {
    try {
      const p = await createPlayer({
        name:       form.name.trim(),
        age:        parseInt(form.age) || null,
        gender:     form.gender,
        seed_level: form.seed_level || null,
      });
      await addPlayerToEvent(currentEvent.event_id, p.player_id, form.group_id ? parseInt(form.group_id) : null);
      loadData(); flash("Player added!");
    } catch (e) { flash("Error: " + e.message); }
  };

  const handleAssignGroup = async (playerId, groupId) => {
    try {
      await assignPlayerGroup(currentEvent.event_id, playerId, groupId);
      loadData(); flash(groupId ? "Player assigned to group." : "Player removed from group.");
    } catch (e) { flash("Error: " + e.message); }
  };

  const handleRemovePlayer = async (playerId) => {
    try {
      await removePlayerFromEvent(currentEvent.event_id, playerId);
      loadData(); flash("Player removed.");
    } catch (e) { flash("Error: " + e.message); }
  };

  const handleUpdateSeed = async (playerId, seedLevel) => {
    try {
      await updateParticipantSeed(currentEvent.event_id, playerId, seedLevel);
      loadData();
    } catch (e) { flash("Error: " + e.message); }
  };

  // ── Public / private toggle ───────────────────────────────
  const handleTogglePublic = async () => {
    try {
      await updateTournament(t.org_id, t.tournament_id, { is_published: !t.is_published });
      loadData();
      flash(t.is_published ? "Tournament is now private." : "Tournament is now public.");
    } catch (e) { flash("Error: " + e.message); }
  };

  // ── Tournament lifecycle (live/completed) ─────────────────
  const handleTournamentTransition = async (targetStatus) => {
    try {
      await transitionTournament(t.tournament_id, targetStatus);
      loadData();
      flash(
        targetStatus === "live"      ? "Tournament published — it's now live!" :
        targetStatus === "completed" ? "Tournament marked completed." :
        "Tournament moved back to draft."
      );
    } catch (e) { flash("Error: " + e.message); }
  };

  const handleCreateGroup = async (name) => {
    try { await createGroup(currentEvent.event_id, name); loadData(); flash("Group created!"); }
    catch (e) { flash("Error: " + e.message); }
  };

  // Doubles — captain is contact, stored as Team with 2 members
  const handleAddPair = async (form) => {
    // Guard: ensure org_id exists
  if (!t.org_id) {
    flash("Error: Organization ID missing. Please reload the page.");
    console.error("Tournament data:", t);
    return;
  }

    try {
      const team = await createTeamAPI(t.org_id || 1, {
        name:          form.pair_name,
        contact_phone: form.contact_phone || "",
        sport_key:     currentEvent.sport_key,
        seed_level:    form.seed_level || null,
        members: [
          { name: form.player1_name.trim(), role: "player1" },
          { name: form.player2_name.trim(), role: "player2" },
        ],
      });
      await addTeamToEvent(currentEvent.event_id, team.team_id);
      loadTeams(); flash("Pair added!");
    } catch (e) { flash("Error: " + e.message); }
  };

  const handleRemovePair = async (teamId) => {
    try { await removeTeamFromEvent(currentEvent.event_id, teamId); loadTeams(); flash("Pair removed."); }
    catch (e) { flash("Error: " + e.message); }
  };

  // Team — captain IS the contact person (no separate contact fields)
  const handleAddTeam = async (form, members) => {
    if (!t.org_id) {
      flash("Error: Organization ID missing. Please reload the page.");
      console.error("Tournament data:", t);
      return;
    }
    try {
      const team = await createTeamAPI(t.org_id , {
        name:          form.name.trim(),
        contact_name:  form.contact_name?.trim()  || "",
        contact_phone: form.contact_phone?.trim() || "",
        sport_key:     currentEvent.sport_key,
        members,
      });
      await addTeamToEvent(currentEvent.event_id, team.team_id);
      loadTeams(); flash("Team added!");
    } catch (e) { flash("Error: " + e.message); }
  };

  const handleRemoveTeam = async (teamId) => {
    try { await removeTeamFromEvent(currentEvent.event_id, teamId); loadTeams(); flash("Team removed."); }
    catch (e) { flash("Error: " + e.message); }
  };

  // Fixtures + scoring
  const handleGenerateFixtures = async () => {
    try {
      const r = await generateFixtures(currentEvent.event_id, true);
      loadData();
      if (showStandings) loadStandings();
      flash(`${r.matches_created} matches created!`);
    }
    catch (e) { flash("Error: " + e.message); }
  };

  const handleGenerateGroups = async () => {
    try {
      const r = await apiFetch(`/events/${currentEvent.event_id}/generate-groups?num_groups=${numGroups}`, { method: "POST" });
      loadData();
      flash(`${r.groups_created} groups created, ${r.matches_created} matches generated!`);
    } catch (e) { flash("Error: " + e.message); }
  };

  const handleGenerateKnockout = async () => {
    try {
      const r = await apiFetch(
        `/events/${currentEvent.event_id}/generate-knockout-from-groups?qualifiers_per_group=${qualifiersPerGroup}&third_place=true`,
        { method: "POST" }
      );
      loadData();
      flash(`Knockout bracket created — ${r.matches_created} matches, ${r.qualifiers} qualifiers.`);
    } catch (e) { flash("Error: " + e.message); }
  };

  const handleCreateMatch = async (body) => {
    try {
      await createMatch(currentEvent.event_id, body);
      loadData();
      flash("Match created!");
    } catch (e) { flash("Error: " + e.message); }
  };

  // Creates all first-round matches (with participants) + TBD later-round matches.
  // `participants` is passed so we can identify which player has the bye (not in any
  // slot) and pre-seed them into position 1 of the first next-round match.
  const handleBulkCreateMatches = async (template, slots, participants) => {
    try {
      const eId     = currentEvent.event_id;
      const useTeam = isTeam || isDoubles;
      const first   = template.rounds.find(r => r.isAssignable);

      // Identify bye participant: the one not assigned to any first-round slot
      const usedIds = new Set(slots.flatMap(s => [s.p1, s.p2].filter(Boolean).map(String)));
      const byeParticipant = (template.byeCount > 0 && participants)
        ? participants.find(p => !usedIds.has(String(p.id)))
        : null;

      // Round 1: first-round matches with real participants
      for (const slot of slots) {
        await createMatch(eId, {
          stage: first.stage,
          round: 1,
          ...(useTeam
            ? { team1_id:   parseInt(slot.p1), team2_id:   parseInt(slot.p2) }
            : { player1_id: parseInt(slot.p1), player2_id: parseInt(slot.p2) }
          ),
        });
      }

      // Later rounds: TBD placeholder matches numbered round 2, 3, 4 …
      // The bye player is pre-seeded into position 1 of the very first next-round
      // match so that _advance_winner can correctly fill position 2 later.
      const laterRounds = template.rounds.filter(r => !r.isAssignable);
      let roundNum  = 2;
      let byePlaced = false;

      for (const round of laterRounds) {
        for (let i = 0; i < round.matchCount; i++) {
          const body = { stage: round.stage, round: roundNum };
          if (!byePlaced && byeParticipant) {
            if (useTeam) body.team1_id   = byeParticipant.id;
            else         body.player1_id = byeParticipant.id;
            byePlaced = true;
          }
          await createMatch(eId, body);
        }
        roundNum++;
      }

      loadData();
      flash(`Bracket created! ${template.total} match${template.total !== 1 ? "es" : ""}.`);
    } catch (e) { flash("Error: " + e.message); }
  };

  // Manually assigns participants to groups, then generates bracket matches
  const handleManualGroupSetup = async (groupAssignments) => {
    // groupAssignments = [{ name: "Group A", participants: [id, id, ...] }, ...]
    try {
      const eId     = currentEvent.event_id;
      const useTeam = isTeam || isDoubles;

      for (const group of groupAssignments) {
        const created = await createGroup(eId, group.name);
        const gId     = created.group_id;
        for (const pId of group.participants) {
          if (useTeam) {
            await apiFetch(`/events/${eId}/teams/${pId}?group_id=${gId}`, { method: "PATCH" });
          } else {
            await assignPlayerGroup(eId, pId, gId);
          }
        }
      }

      await generateGroupMatches(eId);
      loadData();
      flash("Groups created and matches generated!");
    } catch (e) { flash("Error: " + e.message); }
  };

  const handleMatchAction = async (matchId, action) => {
    try {
      if      (action === "start")    setActiveMatch(matchId);          // open scorer — NOT live yet
      else if (action === "go_live")  await updateMatchStatus(matchId, { status: "live" });
      else if (action === "pause")    await updateMatchStatus(matchId, { status: "scheduled" });
      else if (action === "reset")    await rematchMatch(matchId);       // nullify scores, back to scheduled
      else if (action === "score")    setActiveMatch(matchId);
      else if (action === "rematch")  await rematchMatch(matchId);
      else if (action === "delete")   await deleteMatch(matchId);
      loadData();
    } catch (e) { flash("Error: " + e.message); }
  };

  const handleSetConfig = async (matchId, setsToWin) => {
    try {
      await updateMatchStatus(matchId, { status: "scheduled", sets_to_win: setsToWin });
      loadData();
    } catch (e) { flash("Error: " + e.message); }
  };

  const handleScore = async (matchId, s1, s2, server) => {
    const updated = await updateScore(matchId, { score_p1: s1, score_p2: s2, current_server: server });
    // If match finished, reload to advance bracket TBD slots; otherwise patch locally (no round-trip)
    if (updated?.status === "done") {
      loadData();
      if (showStandings) loadStandings();
    } else {
      patchMatchInData(updated);
    }
  };

  const handleFinishMatch = async (matchId, winPos, extraData = {}) => {
    try {
      const body = { winner_position: winPos, ...extraData };
      const result = await finishMatchAPI(matchId, body);
      loadData();
      if (showStandings) loadStandings();
      if (result?.status === "done") {
        setActiveMatch(null);
        flash("Match finished!");
      } else {
        flash(winPos === "super_over" ? "Super Over starting!" : "Innings ended — 2nd innings starting…");
      }
    }
    catch (e) { flash("Error: " + e.message); }
  };

  const handleEndMatch = async (matchId, winnerPos) => {
    try {
      await walkoverMatch(matchId, winnerPos);
      loadData();
      if (showStandings) loadStandings();
      setActiveMatch(null);
      flash("Match ended.");
    } catch (e) { flash("Error: " + e.message); }
  };

  const handleWalkover = async (matchId, winnerPos) => {
    try {
      await walkoverMatch(matchId, winnerPos);
      loadData();
      if (showStandings) loadStandings();
      setActiveMatch(null);
      flash("Walkover recorded.");
    }
    catch (e) { flash("Error: " + e.message); }
  };

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)" }}>
      <OrgHeader
        user={user}
        onLogout={() => { clearToken(); navigate("/", { replace: true }); }}
        crumbs={[
          { label: "My Tournaments", path: "/organiser" },
          { label: t.name },
        ]}
        right={(
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {liveCount > 0 && <div className="live-badge"><span className="live-dot" /> {liveCount} LIVE</div>}
          </div>
        )}
      />

      {msg && <div className="flash success">{msg}</div>}

      {/* ── TABS ── */}
      <div className="tabs">
        {TABS.map(tb => (
          <button key={tb} className={`tab${tab === tb ? " active" : ""}`} onClick={() => setTab(tb)}>
            {tabLabel(tb)}
            {tb === "live" && liveCount > 0 && <span className="tab-badge">{liveCount}</span>}
          </button>
        ))}
      </div>

      <div className="workspace-content" style={{ maxWidth: 1100, margin: "0 auto", padding: "20px 24px" }}>
        <>

        {/* ══ OVERVIEW ══════════════════════════════════════════ */}
        {tab === "overview" && (() => {
          const inputStyle = { background: "var(--elevated)", border: "1px solid var(--border-mid)", borderRadius: 6, padding: "7px 10px", fontSize: 13, color: "var(--ink)", width: "100%", outline: "none", fontFamily: "inherit" };
          const labelStyle = { fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: 2, color: "var(--muted)", fontFamily: "var(--font-display)", marginBottom: 4, display: "block" };
          const fieldStyle = { marginBottom: 14 };

          // Format & Play fields fold into the Basic Info section via `extra`
          // instead of being their own accordion block.
          const formatPlayExtra = {
            statusSections: ["format"],
            initExtra: () => ({
              format:     currentEvent.format || "direct_knockout",
              squad_size: currentEvent.squad_size || 11,
              overs:      currentEvent.sport_config?.overs ?? 20,
            }),
            editableFields: (eForm, setEForm) => (
              <>
                <div style={fieldStyle}>
                  <label style={labelStyle}>Tournament Format</label>
                  <select style={inputStyle} value={eForm.format} onChange={e => setEForm(f => ({ ...f, format: e.target.value }))}>
                    <option value="direct_knockout">Direct Knockout</option>
                    <option value="round_robin">Round Robin</option>
                    <option value="group_knockout">Group Stage + Knockout</option>
                  </select>
                </div>
                <div style={fieldStyle}>
                  <label style={labelStyle}>Participant Type</label>
                  <div style={{ ...inputStyle, background: "none", border: "none", padding: "7px 0", color: "var(--muted)" }}>
                    {isDoubles ? "Doubles Pairs" : isTeam ? "Team" : "Individual"}
                  </div>
                </div>
                {currentEvent.sport_key === "cricket" && (
                  <>
                    <div style={fieldStyle}>
                      <label style={labelStyle}>Squad Size <span style={{ color: "var(--muted)", textTransform: "none", letterSpacing: 0 }}>(wickets = squad − 1)</span></label>
                      <input style={inputStyle} type="number" min={6} max={15} value={eForm.squad_size}
                        onChange={e => setEForm(f => ({ ...f, squad_size: parseInt(e.target.value) || 11 }))} />
                    </div>
                    <div style={fieldStyle}>
                      <label style={labelStyle}>Overs per Innings</label>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <button className="btn btn-outline btn-sm" style={{ width: 32, padding: 0 }}
                          onClick={() => setEForm(f => ({ ...f, overs: Math.max(1, (f.overs || 20) - 1) }))}>−</button>
                        <span style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 900, color: "var(--primary)", minWidth: 36, textAlign: "center" }}>
                          {eForm.overs ?? 20}
                        </span>
                        <button className="btn btn-outline btn-sm" style={{ width: 32, padding: 0 }}
                          onClick={() => setEForm(f => ({ ...f, overs: Math.min(50, (f.overs || 20) + 1) }))}>+</button>
                        <span style={{ fontSize: 11, color: "var(--muted)" }}>
                          {eForm.overs === 5 ? "T5" : eForm.overs === 10 ? "T10" : eForm.overs === 20 ? "T20" : eForm.overs === 50 ? "ODI" : "Custom"}
                        </span>
                      </div>
                    </div>
                  </>
                )}
                {currentEvent.sport_key === "football" && (
                  <div style={fieldStyle}>
                    <label style={labelStyle}>Team Format</label>
                    <div style={{ ...inputStyle, background: "none", border: "none", padding: "7px 0", color: "var(--muted)" }}>
                      {currentEvent.team_size ?? 11}-a-side · {currentEvent.substitutes ?? 5} subs · {currentEvent.sport_config?.half_duration_minutes ?? 45} min halves
                    </div>
                  </div>
                )}
              </>
            ),
            onSaveExtra: async (eForm) => {
              if (currentEvent.sport_key === "cricket") {
                const squadSize = parseInt(eForm.squad_size) || 11;
                const overs     = parseInt(eForm.overs) || 20;
                await configureEvent(currentEvent.event_id, {
                  format:           eForm.format,
                  participant_type: currentEvent.participant_type,
                  squad_size:       squadSize,
                  sport_config:     { ...currentEvent.sport_config, overs, wickets: squadSize - 1 },
                });
              } else {
                await updateEvent(currentEvent.event_id, {
                  format: eForm.format || undefined,
                });
              }
            },
          };

          const eventCard = (
            <div className="card" style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16 }}>
                <div style={{ width: 52, height: 52, borderRadius: 10, background: "var(--primary-dim)", border: "1px solid rgba(255,107,53,0.2)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-display)", fontSize: 14, fontWeight: 900, color: "var(--primary)", flexShrink: 0 }}>
                  {sm.abbrev}
                </div>
                <div>
                  <div style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 900, textTransform: "uppercase", letterSpacing: -0.5, color: "var(--ink)" }}>
                    {currentEvent.name}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 3, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <span>{sm.label}</span>
                    <span>·</span>
                    <span>{currentEvent.format.replace(/_/g, " ")}</span>
                    <span>·</span>
                    <span className={`pill ${isDoubles ? "pill-gold" : isTeam ? "pill-orange" : "pill-green"}`}>
                      {isDoubles ? "Doubles Pairs" : isTeam ? "Team Sport" : "Individual"}
                    </span>
                  </div>
                </div>
              </div>
              <div className="stats-grid" style={{ marginBottom: 16 }}>
                {[
                  { label: isDoubles ? "Pairs" : isTeam ? "Teams" : "Players", value: currentEvent.player_count },
                  { label: "Matches", value: currentEvent.match_count },
                  { label: "Done",    value: `${currentEvent.done_count || 0}/${currentEvent.match_count}` },
                  { label: "Live",    value: liveCount, color: liveCount > 0 ? "var(--primary)" : undefined },
                ].map(({ label, value, color }) => (
                  <div key={label} className="stat-card" style={{ margin: 0 }}>
                    <div className="stat-num" style={color ? { color } : {}}>{value}</div>
                    <div className="stat-label">{label}</div>
                  </div>
                ))}
              </div>
              {liveCount > 0 && (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button className="btn btn-danger" onClick={() => setTab("live")}>Score Live</button>
                </div>
              )}
            </div>
          );

          const setupSections = (
            <>
              <TournamentBasicInfoSection
                t={t} checklist={setupChecklist}
                defaultOpen={
                  !isSectionComplete(setupChecklist, "basic") ||
                  !isSectionComplete(setupChecklist, "format")
                }
                onSaved={loadData} flash={flash}
                extras={[formatPlayExtra]}
              />

              <SetupSection icon="🎨" title="Branding" status="optional" defaultOpen={false}>
                <div style={{ maxWidth: 240 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Tournament Logo</div>
                  <MediaUpload
                    label=""
                    hint="JPEG / PNG / WebP · Recommended 400×400px"
                    bucket="logos"
                    resourceType="tournaments"
                    resourceId={t.tournament_id}
                    filename="logo"
                    enforceAspect="1:1"
                    maxWidth={400}
                    previewUrl={t.logo_url}
                    previewStyle={{ width: "100%", aspectRatio: "1/1", objectFit: "contain", borderRadius: 6 }}
                    onUploaded={async (url) => {
                      try {
                        await updateTournament(t.org_id, t.tournament_id, { logo_url: url });
                        loadData();
                        flash("Logo updated!");
                      } catch (e) { flash("Error: " + e.message); }
                    }}
                  />
                </div>
              </SetupSection>
            </>
          );

          const navCards = [
            showStandings   && { label: "Standings", sub: "Group & round-robin rankings", onClick: () => setTab("standings") },
            liveCount > 0   && { label: "Live",      sub: `${liveCount} match${liveCount !== 1 ? "es" : ""} in progress`, onClick: () => setTab("live") },
          ].filter(Boolean);

          return (
            <div>
              {eventCard}

              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(220px, 1fr))", gap: 10, marginBottom: 16 }}>
                {navCards.map(card => (
                  <div key={card.label} className="card card-interactive" onClick={card.onClick}
                    style={{ cursor: "pointer", margin: 0 }}>
                    <div style={{ fontFamily: "var(--font-display)", fontSize: 13, fontWeight: 900, textTransform: "uppercase", letterSpacing: -0.5, color: "var(--ink)" }}>
                      {card.label}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>{card.sub}</div>
                  </div>
                ))}
              </div>

              <div className="card" style={{ marginBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontFamily: "var(--font-display)", fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: 2, color: "var(--primary)", marginBottom: 4 }}>
                      Visibility
                    </div>
                    <div style={{ fontSize: 13, color: "var(--muted)" }}>
                      {t.is_published
                        ? "Public — anyone with the link can view this tournament."
                        : "Private — only you can see this tournament."}
                    </div>
                  </div>
                  <button
                    type="button" role="switch" aria-checked={!!t.is_published}
                    onClick={handleTogglePublic}
                    style={{
                      display: "flex", alignItems: "center", gap: 10, cursor: "pointer",
                      background: "none", border: "none", padding: 0, fontFamily: "var(--font-display)",
                      fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: 1,
                      color: t.is_published ? "var(--primary)" : "var(--muted)",
                    }}>
                    {t.is_published ? "Public" : "Private"}
                    <span style={{
                      width: 42, height: 24, borderRadius: 12, position: "relative", flexShrink: 0,
                      background: t.is_published ? "var(--primary)" : "var(--border-mid)", transition: "background .15s",
                    }}>
                      <span style={{
                        position: "absolute", top: 3, left: t.is_published ? 21 : 3, width: 18, height: 18,
                        borderRadius: "50%", background: "#fff", transition: "left .15s",
                      }} />
                    </span>
                  </button>
                </div>
                {isAdmin && t.status === "completed" && (
                  <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                    <div style={{ fontSize: 13, color: "var(--muted)" }}>This tournament is marked completed.</div>
                    <button className="btn btn-outline btn-sm" onClick={() => handleTournamentTransition("live")}>
                      Reopen Tournament
                    </button>
                  </div>
                )}
              </div>

              {setupSections}

              <div className="card" style={{ marginBottom: 16 }}>
                <div style={{ fontFamily: "var(--font-display)", fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: 2, color: "var(--primary)", marginBottom: 12 }}>
                  Share Tournament
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <input
                    readOnly
                    value={`${window.location.origin}/t/${t.tournament_id}`}
                    style={{ flex: 1, minWidth: 200, padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--elevated)", color: "var(--ink)", fontSize: 13, fontFamily: "monospace" }}
                  />
                  <button
                    className="btn btn-outline btn-sm"
                    onClick={() => {
                      navigator.clipboard.writeText(`${window.location.origin}/t/${t.tournament_id}`);
                      flash("Link copied!");
                    }}
                    style={{ flexShrink: 0 }}
                  >
                    Copy Link
                  </button>
                  <button
                    className="btn btn-outline btn-sm"
                    style={{ flexShrink: 0 }}
                    onClick={() => {
                      if (navigator.share) {
                        navigator.share({ title: t.name, url: `${window.location.origin}/t/${t.tournament_id}` }).catch(() => {});
                      } else {
                        navigator.clipboard.writeText(`${window.location.origin}/t/${t.tournament_id}`);
                        flash("Link copied!");
                      }
                    }}
                  >
                    Share
                  </button>
                </div>
              </div>

              <div className="card" style={{ marginBottom: 16 }}>
                <SponsorsSection
                  tournamentId={t.tournament_id}
                  sponsors={t.sponsors || []}
                  onRefresh={loadData}
                  flash={flash}
                />
              </div>
            </div>
          );
        })()}

        {/* ══ PARTICIPANTS ══════════════════════════════════════
            Exactly ONE of these renders based on participant_type.
            The old inline form has been removed entirely.
        ════════════════════════════════════════════════════════ */}

        {tab === "players" && isIndividual && (
          <IndividualTab
            event={currentEvent}
            onAddPlayer={handleAddPlayer}
            onCreateGroup={handleCreateGroup}
            onAssignGroup={handleAssignGroup}
            onRemovePlayer={handleRemovePlayer}
            onUpdateSeed={handleUpdateSeed}
            flash={flash}
          />
        )}

        {tab === "pairs" && isDoubles && (
          <DoublesTab
            event={currentEvent}
            pairs={eventTeams}
            onAddPair={handleAddPair}
            onRemovePair={handleRemovePair}
            flash={flash}
            numGroups={numGroups}
            setNumGroups={setNumGroups}
            onGenerateGroups={handleGenerateGroups}
          />
        )}

        {tab === "teams" && isTeam && (
          <TeamTab
            teams={eventTeams}
            onAddTeam={handleAddTeam}
            onRemoveTeam={handleRemoveTeam}
            flash={flash}
          />
        )}

        {/* ══ FIXTURES ══════════════════════════════════════════ */}
        {tab === "fixtures" && (() => {
          // Once a tournament is marked completed, its bracket is final —
          // hide every action that would mutate it (add/regenerate matches).
          // Read-only views (scores, standings) stay visible.
          const isCompleted = t.status === "completed";
          return (
          <div>
            {currentEvent.format === "group_knockout" ? (
              <GroupKnockoutFixtures
                event={currentEvent}
                isCompleted={isCompleted}
                numGroups={numGroups}
                setNumGroups={setNumGroups}
                qualifiersPerGroup={qualifiersPerGroup}
                setQualifiersPerGroup={setQualifiersPerGroup}
                onGenerateGroups={handleGenerateGroups}
                onGenerateKnockout={handleGenerateKnockout}
                onAction={handleMatchAction}
                onSetConfig={handleSetConfig}
                onEndMatch={handleEndMatch}
                sportKey={currentEvent.sport_key}
                participantType={currentEvent.participant_type}
                participants={
                  (isTeam || isDoubles)
                    ? eventTeams.map(ep => { const t = ep.team || ep; return { id: t.team_id, name: t.name }; })
                    : [
                        ...(currentEvent.groups || []).flatMap(g => (g.players || []).map(p => ({ id: p.player_id, name: p.name }))),
                        ...(currentEvent.ungrouped_players || []).map(p => ({ id: p.player_id, name: p.name })),
                      ]
                }
                isTeamEvent={isTeam || isDoubles}
                onCreateMatch={handleCreateMatch}
                onManualGroupSetup={handleManualGroupSetup}
                flash={flash}
              />
            ) : (
              (() => {
                const allParticipants = isTeam || isDoubles
                  ? eventTeams.map(ep => { const t = ep.team || ep; return { id: t.team_id, name: t.name }; })
                  : [
                      ...(currentEvent.groups || []).flatMap(g => (g.players || []).map(p => ({ id: p.player_id, name: p.name }))),
                      ...(currentEvent.ungrouped_players || []).map(p => ({ id: p.player_id, name: p.name })),
                    ];

                // ── No matches yet → show suggestion + setup panel ──
                if (!currentEvent.matches?.length) {
                  return (
                    <DirectKnockoutSuggestionPanel
                      participantCount={allParticipants.length}
                      participants={allParticipants}
                      isTeam={isTeam || isDoubles}
                      onAutoGenerate={handleGenerateFixtures}
                      onBulkCreate={handleBulkCreateMatches}
                      flash={flash}
                    />
                  );
                }

                // ── Matches exist → control bar + add manually + bracket ──
                return (
                  <>
                    {!isCompleted && (
                      <>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
                          <span style={{ fontFamily: "var(--font-display)", fontSize: 13, color: "var(--muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>
                            {currentEvent.match_count} {isDoubles ? "pair " : isTeam ? "team " : ""}matches
                          </span>
                          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                            <ConfirmButton
                              label="Regenerate Fixtures"
                              title="Regenerate all fixtures?"
                              body="Are you sure you want to regenerate all fixtures? The current fixtures will be replaced."
                              confirmLabel="Yes, regenerate" onConfirm={handleGenerateFixtures} />
                          </div>
                        </div>

                        <ManualMatchCreator
                          format={currentEvent.format}
                          groups={currentEvent.groups || []}
                          participants={allParticipants}
                          isTeam={isTeam || isDoubles}
                          onCreate={handleCreateMatch}
                          flash={flash}
                          eligibleIds={
                            // Direct knockout: each player appears once in the bracket,
                            // so hide anyone already placed. Round robin allows repeats.
                            currentEvent.format === "direct_knockout"
                              ? new Set(
                                  allParticipants
                                    .map(p => String(p.id))
                                    .filter(id => !(currentEvent.matches || []).some(m =>
                                      [m.player_1, m.player_2].some(mp =>
                                        String(mp?.player_id ?? mp?.team_id) === id)))
                                )
                              : null
                          }
                        />
                      </>
                    )}

                    {currentEvent.format === "direct_knockout" ? (
                      <KnockoutBracket fixtureOnly matches={currentEvent.matches} onAction={handleMatchAction} onSetConfig={handleSetConfig} onEndMatch={handleEndMatch} sportKey={currentEvent.sport_key} />
                    ) : (
                      <>
                        {currentEvent.groups?.map(g => {
                          const gm = currentEvent.matches.filter(m => m.group_id === g.group_id);
                          if (!gm.length) return null;
                          return (
                            <div key={g.group_id} style={{ marginBottom: 20 }}>
                              <div className="section-label">{g.name} · {gm.length} matches</div>
                              {[...gm].sort(byPriority).map(m => <MatchCard fixtureOnly key={m.match_id} match={m} onAction={handleMatchAction} onSetConfig={handleSetConfig} sportKey={currentEvent.sport_key} />)}
                            </div>
                          );
                        })}
                        {currentEvent.matches.filter(m => !m.group_id).sort(byPriority).map(m => (
                          <MatchCard fixtureOnly key={m.match_id} match={m} onAction={handleMatchAction} onSetConfig={handleSetConfig} onEndMatch={handleEndMatch} sportKey={currentEvent.sport_key} />
                        ))}
                      </>
                    )}
                  </>
                );
              })()
            )}
          </div>
          );
        })()}

        {/* ══ STANDINGS (round_robin / group_knockout) ═══════════ */}
        {tab === "standings" && (
          <div>
            {!standings ? (
              <div className="empty">Loading standings…</div>
            ) : !standings.groups?.length || standings.groups.every(g => !g.rows?.length) ? (
              <div className="empty">No completed matches yet. Standings will appear as matches finish.</div>
            ) : standings.groups.map((group, gi) => (
              <div key={gi} style={{ marginBottom: 24 }}>
                {standings.groups.length > 1 && (
                  <div className="section-label" style={{ marginBottom: 10 }}>{group.name}</div>
                )}
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: "var(--surface-2, var(--surface))" }}>
                        {["#", "Name", "MP", "W", "L", "SW", "SL", "PF", "PA", "Pts"].map(h => (
                          <th key={h} style={{ padding: "8px 10px", textAlign: h === "Name" ? "left" : "center", fontFamily: "var(--font-display)", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: "var(--muted)", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" }}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {group.rows.map((row, i) => (
                        <tr key={row.participant_id} style={{ borderBottom: "1px solid var(--border)", background: i % 2 === 0 ? "transparent" : "var(--surface)" }}>
                          <td style={{ padding: "9px 10px", textAlign: "center", color: "var(--muted)", fontWeight: 700 }}>{i + 1}</td>
                          <td style={{ padding: "9px 10px", fontWeight: 600, color: "var(--ink)" }}>{row.name}</td>
                          <td style={{ padding: "9px 10px", textAlign: "center", color: "var(--muted)" }}>{row.matches_played}</td>
                          <td style={{ padding: "9px 10px", textAlign: "center", color: "var(--green, #22c55e)", fontWeight: 700 }}>{row.wins}</td>
                          <td style={{ padding: "9px 10px", textAlign: "center", color: "var(--red, #ef4444)" }}>{row.losses}</td>
                          <td style={{ padding: "9px 10px", textAlign: "center", color: "var(--muted)" }}>{row.sets_won}</td>
                          <td style={{ padding: "9px 10px", textAlign: "center", color: "var(--muted)" }}>{row.sets_lost}</td>
                          <td style={{ padding: "9px 10px", textAlign: "center", color: "var(--muted)" }}>{row.points_for}</td>
                          <td style={{ padding: "9px 10px", textAlign: "center", color: "var(--muted)" }}>{row.points_against}</td>
                          <td style={{ padding: "9px 10px", textAlign: "center", fontFamily: "var(--font-display)", fontSize: 14, fontWeight: 900, color: "var(--primary)" }}>{row.ranking_points}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div style={{ marginTop: 8, fontSize: 11, color: "var(--muted)", display: "flex", gap: 12 }}>
                  <span>MP = Matches Played</span>
                  <span>W/L = Wins/Losses</span>
                  <span>SW/SL = Sets Won/Lost</span>
                  <span>PF/PA = Points For/Against</span>
                  <span>Pts = Ranking Points (W=2)</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ══ LIVE / INNINGS / MATCH DAY ════════════════════════ */}
        {tab === "live" && (
          <div>
            {!currentEvent.match_count ? (
              <div className="empty">Generate fixtures first.</div>
            ) : (() => {
              const byStatus = byPriority;
              const all = currentEvent.matches || [];

              // Sections: one per group, then knockout stages (semi finals,
              // final, …) in play order, then anything unstaged.
              const sections = [];
              (currentEvent.groups || []).forEach(g => {
                const ms = all.filter(m => m.group_id === g.group_id);
                if (ms.length) sections.push({ key: `g${g.group_id}`, label: g.name, matches: ms });
              });
              const stageOrder = ["preliminary", "round_of_32", "round_of_16", "knockout", "quarter", "semi", "third_place", "final"];
              const ungrouped = all.filter(m => !m.group_id);
              const known = stageOrder.filter(st => ungrouped.some(m => m.stage === st));
              const other = ungrouped.filter(m => !stageOrder.includes(m.stage));
              if (other.length) sections.push({ key: "other", label: "Matches", matches: other });
              known.forEach(st => sections.push({
                key: st,
                label: STAGE_LABEL[st] || st,
                matches: ungrouped.filter(m => m.stage === st),
              }));

              const groupMs = all.filter(m => m.group_id);
              const groupsFinished = currentEvent.format === "group_knockout" && (currentEvent.groups?.length > 0) &&
                currentEvent.groups.every(g => groupMs.some(m => m.group_id === g.group_id && m.stage === "final" && m.status === "done"));
              const needsKnockout = groupsFinished && !all.some(m => !m.group_id) && t.status !== "completed";

              // Sections whose matches are all finished sink to the bottom.
              const sectionDone = sec => sec.matches.every(m => m.status === "done");
              sections.sort((a, b) => Number(sectionDone(a)) - Number(sectionDone(b)));

              return (<>
                {needsKnockout && (
                  <div className="card" style={{ marginBottom: 16, border: "2px solid var(--primary)", background: "var(--primary-dim)" }}>
                    <div style={{ fontFamily: "var(--font-display)", fontSize: 14, fontWeight: 900, textTransform: "uppercase", letterSpacing: 0.5, color: "var(--primary)" }}>
                      All group matches are complete
                    </div>
                    <div style={{ fontSize: 13, color: "var(--muted)", margin: "4px 0 12px" }}>
                      Go to the Fixtures tab and generate the Semi Finals & Final to continue.
                    </div>
                    <button className="btn btn-primary btn-sm" onClick={() => setTab("fixtures")}>Go to Fixtures →</button>
                  </div>
                )}
                {sections.map(sec => (
                <div key={sec.key} style={{ marginBottom: 20 }}>
                  <div className="section-label">{sec.label} · {sec.matches.length} match{sec.matches.length !== 1 ? "es" : ""}</div>
                  {[...sec.matches].sort(byStatus).map(m => (
                    <MatchCard key={m.match_id} match={m} onAction={handleMatchAction} onSetConfig={handleSetConfig} onEndMatch={handleEndMatch}
                      sportKey={currentEvent.sport_key} />
                  ))}
                </div>
              ))}
              </>);
            })()}
          </div>
        )}
        </>
      </div>

      {/* ── SCORER OVERLAYS ── */}
      {activeMatch && activeMatchData && currentEvent.sport_key === "table_tennis" && (
        <TTScorer match={activeMatchData} config={currentEvent.sport_config || {}}
          onScore={(s1, s2, srv) => handleScore(activeMatch, s1, s2, srv)}
          onUndoSet={() => { undoSet(activeMatch).then(loadData); }}
          onWalkover={(winPos) => handleWalkover(activeMatch, winPos)}
          onGoLive={() => handleMatchAction(activeMatch, "go_live")}
          onPause={() => handleMatchAction(activeMatch, "pause")}
          onReset={() => handleMatchAction(activeMatch, "reset")}
          onClose={() => { setActiveMatch(null); loadData(); loadStandings(); }} />
      )}
      {activeMatch && activeMatchData && currentEvent.sport_key === "badminton" && (
        <BadmintonScorer match={activeMatchData} config={currentEvent.sport_config || {}}
          onScore={(s1, s2, srv) => handleScore(activeMatch, s1, s2, srv)}
          onUndoSet={() => { undoSet(activeMatch).then(loadData); }}
          onWalkover={(winPos) => handleWalkover(activeMatch, winPos)}
          onGoLive={() => handleMatchAction(activeMatch, "go_live")}
          onPause={() => handleMatchAction(activeMatch, "pause")}
          onReset={() => handleMatchAction(activeMatch, "reset")}
          onClose={() => { setActiveMatch(null); loadData(); }} />
      )}
      {activeMatch && activeMatchData && currentEvent.sport_key === "cricket" && (
        <CricketScorer match={activeMatchData} config={currentEvent.sport_config || {}}
          onScore={(s1, s2, extra) => updateScore(activeMatch, { score_p1: s1, score_p2: s2, ...extra }).then(u => u?.status === "done" ? loadData() : patchMatchInData(u))}
          onFinish={(wp, extra) => handleFinishMatch(activeMatch, wp, extra)}
          onGoLive={() => handleMatchAction(activeMatch, "go_live")}
          onPause={() => handleMatchAction(activeMatch, "pause")}
          onReset={() => handleMatchAction(activeMatch, "reset")}
          onClose={() => { setActiveMatch(null); loadData(); }} />
      )}
      {activeMatch && activeMatchData && currentEvent.sport_key === "football" && (
        <FootballScorer match={activeMatchData} config={{ ...(currentEvent.sport_config || {}), team_size: currentEvent.team_size ?? currentEvent.sport_config?.team_size }}
          onScore={(s1, s2, extra) => updateScore(activeMatch, { score_p1: s1, score_p2: s2, ...extra }).then(u => u?.status === "done" ? loadData() : patchMatchInData(u))}
          onFinish={(wp) => handleFinishMatch(activeMatch, wp)}
          onWalkover={(winPos) => handleWalkover(activeMatch, winPos)}
          onGoLive={() => handleMatchAction(activeMatch, "go_live")}
          onPause={() => handleMatchAction(activeMatch, "pause")}
          onReset={() => handleMatchAction(activeMatch, "reset")}
          onClose={() => { setActiveMatch(null); loadData(); }} />
      )}
    </div>
  );
}

// ── Bracket template calculator ──────────────────────────────
// Mirrors the backend build_bracket algorithm to show bracket structure.
// Returns { rounds, byeCount, total }
// rounds = [{ stage, label, matchCount, isAssignable, byeCount }]
// The 3rd place match is always included (needs 4+ participants).
function getBracketTemplate(n) {
  if (n < 2) return null;
  const bracketSize = Math.pow(2, Math.ceil(Math.log2(Math.max(n, 2))));
  const halfBracket = bracketSize / 2;
  const prelimCount = n - halfBracket;     // first-round real matches
  const byeCount    = halfBracket - prelimCount;

  const STAGE_FOR_COUNT = (count) => {
    if (count <= 2)  return { stage: "final",       label: "Final"           };
    if (count <= 4)  return { stage: "semi",         label: "Semi Finals"     };
    if (count <= 8)  return { stage: "quarter",      label: "Quarter Finals"  };
    if (count <= 16) return { stage: "round_of_16",  label: "Round of 16"     };
    if (count <= 32) return { stage: "round_of_32",  label: "Round of 32"     };
    return { stage: "preliminary", label: "First Round" };
  };

  const r1 = byeCount > 0
    ? { stage: "preliminary", label: "Preliminary Round" }
    : STAGE_FOR_COUNT(n);

  const rounds = [{ ...r1, matchCount: prelimCount, isAssignable: true, byeCount }];

  // Subsequent TBD rounds (advancing players = halfBracket)
  let advancing = halfBracket;
  while (advancing > 1) {
    const info = STAGE_FOR_COUNT(advancing);
    rounds.push({ ...info, matchCount: advancing / 2, isAssignable: false, byeCount: 0 });
    advancing = advancing / 2;
  }

  if (n >= 4) {
    rounds.push({ stage: "third_place", label: "3rd Place Match", matchCount: 1, isAssignable: false, byeCount: 0 });
  }

  return { rounds, byeCount, total: rounds.reduce((s, r) => s + r.matchCount, 0) };
}

// ── ConfirmButton ─────────────────────────────────────────────
// A button that asks "are you sure?" in a popup before running onConfirm.
function ConfirmButton({ label, title, body, confirmLabel = "Yes, continue", onConfirm, className = "btn btn-primary", style }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className={className} style={style} onClick={() => setOpen(true)}>{label}</button>
      {open && (
        <div className="overlay" onClick={() => setOpen(false)}>
          <div className="danger-box" onClick={e => e.stopPropagation()}>
            <div className="danger-title">{title}</div>
            <div className="danger-body">{body}</div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
              <button className="btn btn-outline" onClick={() => setOpen(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={() => { setOpen(false); onConfirm(); }}>{confirmLabel}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── DirectKnockoutSuggestionPanel ────────────────────────────
// Shown when no fixtures exist yet for a direct_knockout event.
// Two modes: suggestion overview, or manual slot assignment.
function DirectKnockoutSuggestionPanel({
  participantCount, participants, isTeam,
  onAutoGenerate, onBulkCreate, flash,
}) {
  const [mode,  setMode]  = useState("suggestion"); // "suggestion" | "manual"
  const n       = participantCount;
  const template = getBracketTemplate(n);
  const unit    = isTeam ? "team" : "player";
  const Unit    = isTeam ? "Team" : "Player";

  const cardStyle  = { marginBottom: 16 };
  const labelStyle = { fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: 2, color: "var(--muted)", display: "block", marginBottom: 4 };

  // ── Suggestion overview ───────────────────────────────────
  if (mode === "suggestion") {
    return (
      <div className="card" style={cardStyle}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 18, flexWrap: "wrap", gap: 8 }}>
          <div>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 900, color: "var(--ink)", letterSpacing: -0.3 }}>
              🏆 Tournament Setup
            </div>
            <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 3 }}>
              {n} {unit}{n !== 1 ? "s" : ""} · Direct Knockout
            </div>
          </div>
        </div>

        {n < 2 ? (
          <div style={{ fontSize: 13, color: "var(--muted)", padding: "12px 0" }}>
            Add at least 2 {unit}s to set up the bracket.
          </div>
        ) : (
          <>
            {/* Bracket flow */}
            <div style={{ marginBottom: 18 }}>
              <div style={labelStyle}>Recommended Bracket — {template.total} matches total</div>
              <div style={{ display: "flex", alignItems: "center", gap: 0, flexWrap: "wrap", marginTop: 6 }}>
                {template.rounds.map((r, i) => (
                  <div key={r.stage} style={{ display: "flex", alignItems: "center" }}>
                    {i > 0 && <span style={{ color: "var(--muted)", fontSize: 16, padding: "0 8px" }}>→</span>}
                    <div style={{
                      background: r.isAssignable ? "var(--primary-dim)" : "var(--surface)",
                      border: `1px solid ${r.isAssignable ? "rgba(255,107,53,0.35)" : "var(--border)"}`,
                      borderRadius: 8, padding: "8px 12px", textAlign: "center", minWidth: 90,
                    }}>
                      <div style={{ fontFamily: "var(--font-display)", fontSize: 11, fontWeight: 800, color: r.isAssignable ? "var(--primary)" : "var(--ink)", textTransform: "uppercase", letterSpacing: 0.5 }}>
                        {r.label}
                      </div>
                      <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
                        {r.matchCount} match{r.matchCount !== 1 ? "es" : ""}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              {template.byeCount > 0 && (
                <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 10, padding: "6px 10px", background: "var(--elevated)", borderRadius: 6, display: "inline-block" }}>
                  ℹ {template.byeCount} {unit}{template.byeCount !== 1 ? "s" : ""} will get a bye directly to the next round
                </div>
              )}
            </div>

            {/* Action buttons */}
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <ConfirmButton
                label="⚡ Generate Automatically" style={{ gap: 6 }}
                title="Generate all fixtures?"
                body="Are you sure you want to generate all fixtures? Participants will be drawn into matches automatically."
                confirmLabel="Yes, generate" onConfirm={onAutoGenerate} />
              <button className="btn btn-outline" onClick={() => setMode("manual")}>
                🎯 Set Up Manually
              </button>
            </div>
          </>
        )}
      </div>
    );
  }

  // ── Manual slot assignment ────────────────────────────────
  return (
    <DirectKnockoutManualSetup
      template={template}
      participants={participants}
      isTeam={isTeam}
      onBulkCreate={onBulkCreate}
      onBack={() => setMode("suggestion")}
      flash={flash}
    />
  );
}

// ── DirectKnockoutManualSetup ─────────────────────────────────
// Shows slot-by-slot participant assignment for the first round.
function DirectKnockoutManualSetup({ template, participants, isTeam, onBulkCreate, onBack, flash }) {
  const first      = template?.rounds?.find(r => r.isAssignable);
  const slotCount  = first?.matchCount || 0;
  const [slots, setSlots] = useState(() => Array.from({ length: slotCount }, () => ({ p1: "", p2: "" })));
  const [busy, setBusy]   = useState(false);

  const unit  = isTeam ? "Team" : "Player";
  const iStyle = {
    background: "var(--elevated)", border: "1px solid var(--border-mid)",
    borderRadius: 6, padding: "7px 10px", fontSize: 13,
    color: "var(--ink)", width: "100%", outline: "none", fontFamily: "inherit",
  };
  const lStyle = { fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: 2, color: "var(--muted)", display: "block", marginBottom: 4 };

  // IDs that are already picked in some slot
  const usedSet = new Set(slots.flatMap(s => [s.p1, s.p2].filter(Boolean)));

  const updateSlot = (idx, field, val) =>
    setSlots(prev => prev.map((s, i) => i === idx ? { ...s, [field]: val } : s));

  const handleCreate = async () => {
    const incomplete = slots.some(s => !s.p1 || !s.p2);
    if (incomplete) return flash("Fill in all match slots before creating.");
    setBusy(true);
    // Pass participants so handleBulkCreateMatches can identify the bye player
    try { await onBulkCreate(template, slots, participants); }
    finally { setBusy(false); }
  };

  const laterRounds = template.rounds.filter(r => !r.isAssignable);

  return (
    <div className="card" style={{ marginBottom: 16, border: "1px solid rgba(255,107,53,0.25)" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 4, flexWrap: "wrap", gap: 8 }}>
        <div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 13, fontWeight: 900, color: "var(--ink)" }}>
            Manual Setup — {first?.label}
          </div>
          <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
            Assign participants for {slotCount} first-round match{slotCount !== 1 ? "es" : ""}.
            {laterRounds.length > 0 && (
              <span> {laterRounds.map(r => r.label).join(" → ")} will be created as TBD.</span>
            )}
          </div>
        </div>
        <button className="btn btn-outline btn-sm" onClick={onBack}>← Back</button>
      </div>

      {template.byeCount > 0 && (
        <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 14, padding: "6px 10px", background: "var(--elevated)", borderRadius: 6 }}>
          ℹ {template.byeCount} participant{template.byeCount !== 1 ? "s" : ""} will automatically get a bye to the next round.
        </div>
      )}

      {/* Match slots */}
      <div style={{ marginBottom: 14 }}>
        {slots.map((slot, idx) => (
          <div key={idx} style={{ marginBottom: 12, padding: "12px 0", borderBottom: idx < slots.length - 1 ? "1px solid var(--border)" : "none" }}>
            <div style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: 1.5, color: "var(--muted)", marginBottom: 8 }}>
              Match {idx + 1}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 36px 1fr", gap: 8, alignItems: "end" }}>
              <div>
                <label style={lStyle}>{unit} 1</label>
                <select style={iStyle} value={slot.p1} onChange={e => updateSlot(idx, "p1", e.target.value)}>
                  <option value="">— Select —</option>
                  {participants
                    .filter(p => String(p.id) === slot.p1 || !usedSet.has(String(p.id)))
                    .filter(p => String(p.id) !== slot.p2)
                    .map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div style={{ textAlign: "center", paddingBottom: 8, fontWeight: 900, color: "var(--muted)", fontSize: 11 }}>vs</div>
              <div>
                <label style={lStyle}>{unit} 2</label>
                <select style={iStyle} value={slot.p2} onChange={e => updateSlot(idx, "p2", e.target.value)}>
                  <option value="">— Select —</option>
                  {participants
                    .filter(p => String(p.id) === slot.p2 || !usedSet.has(String(p.id)))
                    .filter(p => String(p.id) !== slot.p1)
                    .map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <button className="btn btn-primary" onClick={handleCreate} disabled={busy || slots.some(s => !s.p1 || !s.p2)}>
          {busy ? "Creating…" : `✓ Create All ${template.total} Matches`}
        </button>
        <button className="btn btn-outline btn-sm" onClick={onBack}>Cancel</button>
      </div>
    </div>
  );
}

// ── GroupKnockoutSuggestionPanel ──────────────────────────────
// Shown when no groups exist yet for a group_knockout event.
// Suggestion mode shows recommended group count + two action buttons.
// Manual mode shows group-assignment slots.
function GroupKnockoutSuggestionPanel({
  participantCount, participants, isTeam, numGroups, setNumGroups,
  unitLabel, UnitLabel, onAutoGenerate, onManualSetup, flash,
}) {
  const [mode, setMode] = useState("suggestion"); // "suggestion" | "manual"
  const n = participantCount;

  // Recommend ≈ 4 participants per group
  const recommended = Math.max(2, Math.min(Math.floor(n / 4), 8));
  const perGroup    = numGroups > 0 ? Math.ceil(n / numGroups) : 0;

  const iStyle = { background: "var(--elevated)", border: "1px solid var(--border-mid)", borderRadius: 6, padding: "7px 10px", fontSize: 13, color: "var(--ink)", width: "100%", outline: "none", fontFamily: "inherit" };
  const lStyle = { fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: 2, color: "var(--muted)", display: "block", marginBottom: 4 };

  // ── Suggestion overview ───────────────────────────────────
  if (mode === "suggestion") {
    return (
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 900, color: "var(--ink)", letterSpacing: -0.3 }}>
            🏆 Tournament Setup
          </div>
          <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 3 }}>
            {n} {unitLabel} · Group Stage + Knockout
          </div>
        </div>

        {n < 4 ? (
          <div style={{ fontSize: 13, color: "var(--muted)", padding: "12px 0" }}>
            Add at least 4 {unitLabel} to set up groups.
          </div>
        ) : (
          <>
            {/* Structure summary */}
            <div style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: 2, color: "var(--muted)", marginBottom: 10 }}>
                Recommended Structure
              </div>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
                {[
                  { icon: "👥", label: "Groups", value: `${recommended} groups` },
                  { icon: "📋", label: "Per Group", value: `~${Math.ceil(n / recommended)} ${unitLabel}` },
                  { icon: "🏅", label: "Format", value: "Single-elim bracket" },
                  { icon: "🥇", label: "Advance", value: "Group winners → Championship" },
                ].map(({ icon, label, value }) => (
                  <div key={label} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 12px", minWidth: 120 }}>
                    <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 2 }}>{icon} {label}</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)" }}>{value}</div>
                  </div>
                ))}
              </div>

              {/* Groups stepper */}
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 12, color: "var(--muted)" }}>Number of groups:</span>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <button className="btn btn-outline btn-sm" style={{ width: 28, padding: 0 }}
                    onClick={() => setNumGroups(g => Math.max(2, g - 1))}>−</button>
                  <span style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 900, color: "var(--primary)", minWidth: 28, textAlign: "center" }}>{numGroups}</span>
                  <button className="btn btn-outline btn-sm" style={{ width: 28, padding: 0 }}
                    onClick={() => setNumGroups(g => Math.min(16, g + 1))}>+</button>
                </div>
                <span style={{ fontSize: 11, color: "var(--muted)" }}>≈ {perGroup} {unitLabel} per group</span>
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <ConfirmButton
                label="⚡ Generate Automatically"
                title="Generate all fixtures?"
                body="Are you sure you want to generate all fixtures? Groups and group-stage matches will be created automatically."
                confirmLabel="Yes, generate" onConfirm={onAutoGenerate} />
              {onManualSetup && (
                <button className="btn btn-outline" onClick={() => setMode("manual")}>🎯 Assign Groups Manually</button>
              )}
            </div>
          </>
        )}
      </div>
    );
  }

  // ── Manual group assignment ───────────────────────────────
  return (
    <GroupManualAssignment
      numGroups={numGroups}
      participants={participants}
      isTeam={isTeam}
      unitLabel={unitLabel}
      UnitLabel={UnitLabel}
      onSetup={onManualSetup}
      onBack={() => setMode("suggestion")}
      flash={flash}
    />
  );
}

// ── GroupManualAssignment ─────────────────────────────────────
// Shows group boxes with participant assignment dropdowns.
function GroupManualAssignment({ numGroups, participants, isTeam, unitLabel, UnitLabel, onSetup, onBack, flash }) {
  const perGroup = Math.ceil(participants.length / numGroups);
  const groupLabels = Array.from({ length: numGroups }, (_, i) => String.fromCharCode(65 + i)); // A, B, C, …

  // groupSlots[groupIdx][slotIdx] = participantId string or ""
  const [slots, setSlots] = useState(() =>
    Array.from({ length: numGroups }, () => Array.from({ length: perGroup }, () => ""))
  );
  const [busy, setBusy] = useState(false);

  const iStyle = { background: "var(--elevated)", border: "1px solid var(--border-mid)", borderRadius: 6, padding: "6px 8px", fontSize: 12, color: "var(--ink)", width: "100%", outline: "none", fontFamily: "inherit" };

  // All currently assigned participant IDs
  const usedSet = new Set(slots.flat().filter(Boolean));

  const updateSlot = (gi, si, val) =>
    setSlots(prev => prev.map((g, i) => i === gi ? g.map((v, j) => j === si ? val : v) : g));

  const handleCreate = async () => {
    // Validate: every participant assigned exactly once
    const allAssigned = slots.flat().filter(Boolean);
    const unique = new Set(allAssigned);
    if (unique.size < participants.length) {
      return flash(`Assign all ${participants.length} ${unitLabel} to groups.`);
    }

    const groupAssignments = slots.map((g, i) => ({
      name: `Group ${groupLabels[i]}`,
      participants: g.filter(Boolean).map(Number),
    }));

    setBusy(true);
    try { await onSetup(groupAssignments); }
    finally { setBusy(false); }
  };

  const allFilled = slots.flat().filter(Boolean).length === participants.length;

  return (
    <div className="card" style={{ marginBottom: 16, border: "1px solid rgba(255,107,53,0.25)" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
        <div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 13, fontWeight: 900, color: "var(--ink)" }}>
            Assign {UnitLabel} to Groups
          </div>
          <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
            {numGroups} groups · ~{perGroup} {unitLabel} each
          </div>
        </div>
        <button className="btn btn-outline btn-sm" onClick={onBack}>← Back</button>
      </div>

      {/* Group grid */}
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(numGroups, 4)}, 1fr)`, gap: 12, marginBottom: 16, overflowX: "auto" }}>
        {slots.map((group, gi) => (
          <div key={gi} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 10px 12px" }}>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: 1.5, color: "var(--primary)", marginBottom: 8 }}>
              Group {groupLabels[gi]}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {group.map((val, si) => (
                <select key={si} style={iStyle} value={val} onChange={e => updateSlot(gi, si, e.target.value)}>
                  <option value="">— {UnitLabel} {si + 1} —</option>
                  {participants
                    .filter(p => String(p.id) === val || !usedSet.has(String(p.id)))
                    .map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Unassigned indicator */}
      {!allFilled && (
        <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 12, padding: "6px 10px", background: "var(--elevated)", borderRadius: 6 }}>
          {participants.length - slots.flat().filter(Boolean).length} {unitLabel} unassigned
        </div>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button className="btn btn-primary" onClick={handleCreate} disabled={busy || !allFilled}>
          {busy ? "Creating…" : "✓ Create Groups & Matches"}
        </button>
        <button className="btn btn-outline btn-sm" onClick={onBack}>Cancel</button>
      </div>
    </div>
  );
}

// ── ManualMatchCreator ───────────────────────────────────────
// Collapsible form allowing organisers to create individual matches by hand.
// Works for both direct_knockout and group_knockout formats.
// eligibleIds (Set of String ids, optional): for knockout stages, restricts the
// dropdowns to players who qualified from groups AND aren't already placed in
// a knockout match. Group-stage matches always show the full participant list.
const KNOCKOUT_ROUND = { preliminary: 1, round_of_16: 1, quarter: 2, semi: 3, final: 4, third_place: 4 };

function ManualMatchCreator({ format, groups = [], participants = [], isTeam, onCreate, flash, eligibleIds = null }) {
  const [open,    setOpen]    = useState(false);
  const [stage,   setStage]   = useState(format === "group_knockout" ? "group" : "semi");
  const [groupId, setGroupId] = useState("");
  const [p1,      setP1]      = useState("");
  const [p2,      setP2]      = useState("");
  const [busy,    setBusy]    = useState(false);

  const isGroupKnockout = format === "group_knockout";
  const isGroupStage    = isGroupKnockout && stage === "group";

  // Knockout stages draw from the eligible pool only
  const pool = (isGroupStage || !eligibleIds)
    ? participants
    : participants.filter(p => eligibleIds.has(String(p.id)));

  const stageOptions = isGroupKnockout
    ? [
        { value: "group",       label: "Group Stage" },
        { value: "quarter",     label: "Quarter Final" },
        { value: "semi",        label: "Semi Final" },
        { value: "final",       label: "Final" },
        { value: "third_place", label: "3rd Place Match" },
      ]
    : [
        { value: "preliminary", label: "Preliminary" },
        { value: "quarter",     label: "Quarter Final" },
        { value: "semi",        label: "Semi Final" },
        { value: "final",       label: "Final" },
        { value: "third_place", label: "3rd Place Match" },
      ];

  const handleStageChange = (val) => { setStage(val); setGroupId(""); setP1(""); setP2(""); };

  const handleCreate = async () => {
    if (!p1 || !p2) return flash("Select both participants.");
    if (p1 === p2) return flash("Cannot match a participant against themselves.");
    setBusy(true);
    try {
      const body = {
        stage:    isGroupStage ? "group" : stage,
        group_id: isGroupStage && groupId ? parseInt(groupId) : null,
        round:    isGroupStage ? 1 : (KNOCKOUT_ROUND[stage] || 1),
        ...(isTeam
          ? { team1_id: parseInt(p1), team2_id: parseInt(p2) }
          : { player1_id: parseInt(p1), player2_id: parseInt(p2) }
        ),
      };
      await onCreate(body);
      setP1(""); setP2(""); setGroupId("");
      setOpen(false);
    } finally { setBusy(false); }
  };

  const iStyle = {
    background: "var(--elevated)", border: "1px solid var(--border-mid)",
    borderRadius: 6, padding: "7px 10px", fontSize: 13,
    color: "var(--ink)", width: "100%", outline: "none", fontFamily: "inherit",
  };
  const lStyle = {
    fontSize: 10, fontWeight: 800, textTransform: "uppercase",
    letterSpacing: 2, color: "var(--muted)", display: "block", marginBottom: 4,
  };

  if (!open) {
    return (
      <div style={{ marginBottom: 16 }}>
        <button className="btn btn-outline" onClick={() => setOpen(true)} style={{ fontSize: 12 }}>
          ＋ Add Match Manually
        </button>
      </div>
    );
  }

  return (
    <div className="card" style={{ marginBottom: 16, border: "1px solid rgba(255,107,53,0.25)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <span style={{ fontFamily: "var(--font-display)", fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: 1.5, color: "var(--primary)" }}>
          Add Match Manually
        </span>
        <button className="btn btn-outline btn-sm" onClick={() => setOpen(false)}>✕ Close</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isGroupStage && groups.length ? "1fr 1fr" : "1fr", gap: "0 20px" }}>
        {/* Stage */}
        <div style={{ marginBottom: 12 }}>
          <label style={lStyle}>Stage</label>
          <select style={iStyle} value={stage} onChange={e => handleStageChange(e.target.value)}>
            {stageOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        {/* Group selector — only for group stage in group_knockout */}
        {isGroupStage && groups.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <label style={lStyle}>Group (optional)</label>
            <select style={iStyle} value={groupId} onChange={e => setGroupId(e.target.value)}>
              <option value="">— No group —</option>
              {groups.map(g => <option key={g.group_id} value={g.group_id}>{g.name}</option>)}
            </select>
          </div>
        )}
      </div>

      {/* Participant selectors */}
      {participants.length === 0 ? (
        <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 12 }}>
          No {isTeam ? "teams" : "players"} added yet. Add participants first.
        </div>
      ) : pool.length === 0 ? (
        <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 12 }}>
          No eligible {isTeam ? "teams" : "players"} for this stage — either the
          group finals aren't finished yet, or everyone who qualified is already
          placed in a knockout match.
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 28px 1fr", gap: 8, alignItems: "end", marginBottom: 14 }}>
          <div>
            <label style={lStyle}>{isTeam ? "Team" : "Player"} 1</label>
            <select style={iStyle} value={p1} onChange={e => setP1(e.target.value)}>
              <option value="">— Select —</option>
              {pool.filter(p => String(p.id) !== p2).map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div style={{ textAlign: "center", paddingBottom: 8, fontWeight: 900, color: "var(--muted)", fontSize: 12 }}>vs</div>
          <div>
            <label style={lStyle}>{isTeam ? "Team" : "Player"} 2</label>
            <select style={iStyle} value={p2} onChange={e => setP2(e.target.value)}>
              <option value="">— Select —</option>
              {pool.filter(p => String(p.id) !== p1).map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 8 }}>
        <button className="btn btn-primary btn-sm" onClick={handleCreate} disabled={busy || !p1 || !p2}>
          {busy ? "Creating…" : "Create Match"}
        </button>
        <button className="btn btn-outline btn-sm" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </div>
  );
}

// ── GroupKnockoutFixtures ─────────────────────────────────────
// Step-by-step UI for the group + knockout format.
// Group stage = single-elimination bracket per group (with byes).
// Championship stage = knockout bracket seeded from group winners/runners-up.
function GroupKnockoutFixtures({
  event, isCompleted = false, numGroups, setNumGroups, qualifiersPerGroup, setQualifiersPerGroup,
  onGenerateGroups, onGenerateKnockout,
  onAction, onSetConfig, onEndMatch, sportKey, participantType,
  participants = [], isTeamEvent = false, onCreateMatch, onManualGroupSetup, flash,
}) {
  const allMatches      = event.matches || [];
  const groupMatches    = allMatches.filter(m => m.group_id);
  const knockoutMatches = allMatches.filter(m => !m.group_id);
  const hasGroups       = groupMatches.length > 0;
  const hasKnockout     = knockoutMatches.length > 0;

  const isDoubles = participantType === "doubles_pair";
  const isTeam    = participantType === "team";
  const unitLabel = isDoubles ? "pairs" : isTeam ? "teams" : "players";
  const UnitLabel = unitLabel.charAt(0).toUpperCase() + unitLabel.slice(1);

  // "Group stage complete" = every group has a DONE final match
  const allGroupFinalsDone = (event.groups?.length > 0) && event.groups.every(g =>
    groupMatches.some(m => m.group_id === g.group_id && m.stage === "final" && m.status === "done")
  );

  const doneGroup  = groupMatches.filter(m => m.status === "done").length;
  const doneKnock  = knockoutMatches.filter(m => m.status === "done").length;

  // Knockout eligibility for the manual match creator:
  // qualified = winner/loser of a FINISHED group final; minus anyone already
  // placed in a knockout match. This is what makes the dropdown shrink as
  // matches are created (8 qualified → create match 1 → 6 remain, etc).
  const qualifiedIds = new Set(
    (event.groups || []).flatMap(g => {
      const final = groupMatches.find(m =>
        m.group_id === g.group_id && m.stage === "final" && m.status === "done");
      if (!final) return [];
      return [final.player_1, final.player_2]
        .map(p => p?.player_id ?? p?.team_id)
        .filter(id => id != null)
        .map(String);
    })
  );
  const placedIds = new Set(
    knockoutMatches.flatMap(m =>
      [m.player_1, m.player_2]
        .map(p => p?.player_id ?? p?.team_id)
        .filter(id => id != null)
        .map(String))
  );
  const knockoutEligibleIds = new Set([...qualifiedIds].filter(id => !placedIds.has(id)));

  const NumInput = ({ label, value, setter, min, max }) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: "var(--muted)" }}>{label}</span>
      <input
        type="number" value={value} min={min} max={max}
        onChange={e => setter(Math.max(min, Math.min(max, parseInt(e.target.value) || min)))}
        style={{ width: 52, padding: "5px 8px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--ink)", fontSize: 14, fontWeight: 700, textAlign: "center" }}
      />
    </div>
  );

  // Finished sections sink: completed groups go below groups still in play,
  // and below the championship once every group is done.
  const groupDone = g => Number(groupMatches.filter(m => m.group_id === g.group_id).every(m => m.status === "done"));
  const allGroupsDone = groupMatches.length > 0 && groupMatches.every(m => m.status === "done");
  const groupsBlock = (
    <>
      {/* Group brackets — one KnockoutBracket per group */}
      {[...(event.groups || [])].sort((x, y) => groupDone(x) - groupDone(y)).map(g => {
        const gm = groupMatches.filter(m => m.group_id === g.group_id);
        if (!gm.length) return null;
        const finalDone = gm.some(m => m.stage === "final" && m.status === "done");
        return (
          <div key={g.group_id} style={{ marginBottom: 28 }}>
            <div className="section-label" style={{ marginBottom: 10, display: "flex", alignItems: "center", gap: 8 }}>
              {g.name}
              {finalDone
                ? <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 10, background: "rgba(34,197,94,0.15)", color: "var(--green,#22c55e)" }}>✓ DONE</span>
                : <span style={{ fontSize: 10, color: "var(--muted)", fontWeight: 400 }}>{gm.filter(m => m.status === "done").length}/{gm.length} done</span>
              }
            </div>
            <KnockoutBracket fixtureOnly matches={gm} onAction={onAction} onSetConfig={onSetConfig} onEndMatch={onEndMatch} sportKey={sportKey} isGroup={true} />
          </div>
        );
      })}

    </>
  );
  const championshipBlock = (
    <>
      {/* Championship bracket */}
      {hasKnockout && (
        <div style={{ marginTop: 16 }}>
          <div style={{
            fontFamily: "var(--font-display)", fontSize: 10, fontWeight: 800,
            textTransform: "uppercase", letterSpacing: 2, color: "var(--primary)",
            marginBottom: 12, paddingBottom: 6, borderBottom: "2px solid var(--primary)",
            display: "flex", alignItems: "center", justifyContent: "space-between",
          }}>
            <span>Championship Bracket</span>
            <span style={{ fontWeight: 400, color: "var(--muted)", fontSize: 10, textTransform: "none", letterSpacing: 0 }}>
              {doneKnock}/{knockoutMatches.length} done
            </span>
          </div>
          <KnockoutBracket fixtureOnly matches={knockoutMatches} onAction={onAction} onSetConfig={onSetConfig} onEndMatch={onEndMatch} sportKey={sportKey} />
        </div>
      )}
    </>
  );

  // ── Step 1: no groups yet → show suggestion panel ────────
  if (!hasGroups) {
    return (
      <GroupKnockoutSuggestionPanel
        participantCount={participants.length}
        participants={participants}
        isTeam={isTeamEvent}
        numGroups={numGroups}
        setNumGroups={setNumGroups}
        unitLabel={unitLabel}
        UnitLabel={UnitLabel}
        onAutoGenerate={onGenerateGroups}
        onManualSetup={onManualGroupSetup}
        flash={flash || (() => {})}
      />
    );
  }

  // ── Step 2: groups exist ──────────────────────────────────
  return (
    <div>
      {/* ── Generate Championship CTA (shown when all group finals done & no knockout yet) ── */}
      {!isCompleted && allGroupFinalsDone && !hasKnockout && (
        <div className="card" style={{ marginTop: 0, marginBottom: 16, background: "linear-gradient(135deg, var(--primary-dim) 0%, rgba(255,107,53,0.05) 100%)", border: "2px solid var(--primary)", borderRadius: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: 8, background: "var(--primary)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/>
              </svg>
            </div>
            <div>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 14, fontWeight: 900, textTransform: "uppercase", letterSpacing: 0.5, color: "var(--primary)" }}>
                All Groups Complete!
              </div>
              <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
                Generate the knockout bracket (Semis & Final) from group results.
              </div>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap", marginBottom: 14 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: "var(--muted)" }}>Qualifiers per group</span>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <button className="btn btn-outline btn-sm" style={{ width: 28, padding: 0 }}
                  onClick={() => setQualifiersPerGroup(q => Math.max(1, q - 1))}>−</button>
                <span style={{ fontWeight: 800, fontSize: 16, color: "var(--ink)", minWidth: 20, textAlign: "center" }}>{qualifiersPerGroup}</span>
                <button className="btn btn-outline btn-sm" style={{ width: 28, padding: 0 }}
                  onClick={() => setQualifiersPerGroup(q => Math.min(2, q + 1))}>+</button>
              </div>
            </div>
          </div>

          <ConfirmButton
            className="btn btn-gradient btn-lg"
            style={{ width: "100%", fontSize: 14 }}
            label="Generate Semis & Final →"
            title="Generate semi finals & final?"
            body="Are you sure you want to generate the semi finals and final from the group results?"
            confirmLabel="Yes, generate"
            onConfirm={onGenerateKnockout} />
        </div>
      )}

      {/* Status bar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <div style={{ fontSize: 12, color: "var(--muted)" }}>
          {hasKnockout
            ? <>Groups: <strong style={{ color: "var(--ink)" }}>{doneGroup}/{groupMatches.length}</strong> · Championship: <strong style={{ color: "var(--ink)" }}>{doneKnock}/{knockoutMatches.length}</strong></>
            : <><strong style={{ color: "var(--ink)" }}>{doneGroup}/{groupMatches.length}</strong> group matches played</>
          }
        </div>
        {!isCompleted && hasKnockout && (
          <ConfirmButton
            className="btn btn-outline btn-sm" style={{ fontSize: 11, color: "var(--muted)" }}
            label="Regenerate Championship"
            title="Regenerate championship?"
            body="Are you sure you want to regenerate the championship bracket? The current bracket will be replaced."
            confirmLabel="Yes, regenerate" onConfirm={onGenerateKnockout} />
        )}
        {!isCompleted && !hasKnockout && (
          <ConfirmButton
            className="btn btn-outline btn-sm" style={{ fontSize: 11, color: "var(--muted)" }}
            label="Reset Groups"
            title="Reset groups?"
            body="Are you sure you want to reset the groups? Groups and group matches will be regenerated."
            confirmLabel="Yes, reset" onConfirm={onGenerateGroups} />
        )}
      </div>

      {/* Manual match creator — hidden once the tournament is completed */}
      {!isCompleted && onCreateMatch && (
        <ManualMatchCreator
          format="group_knockout"
          groups={event.groups || []}
          participants={participants}
          isTeam={isTeamEvent}
          onCreate={onCreateMatch}
          flash={flash || (() => {})}
          eligibleIds={knockoutEligibleIds}
        />
      )}

      {allGroupsDone ? championshipBlock : null}
      {groupsBlock}
      {allGroupsDone ? null : championshipBlock}
    </div>
  );
}

// ── KnockoutBracket ──────────────────────────────────────────
// Road to Finals: groups matches by stage and shows bracket columns
const STAGE_ORDER = ["preliminary", "round_of_32", "round_of_16", "knockout", "quarter", "semi", "third_place", "final"];
const STAGE_LABEL = {
  preliminary: "Preliminary",
  round_of_32: "Round of 32",
  round_of_16: "Round of 16",
  knockout:    "Round of 16",   // legacy label for old records
  quarter:     "Quarter Finals",
  semi:        "Semi Finals",
  third_place: "3rd Place",
  final:       "Final",
};

// Sort key: live first, then matches yet to start, then TBD matches (an
// opponent not decided yet), then finished matches last.
const matchPriority = (m) => {
  const isSet = (p) => !!(p && (p.player_id != null || p.team_id != null));
  const known = isSet(m.player_1) && isSet(m.player_2);
  if (m.status === "live") return 0;
  if (m.status === "done") return 3;
  return known ? 1 : 2;
};
const byPriority = (a, b) => matchPriority(a) - matchPriority(b);

function KnockoutBracket({ matches, onAction, onSetConfig, onEndMatch, sportKey, isGroup = false, fixtureOnly = false }) {
  // ── Group bracket: stack rounds vertically ──────────────────
  if (isGroup) {
    const byRound = {};
    for (const m of matches) {
      const r = m.round || 1;
      if (!byRound[r]) byRound[r] = [];
      byRound[r].push(m);
    }
    const rounds = Object.keys(byRound).map(Number).sort((a, b) => a - b);
    if (!rounds.length) return null;
    const lastRound = rounds[rounds.length - 1];

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {rounds.map(r => (
          <div key={r}>
            <div style={{
              fontFamily: "var(--font-display)", fontSize: 9, fontWeight: 800,
              textTransform: "uppercase", letterSpacing: 2,
              color: r === lastRound ? "var(--primary)" : "var(--muted)",
              marginBottom: 8, paddingBottom: 5,
              borderBottom: `2px solid ${r === lastRound ? "var(--primary)" : "var(--border)"}`,
            }}>
              {r === lastRound ? "Group Final" : `Round ${r}`}
              <span style={{ color: "var(--muted)", fontWeight: 400, marginLeft: 4, letterSpacing: 0, textTransform: "none", fontSize: 10 }}>
                ({byRound[r].length})
              </span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[...byRound[r]].sort(byPriority).map(m => (
                <BracketCard fixtureOnly={fixtureOnly} key={m.match_id} match={m} onAction={onAction} onSetConfig={onSetConfig} onEndMatch={onEndMatch}
                  sportKey={sportKey} isFinal={r === lastRound} />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  // ── Championship / direct knockout: stack stages vertically ──
  const byStage = {};
  for (const m of matches) {
    const s = m.stage || "knockout";
    if (!byStage[s]) byStage[s] = [];
    byStage[s].push(m);
  }

  const stages = STAGE_ORDER.filter(s => byStage[s]?.length > 0);
  if (!stages.length) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {stages.map(stage => (
        <div key={stage}>
          <div style={{
            fontFamily: "var(--font-display)", fontSize: 9, fontWeight: 800,
            textTransform: "uppercase", letterSpacing: 2,
            color: stage === "final" ? "var(--primary)" : "var(--muted)",
            marginBottom: 8, paddingBottom: 5,
            borderBottom: `2px solid ${stage === "final" ? "var(--primary)" : "var(--border)"}`,
          }}>
            {STAGE_LABEL[stage] || stage}
            <span style={{ color: "var(--muted)", fontWeight: 400, marginLeft: 4, letterSpacing: 0, textTransform: "none", fontSize: 10 }}>
              ({byStage[stage].length})
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {[...byStage[stage]].sort(byPriority).map(m => (
              <BracketCard fixtureOnly={fixtureOnly} key={m.match_id} match={m} onAction={onAction} onSetConfig={onSetConfig} onEndMatch={onEndMatch}
                sportKey={sportKey} isFinal={stage === "final"} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// Group stage + quarter → best of 3 (sets_to_win=2); semi/final/3rd → best of 5 (sets_to_win=3)
function defaultSetsToWin(match) {
  if (match.group_id) return 2;  // any match inside a group bracket
  if (["semi", "final", "third_place"].includes(match.stage)) return 3;
  return 2;  // quarter, round_of_16, round_of_32, preliminary
}

function BracketCard({ match: m, onAction, onSetConfig, onEndMatch, sportKey, isFinal, fixtureOnly = false }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [endMatchMode, setEndMatchMode]   = useState(false);
  const isLive     = m.status === "live";
  const isDone     = m.status === "done";
  const p1Won      = m.player_1?.is_winner;
  const p2Won      = m.player_2?.is_winner;
  const isSetBased = ["table_tennis", "badminton"].includes(sportKey);
  const ls         = typeof m.live_state === "string" ? JSON.parse(m.live_state) : (m.live_state || {});
  const curSets    = ls.sets_to_win ?? defaultSetsToWin(m);
  const sets       = (m.sets || []).filter(s => s.is_complete);

  const nameStyle = (won) => ({
    fontSize: 11, fontWeight: won ? 700 : 400,
    color: won ? "var(--primary)" : "var(--ink)",
    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
    flex: 1, minWidth: 0,
  });

  const rowStyle = (won) => ({
    display: "flex", alignItems: "center", justifyContent: "space-between",
    gap: 4, padding: "5px 8px", borderRadius: 4, marginBottom: 2,
    background: won ? "var(--primary-dim)" : "transparent",
    border: `1px solid ${won ? "rgba(255,107,53,0.3)" : "var(--border)"}`,
  });

  return (
    <div style={{
      borderRadius: 8,
      border: `1px solid ${isFinal ? "var(--primary)" : isLive ? "rgba(255,107,53,0.5)" : "var(--border)"}`,
      overflow: "hidden",
      background: "var(--surface)",
      boxShadow: isFinal ? "0 0 0 1px rgba(255,107,53,0.2)" : "none",
    }}>
      {/* Status bar */}
      <div style={{
        padding: "3px 8px",
        background: isLive ? "var(--primary)" : "var(--surface-2, var(--elevated, var(--surface)))",
        borderBottom: "1px solid var(--border)",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <span style={{ fontSize: 8, fontWeight: 800, fontFamily: "var(--font-display)", textTransform: "uppercase", letterSpacing: 1, color: isLive ? "#fff" : "var(--muted)" }}>
          {isLive ? "● LIVE" : isDone ? "✓ Done" : "Scheduled"}
        </span>
      </div>

      {/* Players + set scores */}
      <div style={{ padding: "5px 0" }}>
        <div style={rowStyle(p1Won)}>
          <span style={nameStyle(p1Won)}>{m.player_1?.name || "TBD"}</span>
          {(isLive || isDone) && (
            <span style={{ fontSize: 13, fontWeight: 900, fontFamily: "var(--font-display)", color: p1Won ? "var(--primary)" : "var(--ink)", flexShrink: 0 }}>
              {m.player_1?.score ?? 0}
            </span>
          )}
        </div>
        <div style={rowStyle(p2Won)}>
          <span style={nameStyle(p2Won)}>{m.player_2?.name || "TBD"}</span>
          {(isLive || isDone) && (
            <span style={{ fontSize: 13, fontWeight: 900, fontFamily: "var(--font-display)", color: p2Won ? "var(--primary)" : "var(--ink)", flexShrink: 0 }}>
              {m.player_2?.score ?? 0}
            </span>
          )}
        </div>

        {/* Compact set history */}
        {sets.length > 0 && isSetBased && (
          <div style={{ display: "flex", gap: 3, flexWrap: "wrap", padding: "4px 8px 0" }}>
            {sets.map(s => (
              <span key={s.set_number} style={{
                fontSize: 9, padding: "1px 5px", borderRadius: 3,
                fontWeight: 800, fontFamily: "var(--font-display)",
                background: "var(--primary-dim)", color: "var(--primary)",
              }}>
                {s.score_p1}–{s.score_p2}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Action footer — fixtures only offer delete; match actions live on Match Day */}
      {(!fixtureOnly || m.status === "scheduled") && (
      <div style={{ padding: "4px 6px", borderTop: "1px solid var(--border)" }}>
        {/* ── Delete confirmation strip ── */}
        {confirmDelete ? (
          <div style={{ padding: "6px 4px" }}>
            <div style={{ fontSize: 9, color: "var(--ink)", fontWeight: 700, marginBottom: 6, textAlign: "center" }}>
              Delete this match?
            </div>
            <div style={{ display: "flex", gap: 4 }}>
              <button
                className="btn btn-sm btn-outline"
                style={{ flex: 1, fontSize: 9, padding: "4px 0", color: "var(--muted)" }}
                onClick={() => setConfirmDelete(false)}>
                Cancel
              </button>
              <button
                className="btn btn-sm"
                style={{ flex: 1, fontSize: 9, padding: "4px 0", background: "#ef4444", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer" }}
                onClick={() => { setConfirmDelete(false); onAction(m.match_id, "delete"); }}>
                Delete
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Sets picker — own row */}
            {!fixtureOnly && m.status === "scheduled" && isSetBased && (
              <div style={{ display: "flex", alignItems: "center", gap: 2, marginBottom: 4 }}>
                <span style={{ fontSize: 8, color: "var(--muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, marginRight: 2 }}>Sets</span>
                {[1, 2, 3].map(v => (
                  <button key={v}
                    className={`btn btn-sm ${curSets === v ? "btn-danger" : "btn-outline"}`}
                    style={{ fontSize: 9, padding: "1px 6px", minWidth: 22, flex: 1 }}
                    onClick={() => onSetConfig(m.match_id, v)}>
                    {v * 2 - 1}
                  </button>
                ))}
              </div>
            )}
            {/* Primary action — full width */}
            {!fixtureOnly && m.status === "scheduled" && (
              <button className="btn btn-sm btn-danger" style={{ fontSize: 10, padding: "4px 0", width: "100%" }}
                onClick={() => onAction(m.match_id, "start")}>▶ Start</button>
            )}
            {!fixtureOnly && isLive && !endMatchMode && (
              <>
                <button className="btn btn-sm btn-danger" style={{ fontSize: 10, padding: "4px 0", width: "100%", marginBottom: 3 }}
                  onClick={() => onAction(m.match_id, "score")}>Score</button>
                <button className="btn btn-sm btn-outline" style={{ fontSize: 9, padding: "3px 0", width: "100%", color: "var(--muted)" }}
                  onClick={() => setEndMatchMode(true)}>End Match</button>
              </>
            )}
            {!fixtureOnly && isLive && endMatchMode && (
              <div>
                <div style={{ fontSize: 9, fontWeight: 700, color: "var(--ink)", textAlign: "center", marginBottom: 5 }}>Who won?</div>
                <div style={{ display: "flex", gap: 3 }}>
                  <button className="btn btn-sm btn-primary" style={{ flex: 1, fontSize: 9, padding: "4px 0" }}
                    onClick={() => { setEndMatchMode(false); onEndMatch(m.match_id, 1); }}>
                    {m.player_1?.name?.split(" ")[0] || "P1"}
                  </button>
                  <button className="btn btn-sm btn-primary" style={{ flex: 1, fontSize: 9, padding: "4px 0" }}
                    onClick={() => { setEndMatchMode(false); onEndMatch(m.match_id, 2); }}>
                    {m.player_2?.name?.split(" ")[0] || "P2"}
                  </button>
                </div>
                <button className="btn btn-sm btn-outline" style={{ fontSize: 8, padding: "3px 0", width: "100%", marginTop: 3, color: "var(--muted)" }}
                  onClick={() => setEndMatchMode(false)}>Cancel</button>
              </div>
            )}
            {!fixtureOnly && isDone && (
              <button className="btn btn-sm btn-outline" style={{ fontSize: 10, padding: "4px 0", width: "100%" }}
                onClick={() => onAction(m.match_id, "rematch")}>Rematch</button>
            )}
            {/* Delete — fixtures tab only, for matches that haven't started */}
            {fixtureOnly && m.status === "scheduled" && (
              <button
                className="btn btn-sm btn-outline"
                style={{ fontSize: 9, padding: "3px 0", width: "100%", marginTop: 3, color: "var(--muted)" }}
                onClick={() => setConfirmDelete(true)}>
                ✕ Delete
              </button>
            )}
          </>
        )}
      </div>
      )}
    </div>
  );
}

// ── MatchCard ─────────────────────────────────────────────────
function MatchCard({ match: m, onAction, onSetConfig, onEndMatch, sportKey, fixtureOnly = false }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [endMatchMode, setEndMatchMode]   = useState(false);
  const isLive     = m.status === "live";
  const isDone     = m.status === "done";
  const sets       = m.sets || [];
  const ls         = typeof m.live_state === "string" ? JSON.parse(m.live_state) : (m.live_state || {});
  const isSetBased = ["table_tennis", "badminton"].includes(sportKey);
  const curSets    = ls.sets_to_win ?? defaultSetsToWin(m);

  return (
    <div className={`match-row${isLive ? " live" : ""}`} style={{ flexDirection: "column", gap: 10 }}>

      {/* ── Players + score row ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {/* P1 name */}
        <span className={`match-pname${m.player_1?.is_winner ? " winner" : ""}`}
          style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {m.player_1?.name || "TBD"}
        </span>

        {/* Score + status */}
        <div style={{ textAlign: "center", flexShrink: 0 }}>
          <div className={`match-score ${isLive ? "live-score" : isDone ? "done-score" : "vs-score"}`}>
            {isLive || isDone ? `${m.player_1?.score ?? 0}–${m.player_2?.score ?? 0}` : "vs"}
          </div>
          <div style={{ display: "flex", gap: 4, justifyContent: "center", marginTop: 2 }}>
            {isLive && (
              <span className="pill pill-orange" style={{ padding: "1px 5px", fontSize: 8 }}>
                <span className="live-dot" style={{ width: 4, height: 4 }} />LIVE
              </span>
            )}
            {isDone && <span className="pill pill-green" style={{ padding: "1px 5px", fontSize: 8 }}>DONE</span>}
            {m.status === "scheduled" && (
              <span className="pill pill-gray sched-pill-mobile" style={{ padding: "1px 5px", fontSize: 8 }}>SCHEDULED</span>
            )}
          </div>
          {isLive && sportKey === "cricket"  && ls.overs  && <div style={{ fontSize: 9, color: "var(--primary)", fontWeight: 700, marginTop: 2 }}>{ls.overs} ov</div>}
          {isLive && sportKey === "football" && ls.minute && <div style={{ fontSize: 9, color: "var(--primary)", fontWeight: 700, marginTop: 2 }}>{ls.minute}'</div>}
        </div>

        {/* P2 name */}
        <span className={`match-pname right${m.player_2?.is_winner ? " winner" : ""}`}
          style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: "right" }}>
          {m.player_2?.name || "TBD"}
        </span>
      </div>

      {/* ── Set history chips (TT / Badminton) ── */}
      {sets.length > 0 && (isLive || isDone) && isSetBased && (
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {sets.map(s => (
            <span key={s.set_number} style={{
              fontSize: 10, padding: "2px 7px", borderRadius: 3,
              fontWeight: 800, fontFamily: "var(--font-display)",
              background: s.is_complete ? "var(--primary-dim)" : "var(--gold-dim)",
              color:      s.is_complete ? "var(--primary)"     : "var(--gold-text)",
            }}>
              S{s.set_number}: {s.score_p1}–{s.score_p2}
            </span>
          ))}
        </div>
      )}

      {/* ── Cricket innings ── */}
      {sportKey === "cricket" && sets.length > 0 && (
        <div style={{ display: "flex", gap: 12, fontSize: 12, color: "var(--muted)", flexWrap: "wrap" }}>
          {sets.map(s => (
            <span key={s.set_number}>
              <strong style={{ fontFamily: "var(--font-display)", color: "var(--ink)" }}>Inn {s.set_number}:</strong>{" "}
              {s.score_p1}/{s.score_p2}{s.is_complete ? " ✓" : ""}
            </span>
          ))}
          {sets.length === 2 && sets[0]?.is_complete && !sets[1]?.is_complete && (
            <span style={{ color: "var(--gold-text)", fontWeight: 700 }}>Target: {sets[0].score_p1 + 1}</span>
          )}
        </div>
      )}

      {/* ── Winner label ── */}
      {isDone && (
        <div style={{ fontSize: 11, fontWeight: 700, fontFamily: "var(--font-display)", textTransform: "uppercase", letterSpacing: 0.5, color: "var(--gold-text)" }}>
          {m.player_1?.is_winner ? m.player_1.name : m.player_2?.is_winner ? m.player_2.name : "Draw"}
        </div>
      )}

      {/* ── Footer: meta + actions ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
        {/* Meta */}
        <div style={{ fontSize: 10, color: "var(--muted)", fontWeight: 600, display: "flex", gap: 6 }}>
          {m.stage && <span style={{ textTransform: "capitalize" }}>{STAGE_LABEL[m.stage] || m.stage}</span>}
        </div>

        {/* Actions */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          {confirmDelete ? (
            /* ── Inline delete confirmation ── */
            <div style={{
              display: "flex", alignItems: "center", gap: 6,
              background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)",
              borderRadius: 6, padding: "4px 8px",
            }}>
              <span style={{ fontSize: 10, color: "var(--ink)", fontWeight: 600, whiteSpace: "nowrap" }}>
                Delete this match?
              </span>
              <button
                className="btn btn-sm btn-outline"
                style={{ fontSize: 10, padding: "2px 8px", color: "var(--muted)" }}
                onClick={() => setConfirmDelete(false)}>
                Cancel
              </button>
              <button
                className="btn btn-sm"
                style={{ fontSize: 10, padding: "2px 8px", background: "#ef4444", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", fontWeight: 700 }}
                onClick={() => { setConfirmDelete(false); onAction(m.match_id, "delete"); }}>
                Delete
              </button>
            </div>
          ) : (
            <>
              {/* Sets picker — scheduled set-based matches only */}
              {!fixtureOnly && m.status === "scheduled" && isSetBased && (
                <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
                  <span style={{ fontSize: 10, color: "var(--muted)", fontWeight: 600 }}>Sets:</span>
                  {[1, 2, 3].map(v => (
                    <button key={v}
                      className={`btn btn-sm ${curSets === v ? "btn-danger" : "btn-outline"}`}
                      style={{ fontSize: 10, padding: "3px 8px", minWidth: 28 }}
                      onClick={() => onSetConfig(m.match_id, v)}>
                      {v * 2 - 1}
                    </button>
                  ))}
                </div>
              )}
              {!fixtureOnly && m.status === "scheduled" && (
                <button className="btn btn-sm btn-danger match-primary-action" style={{ padding: "4px 12px" }}
                  onClick={() => onAction(m.match_id, "start")}>▶ Start</button>
              )}
              {!fixtureOnly && isLive && !endMatchMode && (
                <>
                  <button className="btn btn-sm btn-danger match-primary-action" style={{ padding: "4px 12px" }}
                    onClick={() => onAction(m.match_id, "score")}>Score</button>
                  <button className="btn btn-sm btn-outline" style={{ padding: "4px 10px", fontSize: 11, color: "var(--muted)" }}
                    onClick={() => setEndMatchMode(true)}>End Match</button>
                </>
              )}
              {!fixtureOnly && isLive && endMatchMode && (
                <div style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(0,0,0,0.04)", border: "1px solid var(--border)", borderRadius: 6, padding: "5px 8px" }}>
                  <span style={{ fontSize: 11, color: "var(--muted)", fontWeight: 600, whiteSpace: "nowrap" }}>Who won?</span>
                  <button className="btn btn-sm btn-primary" style={{ padding: "3px 10px", fontSize: 11 }}
                    onClick={() => { setEndMatchMode(false); onEndMatch(m.match_id, 1); }}>
                    {m.player_1?.name?.split(" ")[0] || "P1"} ✓
                  </button>
                  <button className="btn btn-sm btn-primary" style={{ padding: "3px 10px", fontSize: 11 }}
                    onClick={() => { setEndMatchMode(false); onEndMatch(m.match_id, 2); }}>
                    {m.player_2?.name?.split(" ")[0] || "P2"} ✓
                  </button>
                  {m.requires_winner === false && ["football", "cricket"].includes(sportKey) && (
                    <button className="btn btn-sm btn-outline" style={{ padding: "3px 10px", fontSize: 11 }}
                      onClick={() => { setEndMatchMode(false); onEndMatch(m.match_id, null); }}>
                      {sportKey === "cricket" ? "Tie" : "Draw"}
                    </button>
                  )}
                  <button className="btn btn-sm btn-outline" style={{ padding: "3px 8px", fontSize: 10, color: "var(--muted)" }}
                    onClick={() => setEndMatchMode(false)}>✕</button>
                </div>
              )}
              {!fixtureOnly && isDone && (
                <button className="btn btn-sm btn-outline match-primary-action" style={{ padding: "4px 12px" }}
                  onClick={() => onAction(m.match_id, "rematch")}>Rematch</button>
              )}
              {fixtureOnly && m.status === "scheduled" && (
                <button className="btn btn-sm btn-outline" style={{ color: "var(--muted)", padding: "4px 8px" }}
                  onClick={() => setConfirmDelete(true)}>✕ Delete</button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}