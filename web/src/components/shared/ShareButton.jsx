import { useState, useRef, useEffect } from "react";
import { useShare } from "../../hooks/useShare";

const WA_ICON = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
  </svg>
);
const IG_ICON = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
  </svg>
);

const CHANNELS = [
  { id: "whatsapp",  label: "WhatsApp",   color: "#25D366", icon: WA_ICON },
  {
    id: "twitter", label: "X / Twitter", color: "#000",
    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>,
  },
  {
    id: "facebook", label: "Facebook", color: "#1877F2",
    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>,
  },
];

export function ShareButton({ type, slug, matchId, title, upward = false, iconOnly = false }) {
  const [open,    setOpen]    = useState(false);
  const [copied,  setCopied]  = useState(false);
  const [igState, setIgState] = useState(null);
  const ref = useRef(null);
  const { share, shareInstagram, copyLink } = useShare({ type, slug, matchId, title });

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleCopy = async () => {
    await copyLink();
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    setOpen(false);
  };

  const handleInstagram = async () => {
    await shareInstagram();
    setIgState("copied");
    setTimeout(() => { setIgState(null); setOpen(false); }, 2500);
  };

  const igLabel = igState ? "Link copied — paste in Instagram!" : "Instagram";
  const igColor = igState ? "var(--green)" : "#E1306C";

  const ROW = {
    display: "flex", alignItems: "center", gap: 12,
    width: "100%", padding: "10px 14px",
    background: "none", border: "none", borderRadius: 8,
    color: "var(--ink)", fontSize: 14, cursor: "pointer", textAlign: "left",
  };

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        title="Share"
        style={{
          display: "flex", alignItems: "center", gap: 6,
          padding: iconOnly ? "7px 9px" : "7px 14px",
          background: "var(--elevated)", border: "1px solid var(--border)",
          borderRadius: 8, color: "var(--ink)", fontSize: 14, fontWeight: 500,
          cursor: "pointer", whiteSpace: "nowrap",
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
          <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
          <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
        </svg>
        {!iconOnly && "Share"}
      </button>

      {open && (
        <>
          {/* Backdrop */}
          <div
            onClick={() => setOpen(false)}
            style={{ position: "fixed", inset: 0, zIndex: 999, background: "rgba(0,0,0,0.25)" }}
          />
          {/* Dropdown — fixed position so never clipped by parent overflow */}
          <div style={{
            position: "fixed",
            top: "50%", left: "50%",
            transform: "translate(-50%, -50%)",
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 14, padding: "6px",
            boxShadow: "0 8px 40px rgba(0,0,0,0.18)",
            zIndex: 1000, minWidth: 220, width: "calc(100vw - 48px)", maxWidth: 320,
          }}>
            {CHANNELS.map((ch) => (
              <button key={ch.id} onClick={() => { share(ch.id); setOpen(false); }} style={ROW}
                onMouseEnter={(e) => e.currentTarget.style.background = "var(--elevated)"}
                onMouseLeave={(e) => e.currentTarget.style.background = "none"}>
                <span style={{ color: ch.color, flexShrink: 0, display: "flex" }}>{ch.icon}</span>
                {ch.label}
              </button>
            ))}

            <button onClick={handleInstagram} style={{ ...ROW, color: igState ? "var(--green)" : "var(--ink)" }}
              onMouseEnter={(e) => e.currentTarget.style.background = "var(--elevated)"}
              onMouseLeave={(e) => e.currentTarget.style.background = "none"}>
              <span style={{ color: igColor, flexShrink: 0, display: "flex" }}>{IG_ICON}</span>
              <span style={{ flex: 1 }}>{igLabel}</span>
            </button>

            <div style={{ height: 1, background: "var(--border)", margin: "4px 8px" }} />

            <button onClick={handleCopy}
              style={{ ...ROW, color: copied ? "var(--green)" : "var(--ink)" }}
              onMouseEnter={(e) => e.currentTarget.style.background = "var(--elevated)"}
              onMouseLeave={(e) => e.currentTarget.style.background = "none"}>
              <span style={{ flexShrink: 0, display: "flex" }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  {copied
                    ? <polyline points="20 6 9 17 4 12"/>
                    : <><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></>
                  }
                </svg>
              </span>
              {copied ? "Link copied!" : "Copy link"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
