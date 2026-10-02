/**
 * RoadToFinal — symmetric knockout bracket.
 *
 * Desktop: column layout (5/3/1 columns depending on bracket depth —
 * leftQF | leftSF | Final | rightSF | rightQF, or a subset), absolutely
 * positioned inside a fixed-width container with SVG connector lines.
 * Mobile: vertical stack — one full-width card per match, grouped by round,
 * scrolling down the page like the rest of the site (no horizontal swipe).
 *
 * Stage names from backend: quarter | semi | final | third_place
 */

// ── Layout constants ──────────────────────────────────────────
const CW = 192;  // card width  (px)
const CH = 96;   // card height (px)
const QG = 28;   // gap between the two QF cards in the same column
const CG = 50;   // horizontal gap between columns
const LH = 60;   // header height above the first card row

// ── Helpers ───────────────────────────────────────────────────
const isTBD = n => !n || n === "TBD";
const tbdMatch = id => ({
  match_id: `placeholder_${id}`,
  status:   "scheduled",
  player_1: { name: "TBD", score: 0 },
  player_2: { name: "TBD", score: 0 },
});

// ── Bracket Card ──────────────────────────────────────────────
// Stadium Lights, strictly: white surfaces, orange accents, black/gray text.
// No dark novelty fills for any match state — Live gets an orange tint,
// Completed is told apart by a black border + bold winner name, not a
// separate background color.
function BracketCard({ match: m, fullWidth }) {
  const done = m.status === "done";
  const live = m.status === "live";

  const hBg  = live ? "var(--primary-dim)" : "var(--elevated)";
  const hTxt = live ? "var(--primary)" : done ? "var(--ink)" : "var(--muted)";
  const bdr  = live ? "var(--primary)" : done ? "var(--ink)" : "var(--border)";

  const rows = [
    { n: m.player_1?.name || "TBD", s: m.player_1?.score, won: done && !!m.player_1?.is_winner },
    { n: m.player_2?.name || "TBD", s: m.player_2?.score, won: done && !!m.player_2?.is_winner },
  ];

  return (
    <div style={{
      width:      fullWidth ? "100%" : CW,
      border:     `1.5px solid ${bdr}`,
      borderRadius: 9,
      overflow:   "hidden",
      boxShadow:  "0 1px 4px rgba(0,0,0,.06)",
      flexShrink: 0,
      background: "var(--surface)",
    }}>
      {/* Status header */}
      <div style={{
        background: hBg, height: 26,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 10px",
      }}>
        <span style={{
          fontFamily: "var(--font-display)", fontSize: 7.5, fontWeight: 800,
          letterSpacing: 1.2, color: hTxt,
        }}>
          {done ? "✓  DONE" : live ? "●  LIVE" : "SCHEDULED"}
        </span>
        {m.table_number != null && (
          <span style={{
            fontFamily: "var(--font-display)", fontSize: 7.5, fontWeight: 700,
            color: hTxt, opacity: 0.7,
          }}>
            T{m.table_number}
          </span>
        )}
      </div>

      {/* Player rows */}
      {rows.map((p, i) => (
        <div key={i} style={{
          height:      35,
          display:     "flex", alignItems: "center", justifyContent: "space-between",
          padding:     "0 10px",
          background:  "var(--surface)",
          borderTop:   i > 0 ? "1px solid var(--border)" : "none",
          overflow: "hidden",
        }}>
          <span style={{
            flex:           1,
            fontSize:       12,
            fontWeight:     done && p.won ? 700 : 500,
            color:          done
              ? (p.won ? "var(--ink)" : "var(--muted)")
              : (isTBD(p.n) ? "var(--muted)" : "var(--ink)"),
            textDecoration: done && !p.won && !isTBD(p.n) ? "line-through" : "none",
            fontStyle:      isTBD(p.n) ? "italic" : "normal",
            overflow:       "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            display:        "flex", alignItems: "center", gap: 5,
          }}>
            {done && p.won && (
              <span style={{ fontSize: 11, flexShrink: 0 }}>🏆</span>
            )}
            {p.n}
          </span>

          {(done || live) && !isTBD(p.n) && p.s != null && (
            <span style={{
              fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 900,
              flexShrink: 0, marginLeft: 8,
              color: done
                ? (p.won ? "var(--primary, #FF6B35)" : "var(--muted)")
                : "var(--primary, #FF6B35)",
            }}>
              {p.s}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Column Label ──────────────────────────────────────────────
function ColLbl({ text, x, width, gold, bronze }) {
  return (
    <div style={{
      position:  "absolute", left: x, top: 0,
      width:     width || CW, textAlign: "center",
    }}>
      {gold   && <div style={{ fontSize: 22, lineHeight: 1, marginBottom: 3 }}>🏆</div>}
      {bronze && <div style={{ fontSize: 16, lineHeight: 1, marginBottom: 2 }}>🥉</div>}
      <div style={{
        fontFamily:     "var(--font-display)",
        fontSize:       8.5, fontWeight: 900,
        letterSpacing:  2, textTransform: "uppercase",
        color:          gold ? "#d97706" : bronze ? "#b45309" : "var(--muted)",
        whiteSpace:     "nowrap",
      }}>
        {text}
      </div>
    </div>
  );
}

// ── Legend ────────────────────────────────────────────────────
function BracketLegend() {
  return (
    <div style={{
      display: "flex", gap: 24, justifyContent: "center",
      marginTop: 28, paddingTop: 16,
      borderTop: "1px solid var(--border)",
      flexWrap: "wrap",
    }}>
      {[
        { bg: "var(--elevated)",    bd: "var(--border)",  label: "Scheduled" },
        { bg: "var(--primary-dim)", bd: "var(--primary)", label: "Live"      },
        { bg: "var(--surface)",     bd: "var(--ink)",     label: "Completed" },
      ].map(s => (
        <div key={s.label} style={{
          display: "flex", alignItems: "center", gap: 7,
          fontSize: 12, color: "var(--muted)",
        }}>
          <div style={{
            width: 14, height: 14, borderRadius: 3,
            background: s.bg, border: `1.5px solid ${s.bd}`, flexShrink: 0,
          }} />
          {s.label}
        </div>
      ))}
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────
function EmptyBracket({ format }) {
  return (
    <div style={{ textAlign: "center", padding: "40px 20px" }}>
      <div style={{ fontSize: 44, marginBottom: 14 }}>🏆</div>
      <div style={{
        fontFamily: "var(--font-display)", fontSize: 14, fontWeight: 900,
        textTransform: "uppercase", letterSpacing: 1,
        color: "var(--muted)", marginBottom: 10,
      }}>
        Bracket Pending
      </div>
      <p style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.7, maxWidth: 340, margin: "0 auto" }}>
        {format === "group_knockout"
          ? "The knockout draw will be generated once the group stage is complete."
          : "The bracket will appear once the tournament draw is published."}
      </p>
    </div>
  );
}

// ── Pair connector — shows two matches merging into the next round's slot ──
// Card height is fixed (26 header + 35 + 35 = 96px) regardless of width, so
// the merge point can be computed precisely even though width is fluid.
function PairConnector({ gap }) {
  const H = 96;
  const totalH = H * 2 + gap;
  const c1  = H / 2;
  const c2  = H + gap + H / 2;
  const mid = H + gap / 2;
  return (
    <svg width="20" height={totalH} viewBox={`0 0 20 ${totalH}`} style={{ display: "block", flexShrink: 0 }}>
      <path d={`M10 ${c1} V${mid} H20`} fill="none" stroke="var(--border)" strokeWidth="2" />
      <path d={`M10 ${c2} V${mid}`}     fill="none" stroke="var(--border)" strokeWidth="2" />
      <circle cx="20" cy={mid} r="3.5" fill="var(--primary)" />
    </svg>
  );
}

// ── Advance arrow — points from a completed round down to the next one ──
function AdvanceArrow() {
  return (
    <div style={{ display: "flex", justifyContent: "center", padding: "2px 0 10px" }}>
      <svg width="14" height="22" viewBox="0 0 14 22">
        <path d="M7 0 V16" stroke="var(--border)" strokeWidth="2" />
        <path d="M2 13 L7 19 L12 13" fill="none" stroke="var(--border)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

const PAIR_GAP = 18;

// ── A round's matches, paired up with connector lines showing which two
// feed into a single slot in the next round ──
function PairedRound({ matches }) {
  const pairs = [];
  for (let i = 0; i < matches.length; i += 2) pairs.push(matches.slice(i, i + 2));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {pairs.map((pair, i) => (
        <div key={pair[0].match_id} style={{ display: "flex", alignItems: "stretch", gap: 8 }}>
          {pair.length === 2 && <PairConnector gap={PAIR_GAP} />}
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: PAIR_GAP }}>
            {pair.map(m => <BracketCard key={m.match_id} match={m} fullWidth />)}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Mobile vertical stack ─────────────────────────────────────
function MobileBracket({ leftQF, rightQF, leftSF, rightSF, theFinal, thirdPlace, showQF }) {
  const stages = [
    ...(showQF ? [{
      label: "Quarter Finals",
      matches: [...leftQF, ...rightQF],
      advances: true,
    }] : []),
    {
      label: "Semi Finals",
      matches: [leftSF, rightSF],
      advances: true,
    },
    {
      label: "Final", emoji: "🏆",
      matches: [theFinal],
      advances: false,
    },
    ...(thirdPlace ? [{
      label: "3rd Place", emoji: "🥉",
      matches: [thirdPlace],
      advances: false,
    }] : []),
  ];

  return (
    <div>
      {stages.map(({ label, emoji, matches, advances }, i) => (
        <div key={label} style={{ marginBottom: 12 }}>
          <div style={{
            display: "flex", alignItems: "center", gap: 8,
            marginBottom: 12, paddingBottom: 8,
            borderBottom: "1px solid var(--border)",
          }}>
            {emoji && <span style={{ fontSize: 16 }}>{emoji}</span>}
            <span style={{
              fontFamily: "var(--font-display)", fontSize: 10, fontWeight: 800,
              textTransform: "uppercase", letterSpacing: 2, color: "var(--muted)",
            }}>
              {label}
            </span>
          </div>
          {matches.length > 1
            ? <PairedRound matches={matches} />
            : <BracketCard match={matches[0]} fullWidth />}
          {advances && i < stages.length - 1 && <AdvanceArrow />}
        </div>
      ))}
      <BracketLegend />
    </div>
  );
}

// ── Desktop 5-column bracket ──────────────────────────────────
function DesktopBracket5({ leftQF, rightQF, leftSF, rightSF, theFinal, thirdPlace }) {
  const cols = {
    lqf: 0,
    lsf: CW + CG,           // 242
    fin: 2 * (CW + CG),     // 484
    rsf: 3 * (CW + CG),     // 726
    rqf: 4 * (CW + CG),     // 968
  };
  const W = cols.rqf + CW;  // 1160

  const qfH = CH * 2 + QG;             // 220 — total height of a QF pair
  const row = {
    qf1: LH,
    qf2: LH + CH + QG,                 // 188
    sf:  LH + (qfH - CH) / 2,          // 122 — centred between QF pair
    fin: LH + (qfH - CH) / 2,          // 122
    tp:  LH + (qfH - CH) / 2 + CH + 56, // 274 — 3rd place below final
  };

  const mid = {
    qf1: row.qf1 + CH / 2,   // 108
    qf2: row.qf2 + CH / 2,   // 236
    sf:  row.sf  + CH / 2,   // 170
    fin: row.fin + CH / 2,   // 170
  };

  const jl = cols.lsf - CG / 2;  // 217 — left  junction
  const jr = cols.rqf - CG / 2;  // 943 — right junction

  const H = thirdPlace ? row.tp + CH + 24 : row.fin + CH + 24;

  const paths = [
    // Left QF → Left SF
    `M ${cols.lqf + CW} ${mid.qf1} H ${jl}`,
    `M ${cols.lqf + CW} ${mid.qf2} H ${jl}`,
    `M ${jl} ${mid.qf1} V ${mid.qf2}`,
    `M ${jl} ${mid.sf}  H ${cols.lsf}`,
    // Left SF → Final
    `M ${cols.lsf + CW} ${mid.sf}  H ${cols.fin}`,
    // Final → Right SF
    `M ${cols.fin + CW} ${mid.fin} H ${cols.rsf}`,
    // Right SF → Right QF
    `M ${cols.rsf + CW} ${mid.sf}  H ${jr}`,
    `M ${jr} ${mid.qf1} V ${mid.qf2}`,
    `M ${jr} ${mid.qf1} H ${cols.rqf}`,
    `M ${jr} ${mid.qf2} H ${cols.rqf}`,
  ];

  const abs = (l, t) => ({ position: "absolute", left: l, top: t, zIndex: 2 });

  return (
    <div>
      {/* No inner overflowX wrapper — BracketSection is the single scroll boundary */}
      <div style={{ paddingBottom: 8 }}>
        <div style={{ position: "relative", width: W, height: H, margin: "0 auto" }}>

          {/* SVG connector lines */}
          <svg style={{
            position: "absolute", inset: 0,
            width: "100%", height: "100%",
            overflow: "visible", pointerEvents: "none", zIndex: 1,
          }} viewBox={`0 0 ${W} ${H}`}>
            {paths.map((d, i) => (
              <path key={i} d={d} fill="none"
                stroke="var(--muted)" strokeOpacity=".35"
                strokeWidth="1.5" strokeLinecap="round" />
            ))}
          </svg>

          {/* Column labels */}
          <ColLbl text="Quarter Finals" x={cols.lqf} />
          <ColLbl text="Semi Finals"   x={cols.lsf} />
          <ColLbl text="Final"         x={cols.fin} gold />
          <ColLbl text="Semi Finals"   x={cols.rsf} />
          <ColLbl text="Quarter Finals" x={cols.rqf} />

          {/* 3rd place label */}
          {thirdPlace && (
            <div style={{
              position: "absolute", left: cols.fin, top: row.tp - 34,
              width: CW, textAlign: "center", zIndex: 2,
            }}>
              <div style={{ fontSize: 14, lineHeight: 1, marginBottom: 2 }}>🥉</div>
              <div style={{
                fontFamily: "var(--font-display)", fontSize: 8, fontWeight: 900,
                letterSpacing: 2, color: "#b45309", textTransform: "uppercase",
              }}>3RD PLACE</div>
            </div>
          )}

          {/* Match cards */}
          <div style={abs(cols.lqf, row.qf1)}><BracketCard match={leftQF[0]}  /></div>
          <div style={abs(cols.lqf, row.qf2)}><BracketCard match={leftQF[1]}  /></div>
          <div style={abs(cols.lsf, row.sf)} ><BracketCard match={leftSF}     /></div>
          <div style={abs(cols.fin, row.fin)} ><BracketCard match={theFinal}   /></div>
          <div style={abs(cols.rsf, row.sf)} ><BracketCard match={rightSF}    /></div>
          <div style={abs(cols.rqf, row.qf1)}><BracketCard match={rightQF[0]} /></div>
          <div style={abs(cols.rqf, row.qf2)}><BracketCard match={rightQF[1]} /></div>
          {thirdPlace && (
            <div style={abs(cols.fin, row.tp)}><BracketCard match={thirdPlace} /></div>
          )}
        </div>
      </div>
      <BracketLegend />
    </div>
  );
}

// ── Desktop 3-column bracket (SF only) ───────────────────────
function DesktopBracket3({ leftSF, rightSF, theFinal, thirdPlace }) {
  const cols = {
    lsf: 0,
    fin: CW + CG,        // 242
    rsf: 2 * (CW + CG), // 484
  };
  const W = cols.rsf + CW; // 676

  const row = {
    sf:  LH,
    fin: LH,
    tp:  LH + CH + 56,
  };

  const mid = {
    sf:  row.sf  + CH / 2,
    fin: row.fin + CH / 2,
  };

  const H = thirdPlace ? row.tp + CH + 24 : row.fin + CH + 24;

  const paths = [
    `M ${cols.lsf + CW} ${mid.sf}  H ${cols.fin}`,
    `M ${cols.fin + CW} ${mid.fin} H ${cols.rsf}`,
  ];

  const abs = (l, t) => ({ position: "absolute", left: l, top: t, zIndex: 2 });

  return (
    <div>
      {/* No inner overflowX wrapper — BracketSection is the single scroll boundary */}
      <div style={{ paddingBottom: 8 }}>
        <div style={{ position: "relative", width: W, height: H, margin: "0 auto" }}>

          {/* SVG connector lines */}
          <svg style={{
            position: "absolute", inset: 0,
            width: "100%", height: "100%",
            overflow: "visible", pointerEvents: "none", zIndex: 1,
          }} viewBox={`0 0 ${W} ${H}`}>
            {paths.map((d, i) => (
              <path key={i} d={d} fill="none"
                stroke="var(--muted)" strokeOpacity=".35"
                strokeWidth="1.5" strokeLinecap="round" />
            ))}
          </svg>

          {/* Column labels */}
          <ColLbl text="Semi Finals" x={cols.lsf} />
          <ColLbl text="Final"       x={cols.fin} gold />
          <ColLbl text="Semi Finals" x={cols.rsf} />

          {/* 3rd place label */}
          {thirdPlace && (
            <div style={{
              position: "absolute", left: cols.fin, top: row.tp - 34,
              width: CW, textAlign: "center", zIndex: 2,
            }}>
              <div style={{ fontSize: 14, lineHeight: 1, marginBottom: 2 }}>🥉</div>
              <div style={{
                fontFamily: "var(--font-display)", fontSize: 8, fontWeight: 900,
                letterSpacing: 2, color: "#b45309", textTransform: "uppercase",
              }}>3RD PLACE</div>
            </div>
          )}

          {/* Match cards */}
          <div style={abs(cols.lsf, row.sf)} ><BracketCard match={leftSF}   /></div>
          <div style={abs(cols.fin, row.fin)} ><BracketCard match={theFinal} /></div>
          <div style={abs(cols.rsf, row.sf)} ><BracketCard match={rightSF}  /></div>
          {thirdPlace && (
            <div style={abs(cols.fin, row.tp)}><BracketCard match={thirdPlace} /></div>
          )}
        </div>
      </div>
      <BracketLegend />
    </div>
  );
}

// ── Desktop 1-column (Final only) ────────────────────────────
function DesktopBracket1({ theFinal, thirdPlace }) {
  return (
    <div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
        <div style={{ textAlign: "center", marginBottom: 4 }}>
          <div style={{ fontSize: 22, lineHeight: 1, marginBottom: 3 }}>🏆</div>
          <div style={{
            fontFamily: "var(--font-display)", fontSize: 8.5, fontWeight: 900,
            letterSpacing: 2, color: "#d97706", textTransform: "uppercase",
          }}>Final</div>
        </div>
        <BracketCard match={theFinal} />
        {thirdPlace && (
          <>
            <div style={{ textAlign: "center", marginTop: 20 }}>
              <div style={{ fontSize: 16, lineHeight: 1, marginBottom: 2 }}>🥉</div>
              <div style={{
                fontFamily: "var(--font-display)", fontSize: 8, fontWeight: 900,
                letterSpacing: 2, color: "#b45309", textTransform: "uppercase",
              }}>3rd Place</div>
            </div>
            <BracketCard match={thirdPlace} />
          </>
        )}
      </div>
      <BracketLegend />
    </div>
  );
}

// ── Per-event bracket ─────────────────────────────────────────
function EventBracket({ event, isMobile }) {
  const matches = event.all_matches || [];

  // group_knockout events run each group as its own mini bracket using the
  // same generic engine as the real championship, so a group's internal
  // matches can carry stage="semi"/"final" too — not just "group". Anything
  // with a `group` name belongs to the group stage, not the championship;
  // exclude it here regardless of its raw stage label.
  const champMatches  = matches.filter(m => !m.group);
  const thirdPlaceAll = champMatches.filter(m => m.stage === "third_place");
  const koMatches     = champMatches.filter(m => m.stage !== "third_place");

  // Group by stage
  const byStage = {};
  for (const m of koMatches) {
    if (!m.stage) continue;
    (byStage[m.stage] = byStage[m.stage] || []).push(m);
  }

  const qfAll  = byStage["quarter"] || [];
  const sfAll  = byStage["semi"]    || [];
  const finAll = byStage["final"]   || [];

  const hasAny = qfAll.length || sfAll.length || finAll.length || thirdPlaceAll.length;
  if (!hasAny) return <EmptyBracket format={event.format} />;

  // Determine bracket depth
  const showQF = qfAll.length > 0;
  const showSF = sfAll.length > 0 || showQF;

  // Assign matches to bracket slots
  // QF: first two → left side, next two → right side
  const leftQFRaw  = qfAll.slice(0, 2);
  const rightQFRaw = qfAll.slice(2, 4);
  const leftQF  = [...leftQFRaw];
  const rightQF = [...rightQFRaw];
  while (leftQF.length  < 2) leftQF.push(tbdMatch(`lqf_${leftQF.length}`));
  while (rightQF.length < 2) rightQF.push(tbdMatch(`rqf_${rightQF.length}`));

  // SF: first → left, second → right
  const leftSF   = sfAll[0]  || tbdMatch("lsf");
  const rightSF  = sfAll[1]  || tbdMatch("rsf");
  const theFinal = finAll[0] || tbdMatch("fin");
  const thirdPlace = thirdPlaceAll[0] || null;

  // ── Mobile: vertical stack, grouped by round, scrolls down the page ──
  if (isMobile) {
    return (
      <MobileBracket
        leftQF={leftQF} rightQF={rightQF}
        leftSF={leftSF} rightSF={rightSF}
        theFinal={theFinal} thirdPlace={thirdPlace}
        showQF={showQF}
      />
    );
  }

  // ── Desktop: column layout with connector lines ──
  if (showQF) {
    return (
      <DesktopBracket5
        leftQF={leftQF} rightQF={rightQF}
        leftSF={leftSF} rightSF={rightSF}
        theFinal={theFinal} thirdPlace={thirdPlace}
      />
    );
  }
  if (showSF) {
    return (
      <DesktopBracket3
        leftSF={leftSF} rightSF={rightSF}
        theFinal={theFinal} thirdPlace={thirdPlace}
      />
    );
  }
  return <DesktopBracket1 theFinal={theFinal} thirdPlace={thirdPlace} />;
}

// ── Main export ───────────────────────────────────────────────
export default function RoadToFinal({ events, isMobile = false }) {
  const relevant = (events || []).filter(ev =>
    ev.format === "direct_knockout" || ev.format === "group_knockout"
  );
  if (!relevant.length) return null;

  return (
    <>
      {relevant.map((ev, i) => (
        <div key={ev.event_id} style={{ marginBottom: i < relevant.length - 1 ? 36 : 0 }}>
          {relevant.length > 1 && (
            <div style={{
              fontFamily: "var(--font-display)", fontSize: 11, fontWeight: 800,
              textTransform: "uppercase", letterSpacing: 1,
              color: "var(--muted)", marginBottom: 12,
            }}>
              {ev.name}
            </div>
          )}
          <EventBracket event={ev} isMobile={isMobile} />
        </div>
      ))}
    </>
  );
}
