import { useState, useEffect, useCallback, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { getHomepageData, isLoggedIn } from "../api/client";
import TournamentCard, { SPORT_LABELS } from "../components/shared/TournamentCard";
import SiteFooter from "../components/shared/SiteFooter";

const SPORTS_CONFIG = [
  { key: "football",     url: "football",      color: "#22c55e", icon: "⚽" },
  { key: "cricket",      url: "cricket",       color: "#D97706", icon: "🏏" },
  { key: "table_tennis", url: "table-tennis",  color: "#FF6B35", icon: "🏓" },
  { key: "badminton",    url: "badminton",     color: "#38bdf8", icon: "🏸" },
];


const navLinkStyle = {
  background: "none", border: "none", cursor: "pointer",
  color: "var(--muted)", fontSize: 13, fontWeight: 600,
  fontFamily: "var(--font-body)", padding: "6px 14px",
  borderRadius: 6, transition: "color 0.2s",
  whiteSpace: "nowrap", textDecoration: "none",
};

export default function Landing() {
  const navigate = useNavigate();
  const [data,  setData]  = useState(null);
  const [theme, setTheme] = useState(() => localStorage.getItem("theme") || "light");
  const fetchingRef   = useRef(false);
  const sportsRef     = useRef(null);

  const fetchData = useCallback(async () => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    try {
      const d = await getHomepageData();
      setData(d);
    } catch (e) {
      // warn, not error: a failed homepage fetch is non-fatal (page renders
      // skeletons) and console.error trips Lighthouse's best-practices audit
      console.warn("Homepage data fetch failed:", e);
    } finally {
      fetchingRef.current = false;
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, []);

  const toggleTheme = () => {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("theme", next);
  };

  const scrollTo = (ref) => ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });

  const sports     = data?.sports || [];
  const trending   = data?.trending || [];
  const sportStats = {};
  sports.forEach(s => { sportStats[s.sport_key] = s; });

  const totalTournaments = sports.reduce((a, s) => a + (s.tournament_count || 0), 0);
  const totalPlayers     = sports.reduce((a, s) => a + (s.player_count    || 0), 0);
  const totalCities      = data?.total_cities || 12;

  // Showcase grid (below hero) — up to 6
  const gridSeen = new Set();
  const showcaseTournaments = [...trending, ...sports.flatMap(s => s.tournaments || [])]
    .filter(t => { if (gridSeen.has(t.tournament_id)) return false; gridSeen.add(t.tournament_id); return true; })
    .slice(0, 6);

  const loggedIn = isLoggedIn();

  return (
    <div className="app" style={{ minHeight: "100vh" }}>

      {/* ── HEADER ──────────────────────────────────────────── */}
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
              onClick={() => scrollTo(sportsRef)}
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

      <main>

      {/* ── HERO SPLIT ──────────────────────────────────────── */}
      <section className="hero-split" style={{ background: "var(--surface)" }}>

        {/* Left: copy */}
        <div className="hero-split-left">
          {/* Background glow */}
          <div style={{
            position: "absolute", top: -80, left: "50%", transform: "translateX(-50%)",
            width: 600, height: 480, borderRadius: "50%",
            background: "radial-gradient(circle, rgba(255,107,53,0.07) 0%, transparent 65%)",
            pointerEvents: "none",
          }}/>

          {/* Eyebrow */}
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            background: "rgba(255,107,53,0.1)", color: "var(--primary-text)",
            borderRadius: 6, padding: "5px 12px",
            fontFamily: "var(--font-display)", fontSize: 10, fontWeight: 800,
            letterSpacing: 2, textTransform: "uppercase",
            marginBottom: 24,
            animation: "fadeUp 0.4s ease both",
          }}>
            <span style={{
              width: 6, height: 6, borderRadius: "50%",
              background: "var(--primary)", animation: "pulse 1.5s infinite", display: "inline-block",
            }}/>
            Live Tournament Platform
          </div>

          <h1 style={{
            fontFamily: "var(--font-display)", fontSize: "clamp(36px, 6.5vw, 80px)",
            fontWeight: 900, lineHeight: 1.02, letterSpacing: "clamp(-1.5px, -0.3vw, -3px)",
            color: "var(--ink)", marginBottom: 24,
            animation: "fadeUp 0.4s ease 0.1s both",
          }}>
            Your Local Sports Scene,{" "}
            <span style={{ color: "var(--primary-text-lg)" }}>Live & Trackable</span>
          </h1>

          <p style={{
            fontSize: "clamp(15px, 1.5vw, 19px)", color: "var(--muted)", lineHeight: 1.75,
            marginBottom: 40, maxWidth: 620,
            animation: "fadeUp 0.4s ease 0.2s both",
          }}>
            Create tournaments, run live scoring, and let everyone follow along — all in one place. Built for grassroots sports communities.
          </p>

          <div style={{
            display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center",
            animation: "fadeUp 0.4s ease 0.3s both",
          }} className="hero-cta-row">
            <Link
              to="/tournaments"
              style={{
                background: "var(--primary)", color: "#fff",
                border: "none", borderRadius: 9, padding: "14px 32px",
                fontFamily: "var(--font-display)", fontSize: 12, fontWeight: 800,
                textTransform: "uppercase", letterSpacing: 0.5, cursor: "pointer",
                boxShadow: "0 4px 20px rgba(255,107,53,0.35)", transition: "all 0.2s",
                textDecoration: "none", display: "inline-block",
              }}
              onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 8px 28px rgba(255,107,53,0.45)"; }}
              onMouseLeave={e => { e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = "0 4px 20px rgba(255,107,53,0.35)"; }}
            >
              Find Tournaments →
            </Link>
            <Link
              to={loggedIn ? "/organiser" : "/register"}
              style={{
                background: "none", color: "var(--ink)",
                border: "2px solid var(--border)", borderRadius: 9, padding: "12px 28px",
                fontFamily: "var(--font-display)", fontSize: 12, fontWeight: 800,
                textTransform: "uppercase", letterSpacing: 0.5, cursor: "pointer",
                transition: "all 0.2s",
                textDecoration: "none", display: "inline-block",
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--primary)"; e.currentTarget.style.color = "var(--primary)"; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "var(--ink)"; }}
            >
              {loggedIn ? "My Dashboard" : "Create Account"}
            </Link>
          </div>

          {/* Instagram — below CTAs */}
          <a
            href="https://www.instagram.com/thescoreboard.in/"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "inline-flex", alignItems: "center", gap: 7,
              marginTop: 28, textDecoration: "none",
              color: "var(--muted)", fontSize: 13, fontWeight: 600,
              transition: "color 0.2s",
            }}
            onMouseEnter={e => e.currentTarget.style.color = "#E1306C"}
            onMouseLeave={e => e.currentTarget.style.color = "var(--muted)"}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="2" width="20" height="20" rx="5" ry="5"/>
              <circle cx="12" cy="12" r="4"/>
              <circle cx="17.5" cy="6.5" r="0.5" fill="currentColor"/>
            </svg>
            @thescoreboard.in
          </a>

        </div>

      </section>


      {/* ── TOURNAMENT SHOWCASE ─────────────────────────────── */}
      {(data === null || showcaseTournaments.length > 0) && (
        <section style={{
          padding: "56px 24px",
          background: "var(--surface)",
          borderTop: "2px solid var(--border)",
        }} className="landing-section-pad">
          <div style={{ maxWidth: 1100, margin: "0 auto" }}>
            <div style={{
              display: "flex", justifyContent: "space-between",
              alignItems: "flex-end", marginBottom: 28,
              flexWrap: "wrap", gap: 12,
            }}>
              <div>
                <div style={{
                  fontFamily: "var(--font-display)", fontSize: 10, fontWeight: 800,
                  textTransform: "uppercase", letterSpacing: 3,
                  color: "var(--primary-text)", marginBottom: 8,
                }}>
                  Featured Tournaments
                </div>
                <div style={{
                  fontFamily: "var(--font-display)", fontSize: "clamp(22px,3vw,32px)",
                  fontWeight: 900, color: "var(--ink)", letterSpacing: -1.5,
                }}>
                  Discover Tournaments
                </div>
              </div>
              <Link
                to="/tournaments"
                style={{
                  background: "var(--primary)", border: "none",
                  color: "#fff", borderRadius: 8, padding: "10px 22px",
                  fontSize: 11, fontWeight: 800, cursor: "pointer",
                  fontFamily: "var(--font-display)", textTransform: "uppercase", letterSpacing: 1.5,
                  transition: "opacity 0.2s",
                  textDecoration: "none", display: "inline-block",
                }}
                onMouseEnter={e => { e.currentTarget.style.opacity = "0.85"; }}
                onMouseLeave={e => { e.currentTarget.style.opacity = "1"; }}
              >
                View All →
              </Link>
            </div>

            {!data ? (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))", gap: 16 }}>
                {[1, 2, 3].map(i => (
                  <div key={i} style={{ borderRadius: 12, overflow: "hidden", border: "2px solid var(--border)" }}>
                    <div className="skeleton" style={{ height: 6 }}/>
                    <div style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 10 }}>
                      <div className="skeleton" style={{ height: 12, width: "40%" }}/>
                      <div className="skeleton" style={{ height: 20, width: "70%" }}/>
                      <div className="skeleton" style={{ height: 12, width: "55%" }}/>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(300px,1fr))",
                gap: 16,
              }}>
                {showcaseTournaments.map(t => (
                  <TournamentCard
                    key={t.tournament_id}
                    tournament={t}
                    onClick={() => navigate(`/t/${t.slug}`)}
                  />
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {/* ── DUAL CTA ────────────────────────────────────────── */}
      <section style={{
        padding: "72px 24px",
        background: "var(--bg)",
        borderTop: "2px solid var(--border)",
      }} className="landing-section-pad">
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          {/* For Organisers — full-width dark banner: pitch + CTA on the left, features on the right */}
          <div className="organiser-cta" style={{
            borderRadius: 20, padding: "56px 56px",
            background: "linear-gradient(135deg, #150800 0%, #2a1000 100%)",
            position: "relative", overflow: "hidden",
          }}>
            <div style={{
              position: "absolute", top: -80, right: -60,
              width: 360, height: 360, borderRadius: "50%",
              background: "radial-gradient(circle, rgba(255,107,53,0.18) 0%, transparent 70%)",
              pointerEvents: "none",
            }}/>

            <div style={{ position: "relative" }}>
              <div style={{
                fontFamily: "var(--font-display)", fontSize: 10, fontWeight: 800,
                textTransform: "uppercase", letterSpacing: 3,
                color: "#FF6B35", marginBottom: 16,
              }}>
                For Organisers
              </div>
              <h3 style={{
                fontFamily: "var(--font-display)", fontSize: "clamp(26px,3.2vw,40px)",
                fontWeight: 900, letterSpacing: -1, color: "#fff",
                lineHeight: 1.1, margin: "0 0 16px",
              }}>
                Run tournaments like a pro
              </h3>
              <p style={{ fontSize: 15, color: "rgba(255,255,255,0.55)", lineHeight: 1.7, margin: "0 0 32px", maxWidth: 460 }}>
                Create and manage tournaments from your phone or desktop. Auto-generate brackets, track scores live, and publish results instantly.
              </p>
              <button
                onClick={() => navigate(loggedIn ? "/organiser" : "/register")}
                style={{
                  background: "#FF6B35", color: "#fff",
                  border: "none", borderRadius: 10, padding: "14px 32px",
                  fontFamily: "var(--font-display)", fontSize: 12, fontWeight: 900,
                  textTransform: "uppercase", letterSpacing: 0.5, cursor: "pointer",
                  transition: "all 0.2s", whiteSpace: "nowrap",
                }}
                onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 6px 20px rgba(255,107,53,0.4)"; }}
                onMouseLeave={e => { e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = "none"; }}
              >
                {loggedIn ? "Organiser Dashboard →" : "Start Organising →"}
              </button>
            </div>

            <ul className="organiser-cta-features" style={{
              listStyle: "none", padding: 0, margin: 0, position: "relative",
              display: "grid", gap: 12,
            }}>
              {["Auto-generate brackets & fixtures", "Live score management", "Publish results instantly", "Sponsor & media management"].map(item => (
                <li key={item} style={{
                  fontSize: 14, fontWeight: 600, color: "rgba(255,255,255,0.85)",
                  display: "flex", alignItems: "center", gap: 12,
                  padding: "18px 18px", borderRadius: 12,
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.09)",
                }}>
                  <span style={{
                    flexShrink: 0, width: 26, height: 26, borderRadius: "50%",
                    background: "rgba(255,107,53,0.18)", color: "#FF6B35",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontWeight: 900, fontSize: 13,
                  }}>✓</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ── SPORTS BROWSE ───────────────────────────────────── */}
      <section ref={sportsRef} style={{
        padding: "72px 24px",
        background: "var(--surface)",
        borderTop: "2px solid var(--border)",
      }} className="landing-section-pad">
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{
            display: "flex", alignItems: "flex-end",
            justifyContent: "space-between", marginBottom: 32,
            flexWrap: "wrap", gap: 12,
          }}>
            <div>
              <div style={{
                fontFamily: "var(--font-display)", fontSize: 10, fontWeight: 800,
                textTransform: "uppercase", letterSpacing: 3,
                color: "var(--primary-text)", marginBottom: 8,
              }}>
                Browse Sports
              </div>
              <div style={{
                fontFamily: "var(--font-display)", fontSize: "clamp(22px,3vw,36px)",
                fontWeight: 900, color: "var(--ink)", letterSpacing: -1.5,
              }}>
                Find your game
              </div>
            </div>
            <div style={{ color: "var(--muted)", fontSize: 13, fontWeight: 600 }}>
              {SPORTS_CONFIG.reduce((a, s) => a + (sportStats[s.key]?.tournament_count || 0), 0)} tournaments across {SPORTS_CONFIG.length} sports
            </div>
          </div>

          <div className="sports-browse-grid">
            {SPORTS_CONFIG.map(sport => {
              const stats      = sportStats[sport.key];
              const tournCount = stats?.tournament_count || 0;
              return (
                <Link
                  key={sport.key}
                  to={`/${sport.url}`}
                  className="sport-browse-card"
                  style={{
                    display: "flex", alignItems: "center",
                    borderRadius: 14, overflow: "hidden",
                    border: `1.5px solid ${sport.color}28`,
                    background: `${sport.color}08`,
                    cursor: "pointer", transition: "all 0.2s", minHeight: 96,
                    textDecoration: "none",
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.background = `${sport.color}14`;
                    e.currentTarget.style.borderColor = `${sport.color}55`;
                    e.currentTarget.style.transform = "translateY(-3px)";
                    e.currentTarget.style.boxShadow = `0 8px 28px ${sport.color}20`;
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.background = `${sport.color}08`;
                    e.currentTarget.style.borderColor = `${sport.color}28`;
                    e.currentTarget.style.transform = "none";
                    e.currentTarget.style.boxShadow = "none";
                  }}
                >
                  {/* Left colour accent bar */}
                  <div style={{ width: 5, alignSelf: "stretch", background: sport.color, flexShrink: 0 }} />

                  {/* Sport icon */}
                  <div style={{
                    padding: "0 14px", fontSize: 28, lineHeight: 1, flexShrink: 0,
                    display: "flex", alignItems: "center",
                  }}>
                    {sport.icon}
                  </div>

                  {/* Content */}
                  <div style={{ flex: 1, padding: "16px 0", minWidth: 0 }}>
                    <div style={{
                      fontFamily: "var(--font-display)", fontSize: "clamp(14px, 2.5vw, 19px)",
                      fontWeight: 900, textTransform: "uppercase", letterSpacing: -0.3,
                      color: "var(--ink)", lineHeight: 1.1, marginBottom: 6,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {SPORT_LABELS[sport.key]}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{
                        fontSize: 11, fontWeight: 700, color: "var(--muted)",
                        background: "var(--elevated)", borderRadius: 4, padding: "2px 8px",
                        whiteSpace: "nowrap",
                      }}>
                        {tournCount > 0 ? `${tournCount} tournament${tournCount !== 1 ? "s" : ""}` : "Coming soon"}
                      </span>
                    </div>
                  </div>

                  {/* Arrow */}
                  <div style={{
                    paddingRight: 16, color: sport.color,
                    fontSize: 18, fontWeight: 900, opacity: 0.6, flexShrink: 0,
                  }}>→</div>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      </main>

      {/* ── FOOTER ──────────────────────────────────────────── */}
      <SiteFooter />

      {/* ── FAB (mobile only, logged-in users only) ─────────── */}
      {loggedIn && (
        <button
          onClick={() => navigate("/organiser")}
          style={{
            position: "fixed", bottom: 24, right: 20, zIndex: 100,
            display: "flex", alignItems: "center", gap: 8,
            background: "var(--primary)", color: "#fff",
            border: "none", borderRadius: 50, padding: "13px 22px",
            fontFamily: "var(--font-display)", fontSize: 12, fontWeight: 800,
            textTransform: "uppercase", letterSpacing: 1,
            boxShadow: "0 4px 20px rgba(255,107,53,0.5)", cursor: "pointer",
            transition: "all 0.2s",
          }}
          className="fab-hide-desktop"
        >
          Dashboard →
        </button>
      )}
    </div>
  );
}
