import { useState } from "react";

// A single collapsible row in the "Setup Progress" checklist. Collapsed state
// shows only the title + status pill; expanding reveals `children` (always
// the editable form for that section — there's no separate read-only view).
export default function SetupSection({ icon, title, status, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);

  const pill = {
    complete:    { label: "✓ Complete",  bg: "rgba(34,197,94,0.14)", fg: "#16a34a" },
    optional:    { label: "Optional",    bg: "var(--elevated)",      fg: "var(--muted)" },
    not_started: { label: "Not Started", bg: "var(--elevated)",      fg: "var(--muted)" },
  }[status] || { label: "Not Started", bg: "var(--elevated)", fg: "var(--muted)" };

  return (
    <div className="card" style={{ marginBottom: 10, padding: 0, overflow: "hidden" }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "14px 18px", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit",
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 16 }}>{icon}</span>
          <span style={{ fontFamily: "var(--font-display)", fontSize: 12, fontWeight: 900, textTransform: "uppercase", letterSpacing: 1, color: "var(--ink)" }}>
            {title}
          </span>
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ background: pill.bg, color: pill.fg, fontSize: 10, fontWeight: 800, padding: "4px 10px", borderRadius: 6, textTransform: "uppercase", letterSpacing: 0.5 }}>
            {pill.label}
          </span>
          <span style={{ fontSize: 11, color: "var(--muted)", transform: open ? "rotate(180deg)" : "none", transition: "transform .15s" }}>▾</span>
        </span>
      </button>
      {open && (
        <div style={{ padding: "0 18px 18px", borderTop: "1px solid var(--border)" }}>
          <div style={{ paddingTop: 16 }}>{children}</div>
        </div>
      )}
    </div>
  );
}
