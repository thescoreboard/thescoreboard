export default function PageLoader() {
  return (
    <div style={{
      minHeight: "100vh", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      background: "var(--bg)", gap: 20,
    }}>
      {/* Logo */}
      <div style={{
        fontFamily: "var(--font-display)", fontSize: 28, fontWeight: 900,
        textTransform: "uppercase", letterSpacing: -1, lineHeight: 1,
        animation: "tsb-pulse 1.6s ease-in-out infinite",
      }}>
        The<span style={{ color: "var(--primary)" }}>Score</span>Board
      </div>

      {/* Three-dot bounce */}
      <div style={{ display: "flex", gap: 6 }}>
        {[0, 1, 2].map(i => (
          <span key={i} style={{
            width: 7, height: 7, borderRadius: "50%",
            background: "var(--primary)",
            display: "inline-block",
            animation: `tsb-bounce 1.2s ease-in-out ${i * 0.2}s infinite`,
          }} />
        ))}
      </div>

      <style>{`
        @keyframes tsb-pulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.45; }
        }
        @keyframes tsb-bounce {
          0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
          40%            { transform: translateY(-8px); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
