import { useState } from "react";
import { bracketLayout } from "../../utils/bracketLayout";

// Shared bracket UI for direct knockout, the championship and group brackets.
//   <BracketPreview n={5} unit="team" />        read-only structure
//   <BracketEditor participants=[…] … />        pick who plays in every slot
// Both draw from bracketLayout(), which mirrors the server's bracket builder.

const S = {
  label: { fontFamily: "var(--font-display)", fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: 2, color: "var(--muted)" },
  round: { fontFamily: "var(--font-display)", fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: 1.2, color: "var(--ink)" },
  box:   { border: "1px solid var(--border)", borderRadius: 8, background: "var(--surface)", padding: "8px 10px" },
  input: { background: "var(--elevated)", border: "1px solid var(--border-mid)", borderRadius: 6, padding: "7px 10px", fontSize: 13, color: "var(--ink)", width: "100%", outline: "none", fontFamily: "inherit" },
  fixed: { fontSize: 12, color: "var(--muted)", fontStyle: "italic", padding: "7px 10px", background: "var(--elevated)", borderRadius: 6, border: "1px dashed var(--border)" },
};

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

// One-sentence explanation of the bracket, e.g. for 5 teams:
// "5 teams → 5 matches. 3 teams get a bye straight into the Semi Finals."
export function bracketSummary(layout, unit) {
  if (!layout) return "";
  const first = layout.rounds[0];
  const second = layout.rounds[1];
  let s = `${plural(layout.n, unit)} → ${plural(layout.total, "match")}.`;
  if (layout.byeCount > 0 && second) {
    s += ` ${plural(layout.byeCount, unit)} get a bye straight into the ${second.label}; ` +
         `the other ${layout.n - layout.byeCount} play the ${first.label}.`;
  }
  return s;
}

function useSlotText(layout, unit) {
  return (slot, roundNo) => {
    if (slot.type === "winner") return `Winner of Match ${slot.of}`;
    if (slot.type === "loser")  return `Loser of Match ${slot.of}`;
    return roundNo > 1 ? `${cap(unit)} (bye)` : cap(unit);
  };
}

function Slot({ text, children, fixed }) {
  if (children) return children;
  return <div style={fixed ? S.fixed : { ...S.fixed, fontStyle: "normal", border: "1px solid var(--border)" }}>{text}</div>;
}

function Rounds({ layout, unit, renderPick }) {
  const slotText = useSlotText(layout, unit);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {layout.rounds.map(r => (
        <div key={r.stage + r.matches[0].no}>
          <div style={{ ...S.round, marginBottom: 8, paddingBottom: 5, borderBottom: "2px solid var(--border)" }}>
            {r.label}
            <span style={{ ...S.label, marginLeft: 8, letterSpacing: 0, fontWeight: 600 }}>
              {plural(r.matches.length, "match")}
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {r.matches.map(m => (
              <div key={m.no} style={S.box}>
                <div style={{ ...S.label, marginBottom: 6 }}>Match {m.no}</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 28px 1fr", gap: 8, alignItems: "center" }}>
                  {m.slots.map((slot, i) => {
                    const cell = slot.type === "pick" && renderPick
                      ? renderPick(slot, m.round)
                      : <Slot text={slotText(slot, m.round)} fixed={slot.type !== "pick"} />;
                    return i === 0
                      ? [<div key="a">{cell}</div>, <div key="vs" style={{ textAlign: "center", fontSize: 11, fontWeight: 900, color: "var(--muted)" }}>vs</div>]
                      : <div key="b">{cell}</div>;
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Read-only structure ───────────────────────────────────────
export function BracketPreview({ n, unit = "team" }) {
  const layout = bracketLayout(n, true);
  if (!layout) return null;
  return (
    <div>
      <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 12, padding: "8px 10px", background: "var(--elevated)", borderRadius: 6 }}>
        {bracketSummary(layout, unit)}
      </div>
      <Rounds layout={layout} unit={unit} />
    </div>
  );
}

// ── Pick every slot yourself ──────────────────────────────────
// participants: [{ id, name }]. onSubmit receives the ids in server order.
export function BracketEditor({ participants, unit = "team", title, intro, submitLabel = "Create bracket", onSubmit, onBack, flash }) {
  const n = participants.length;
  const layout = bracketLayout(n, true);
  const [order, setOrder] = useState(() => Array(n).fill(""));
  const [busy, setBusy] = useState(false);

  if (!layout) {
    return (
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 13, color: "var(--muted)" }}>Add at least 2 {unit}s first.</div>
        {onBack && <button className="btn btn-outline btn-sm" style={{ marginTop: 10 }} onClick={onBack}>← Back</button>}
      </div>
    );
  }

  const used = new Set(order.filter(Boolean));
  const filled = order.filter(Boolean).length;
  const set = (idx, val) => setOrder(prev => prev.map((v, i) => (i === idx ? val : v)));

  const renderPick = (slot, roundNo) => (
    <select style={S.input} value={order[slot.idx]} onChange={e => set(slot.idx, e.target.value)}>
      <option value="">— {roundNo > 1 ? `${cap(unit)} (bye)` : cap(unit)} —</option>
      {participants
        .filter(p => String(p.id) === order[slot.idx] || !used.has(String(p.id)))
        .map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
    </select>
  );

  const submit = async () => {
    if (filled < n) return flash?.(`Place all ${n} ${unit}s in the bracket.`);
    setBusy(true);
    try { await onSubmit(order.map(Number)); }
    finally { setBusy(false); }
  };

  return (
    <div className="card" style={{ marginBottom: 16, border: "1px solid rgba(255,107,53,0.25)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
        <div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 14, fontWeight: 900, color: "var(--ink)" }}>{title}</div>
          <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 3, maxWidth: 560 }}>
            {intro || "Choose who plays in every match. Later rounds fill in automatically as winners advance."}
          </div>
        </div>
        {onBack && <button className="btn btn-outline btn-sm" onClick={onBack}>← Back</button>}
      </div>

      <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 14, padding: "8px 10px", background: "var(--elevated)", borderRadius: 6 }}>
        {bracketSummary(layout, unit)}
      </div>

      <Rounds layout={layout} unit={unit} renderPick={renderPick} />

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 18 }}>
        <button className="btn btn-primary" onClick={submit} disabled={busy || filled < n}>
          {busy ? "Creating…" : `✓ ${submitLabel} (${layout.total} matches)`}
        </button>
        {onBack && <button className="btn btn-outline btn-sm" onClick={onBack}>Cancel</button>}
        <span style={{ fontSize: 11, color: "var(--muted)" }}>{filled}/{n} placed</span>
      </div>
    </div>
  );
}

// Plain-text fixtures for a group bracket, e.g. for [A, B, C]:
//   ["B vs C", "A — bye to the Final"]
export function groupFixtureLines(names) {
  const layout = bracketLayout(names.length, false);
  if (!layout) return [];
  const nm = (i) => names[i] || "—";
  const lines = [];
  layout.rounds[0].matches.forEach(m => {
    lines.push(`${nm(m.slots[0].idx)} vs ${nm(m.slots[1].idx)}`);
  });
  const second = layout.rounds[1];
  for (let k = 0; k < layout.byeCount; k++) {
    lines.push(`${nm(k)} — bye to the ${second ? second.label : "next round"}`);
  }
  return lines;
}
