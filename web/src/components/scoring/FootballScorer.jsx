/**
 * FootballScorer — fullscreen Football match scorer.
 * Stadium Lights design.
 *
 * No half selector — just goals and a single "Full Time" button.
 * Phase flow: Normal → (knockout draw only) Extra Time → Penalties.
 * A knockout match can never end level: after a drawn Full Time, 5-a-side
 * goes straight to a penalty shootout; other formats play extra time first
 * and go to penalties if still level.
 * Penalty phase: hit/miss per kick, 5 standard slots, undo support.
 */
import { useState } from "react";
import { useIsMobile } from "../../hooks/useIsMobile";
import { ReadyScreen } from "./MobileScorerKit";

// Penalty slot visual
function PenSlot({ result, isCurrent }) {
  const scored  = result === "H";
  const missed  = result === "M";
  const taken   = scored || missed;

  return (
    <div style={{
      width: 34, height: 34, borderRadius: "50%",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: 15, fontWeight: 900,
      background: scored ? "#16a34a" : missed ? "#dc2626" : "transparent",
      border: isCurrent
        ? "2.5px solid #FFCC00"
        : taken ? "none"
        : "2px solid #3a3a3a",
      color: "#fff",
      boxShadow: isCurrent ? "0 0 8px #FFCC0066" : scored ? "0 0 6px #16a34a55" : "none",
      transition: "all .2s",
      flexShrink: 0,
    }}>
      {scored ? "✓" : missed ? "✗" : isCurrent ? "→" : ""}
    </div>
  );
}

const PHASE_HALF = { normal: 1, extra_time: 3, penalties: 5 };

