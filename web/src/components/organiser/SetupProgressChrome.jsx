// Small shared bits used around the Setup Progress checklist on the event workspace.
export function SetupProgressHeader({ doneCount, totalCount, percent }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
        <div style={{ fontFamily: "var(--font-display)", fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: 1.5, color: "var(--ink)" }}>
          Setup Progress
        </div>
        <div style={{ fontSize: 12, color: "var(--muted)" }}>{doneCount} of {totalCount} details added · {percent}%</div>
      </div>
      <div style={{ height: 6, borderRadius: 4, background: "var(--elevated)", overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${percent}%`, background: "var(--primary)", borderRadius: 4, transition: "width .2s" }} />
      </div>
    </div>
  );
}

export function SetupCreatedBanner({ onDismiss }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
      background: "var(--primary-dim)", border: "1px solid rgba(255,107,53,0.25)",
      borderRadius: 10, padding: "12px 16px", marginBottom: 16,
    }}>
      <div style={{ fontSize: 13, color: "var(--ink)", display: "flex", alignItems: "center", gap: 8 }}>
        <span>🏅</span>
        <span>Tournament created — finish the details below to publish it.</span>
      </div>
      <button onClick={onDismiss} title="Dismiss"
        style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)", fontSize: 16, lineHeight: 1, padding: 4, fontFamily: "inherit", flexShrink: 0 }}>
        ×
      </button>
    </div>
  );
}

export function PublishCTA({ complete, remaining, onPublish }) {
  if (!complete) {
    return (
      <button className="btn btn-primary" disabled
        style={{ width: "100%", opacity: 0.5, cursor: "not-allowed" }}>
        Complete {remaining} More to Publish
      </button>
    );
  }
  return (
    <button className="btn btn-primary" onClick={onPublish} style={{ width: "100%" }}>
      Publish Tournament →
    </button>
  );
}

export function LockedTabPlaceholder({ onBack, label }) {
  return (
    <div className="card" style={{ textAlign: "center", padding: "48px 24px" }}>
      <div style={{ fontSize: 28, marginBottom: 10 }}>🔒</div>
      <div style={{ fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 900, textTransform: "uppercase", letterSpacing: -0.5, color: "var(--ink)", marginBottom: 6 }}>
        {label || "This section"} is locked
      </div>
      <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 18, maxWidth: 360, marginLeft: "auto", marginRight: "auto" }}>
        Complete the tournament setup checklist on the Info tab to unlock this.
      </div>
      <button className="btn btn-outline btn-sm" onClick={onBack}>← Back to Info</button>
    </div>
  );
}
