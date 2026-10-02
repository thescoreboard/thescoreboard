// Shared black-theme visual language for the mobile scoring screens
// (Ready / pre-live state + live scoring header) across all four scorers.

export function mobileScorerTheme(accent = "#38bdf8") {
  return {
    bg: "#000000",
    surface: "#0a0a0a",
    border: "#1a1a1a",
    ink: "#ffffff",
    muted: "#6b7280",
    accent,
    gold: "#facc15",
    red: "#ef4444",
  };
}

export function InitialAvatar({ name, accent = "#38bdf8", size = 64 }) {
  const initial = (name || "?").trim().charAt(0).toUpperCase() || "?";
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%",
      background: "transparent", border: `2px solid ${accent}55`,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: "'Space Grotesk', system-ui, sans-serif",
      fontSize: size * 0.4, fontWeight: 800, color: accent,
      flexShrink: 0,
    }}>
      {initial}
    </div>
  );
}

// Shared top bar for both the Ready screen and the live-scoring screen.
export function MobileTopBar({ accent, statusLabel, statusColor, pulse = true, right, onClose }) {
  const c = mobileScorerTheme(accent);
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "12px 16px", borderBottom: `1px solid ${c.border}`, flexShrink: 0,
    }}>
      <span style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        fontSize: 11, fontWeight: 800, letterSpacing: 1.5, textTransform: "uppercase",
        color: statusColor || c.gold,
      }}>
        {pulse && <span style={{ width: 6, height: 6, borderRadius: "50%", background: statusColor || c.gold }} />}
        {statusLabel}
      </span>
      <span style={{ fontSize: 12, color: c.muted, fontWeight: 600 }}>{right}</span>
      {onClose && (
        <span onClick={onClose} style={{ fontSize: 12, color: c.muted, fontWeight: 700, cursor: "pointer" }}>
          Close
        </span>
      )}
    </div>
  );
}

export function ReadyScreen({ accent, leftName, rightName, onGoLive, onClose, gamesLabel }) {
  const c = mobileScorerTheme(accent);
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9999, background: c.bg,
      display: "flex", flexDirection: "column", overflow: "hidden",
      fontFamily: "'Space Grotesk', system-ui, sans-serif",
    }}>
      <MobileTopBar accent={accent} statusLabel="Ready" statusColor={c.gold} right={gamesLabel} onClose={onClose} />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 24, padding: 32 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
            <InitialAvatar name={leftName} accent={accent} />
            <span style={{ fontSize: 12, color: c.muted, fontWeight: 600 }}>{leftName}</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
            <InitialAvatar name={rightName} accent={accent} />
            <span style={{ fontSize: 12, color: c.muted, fontWeight: 600 }}>{rightName}</span>
          </div>
        </div>
        <div style={{ fontSize: 13, color: c.muted, textAlign: "center" }}>
          Match is ready. One tap to begin scoring.
        </div>
        <button
          onClick={onGoLive}
          style={{
            width: "100%", maxWidth: 320, padding: "18px 0", borderRadius: 12,
            fontSize: 14, fontWeight: 900, letterSpacing: 1, textTransform: "uppercase",
            background: accent, color: "#000", border: "none", cursor: "pointer",
            fontFamily: "inherit", boxShadow: `0 0 32px ${accent}44`,
          }}
        >
          ▶ Go Live
        </button>
      </div>
    </div>
  );
}