export default function FootballScorer({ match, config, onScore, onFinish, onWalkover, onGoLive, onPause, onReset, onClose }) {
  const isMobile = useIsMobile();
  const p1 = match.player_1 || {};
  const p2 = match.player_2 || {};
  const sets = match.sets || [];
  const currentSet = sets.find(s => !s.is_complete) || sets[0];
  const isDone    = match.status === "done";
  const isPreLive = match.status === "scheduled";
  const ls     = match.live_state || {};

  const isKnockout = match.requires_winner ?? !!(match.stage && !["group", "round_robin"].includes(match.stage));
  const isFiveASide = Number(config?.team_size) === 5;

  // live_state.half is kept as a phase marker for the public views:
  // 1 = normal time, 3 = extra time, 5 = penalties.
  const getInitPhase = () => {
    const h = ls.half || 1;
    if (h >= 5) return "penalties";
    if (h >= 3) return "extra_time";
    return "normal";
  };

  const [goals1,       setGoals1]       = useState(currentSet?.score_p1 ?? (p1?.score ?? 0));
  const [goals2,       setGoals2]       = useState(currentSet?.score_p2 ?? (p2?.score ?? 0));
  const [phase,        setPhase]        = useState(getInitPhase);
  // Penalty histories: arrays of "H" (hit) or "M" (miss)
  const [penH1,        setPenH1]        = useState(ls.pen_h1 || []);
  const [penH2,        setPenH2]        = useState(ls.pen_h2 || []);
  const [showWalkover, setShowWalkover] = useState(false);
  const [confirmPause, setConfirmPause] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  const isLeading = goals1 > goals2 ? 1 : goals2 > goals1 ? 2 : 0;
  const isDraw    = goals1 === goals2;

  const c = {
    bg:"#0d0d0d", surface:"#1a1a1a", border:"#2a2a2a",
    orange:"#FF6B35", gold:"#FFCC00", green:"#22c55e",
    blue:"#3b82f6", red:"#ef4444", muted:"#666", ink:"#fff",
  };

  // ── Goal handling ──────────────────────────────────────────
  const addGoal = (pos) => {
    const g1 = pos === 1 ? goals1 + 1 : goals1;
    const g2 = pos === 2 ? goals2 + 1 : goals2;
    if (pos === 1) setGoals1(g1); else setGoals2(g2);
    onScore(g1, g2, { football_half: PHASE_HALF[phase] });
  };
  const removeGoal = (pos) => {
    const g1 = pos === 1 ? Math.max(0, goals1 - 1) : goals1;
    const g2 = pos === 2 ? Math.max(0, goals2 - 1) : goals2;
    if (pos === 1) setGoals1(g1); else setGoals2(g2);
    onScore(g1, g2, { football_half: PHASE_HALF[phase] });
  };
  const enterPhase = (nextPhase) => {
    setPhase(nextPhase);
    onScore(goals1, goals2, { football_half: PHASE_HALF[nextPhase] });
  };

  // ── Penalty helpers ────────────────────────────────────────
  const penGoals1 = penH1.filter(r => r === "H").length;
  const penGoals2 = penH2.filter(r => r === "H").length;

  // T1 always shoots first: if penH1.length > penH2.length → T2's turn, else T1's turn
  const nextPenTeam   = penH1.length > penH2.length ? 2 : 1;
  const nextPenNum    = nextPenTeam === 1 ? penH1.length + 1 : penH2.length + 1;
  const slotsToShow   = Math.max(5, penH1.length + (nextPenTeam === 1 ? 1 : 0), penH2.length + (nextPenTeam === 2 ? 1 : 0));

  const savePenalties = (nh1, nh2) => {
    const pg1 = nh1.filter(r => r === "H").length;
    const pg2 = nh2.filter(r => r === "H").length;
    onScore(goals1, goals2, {
      football_half:   5,
      football_pen_1:  pg1,
      football_pen_2:  pg2,
      football_live_state: { pen_h1: nh1, pen_h2: nh2 },
    });
  };

  const recordPen = (result) => {
    const nh1 = nextPenTeam === 1 ? [...penH1, result] : penH1;
    const nh2 = nextPenTeam === 2 ? [...penH2, result] : penH2;
    setPenH1(nh1);
    setPenH2(nh2);
    savePenalties(nh1, nh2);
  };

  const undoPen = () => {
    if (penH1.length > penH2.length) {
      const nh1 = penH1.slice(0, -1);
      setPenH1(nh1);
      savePenalties(nh1, penH2);
    } else if (penH2.length > 0) {
      const nh2 = penH2.slice(0, -1);
      setPenH2(nh2);
      savePenalties(penH1, nh2);
    }
  };

  // Can declare winner: both teams shot equal rounds AND scores differ
  const canDeclare = penH1.length === penH2.length && penH1.length > 0 && penGoals1 !== penGoals2;

  // ── Phase transitions ──────────────────────────────────────
  // A knockout match can't end level: level after normal time → penalties
  // (5-a-side) or extra time (other formats); level after extra time → penalties.
  const handleFullTime = () => {
    if (phase === "normal" && isKnockout && isDraw) {
      enterPhase(isFiveASide ? "penalties" : "extra_time");
    } else if (phase === "extra_time" && isKnockout && isDraw) {
      enterPhase("penalties");
    } else {
      onFinish(goals1 > goals2 ? 1 : goals2 > goals1 ? 2 : null);
    }
  };

  const handleDeclareWinner = () => {
    if (!canDeclare) return;
    const winner = penGoals1 > penGoals2 ? 1 : 2;
    onScore(goals1, goals2, {
      football_half: 5,
      football_pen_1: penGoals1,
      football_pen_2: penGoals2,
      football_live_state: { pen_h1: penH1, pen_h2: penH2 },
    });
    onFinish(winner);
  };

  const phaseLabel = phase === "penalties"
    ? "Penalty Shootout"
    : phase === "extra_time"
    ? "Extra Time"
    : "Live";

  const ftLabel = (() => {
    if (phase === "normal" && isKnockout && isDraw) return isFiveASide ? "Full Time → Penalties" : "Full Time → Extra Time";
    if (phase === "extra_time" && isKnockout && isDraw) return "End ET → Penalties";
    if (phase === "extra_time") return "⏱ End Extra Time";
    return "⏱ Full Time";
  })();

  const ftColor = (phase !== "penalties" && isKnockout && isDraw) ? c.blue : c.green;

  const GoalButton = ({ pos }) => {
    const score  = pos === 1 ? goals1 : goals2;
    const name   = pos === 1 ? (p1?.name||"Team 1") : (p2?.name||"Team 2");
    const winner = isDone && (pos === 1 ? p1.is_winner : p2.is_winner);
    const leading = isLeading === pos;

    return (
      <div style={{ flex:1, textAlign:"center" }}>
        <div style={{ fontSize:12, fontWeight:700, letterSpacing:1.5, textTransform:"uppercase", color: !isDone && leading ? c.gold : c.muted, marginBottom:10 }}>
          {name}
          {leading && !isDone && <span style={{ color:c.gold }}> ★</span>}
        </div>
        <div style={{ fontFamily:"'Unbounded',sans-serif", fontSize:80, fontWeight:900, lineHeight:1, color: winner ? c.gold : leading&&!isDone ? c.orange : c.ink, marginBottom:12, transition:"color .3s" }}>
          {score}
        </div>
        {!isDone && !isPreLive && phase !== "penalties" && (
          <div style={{ display:"flex", gap:8, justifyContent:"center" }}>
            <button onClick={() => removeGoal(pos)}
              style={{ width:48, height:48, borderRadius:10, background:"transparent", border:`2px solid ${c.border}`, color:c.muted, fontSize:22, cursor:"pointer", fontFamily:"'Unbounded',sans-serif", fontWeight:900 }}>
              −
            </button>
            <button onClick={() => addGoal(pos)}
              style={{ width:64, height:64, borderRadius:12, background:c.orange, border:`3px solid ${c.gold}`, color:c.bg, fontSize:28, cursor:"pointer", fontFamily:"'Unbounded',sans-serif", fontWeight:900, boxShadow:`0 0 24px ${c.orange}55`, transition:"all .15s" }}
              onMouseOver={e => e.currentTarget.style.transform="scale(1.08)"}
              onMouseOut={e  => e.currentTarget.style.transform="scale(1)"}>
              +
            </button>
          </div>
        )}
      </div>
    );
  };

  // ── MOBILE: Ready screen only — the live scoreboard below (penalty
  // shootout grid, walkover/pause/reset) is already dark-themed and
  // keeps its desktop layout on mobile since it has no mockup to follow. ──
  if (isMobile && isPreLive) {
    return (
      <ReadyScreen
        accent={c.green}
        leftName={p1?.name || "Team 1"}
        rightName={p2?.name || "Team 2"}
        onGoLive={onGoLive}
        onClose={onClose}
      />
    );
  }

  return (
    <div style={{ position:"fixed", inset:0, zIndex:9999, background:c.bg, display:"flex", flexDirection:"column", overflow:"hidden", fontFamily:"'Space Grotesk',sans-serif" }}>

      {/* TOP BAR */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 16px", background:c.surface, borderBottom:`2px solid ${isPreLive ? "#f59e0b" : phase==="penalties"?c.blue:phase==="extra_time"?c.blue:c.green}`, gap:"8px 12px", flexWrap:"wrap" }}>
        <span style={{ display:"inline-flex", alignItems:"center", gap:6, background: isPreLive ? "#f59e0b" : phase==="penalties"?c.blue:phase==="extra_time"?c.blue:c.green, color:c.bg, fontFamily:"'Unbounded',sans-serif", fontSize:10, fontWeight:800, letterSpacing:2, textTransform:"uppercase", padding:"3px 10px", borderRadius:4, whiteSpace:"nowrap", flex:"1 1 auto" }}>
          <span style={{ width:7, height:7, borderRadius:"50%", background:c.bg, animation:"pulse 1.5s infinite", display:"inline-block" }} />
          {isDone ? "Full Time" : isPreLive ? "Ready" : phaseLabel}
        </span>
        <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap", justifyContent:"flex-end", flex:"0 0 auto" }}>
          {confirmPause ? (
            <>
              <span style={{ fontSize:11, color:c.muted, fontWeight:600, whiteSpace:"nowrap" }}>Pause this match?</span>
              <button onClick={() => setConfirmPause(false)} style={{ background:"transparent", color:c.muted, border:`1px solid ${c.border}`, borderRadius:6, padding:"5px 10px", cursor:"pointer", fontSize:11, fontWeight:700, fontFamily:"inherit" }}>Cancel</button>
              <button onClick={() => { setConfirmPause(false); onPause(); }} style={{ background:"#f59e0b22", color:"#f59e0b", border:"1px solid #f59e0b", borderRadius:6, padding:"5px 12px", cursor:"pointer", fontSize:11, fontWeight:700, fontFamily:"inherit" }}>Pause</button>
            </>
          ) : confirmReset ? (
            <>
              <span style={{ fontSize:11, color:c.muted, fontWeight:600, whiteSpace:"nowrap" }}>Reset all scores?</span>
              <button onClick={() => setConfirmReset(false)} style={{ background:"transparent", color:c.muted, border:`1px solid ${c.border}`, borderRadius:6, padding:"5px 10px", cursor:"pointer", fontSize:11, fontWeight:700, fontFamily:"inherit" }}>Cancel</button>
              <button onClick={() => { setConfirmReset(false); onReset(); }} style={{ background:"#ef444422", color:"#ef4444", border:"1px solid #ef4444", borderRadius:6, padding:"5px 12px", cursor:"pointer", fontSize:11, fontWeight:700, fontFamily:"inherit" }}>Reset</button>
            </>
          ) : (
            <>
              {!isDone && !isPreLive && onWalkover && (
                <button onClick={() => setShowWalkover(true)} style={{ background:"transparent", color:c.muted, border:`1px solid ${c.border}`, borderRadius:6, padding:"5px 12px", cursor:"pointer", fontSize:12, fontWeight:700, fontFamily:"inherit" }}>Walkover</button>
              )}
              {!isDone && !isPreLive && onPause && (
                <button onClick={() => setConfirmPause(true)} style={{ background:"transparent", color:c.muted, border:`1px solid ${c.border}`, borderRadius:6, padding:"5px 12px", cursor:"pointer", fontSize:12, fontWeight:700, fontFamily:"inherit" }}>Pause</button>
              )}
              {!isDone && !isPreLive && onReset && (
                <button onClick={() => setConfirmReset(true)} style={{ background:"transparent", color:c.muted, border:`1px solid ${c.border}`, borderRadius:6, padding:"5px 12px", cursor:"pointer", fontSize:12, fontWeight:700, fontFamily:"inherit" }}>Reset</button>
              )}
              <button onClick={onClose} style={{ background:"transparent", color:c.muted, border:`1px solid ${c.border}`, borderRadius:6, padding:"5px 14px", cursor:"pointer", fontSize:12, fontWeight:700, fontFamily:"inherit" }}>✕ Close</button>
            </>
          )}
        </div>
      </div>

      <div style={{ flex:1, overflowY:"auto", display:"flex", flexDirection:"column", justifyContent:"center", padding:"16px 20px 24px", gap:20, maxWidth:600, margin:"0 auto", width:"100%" }}>

        {/* ── PRE-LIVE: GO LIVE ── */}
        {isPreLive && (
          <div style={{ textAlign:"center", padding:"24px 0" }}>
            <div style={{ fontSize:12, color:c.muted, marginBottom:20, lineHeight:1.5 }}>
              Match is ready. Press Go Live to begin.
            </div>
            <button
              onClick={onGoLive}
              style={{
                width:"100%", padding:"20px 0", borderRadius:12,
                fontFamily:"'Unbounded',sans-serif", fontSize:15, fontWeight:900,
                letterSpacing:1, textTransform:"uppercase",
                background:c.green, color:c.bg, border:"none",
                cursor:"pointer", boxShadow:`0 0 32px ${c.green}44`,
              }}
            >
              ▶ GO LIVE
            </button>
          </div>
        )}

        {/* SCORE ROW */}
        <div style={{ display:"flex", alignItems:"center", gap:20 }}>
          <GoalButton pos={1} />
          <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:8, flexShrink:0 }}>
            <div style={{ color:c.border, fontFamily:"'Unbounded',sans-serif", fontSize:24, fontWeight:900 }}>vs</div>
            {!isDone && isLeading === 0 && phase !== "penalties" && (
              <div style={{ fontFamily:"'Unbounded',sans-serif", fontSize:10, fontWeight:800, textTransform:"uppercase", letterSpacing:1.5, color:c.muted }}>Draw</div>
            )}
          </div>
          <GoalButton pos={2} />
        </div>

        {/* PENALTIES UI */}
        {!isDone && !isPreLive && phase === "penalties" && (
          <div style={{ background:c.surface, borderRadius:14, border:`2px solid ${c.blue}33`, padding:"20px 16px" }}>
            {/* Penalty slot grids */}
            <div style={{ display:"grid", gridTemplateColumns:"1fr auto 1fr", gap:12, alignItems:"start", marginBottom:20 }}>
              {/* Team 1 */}
              <div style={{ textAlign:"center" }}>
                <div style={{ fontSize:11, fontWeight:700, textTransform:"uppercase", letterSpacing:1, color:c.muted, marginBottom:10 }}>{p1?.name||"Team 1"}</div>
                <div style={{ fontFamily:"'Unbounded',sans-serif", fontSize:36, fontWeight:900, color: penGoals1 > penGoals2 ? c.gold : c.ink, lineHeight:1, marginBottom:10 }}>{penGoals1}</div>
                <div style={{ display:"flex", gap:5, justifyContent:"center", flexWrap:"wrap" }}>
                  {Array.from({ length: slotsToShow }, (_, i) => (
                    <PenSlot key={i} result={penH1[i]} isCurrent={nextPenTeam === 1 && i === penH1.length} />
                  ))}
                </div>
              </div>

              {/* Separator */}
              <div style={{ textAlign:"center", paddingTop:40, fontFamily:"'Unbounded',sans-serif", fontSize:20, fontWeight:900, color:c.border }}>–</div>

              {/* Team 2 */}
              <div style={{ textAlign:"center" }}>
                <div style={{ fontSize:11, fontWeight:700, textTransform:"uppercase", letterSpacing:1, color:c.muted, marginBottom:10 }}>{p2?.name||"Team 2"}</div>
                <div style={{ fontFamily:"'Unbounded',sans-serif", fontSize:36, fontWeight:900, color: penGoals2 > penGoals1 ? c.gold : c.ink, lineHeight:1, marginBottom:10 }}>{penGoals2}</div>
                <div style={{ display:"flex", gap:5, justifyContent:"center", flexWrap:"wrap" }}>
                  {Array.from({ length: slotsToShow }, (_, i) => (
                    <PenSlot key={i} result={penH2[i]} isCurrent={nextPenTeam === 2 && i === penH2.length} />
                  ))}
                </div>
              </div>
            </div>

            {/* Current shooter label */}
            <div style={{ textAlign:"center", marginBottom:14 }}>
              <span style={{ fontFamily:"'Unbounded',sans-serif", fontSize:11, fontWeight:900, textTransform:"uppercase", letterSpacing:1, color:c.gold }}>
                {nextPenTeam === 1 ? (p1?.name||"Team 1") : (p2?.name||"Team 2")}'s Penalty #{nextPenNum}
              </span>
            </div>

            {/* Hit / Miss buttons */}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:12 }}>
              <button onClick={() => recordPen("H")}
                style={{ padding:"16px 0", borderRadius:10, background:"#16a34a22", border:"2px solid #16a34a", color:"#4ade80", fontFamily:"'Unbounded',sans-serif", fontSize:14, fontWeight:900, textTransform:"uppercase", letterSpacing:1, cursor:"pointer" }}>
                ✓ Goal / Hit
              </button>
              <button onClick={() => recordPen("M")}
                style={{ padding:"16px 0", borderRadius:10, background:`${c.red}18`, border:`2px solid ${c.red}`, color:c.red, fontFamily:"'Unbounded',sans-serif", fontSize:14, fontWeight:900, textTransform:"uppercase", letterSpacing:1, cursor:"pointer" }}>
                ✗ Miss
              </button>
            </div>

            {/* Undo */}
            <button onClick={undoPen} disabled={penH1.length === 0 && penH2.length === 0}
              style={{ width:"100%", padding:"10px 0", borderRadius:8, background:"transparent", border:`1px solid ${c.border}`, color:c.muted, fontFamily:"inherit", fontSize:12, fontWeight:700, cursor: (penH1.length > 0 || penH2.length > 0) ? "pointer" : "not-allowed", opacity: (penH1.length > 0 || penH2.length > 0) ? 1 : 0.4 }}>
              ↩ Undo Last Penalty
            </button>
          </div>
        )}

        {/* DONE STATE */}
        {isDone && (
          <div style={{ textAlign:"center" }}>
            <div style={{ fontFamily:"'Unbounded',sans-serif", fontSize:20, fontWeight:900, textTransform:"uppercase", letterSpacing:-1, color:c.gold }}>
              {p1.is_winner ? `${p1?.name||"Team 1"} Win!` : p2.is_winner ? `${p2?.name||"Team 2"} Win!` : "Draw"}
            </div>
            {/* Show penalty summary if applicable */}
            {(ls.pen_h1?.length > 0 || ls.pen_h2?.length > 0) && (
              <div style={{ fontSize:13, color:c.muted, marginTop:8 }}>
                Penalties: {ls.pen_h1?.filter(r=>r==="H").length ?? 0}–{ls.pen_h2?.filter(r=>r==="H").length ?? 0}
              </div>
            )}
            <div style={{ fontSize:13, color:c.muted, marginTop:4 }}>Full Time</div>
          </div>
        )}

        {/* ACTION BUTTONS (live only) */}
        {!isDone && !isPreLive && (
          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            {phase !== "penalties" ? (
              <button onClick={handleFullTime}
                style={{ width:"100%", padding:"16px 0", background:`${ftColor}22`, border:`2px solid ${ftColor}66`, borderRadius:8, fontFamily:"'Unbounded',sans-serif", fontSize:13, fontWeight:900, textTransform:"uppercase", letterSpacing:1, color:ftColor, cursor:"pointer" }}>
                {ftLabel}
              </button>
            ) : (
              <button onClick={handleDeclareWinner} disabled={!canDeclare}
                style={{ width:"100%", padding:"16px 0", background:`${c.gold}18`, border:`2px solid ${c.gold}${canDeclare ? "" : "44"}`, borderRadius:8, fontFamily:"'Unbounded',sans-serif", fontSize:13, fontWeight:900, textTransform:"uppercase", letterSpacing:1, color:c.gold, cursor: canDeclare ? "pointer" : "not-allowed", opacity: canDeclare ? 1 : 0.5 }}>
                🏆 Declare Penalty Winner
              </button>
            )}
          </div>
        )}
      </div>

      {/* WALKOVER MODAL */}
      {showWalkover && (
        <div style={{ position:"fixed", inset:0, zIndex:10000, background:"rgba(0,0,0,0.85)", display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
          <div style={{ background:c.surface, border:`1px solid ${c.border}`, borderRadius:14, padding:"28px 24px", width:"100%", maxWidth:340 }}>
            <div style={{ fontFamily:"'Unbounded',sans-serif", fontSize:13, fontWeight:900, textTransform:"uppercase", letterSpacing:1, color:c.ink, marginBottom:6 }}>
              Record Walkover / No-show
            </div>
            <div style={{ fontSize:12, color:c.muted, marginBottom:20, lineHeight:1.5 }}>
              The match will be marked complete. The winning team advances.
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:10, marginBottom:16 }}>
              {[{ pos:1, name:p1?.name||"Team 1" }, { pos:2, name:p2?.name||"Team 2" }].map(({ pos, name }) => (
                <button key={pos} onClick={() => { setShowWalkover(false); onWalkover(pos); }}
                  style={{ padding:"14px 20px", borderRadius:10, background:`${c.green}18`, border:`2px solid ${c.green}`, color:c.ink, fontFamily:"'Unbounded',sans-serif", fontSize:12, fontWeight:800, textTransform:"uppercase", letterSpacing:1, cursor:"pointer" }}>
                  {name} wins by walkover
                </button>
              ))}
            </div>
            <button onClick={() => setShowWalkover(false)}
              style={{ width:"100%", padding:"10px 0", background:"transparent", color:c.muted, border:`1px solid ${c.border}`, borderRadius:8, fontSize:12, fontWeight:700, fontFamily:"inherit", cursor:"pointer" }}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
