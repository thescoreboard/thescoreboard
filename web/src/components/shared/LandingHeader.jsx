import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { isLoggedIn } from "../../api/client";

const navLinkStyle = {
  background: "none", border: "none", cursor: "pointer",
  color: "var(--muted)", fontSize: 13, fontWeight: 600,
  fontFamily: "var(--font-body)", padding: "6px 14px",
  borderRadius: 6, transition: "color 0.2s",
  whiteSpace: "nowrap", textDecoration: "none",
};

// The site header used on the landing page and public info pages.
// onSportsClick: what the "Sports" link does (the landing page scrolls to its
// sports section; elsewhere it defaults to going to the landing page).
export default function LandingHeader({ onSportsClick }) {
  const navigate = useNavigate();
  const [theme, setTheme] = useState(() => localStorage.getItem("theme") || "light");
  const loggedIn = isLoggedIn();

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, []);

  const toggleTheme = () => {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("theme", next);
  };

  const goSports = onSportsClick || (() => navigate("/"));

  return (
    <header style={{
        background: "var(--surface)", borderBottom: "1px solid var(--border)",
        position: "sticky", top: 0, zIndex: 200,
      }}>
        <div style={{
          maxWidth: 1200, margin: "0 auto", padding: "0 24px",
          height: 62, display: "flex", alignItems: "center",
          justifyContent: "space-between", gap: 16,
        }}>
          {/* Brand */}
          <Link
            to="/"
            aria-label="TheScoreBoard — home"
            style={{
              fontFamily: "var(--font-display)", fontSize: 17, fontWeight: 900,
              color: "var(--ink)", whiteSpace: "nowrap", cursor: "pointer",
              textTransform: "uppercase", letterSpacing: -0.5, lineHeight: 1, flexShrink: 0,
              textDecoration: "none",
            }}
          >
            The<span style={{ color: "var(--primary)" }}>Score</span>Board
          </Link>
  
          {/* Nav links — desktop only (display controlled by CSS .landing-nav) */}
          <nav className="landing-nav-center">
            <Link
              to="/tournaments"
              style={navLinkStyle}
              onMouseEnter={e => e.currentTarget.style.color = "var(--primary)"}
              onMouseLeave={e => e.currentTarget.style.color = "var(--muted)"}
            >
              Find Tournaments
            </Link>
            <button
              style={navLinkStyle}
              onClick={goSports}
              onMouseEnter={e => e.currentTarget.style.color = "var(--primary)"}
              onMouseLeave={e => e.currentTarget.style.color = "var(--muted)"}
            >
              Sports
            </button>
            <Link
              to="/about"
              style={navLinkStyle}
              onMouseEnter={e => e.currentTarget.style.color = "var(--primary)"}
              onMouseLeave={e => e.currentTarget.style.color = "var(--muted)"}
            >
              About Us
            </Link>
          </nav>
  
          {/* Right actions */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            {/* Theme toggle */}
            <button
              onClick={toggleTheme}
              aria-label={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
              style={{
                background: "none", border: "1px solid var(--border)",
                borderRadius: 6, width: 34, height: 34, cursor: "pointer",
                color: "var(--ink)", display: "flex", alignItems: "center", justifyContent: "center",
                transition: "border-color 0.2s",
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
  
            {/* Auth / dashboard actions */}
            {loggedIn ? (
              /* Logged in — go to their current-mode dashboard */
              <button
                onClick={() => navigate("/organiser")}
                className="landing-cta-btn"
                onMouseEnter={e => { e.currentTarget.style.opacity = "0.85"; }}
                onMouseLeave={e => { e.currentTarget.style.opacity = "1"; }}
              >
                Dashboard →
              </button>
            ) : (
              /* Logged out — Sign In only */
              <button
                onClick={() => navigate("/login")}
                className="landing-cta-btn"
                onMouseEnter={e => { e.currentTarget.style.opacity = "0.85"; }}
                onMouseLeave={e => { e.currentTarget.style.opacity = "1"; }}
              >
                Sign In
              </button>
            )}
          </div>
        </div>
      </header>
  );
}
