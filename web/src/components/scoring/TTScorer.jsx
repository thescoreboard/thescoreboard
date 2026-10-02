/**
 * TTScorer — fullscreen Table Tennis live scorer.
 * Grass-green design with swap-sides support.
 *
 * Set flow:
 *   addPoint → if winning score → show pendingSet confirmation overlay
 *              (score is NOT sent to backend yet)
 *   Organiser confirms → confirmSet → onScore → backend advances to next set or ends match
 *   "Cancel" on overlay → dismiss without scoring the point
 *
 * Swap logic:
 *   baseSwap   — manual toggle before any point is scored
 *   autoSwap   — true when completedSets is odd (auto-switch after every set)
 *   isSwapped  — baseSwap XOR autoSwap  (actual display flip)
 *   canSwap    — no points scored yet and match not done
 */
import { useState } from "react";
import { useIsMobile } from "../../hooks/useIsMobile";
import { ReadyScreen, MobileTopBar } from "./MobileScorerKit";

export default function TTScorer({ match, config, onScore, onUndoSet, onWalkover, onGoLive, onPause, onReset, onClose }) {
  const isMobile = useIsMobile();
  const p1   = match.player_1;
  const p2   = match.player_2;
  const sets = (match.sets || []).slice().sort((a, b) => a.set_number - b.set_number);
  const currentSet = sets.find(s => !s.is_complete) || sets[sets.length - 1];
  const isDone     = match.status === "done";
  const isPreLive  = match.status === "scheduled";

  const setsToWin = match.live_state?.sets_to_win ?? config?.sets_to_win ?? 2;
  const totalSets = setsToWin * 2 - 1;

  const s1 = currentSet?.score_p1 ?? 0;
  const s2 = currentSet?.score_p2 ?? 0;

  const [firstServer,    setFirstServer]    = useState(match.current_server || 1);
  const [pendingSet,     setPendingSet]     = useState(null);
  const [walkoverPending, setWalkoverPending] = useState(false);
  const [baseSwap,       setBaseSwap]       = useState(false);
  const [confirmPause,   setConfirmPause]   = useState(false);
  const [confirmReset,   setConfirmReset]   = useState(false);
  const [lastScored,     setLastScored]     = useState(null); // mobile "Undo Last Point" target

  const pts      = config?.points_per_set  || 11;
  const margin   = config?.win_margin      || 2;
  const deuce_at = config?.deuce_starts_at ?? (pts - 1);

  // ── Swap logic ───────────────────────────────────────────────
  const completedSets    = sets.filter(s => s.is_complete).length;
  const autoSwap         = completedSets % 2 !== 0;
  const isSwapped        = baseSwap !== autoSwap;  // XOR

  const completedPts = sets.filter(s => s.is_complete).reduce((a, s) => a + s.score_p1 + s.score_p2, 0);
  const canSwap      = s1 === 0 && s2 === 0 && completedPts === 0 && !isDone;

  // Display-side to position mapping
  const leftPos  = isSwapped ? 2 : 1;
  const rightPos = isSwapped ? 1 : 2;
  const leftName  = isSwapped ? (p2?.name || "Player 2") : (p1?.name || "Player 1");
  const rightName = isSwapped ? (p1?.name || "Player 1") : (p2?.name || "Player 2");
  const leftScore  = isSwapped ? s2 : s1;
  const rightScore = isSwapped ? s1 : s2;

  // ── Serve calculation ────────────────────────────────────────
  const isDeuce = s1 >= deuce_at && s2 >= deuce_at;

  const serving = isDone ? null : (() => {
    const other = firstServer === 1 ? 2 : 1;
    if (isDeuce) {
      const deuceTotal = (s1 + s2) - (deuce_at * 2);
      return deuceTotal % 2 === 0 ? firstServer : other;
    }
    const interval = config?.serve_interval || 2;
    const flips = Math.floor((s1 + s2) / interval);
    return flips % 2 === 0 ? firstServer : other;
  })();

  // ── Set/match winner detection ────────────────────────────────
  const setsWon1 = sets.filter(s => s.is_complete && s.winner === 1).length;
  const setsWon2 = sets.filter(s => s.is_complete && s.winner === 2).length;

  const leftSetsWon  = isSwapped ? setsWon2 : setsWon1;
  const rightSetsWon = isSwapped ? setsWon1 : setsWon2;

  const matchWinner = isDone
    ? (p1?.is_winner ? 1 : p2?.is_winner ? 2 : null)
    : null;

  const setWinner = (() => {
    const d = s1 >= deuce_at && s2 >= deuce_at;
    if (d) {
      if (s1 - s2 >= margin) return 1;
      if (s2 - s1 >= margin) return 2;
    } else {
      if (s1 >= pts) return 1;
      if (s2 >= pts) return 2;
    }
    const iw = config?.instant_win;
    if (iw?.enabled) {
      if (s1 === iw.score && s2 === iw.opponent_score) return 1;
      if (s2 === iw.score && s1 === iw.opponent_score) return 2;
    }
    return null;
  })();

  const tappable = !isDone && !isPreLive && !setWinner && !pendingSet;

  const checkSetWin = (ns1, ns2) => {
    const d = ns1 >= deuce_at && ns2 >= deuce_at;
    if (d) {
      if (ns1 - ns2 >= margin) return 1;
      if (ns2 - ns1 >= margin) return 2;
    } else {
      if (ns1 >= pts) return 1;
      if (ns2 >= pts) return 2;
    }
    const iw = config?.instant_win;
    if (iw?.enabled) {
      if (ns1 === iw.score && ns2 === iw.opponent_score) return 1;
      if (ns2 === iw.score && ns1 === iw.opponent_score) return 2;
    }
    return null;
  };

  // ── Point buttons ─────────────────────────────────────────────
  const addPoint = (pos) => {
    if (isDone || setWinner || pendingSet) return;
    setLastScored(pos);
    const ns1 = pos === 1 ? s1 + 1 : s1;
    const ns2 = pos === 2 ? s2 + 1 : s2;
    const winner = checkSetWin(ns1, ns2);
    if (winner) {
      const projSW1 = setsWon1 + (winner === 1 ? 1 : 0);
      const projSW2 = setsWon2 + (winner === 2 ? 1 : 0);
      setPendingSet({
        ns1, ns2, winner,
        setNumber:    currentSet?.set_number || 1,
        projSetsWon1: projSW1,
        projSetsWon2: projSW2,
        willEndMatch: projSW1 >= setsToWin || projSW2 >= setsToWin,
      });
    } else {
      onScore(ns1, ns2, serving);
    }
  };

  const confirmSet = () => {
    if (!pendingSet) return;
    onScore(pendingSet.ns1, pendingSet.ns2, serving);
    setPendingSet(null);
  };

  const undoPoint = (pos) => {
    if (pos === 1 && s1 === 0) return;
    if (pos === 2 && s2 === 0) return;
    onScore(pos === 1 ? s1 - 1 : s1, pos === 2 ? s2 - 1 : s2, serving);
  };

  // ── Colors ────────────────────────────────────────────────────
  const c = {
    bg:      "#080b08",
    surface: "#111711",
    surface2:"#182018",
    border:  "#1f2b1f",
    green:   "#22c55e",
    greenDim:"#16a34a",
    greenGlow:"#22c55e33",
    gold:    "#facc15",
    red:     "#ef4444",
    muted:   "#5a6e5a",
    mutedHi: "#8aaa8a",
    ink:     "#f0fdf0",
  };

  const scoreColor = (pos) => {
    if (matchWinner === pos) return c.gold;
    if (setWinner   === pos) return c.green;
    return c.ink;
  };

  // Map display-side "left serving" to position check
  const leftServing  = serving === leftPos;
  const rightServing = serving === rightPos;

  // Set-dot helper
  const SetDots = ({ won, total }) => (
    <div style={{ display:"flex", gap:4, justifyContent:"center", marginTop:6 }}>
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} style={{
          width:8, height:8, borderRadius:"50%",
          background: i < won ? c.green : c.border,
          boxShadow:  i < won ? `0 0 6px ${c.green}88` : "none",
          transition: "all .3s",
        }} />
      ))}
    </div>
  );

  // Shared overlays (walkover picker + set-confirmation) reused by both the
  // mobile and desktop layouts so the confirmation flows stay identical.
  const walkoverOverlay = walkoverPending && (
    <div style={{
      position:"absolute", inset:0, zIndex:10,
      background:"rgba(0,0,0,0.95)",
      display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
      gap:24, padding:32,
    }}>
      <div style={{
        fontSize:10, fontWeight:800,
        textTransform:"uppercase", letterSpacing:4, color:"#ef4444",
      }}>
        Walkover / No Show
      </div>
      <div style={{ fontSize:14, color:c.muted, textAlign:"center", fontWeight:600 }}>
        Who wins? (opponent did not show up or forfeited)
      </div>
      <div style={{ display:"flex", gap:16, width:"100%", maxWidth:380 }}>
        {[
          { pos: leftPos,  name: leftName  },
          { pos: rightPos, name: rightName },
        ].map(({ pos, name }) => (
          <button
            key={pos}
            onClick={() => { setWalkoverPending(false); onWalkover && onWalkover(pos); }}
            style={{
              flex:1, padding:"20px 12px", borderRadius:12, cursor:"pointer",
              fontSize:13, fontWeight:800,
              textTransform:"uppercase", letterSpacing:0.5,
              background:"#ef444418", color:"#ef4444",
              border:"2px solid #ef444455",
              transition:"all .15s", fontFamily:"inherit",
            }}
          >
            {name}
            <div style={{ fontSize:10, fontWeight:600, color:c.muted, marginTop:6, textTransform:"none", letterSpacing:0 }}>
              wins by walkover
            </div>
          </button>
        ))}
      </div>
      <div style={{ fontSize:12, color:c.muted, textAlign:"center" }}>
        Sets will be recorded as {setsToWin}–0 ({pts}–0 each set)
      </div>
      <button
        onClick={() => setWalkoverPending(false)}
        style={{
          background:"transparent", color:c.muted,
          border:`1px solid ${c.border}`, borderRadius:6,
          padding:"9px 24px", cursor:"pointer",
          fontSize:11, fontWeight:700, fontFamily:"inherit",
        }}
      >
        ↩ Cancel
      </button>
    </div>
  );

  const setConfirmOverlay = pendingSet && (
    <div style={{
      position:"absolute", inset:0, zIndex:10,
      background:"rgba(0,0,0,0.93)",
      display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
      gap:24, padding:32,
    }}>
      <div style={{
        fontSize:10, fontWeight:800,
        textTransform:"uppercase", letterSpacing:4,
        color: pendingSet.willEndMatch ? c.gold : c.green,
      }}>
        {pendingSet.willEndMatch ? "Match Point" : `Set ${pendingSet.setNumber} Complete`}
      </div>

      <div style={{ textAlign:"center" }}>
        <div style={{
          fontSize:24, fontWeight:900, letterSpacing:-1,
          color: pendingSet.winner === leftPos ? c.green : c.red,
          marginBottom:6,
        }}>
          {pendingSet.winner === leftPos ? leftName : rightName}
        </div>
        <div style={{ fontSize:13, color:c.muted, fontWeight:600 }}>
          {pendingSet.willEndMatch ? "wins the match" : "wins the set"}
        </div>
      </div>

      <div style={{
        background:c.surface2, borderRadius:12,
        padding:"18px 40px", textAlign:"center",
        border:`1px solid ${c.border}`,
      }}>
        <div style={{
          fontSize:36, fontWeight:900,
          color:c.ink, letterSpacing:2, marginBottom:10,
        }}>
          {isSwapped ? pendingSet.ns2 : pendingSet.ns1}
          {" – "}
          {isSwapped ? pendingSet.ns1 : pendingSet.ns2}
        </div>
        <div style={{ fontSize:12, color:c.muted }}>Set {pendingSet.setNumber} score</div>
        <div style={{ borderTop:`1px solid ${c.border}`, marginTop:12, paddingTop:12, fontSize:13 }}>
          <span style={{ color:c.muted }}>Sets: </span>
          <strong style={{ color: pendingSet.winner === leftPos ? c.green : c.ink }}>
            {isSwapped ? pendingSet.projSetsWon2 : pendingSet.projSetsWon1}
          </strong>
          <span style={{ color:c.border, margin:"0 10px" }}>—</span>
          <strong style={{ color: pendingSet.winner === rightPos ? c.green : c.ink }}>
            {isSwapped ? pendingSet.projSetsWon1 : pendingSet.projSetsWon2}
          </strong>
          <span style={{ color:c.muted, marginLeft:8, fontSize:11 }}>of {setsToWin} needed</span>
        </div>
      </div>

      <button
        onClick={confirmSet}
        style={{
          padding:"16px 48px", borderRadius:12, cursor:"pointer",
          fontSize:13, fontWeight:800,
          background: pendingSet.willEndMatch ? c.gold : c.green,
          color: "#000", border:"none",
          textTransform:"uppercase", letterSpacing:1, fontFamily:"inherit",
          boxShadow: pendingSet.willEndMatch
            ? `0 0 32px ${c.gold}44`
            : `0 0 32px ${c.green}44`,
        }}
      >
        {pendingSet.willEndMatch
          ? "Confirm Result →"
          : `Continue to Set ${pendingSet.setNumber + 1} →`}
      </button>

      <button
        onClick={() => setPendingSet(null)}
        style={{
          background:"transparent", color:c.muted,
          border:`1px solid ${c.border}`, borderRadius:6,
          padding:"9px 24px", cursor:"pointer",
          fontSize:11, fontWeight:700, fontFamily:"inherit",
        }}
      >
        ↩ Cancel (don't score this point)
      </button>
    </div>
  );

  // ── MOBILE LAYOUT ──────────────────────────────────────────────
  if (isMobile) {
    if (isPreLive) {
      return (
        <ReadyScreen
          accent={c.green}
          leftName={leftName}
          rightName={rightName}
          onGoLive={onGoLive}
          onClose={onClose}
          gamesLabel={`Sets: ${setsWon1} – ${setsWon2}`}
        />
      );
    }

    const statusLabel = isDone ? "Final" : `Set ${currentSet?.set_number || 1}`;

    return (
      <div style={{
        position:"fixed", inset:0, zIndex:9999, background:"#000",
        display:"flex", flexDirection:"column", overflow:"hidden",
        fontFamily:"'Space Grotesk', system-ui, sans-serif",
      }}>
        <MobileTopBar
          accent={c.green} statusLabel={statusLabel} statusColor={isDone ? c.gold : c.green}
          pulse={!isDone} right={`Sets: ${setsWon1} – ${setsWon2}`} onClose={onClose}
        />

        <div style={{ flex:1, display:"flex", flexDirection:"column", padding:"8px 16px 20px" }}>
          {!isDone && (
            <div style={{ textAlign:"center", padding:"10px 0", fontSize:12, color:c.muted, fontWeight:600 }}>
              Serving: <strong style={{ color:c.green }}>{serving === leftPos ? leftName : rightName}</strong>
            </div>
          )}

          <div style={{ flex:1, display:"flex", alignItems:"center" }}>
            {[
              { pos: leftPos,  name: leftName,  score: leftScore  },
              { pos: rightPos, name: rightName, score: rightScore },
            ].map(({ pos, name, score }, i) => (
              <div key={pos}
                onClick={tappable ? () => addPoint(pos) : undefined}
                style={{
                  flex:1, height:"100%", display:"flex", flexDirection:"column",
                  alignItems:"center", justifyContent:"center", gap:10,
                  cursor: tappable ? "pointer" : "default", userSelect:"none",
                  borderRight: i === 0 ? `1px solid ${c.border}` : "none",
                }}>
                <span style={{ fontSize:11, fontWeight:700, letterSpacing:1.5, textTransform:"uppercase", color: serving === pos && !isDone ? c.green : c.muted }}>
                  {name}
                </span>
                <div style={{
                  width:88, height:88, borderRadius:"50%",
                  border:`2px solid ${scoreColor(pos)}`,
                  display:"flex", alignItems:"center", justifyContent:"center",
                  fontSize:34, fontWeight:900, color: scoreColor(pos),
                }}>
                  {score}
                </div>
                {tappable && (
                  <span style={{ fontSize:9, color:c.muted, textTransform:"uppercase", letterSpacing:1.5 }}>
                    Tap anywhere to score
                  </span>
                )}
              </div>
            ))}
          </div>

          {isDeuce && !setWinner && (
            <div style={{ textAlign:"center", fontSize:12, fontWeight:800, textTransform:"uppercase", letterSpacing:2, color:c.red, marginBottom:10 }}>
              {s1 === s2 ? "Deuce" : `Advantage ${s1 > s2 ? (isSwapped ? rightName : leftName) : (isSwapped ? leftName : rightName)}`}
            </div>
          )}
          {setWinner && !matchWinner && (
            <div style={{ textAlign:"center", fontSize:13, fontWeight:800, textTransform:"uppercase", letterSpacing:2, color:c.green, marginBottom:10 }}>
              Set {currentSet?.set_number} → {setWinner === leftPos ? leftName : rightName}
            </div>
          )}
          {matchWinner && (
            <div style={{ textAlign:"center", fontSize:16, fontWeight:900, textTransform:"uppercase", letterSpacing:2, color:c.gold, marginBottom:10 }}>
              {matchWinner === leftPos ? leftName : rightName} Wins!
            </div>
          )}

          {!confirmReset ? (
            <div style={{ display:"flex", gap:8 }}>
              <button
                onClick={() => lastScored && undoPoint(lastScored)}
                disabled={!lastScored}
                style={{
                  flex:1, padding:"13px 0", background:"transparent",
                  color: lastScored ? c.green : c.muted, border:`1px solid ${c.border}`, borderRadius:8,
                  fontWeight:800, fontSize:11, textTransform:"uppercase", letterSpacing:0.5,
                  fontFamily:"inherit", cursor: lastScored ? "pointer" : "not-allowed",
                  opacity: lastScored ? 1 : .4,
                }}
              >
                ↩ Undo Last Point
              </button>
              <button
                onClick={() => setConfirmReset(true)}
                style={{
                  flex:1, padding:"13px 0", background:"transparent", color:c.muted,
                  border:`1px solid ${c.border}`, borderRadius:8, fontWeight:800, fontSize:11,
                  textTransform:"uppercase", letterSpacing:0.5, fontFamily:"inherit", cursor:"pointer",
                }}
              >
                Reset
              </button>
            </div>
          ) : (
            <div style={{ display:"flex", gap:8 }}>
              <button onClick={() => setConfirmReset(false)} style={{ flex:1, padding:"13px 0", background:"transparent", color:c.muted, border:`1px solid ${c.border}`, borderRadius:8, fontWeight:700, fontSize:12, fontFamily:"inherit", cursor:"pointer" }}>
                Cancel
              </button>
              <button onClick={() => { setConfirmReset(false); onReset(); }} style={{ flex:1, padding:"13px 0", background:`${c.red}22`, color:c.red, border:`1px solid ${c.red}`, borderRadius:8, fontWeight:800, fontSize:12, fontFamily:"inherit", cursor:"pointer" }}>
                Confirm Reset
              </button>
            </div>
          )}

          {!isDone && sets.length > 0 && !pendingSet && !walkoverPending && (
            <div onClick={onUndoSet} style={{ textAlign:"center", padding:"12px 0 0", fontSize:11, color:c.muted, cursor:"pointer" }}>
              ↩ Undo Last Set
            </div>
          )}
          {!isDone && !pendingSet && !walkoverPending && onWalkover && (
            <div onClick={() => setWalkoverPending(true)} style={{ textAlign:"center", padding:"8px 0 0", fontSize:11, color:"#ef4444", cursor:"pointer" }}>
              🚫 Walkover / No Show
            </div>
          )}
        </div>

        {walkoverOverlay}
        {setConfirmOverlay}
      </div>
    );
  }

  return (
    <div style={{
      position:"fixed", inset:0, zIndex:9999,
      background: c.bg,
      display:"flex", flexDirection:"column", overflow:"hidden",
      fontFamily:"'Space Grotesk', system-ui, sans-serif",
    }}>

      {/* ── CSS for pulse animation ── */}
      <style>{`
        @keyframes tt-pulse { 0%,100%{opacity:1} 50%{opacity:.4} }
        @keyframes tt-glow  { 0%,100%{box-shadow:0 0 12px #22c55e44} 50%{box-shadow:0 0 28px #22c55e88} }
        .tt-pulse { animation: tt-pulse 1.5s ease-in-out infinite; }
        .tt-btn-point:hover:not(:disabled) { filter: brightness(1.15); transform: translateY(-1px); }
        .tt-btn-swap:hover:not(:disabled)  { background: #22c55e22 !important; }
      `}</style>

      {/* ── TOP BAR ── */}
      <div style={{
        display:"flex", justifyContent:"space-between", alignItems:"center",
        padding:"10px 16px",
        background: c.surface,
        borderBottom: `2px solid ${c.border}`,
        gap:"8px 12px",
        flexWrap:"wrap",
      }}>
        {/* Left: Status badge + set counter */}
        <div style={{ display:"flex", alignItems:"center", gap:10, flex:"1 1 auto", minWidth:0 }}>
          <span style={{
            display:"inline-flex", alignItems:"center", gap:6,
            background: isDone ? c.gold : isPreLive ? "#f59e0b" : c.green,
            color: "#000",
            fontFamily:"'Space Grotesk', sans-serif",
            fontSize:10, fontWeight:800, letterSpacing:2, textTransform:"uppercase",
            padding:"3px 10px", borderRadius:4, whiteSpace:"nowrap",
          }}>
            <span className="tt-pulse" style={{
              width:7, height:7, borderRadius:"50%",
              background:"#000",
              display: isDone ? "none" : "inline-block",
            }}/>
            {isDone ? "Final" : isPreLive ? "Ready" : `Set ${currentSet?.set_number || 1} of ${totalSets}`}
          </span>
          <span style={{ fontSize:11, color:c.muted, fontWeight:600, whiteSpace:"nowrap" }}>
            <strong style={{ color:c.green }}>{setsWon1}</strong>
            <span style={{ color:c.border, margin:"0 5px" }}>—</span>
            <strong style={{ color:c.green }}>{setsWon2}</strong>
          </span>
        </div>

        {/* Right: Swap + Pause / Reset + Close — all in one wrappable group */}
        <div style={{ display:"flex", gap:6, alignItems:"center", flexWrap:"wrap", justifyContent:"flex-end", flex:"0 0 auto" }}>
          {/* Swap button */}
          <button
            className="tt-btn-swap"
            onClick={() => canSwap && setBaseSwap(b => !b)}
            disabled={!canSwap}
            title={canSwap ? "Swap player sides" : "Cannot swap after match starts"}
            style={{
              display:"flex", alignItems:"center", gap:5,
              padding:"6px 12px", borderRadius:8, cursor: canSwap ? "pointer" : "not-allowed",
              background: "transparent",
              color:  canSwap ? c.green : c.muted,
              border: `1px solid ${canSwap ? c.green + "66" : c.border}`,
              fontSize:12, fontWeight:700, fontFamily:"inherit",
              opacity: canSwap ? 1 : 0.45,
              transition:"all .15s", whiteSpace:"nowrap",
            }}
          >
            ⇌ Swap Sides
          </button>

          {/* Pause / Reset / Close with inline confirmations */}
          {confirmPause ? (
            <>
              <span style={{ fontSize:11, color:c.mutedHi, fontWeight:600, whiteSpace:"nowrap" }}>Pause this match?</span>
              <button onClick={() => setConfirmPause(false)} style={{ background:"transparent", color:c.muted, border:`1px solid ${c.border}`, borderRadius:6, padding:"5px 10px", cursor:"pointer", fontSize:11, fontWeight:700, fontFamily:"inherit" }}>Cancel</button>
              <button onClick={() => { setConfirmPause(false); onPause(); }} style={{ background:"#f59e0b22", color:"#f59e0b", border:"1px solid #f59e0b", borderRadius:6, padding:"5px 12px", cursor:"pointer", fontSize:11, fontWeight:700, fontFamily:"inherit" }}>Pause</button>
            </>
          ) : confirmReset ? (
            <>
              <span style={{ fontSize:11, color:c.mutedHi, fontWeight:600, whiteSpace:"nowrap" }}>Reset all scores?</span>
              <button onClick={() => setConfirmReset(false)} style={{ background:"transparent", color:c.muted, border:`1px solid ${c.border}`, borderRadius:6, padding:"5px 10px", cursor:"pointer", fontSize:11, fontWeight:700, fontFamily:"inherit" }}>Cancel</button>
              <button onClick={() => { setConfirmReset(false); onReset(); }} style={{ background:`${c.red}22`, color:c.red, border:`1px solid ${c.red}`, borderRadius:6, padding:"5px 12px", cursor:"pointer", fontSize:11, fontWeight:700, fontFamily:"inherit" }}>Reset</button>
            </>
          ) : (
            <>
              {!isDone && !isPreLive && onPause && (
                <button onClick={() => setConfirmPause(true)} style={{ background:"transparent", color:c.mutedHi, border:`1px solid ${c.border}`, borderRadius:6, padding:"5px 12px", cursor:"pointer", fontSize:12, fontWeight:700, fontFamily:"inherit" }}>Pause</button>
              )}
              {!isDone && !isPreLive && onReset && (
                <button onClick={() => setConfirmReset(true)} style={{ background:"transparent", color:c.mutedHi, border:`1px solid ${c.border}`, borderRadius:6, padding:"5px 12px", cursor:"pointer", fontSize:12, fontWeight:700, fontFamily:"inherit" }}>Reset</button>
              )}
              <button onClick={onClose} style={{ background:"transparent", color:c.muted, border:`1px solid ${c.border}`, borderRadius:6, padding:"5px 14px", cursor:"pointer", fontSize:12, fontWeight:700, fontFamily:"inherit" }}>✕ Close</button>
            </>
          )}
        </div>
      </div>

      {/* ── AUTO-SWAP INDICATOR ── */}
      {autoSwap && !isDone && (
        <div style={{
          background:`${c.green}12`,
          borderBottom:`1px solid ${c.green}22`,
          textAlign:"center", padding:"5px 0",
          fontSize:11, color:c.greenDim, fontWeight:600, letterSpacing:1,
        }}>
          ⇌ Sides switched for Set {currentSet?.set_number || 1}
        </div>
      )}

      {/* ── MAIN CONTENT ── */}
      <div style={{
        flex:1, display:"flex", flexDirection:"column",
        justifyContent:"center", padding:"12px 16px 16px",
        gap:14, maxWidth:600, margin:"0 auto", width:"100%",
      }}>

        {/* ── SET HISTORY ── */}
        {completedSets > 0 && (
          <div style={{ display:"flex", justifyContent:"center", gap:5, flexWrap:"wrap" }}>
            {sets.filter(s => s.is_complete).map(s => {
              // Show score from left-player perspective
              const lScore = isSwapped ? s.score_p2 : s.score_p1;
              const rScore = isSwapped ? s.score_p1 : s.score_p2;
              const leftWon = isSwapped ? s.winner === 2 : s.winner === 1;
              return (
                <span key={s.set_number} style={{
                  fontSize:10, padding:"3px 9px", borderRadius:4, fontWeight:800,
                  background: leftWon ? `${c.green}18` : `${c.red}18`,
                  color:      leftWon ? c.green : c.red,
                  border: `1px solid ${leftWon ? c.green : c.red}33`,
                  letterSpacing:1,
                }}>
                  S{s.set_number}: {lScore}–{rScore}
                </span>
              );
            })}
          </div>
        )}

        {/* ── SERVE SELECTOR ── */}
        {!isDone && !setWinner && (
          <div style={{ display:"flex", justifyContent:"center", gap:8 }}>
            {[
              { pos: leftPos,  label: leftName },
              { pos: rightPos, label: rightName },
            ].map(({ pos, label }) => (
              <button key={pos} onClick={() => setFirstServer(pos)} style={{
                padding:"6px 16px", borderRadius:8, fontWeight:700, fontSize:11,
                cursor:"pointer", fontFamily:"inherit",
                background: serving === pos ? `${c.green}22` : "transparent",
                color:      serving === pos ? c.green : c.muted,
                border:     serving === pos ? `2px solid ${c.green}` : `2px solid ${c.border}`,
                transition:"all .15s",
              }}>
                {label}
              </button>
            ))}
          </div>
        )}

        {/* ── SCORE DISPLAY ── */}
        <div style={{ display:"flex", alignItems:"stretch", justifyContent:"center", gap:12 }}>

          {/* LEFT PANEL — tap to score (same action as + Point) */}
          <div
            onClick={tappable ? () => addPoint(leftPos) : undefined}
            style={{
              flex:1, textAlign:"center", padding:"16px 8px 12px",
              background: leftServing && !isDone ? `${c.green}0e` : c.surface,
              borderRadius:14,
              border: `1px solid ${leftServing && !isDone ? c.green + "44" : c.border}`,
              boxShadow: leftServing && !isDone ? `0 0 24px ${c.green}18` : "none",
              transition:"all .3s",
              cursor: tappable ? "pointer" : "default", userSelect:"none",
            }}>
            {/* Serving dot */}
            <div style={{ height:10, display:"flex", justifyContent:"center", marginBottom:8 }}>
              {leftServing && !isDone && (
                <div className="tt-pulse" style={{
                  width:8, height:8, borderRadius:"50%", background:c.green,
                  boxShadow:`0 0 8px ${c.green}`,
                }}/>
              )}
            </div>
            <div style={{
              fontSize:11, fontWeight:700, letterSpacing:2, textTransform:"uppercase",
              color: leftServing && !isDone ? c.green : c.mutedHi, marginBottom:6,
            }}>
              {leftName}
            </div>
            <div style={{
              fontSize: window.innerWidth < 400 ? 76 : 96,
              fontWeight:900, lineHeight:1,
              color: scoreColor(leftPos),
              transition:"color .3s",
            }}>
              {leftScore}
            </div>
            <SetDots won={leftSetsWon} total={setsToWin} />
          </div>

          {/* DIVIDER */}
          <div style={{
            display:"flex", alignItems:"center",
            color:c.border, fontSize:24, fontWeight:900, flexShrink:0, padding:"0 4px",
          }}>—</div>

          {/* RIGHT PANEL — tap to score (same action as + Point) */}
          <div
            onClick={tappable ? () => addPoint(rightPos) : undefined}
            style={{
              flex:1, textAlign:"center", padding:"16px 8px 12px",
              background: rightServing && !isDone ? `${c.green}0e` : c.surface,
              borderRadius:14,
              border: `1px solid ${rightServing && !isDone ? c.green + "44" : c.border}`,
              boxShadow: rightServing && !isDone ? `0 0 24px ${c.green}18` : "none",
              transition:"all .3s",
              cursor: tappable ? "pointer" : "default", userSelect:"none",
            }}>
            <div style={{ height:10, display:"flex", justifyContent:"center", marginBottom:8 }}>
              {rightServing && !isDone && (
                <div className="tt-pulse" style={{
                  width:8, height:8, borderRadius:"50%", background:c.green,
                  boxShadow:`0 0 8px ${c.green}`,
                }}/>
              )}
            </div>
            <div style={{
              fontSize:11, fontWeight:700, letterSpacing:2, textTransform:"uppercase",
              color: rightServing && !isDone ? c.green : c.mutedHi, marginBottom:6,
            }}>
              {rightName}
            </div>
            <div style={{
              fontSize: window.innerWidth < 400 ? 76 : 96,
              fontWeight:900, lineHeight:1,
              color: scoreColor(rightPos),
              transition:"color .3s",
            }}>
              {rightScore}
            </div>
            <SetDots won={rightSetsWon} total={setsToWin} />
          </div>

        </div>

        {/* ── STATUS TEXT ── */}
        {isDeuce && !setWinner && (
          <div style={{
            textAlign:"center", fontSize:12, fontWeight:800,
            textTransform:"uppercase", letterSpacing:2, color:c.red,
          }}>
            {s1 === s2 ? "Deuce" : `Advantage ${s1 > s2 ? (isSwapped ? rightName : leftName) : (isSwapped ? leftName : rightName)}`}
          </div>
        )}
        {setWinner && !matchWinner && (
          <div style={{
            textAlign:"center", fontSize:13, fontWeight:800,
            textTransform:"uppercase", letterSpacing:2, color:c.green,
          }}>
            Set {currentSet?.set_number} → {setWinner === leftPos ? leftName : rightName}
          </div>
        )}
        {matchWinner && (
          <div style={{
            textAlign:"center", fontSize:16, fontWeight:900,
            textTransform:"uppercase", letterSpacing:2, color:c.gold,
          }}>
            {matchWinner === leftPos ? leftName : rightName} Wins!
          </div>
        )}

        {/* ── WALKOVER BADGE ── */}
        {isDone && match.live_state?.walkover && (
          <div style={{
            textAlign:"center", padding:"6px 0",
            fontSize:11, fontWeight:800,
            textTransform:"uppercase", letterSpacing:2, color:"#ef4444",
          }}>
            Walkover / No Show
          </div>
        )}

        {/* ── PRE-LIVE: GO LIVE ── */}
        {isPreLive && (
          <div style={{ textAlign:"center", padding:"8px 0 16px" }}>
            <div style={{ fontSize:12, color:c.muted, marginBottom:18, lineHeight:1.5 }}>
              Select who serves first, then start the match.
            </div>
            <button
              onClick={onGoLive}
              style={{
                width:"100%", padding:"20px 0", borderRadius:12,
                fontSize:15, fontWeight:900, letterSpacing:1, textTransform:"uppercase",
                background:c.green, color:"#000", border:"none",
                cursor:"pointer", fontFamily:"inherit",
                boxShadow:`0 0 32px ${c.green}44`,
              }}
            >
              ▶ GO LIVE
            </button>
          </div>
        )}

        {/* ── POINT BUTTONS (live only) ── */}
        {!isDone && !isPreLive && (
          <div style={{ display:"flex", gap:10 }}>
            {[
              { pos: leftPos,  score: leftScore  },
              { pos: rightPos, score: rightScore },
            ].map(({ pos, score }) => {
              const isServing = serving === pos;
              const disabled  = !!(setWinner || pendingSet);
              return (
                <div key={pos} style={{ flex:1, display:"flex", flexDirection:"column", gap:6 }}>
                  <button
                    className="tt-btn-point"
                    onClick={() => addPoint(pos)}
                    disabled={disabled}
                    style={{
                      width:"100%", padding:"18px 0", borderRadius:12,
                      fontSize:14, fontWeight:900,
                      background: disabled ? c.surface2 : isServing ? c.green : c.greenDim,
                      color: disabled ? c.muted : "#000",
                      border: isServing && !disabled ? `3px solid ${c.green}` : "3px solid transparent",
                      cursor: disabled ? "not-allowed" : "pointer",
                      opacity: disabled ? .4 : 1,
                      transition:"all .15s",
                      boxShadow: isServing && !disabled ? `0 0 20px ${c.green}44` : "none",
                    }}
                  >
                    + Point
                  </button>
                  <button
                    onClick={() => undoPoint(pos)}
                    disabled={score === 0 || !!pendingSet}
                    style={{
                      width:"100%", padding:"8px 0",
                      background:"transparent",
                      color:c.muted, border:`1px solid ${c.border}`, borderRadius:8,
                      fontSize:11, fontWeight:700, fontFamily:"inherit",
                      cursor: score===0||pendingSet ? "not-allowed" : "pointer",
                      opacity: score===0||pendingSet ? .35 : 1,
                    }}
                  >↩ Undo</button>
                </div>
              );
            })}
          </div>
        )}

        {/* ── UNDO SET (live only) ── */}
        {!isDone && !isPreLive && sets.length > 0 && !pendingSet && !walkoverPending && (
          <button onClick={onUndoSet} style={{
            width:"100%", padding:"10px 0", background:"transparent",
            color:c.muted, border:`1px solid ${c.border}`, borderRadius:8,
            fontSize:12, fontWeight:700, fontFamily:"inherit", cursor:"pointer",
          }}>
            ↩ Undo Last Set
          </button>
        )}

        {/* ── WALKOVER / NO SHOW (live only) ── */}
        {!isDone && !isPreLive && !pendingSet && !walkoverPending && (
          <button
            onClick={() => setWalkoverPending(true)}
            style={{
              width:"100%", padding:"10px 0", background:"transparent",
              color:"#ef4444", border:"1px solid #ef444430", borderRadius:8,
              fontSize:12, fontWeight:700, fontFamily:"inherit", cursor:"pointer",
            }}
          >
            🚫 Walkover / No Show
          </button>
        )}
      </div>

      {walkoverOverlay}
      {setConfirmOverlay}
    </div>
  );
}
