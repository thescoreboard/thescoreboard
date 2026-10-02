/**
 * BadmintonScorer — fullscreen Badminton live scorer.
 *
 * Rules: Best of 3 games (configurable), first to 21, win by 2, cap at 30.
 * Rally scoring: server changes each point (whoever wins the rally serves next).
 *
 * Props
 * ─────
 *   match       – match data from API (players, sets, status, current_server)
 *   config      – event sport_config (points_per_set, sets_to_win, win_margin, max_points)
 *   onScore     – (score_p1, score_p2, current_server) → void
 *   onUndoSet   – () → void
 *   onWalkover  – (winner_position: 1|2) → void
 *   onClose     – () → void
 */
import { useState } from "react";
import { useIsMobile } from "../../hooks/useIsMobile";
import { ReadyScreen, MobileTopBar } from "./MobileScorerKit";

export default function BadmintonScorer({ match, config, onScore, onUndoSet, onWalkover, onGoLive, onPause, onReset, onClose }) {
  const isMobile = useIsMobile();
  const [showWalkover,  setShowWalkover]  = useState(false);
  const [confirmPause,  setConfirmPause]  = useState(false);
  const [confirmReset,  setConfirmReset]  = useState(false);
  const [lastScored,    setLastScored]    = useState(null); // mobile "Undo Last Point" target

  const p1 = match.player_1 || {};
  const p2 = match.player_2 || {};
  const sets = (match.sets || []).slice().sort((a, b) => a.set_number - b.set_number);
  const currentSet = sets.find(s => !s.is_complete) || sets[sets.length - 1];
  const isDone    = match.status === "done";
  const isPreLive = match.status === "scheduled";

  const s1 = currentSet?.score_p1 ?? 0;
  const s2 = currentSet?.score_p2 ?? 0;

  const pts     = config.points_per_set || 21;
  const margin  = config.win_margin     || 2;
  const maxPts  = config.max_points     || 30;
  const deuceAt = config.deuce_starts_at || pts - 1;
  const isDeuce = s1 >= deuceAt && s2 >= deuceAt;
  const isCap   = s1 >= maxPts - 1 || s2 >= maxPts - 1;

  const setWinner = (() => {
    if (s1 >= maxPts && s1 > s2) return 1;
    if (s2 >= maxPts && s2 > s1) return 2;
    if (s1 >= pts && s1 - s2 >= margin) return 1;
    if (s2 >= pts && s2 - s1 >= margin) return 2;
    return null;
  })();

  const setsWon1    = sets.filter(s => s.is_complete && s.winner_position === 1).length;
  const setsWon2    = sets.filter(s => s.is_complete && s.winner_position === 2).length;
  const matchWinner = isDone ? (p1?.is_winner ? 1 : p2?.is_winner ? 2 : null) : null;

  // In badminton, server = whoever won the last rally; tracked in current_server.
  const serving = isDone ? null : (match.current_server || 1);

  const p1Name = p1?.name || "Player 1";
  const p2Name = p2?.name || "Player 2";

  const addPoint = (player) => {
    if (isDone || setWinner) return;
    setLastScored(player);
    const ns1 = player === 1 ? s1 + 1 : s1;
    const ns2 = player === 2 ? s2 + 1 : s2;
    // Winner of the rally becomes server
    onScore(ns1, ns2, player);
  };

  const undoPoint = (player) => {
    if (player === 1 && s1 === 0) return;
    if (player === 2 && s2 === 0) return;
    onScore(player === 1 ? s1 - 1 : s1, player === 2 ? s2 - 1 : s2, serving);
  };

  const handleWalkover = (pos) => {
    setShowWalkover(false);
    onWalkover(pos);
  };

  const c = {
    bg:      "#0d0d0d",
    surface: "#1a1a1a",
    border:  "#2a2a2a",
    orange:  "#FF6B35",
    gold:    "#FFCC00",
    green:   "#22c55e",
    red:     "#ef4444",
    blue:    "#38bdf8",
    muted:   "#666",
    ink:     "#fff",
  };

  const scoreColor = (pos) => {
    if (matchWinner === pos) return c.gold;
    if (setWinner   === pos) return c.green;
    if (isDeuce)             return c.blue;
    return c.ink;
  };

  // Shared walkover modal, reused by both the mobile and desktop layouts.
  const walkoverModal = showWalkover && (
    <div style={{ position:"fixed", inset:0, zIndex:10000, background:"rgba(0,0,0,0.85)", display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
      <div style={{ background:c.surface, border:`1px solid ${c.border}`, borderRadius:14, padding:"28px 24px", width:"100%", maxWidth:340 }}>
        <div style={{ fontFamily:"'Unbounded',sans-serif", fontSize:13, fontWeight:900, textTransform:"uppercase", letterSpacing:1, color:c.ink, marginBottom:6 }}>
          Record Walkover
        </div>
        <div style={{ fontSize:12, color:c.muted, marginBottom:20, lineHeight:1.5 }}>
          The match will be marked as done. The winner advances in the bracket. Walkover score is recorded automatically.
        </div>
        <div style={{ display:"flex", flexDirection:"column", gap:10, marginBottom:16 }}>
          {[{ pos:1, name:p1Name }, { pos:2, name:p2Name }].map(({ pos, name }) => (
            <button
              key={pos}
              onClick={() => handleWalkover(pos)}
              style={{ padding:"14px 20px", borderRadius:10, background:`${c.blue}18`, border:`2px solid ${c.blue}`, color:c.ink, fontFamily:"'Unbounded',sans-serif", fontSize:12, fontWeight:800, textTransform:"uppercase", letterSpacing:1, cursor:"pointer" }}
            >
              {name} wins by walkover
            </button>
          ))}
        </div>
        <button
          onClick={() => setShowWalkover(false)}
          style={{ width:"100%", padding:"10px 0", background:"transparent", color:c.muted, border:`1px solid ${c.border}`, borderRadius:8, fontSize:12, fontWeight:700, fontFamily:"inherit", cursor:"pointer" }}
        >
          Cancel
        </button>
      </div>
    </div>
  );

  // ── MOBILE LAYOUT ──────────────────────────────────────────────
  if (isMobile) {
    if (isPreLive) {
      return (
        <ReadyScreen
          accent={c.blue}
          leftName={p1Name}
          rightName={p2Name}
          onGoLive={onGoLive}
          onClose={onClose}
          gamesLabel={`Games: ${setsWon1} – ${setsWon2}`}
        />
      );
    }

    const statusLabel = isDone ? "Final" : `Game ${currentSet?.set_number || 1}`;

    return (
      <div style={{
        position:"fixed", inset:0, zIndex:9999, background:"#000",
        display:"flex", flexDirection:"column", overflow:"hidden",
        fontFamily:"'Space Grotesk', system-ui, sans-serif",
      }}>
        <MobileTopBar
          accent={c.blue} statusLabel={statusLabel} statusColor={isDone ? c.gold : c.blue}
          pulse={!isDone} right={`Games: ${setsWon1} – ${setsWon2}`} onClose={onClose}
        />

        <div style={{ flex:1, display:"flex", flexDirection:"column", padding:"8px 16px 20px" }}>
          {!isDone && (
            <div style={{ textAlign:"center", padding:"10px 0", fontSize:12, color:c.muted, fontWeight:600 }}>
              Serving: <strong style={{ color:c.blue }}>{serving === 1 ? p1Name : p2Name}</strong>
            </div>
          )}

          <div style={{ flex:1, display:"flex", alignItems:"center" }}>
            {[
              { pos:1, name:p1Name, score:s1 },
              { pos:2, name:p2Name, score:s2 },
            ].map(({ pos, name, score }, i) => {
              const tappable = !isDone && !setWinner;
              return (
                <div key={pos}
                  onClick={tappable ? () => addPoint(pos) : undefined}
                  style={{
                    flex:1, height:"100%", display:"flex", flexDirection:"column",
                    alignItems:"center", justifyContent:"center", gap:10,
                    cursor: tappable ? "pointer" : "default", userSelect:"none",
                    borderRight: i === 0 ? `1px solid ${c.border}` : "none",
                  }}>
                  <span style={{ fontSize:11, fontWeight:700, letterSpacing:1.5, textTransform:"uppercase", color: serving===pos && !isDone ? c.blue : c.muted }}>
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
              );
            })}
          </div>

          {!isDone && !setWinner && isDeuce && (
            <div style={{ textAlign:"center", fontSize:12, fontWeight:800, textTransform:"uppercase", letterSpacing:2, color:c.blue, marginBottom:10 }}>
              {isCap ? "Game Point — next wins" : "Deuce — win by 2"}
            </div>
          )}
          {setWinner && !matchWinner && (
            <div style={{ textAlign:"center", fontSize:13, fontWeight:800, textTransform:"uppercase", letterSpacing:2, color:c.green, marginBottom:10 }}>
              Game {currentSet?.set_number} → {setWinner === 1 ? p1Name : p2Name}
            </div>
          )}
          {matchWinner && (
            <div style={{ textAlign:"center", fontSize:16, fontWeight:900, textTransform:"uppercase", letterSpacing:2, color:c.gold, marginBottom:10 }}>
              {matchWinner === 1 ? p1Name : p2Name} Wins!
            </div>
          )}

          {!confirmReset ? (
            <div style={{ display:"flex", gap:8 }}>
              <button
                onClick={() => lastScored && undoPoint(lastScored)}
                disabled={!lastScored}
                style={{
                  flex:1, padding:"13px 0", background:"transparent",
                  color: lastScored ? c.blue : c.muted, border:`1px solid ${c.border}`, borderRadius:8,
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

          {!isDone && sets.length > 0 && (
            <div onClick={onUndoSet} style={{ textAlign:"center", padding:"12px 0 0", fontSize:11, color:c.muted, cursor:"pointer" }}>
              ↩ Undo Last Game
            </div>
          )}
          {!isDone && onWalkover && (
            <div onClick={() => setShowWalkover(true)} style={{ textAlign:"center", padding:"8px 0 0", fontSize:11, color:"#ef4444", cursor:"pointer" }}>
              🚫 Walkover / No Show
            </div>
          )}
        </div>

        {walkoverModal}
      </div>
    );
  }

  return (
    <div style={{ position:"fixed", inset:0, zIndex:9999, background:c.bg, display:"flex", flexDirection:"column", overflow:"hidden", fontFamily:"'Space Grotesk',sans-serif" }}>

      {/* ── TOP BAR ── */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 16px", background:c.surface, borderBottom:`2px solid ${isPreLive ? "#f59e0b" : c.blue}`, gap:"8px 12px", flexWrap:"wrap" }}>
        <div style={{ display:"flex", alignItems:"center", gap:10, flex:"1 1 auto", minWidth:0 }}>
          <span style={{ display:"inline-flex", alignItems:"center", gap:6, background: isPreLive ? "#f59e0b" : c.blue, color:c.bg, fontFamily:"'Unbounded',sans-serif", fontSize:10, fontWeight:800, letterSpacing:2, textTransform:"uppercase", padding:"3px 10px", borderRadius:4, whiteSpace:"nowrap" }}>
            <span style={{ width:7, height:7, borderRadius:"50%", background:c.bg, animation:"pulse 1.5s infinite", display:"inline-block" }}/>
            {isDone ? "Final" : isPreLive ? "Ready" : `Game ${currentSet?.set_number || 1}`}
          </span>
          <span style={{ fontSize:12, color:c.muted, fontWeight:600, whiteSpace:"nowrap" }}>
            Games: <strong style={{ color:c.blue }}>{setsWon1}</strong>
            <span style={{ color:c.border, margin:"0 6px" }}>—</span>
            <strong style={{ color:c.blue }}>{setsWon2}</strong>
          </span>
        </div>
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

      <div style={{ flex:1, display:"flex", flexDirection:"column", justifyContent:"center", padding:"16px 20px 20px", gap:16, maxWidth:600, margin:"0 auto", width:"100%" }}>

        {/* ── GAME HISTORY ── */}
        {sets.filter(s => s.is_complete).length > 0 && (
          <div style={{ display:"flex", justifyContent:"center", gap:6, flexWrap:"wrap" }}>
            {sets.filter(s => s.is_complete).map(s => (
              <span key={s.set_number} style={{ fontSize:11, padding:"3px 10px", borderRadius:4, fontWeight:800, fontFamily:"'Unbounded',sans-serif", background: s.winner_position===1?`${c.green}18`:`${c.red}18`, color: s.winner_position===1?c.green:c.red, border:`1px solid ${s.winner_position===1?c.green:c.red}44` }}>
                G{s.set_number}: {s.score_p1}–{s.score_p2}
              </span>
            ))}
          </div>
        )}

        {/* ── SERVER INDICATOR ── */}
        {!isDone && !setWinner && (
          <div style={{ textAlign:"center", fontSize:12, color:c.muted, fontWeight:600 }}>
            Serving: <strong style={{ color:c.blue }}>{serving===1?p1Name:p2Name}</strong>
          </div>
        )}

        {/* ── DEUCE / CAP INDICATOR ── */}
        {!isDone && !setWinner && isDeuce && (
          <div style={{ display:"flex", justifyContent:"center" }}>
            <span style={{ fontSize:11, fontWeight:800, fontFamily:"'Unbounded',sans-serif", textTransform:"uppercase", letterSpacing:1, color:c.blue }}>
              {isCap ? "Game Point — next wins" : "Deuce — win by 2"}
            </span>
          </div>
        )}

        {/* ── SCORE DISPLAY — tap either side to score (same action as + Point) ── */}
        <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:16 }}>
          {[
            { name:p1Name, score:s1, pos:1 },
            null,
            { name:p2Name, score:s2, pos:2 },
          ].map((side, i) => {
            const tappable = side && !isDone && !isPreLive && !setWinner;
            return side ? (
              <div key={side.pos}
                onClick={tappable ? () => addPoint(side.pos) : undefined}
                style={{ flex:1, textAlign:"center", cursor: tappable ? "pointer" : "default", padding:"6px 0", borderRadius:12, transition:"background 150ms ease", userSelect:"none" }}
              >
                <div style={{ fontSize:11, fontWeight:700, letterSpacing:2, textTransform:"uppercase", color: serving===side.pos&&!isDone?c.blue:c.muted, marginBottom:8 }}>
                  {side.name}
                </div>
                <div style={{ fontFamily:"'Unbounded',sans-serif", fontSize:96, fontWeight:900, lineHeight:1, color:scoreColor(side.pos), transition:"color .3s" }}>
                  {side.score}
                </div>
                {tappable && (
                  <div style={{ fontSize:10, color:c.border, textTransform:"uppercase", letterSpacing:1, marginTop:4 }}>Tap to score</div>
                )}
              </div>
            ) : (
              <div key="vs" style={{ color:c.border, fontSize:28, fontWeight:900, flexShrink:0 }}>—</div>
            );
          })}
        </div>

        {/* ── GAME / MATCH WINNER BANNER ── */}
        {setWinner && !matchWinner && (
          <div style={{ textAlign:"center", fontFamily:"'Unbounded',sans-serif", fontSize:13, fontWeight:800, textTransform:"uppercase", letterSpacing:2, color:c.green }}>
            Game {currentSet?.set_number} → {setWinner===1?p1Name:p2Name}
          </div>
        )}
        {matchWinner && (
          <div style={{ textAlign:"center", fontFamily:"'Unbounded',sans-serif", fontSize:16, fontWeight:900, textTransform:"uppercase", letterSpacing:2, color:c.gold }}>
            {matchWinner===1?p1Name:p2Name} Wins!
          </div>
        )}

        {/* ── PRE-LIVE: GO LIVE ── */}
        {isPreLive && (
          <div style={{ textAlign:"center", padding:"8px 0 16px" }}>
            <div style={{ fontSize:12, color:c.muted, marginBottom:18, lineHeight:1.5 }}>
              Match is ready. Press Go Live to begin scoring.
            </div>
            <button
              onClick={onGoLive}
              style={{
                width:"100%", padding:"20px 0", borderRadius:12,
                fontFamily:"'Unbounded',sans-serif", fontSize:15, fontWeight:900,
                letterSpacing:1, textTransform:"uppercase",
                background:c.blue, color:c.bg, border:"none",
                cursor:"pointer", boxShadow:`0 0 32px ${c.blue}44`,
              }}
            >
              ▶ GO LIVE
            </button>
          </div>
        )}

        {/* ── POINT BUTTONS (live only) ── */}
        {!isDone && !isPreLive && (
          <div style={{ display:"flex", gap:12 }}>
            {[1, 2].map(pos => (
              <div key={pos} style={{ flex:1, display:"flex", flexDirection:"column", gap:6 }}>
                <button
                  onClick={() => addPoint(pos)}
                  disabled={!!setWinner}
                  style={{
                    width:"100%", padding:"18px 0", borderRadius:10,
                    fontFamily:"'Unbounded',sans-serif", fontSize:15, fontWeight:900,
                    background: setWinner?c.surface:serving===pos?c.blue:`${c.blue}99`,
                    color: setWinner?c.muted:c.bg,
                    border: serving===pos&&!setWinner?`3px solid ${c.gold}`:"3px solid transparent",
                    cursor: setWinner?"not-allowed":"pointer", opacity:setWinner?.4:1,
                    boxShadow: serving===pos&&!setWinner?`0 0 20px ${c.blue}44`:"none",
                  }}
                >
                  + Point
                </button>
                <button
                  onClick={() => undoPoint(pos)}
                  disabled={(pos===1?s1:s2)===0}
                  style={{ width:"100%", padding:"9px 0", background:"transparent", color:c.muted, border:`1px solid ${c.border}`, borderRadius:8, fontSize:12, fontWeight:700, fontFamily:"inherit", cursor:(pos===1?s1:s2)===0?"not-allowed":"pointer", opacity:(pos===1?s1:s2)===0?.35:1 }}
                >
                  ↩ Undo
                </button>
              </div>
            ))}
          </div>
        )}

        {!isDone && !isPreLive && sets.length > 0 && (
          <button
            onClick={onUndoSet}
            style={{ width:"100%", padding:"11px 0", background:"transparent", color:c.muted, border:`1px solid ${c.border}`, borderRadius:8, fontSize:12, fontWeight:700, fontFamily:"inherit", cursor:"pointer" }}
          >
            ↩ Undo Last Game
          </button>
        )}
      </div>

      {walkoverModal}
    </div>
  );
}
