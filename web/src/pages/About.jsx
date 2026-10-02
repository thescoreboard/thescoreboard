/**
 * About — what TheScoreBoard is and who it's for.
 * Linked from the landing-page footer.
 */
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import usePageMeta from "../hooks/usePageMeta";

const INSTAGRAM_URL  = "https://www.instagram.com/thescoreboard.in/";
const CONTACT_EMAIL  = "teams@thescoreboard.in";
// wa.me deep link opens a chat with this number directly; ?text= pre-fills
// the message so the person just has to hit send.
const WHATSAPP_URL   =
  "https://wa.me/917506134294?text=" +
  encodeURIComponent("Hi! I found TheScoreBoard and I'd like to know more.");
const WHATSAPP_LABEL = "+91 75061 34294";

const PAGE_MAX = 1100;

// Same responsive-width pattern used on TournamentPublic — no shared hook
// file exists yet for this, so each page tracks its own viewport width.
function useW() {
  const [w, setW] = useState(() => typeof window !== "undefined" ? window.innerWidth : 1280);
  useEffect(() => {
    const h = () => setW(window.innerWidth);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);
  return w;
}

const sectionLabel = {
  fontFamily: "var(--font-display)", fontSize: 11, fontWeight: 800,
  textTransform: "uppercase", letterSpacing: 2, color: "var(--primary)",
  marginBottom: 10,
};
const bodyText = { fontSize: 15, lineHeight: 1.85, color: "var(--ink)", marginBottom: 18 };

export default function About() {
  usePageMeta("About Us", "TheScoreBoard is a live scoring and tournament platform built for grassroots sports communities.");
  const navigate = useNavigate();
  const w = useW();
  const isDesktop = w >= 860;

  const [theme, setTheme] = useState(() => localStorage.getItem("theme") || "light");
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);
  const toggleTheme = () => {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    localStorage.setItem("theme", next);
  };

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--ink)" }}>
      {/* ── Hero band — full-bleed brand gradient, stands in for the site header ── */}
      <div style={{ background: "linear-gradient(135deg, #150800 0%, #2a1000 100%)", padding: "clamp(20px, 4vw, 28px) clamp(16px, 4vw, 24px) clamp(40px, 7vw, 72px)" }}>
        <div style={{ maxWidth: PAGE_MAX, margin: "0 auto" }}>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "clamp(24px, 5vw, 44px)" }}>
            <button
              onClick={toggleTheme}
              aria-label={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
              style={{
                background: "none", border: "1px solid rgba(255,255,255,0.25)",
                borderRadius: 6, width: 34, height: 34, cursor: "pointer",
                color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
              {theme === "light" ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="5"/>
                  <line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
                  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
                  <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
                  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
                </svg>
              )}
            </button>
          </div>
          <p style={{ ...sectionLabel, color: "var(--primary)", marginBottom: 14 }}>About TheScoreBoard</p>
          <h1 style={{
            fontFamily: "var(--font-display)", fontSize: "clamp(28px, 5vw, 46px)",
            fontWeight: 900, letterSpacing: -1, lineHeight: 1.12, color: "#fff",
            maxWidth: 720, margin: 0,
          }}>
            Built for the games happening in your local ground, right now.
          </h1>
        </div>
      </div>

      {/* ── Content — two columns on desktop so the wide layout isn't just stretched text ── */}
      <div style={{
        maxWidth: PAGE_MAX, margin: "0 auto",
        padding: "clamp(32px, 5vw, 56px) clamp(16px, 4vw, 24px) 80px",
        display: "grid",
        gridTemplateColumns: isDesktop ? "1.7fr 1fr" : "1fr",
        gap: isDesktop ? 56 : 36,
        alignItems: "start",
      }}>
        {/* Left: what TheScoreBoard is and does */}
        <div>
          <p style={bodyText}>
            TheScoreBoard is a live scoring and tournament management platform —
            built so that any local tournament, from a school table tennis meet
            to a weekend football league, can run with the same live scores,
            brackets, and player profiles that big-league sports take for
            granted.
          </p>
          <p style={bodyText}>
            No more shouted scores across a court, no more paper brackets taped
            to a wall. <strong>Organisers</strong> set up and run a tournament
            in minutes. <strong>Spectators</strong> follow live scores from
            their phones, wherever they are. <strong>Players</strong> carry a
            profile — match history, stats, results — from one event to the
            next.
          </p>

          {/* Mission callout */}
          <div style={{
            margin: "32px 0 0", padding: "22px 24px", borderLeft: "3px solid var(--primary)",
            background: "var(--elevated)", borderRadius: "0 12px 12px 0",
          }}>
            <p style={{ fontSize: 16, lineHeight: 1.75, fontWeight: 600, margin: 0 }}>
              Mainstream sports apps are built for the pros. TheScoreBoard is
              built for everyone else — <span style={{ color: "var(--primary)" }}>club leagues, school
              championships, and community tournaments</span> — where most of
              the world actually plays.
            </p>
          </div>
        </div>

        {/* Right: contact + CTAs, boxed as a card so wide screens get a
            real second column instead of empty margin */}
        <div style={{
          background: "var(--elevated)", border: "1px solid var(--border)",
          borderRadius: 16, padding: 24,
        }}>
          <p style={sectionLabel}>Reach Out</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 24 }}>
            <a href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer" style={contactRow}>
              <span style={{ ...contactIcon, color: "#E1306C" }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="0.5" fill="currentColor"/>
                </svg>
              </span>
              @thescoreboard.in
            </a>
            <a href={`mailto:${CONTACT_EMAIL}`} style={contactRow}>
              <span style={contactIcon}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 5L2 7"/>
                </svg>
              </span>
              {CONTACT_EMAIL}
            </a>
            <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer" style={contactRow}>
              <span style={{ ...contactIcon, color: "#25D366" }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm5.4 14.1c-.2.6-1.3 1.2-1.8 1.2-.5.1-1 .2-3.4-.7-2.9-1.2-4.7-4.1-4.9-4.3-.1-.2-1.1-1.5-1.1-2.9s.7-2 1-2.3c.2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.5s.8 1.9.8 2c.1.1.1.3 0 .5-.3.6-.6.8-.5 1.1.6 1 1.3 1.8 2.2 2.4.7.5 1.2.6 1.4.5.2-.1.7-.8.9-1.1.2-.3.4-.2.6-.1l1.8.8c.2.1.4.2.4.3.1.1.1.6-.2 1.4Z"/>
                </svg>
              </span>
              WhatsApp
            </a>
          </div>

          {/* CTA */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10, paddingTop: 16, borderTop: "1px solid var(--border)" }}>
            <button
              onClick={() => navigate("/organiser")}
              style={{
                background: "var(--primary)", color: "#fff", border: "none",
                borderRadius: 10, padding: "13px 18px", cursor: "pointer",
                fontFamily: "var(--font-display)", fontSize: 12, fontWeight: 800,
                textTransform: "uppercase", letterSpacing: 1,
              }}
            >
              Host a Tournament →
            </button>
            <button
              onClick={() => navigate("/tournaments")}
              style={{
                background: "transparent", color: "var(--ink)",
                border: "1.5px solid var(--border-mid, var(--border))",
                borderRadius: 10, padding: "13px 18px", cursor: "pointer",
                fontFamily: "var(--font-display)", fontSize: 12, fontWeight: 800,
                textTransform: "uppercase", letterSpacing: 1,
              }}
            >
              Follow Live Scores
            </button>
            <button
              onClick={() => navigate("/")}
              style={{
                background: "transparent", color: "var(--muted, var(--ink))",
                border: "none", padding: "13px 18px", cursor: "pointer",
                fontFamily: "var(--font-display)", fontSize: 12, fontWeight: 800,
                textTransform: "uppercase", letterSpacing: 1,
              }}
            >
              ← Home
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const contactRow = {
  display: "inline-flex", alignItems: "center", gap: 10,
  fontSize: 14, fontWeight: 700, color: "var(--ink)", textDecoration: "none",
};
const contactIcon = {
  width: 32, height: 32, borderRadius: 8, flexShrink: 0,
  display: "inline-flex", alignItems: "center", justifyContent: "center",
  background: "var(--surface, var(--bg))", border: "1px solid var(--border)",
  color: "var(--primary)",
};
