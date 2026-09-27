import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { getAllTournaments, isLoggedIn } from "../api/client";
import TournamentCard, { SPORT_LABELS } from "../components/shared/TournamentCard";
import usePageMeta from "../hooks/usePageMeta";

// ── Constants ─────────────────────────────────────────────────────────────────

const SPORT_OPTIONS = [
  { key: "",            label: "All Sports",   icon: "🏆", color: "var(--primary)" },
  { key: "football",    label: "Football",     icon: "⚽", color: "#22c55e" },
  { key: "cricket",     label: "Cricket",      icon: "🏏", color: "#D97706" },
  { key: "table_tennis",label: "Table Tennis", icon: "🏓", color: "#FF6B35" },
  { key: "badminton",   label: "Badminton",    icon: "🏸", color: "#38bdf8" },
];

// ── Pill helper ───────────────────────────────────────────────────────────────

function Pill({ active, onClick, children, accent }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "inline-flex", alignItems: "center", gap: 5,
        padding: "6px 14px", borderRadius: 6,
        fontSize: 12, fontWeight: 700, cursor: "pointer",
        border: active ? `1.5px solid ${accent || "var(--primary)"}` : "1.5px solid var(--border)",
        background: active ? (accent ? `${accent}18` : "var(--primary-dim)") : "var(--surface)",
        color: active ? (accent || "var(--primary)") : "var(--muted)",
        transition: "all 0.15s", whiteSpace: "nowrap",
        fontFamily: "var(--font-body)",
      }}
    >
      {children}
    </button>
  );
}

// ── Skeleton card ─────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div style={{
      borderRadius: 12, overflow: "hidden",
      border: "2px solid var(--border)",
      background: "var(--surface)",
    }}>
      <div className="skeleton" style={{ height: 4 }} />
      <div style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <div className="skeleton" style={{ height: 12, width: "30%", borderRadius: 4 }} />
          <div className="skeleton" style={{ height: 12, width: "18%", borderRadius: 4 }} />
        </div>
        <div className="skeleton" style={{ height: 18, width: "70%", borderRadius: 4 }} />
        <div className="skeleton" style={{ height: 11, width: "45%", borderRadius: 4 }} />
        <div className="skeleton" style={{ height: 11, width: "38%", borderRadius: 4 }} />
        <div style={{ display: "flex", gap: 12, paddingTop: 10, borderTop: "1px solid var(--border)" }}>
          {[1, 2, 3].map(i => (
            <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4, alignItems: "center" }}>
              <div className="skeleton" style={{ height: 18, width: 28, borderRadius: 4 }} />
              <div className="skeleton" style={{ height: 8, width: 36, borderRadius: 4 }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Tournaments() {
  usePageMeta("Find Tournaments", "Browse local sports tournaments by sport and city. Follow live scores.");
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Sync filters with URL search params so bookmarking / back-button works
  const [sport,  setSport]  = useState(searchParams.get("sport")  || "");
  const [city,   setCity]   = useState(searchParams.get("city")   || "");
  const [searchQ,setSearchQ]= useState(searchParams.get("q")      || "");
  const [inputQ, setInputQ] = useState(searchParams.get("q")      || "");

  const [data,    setData]    = useState(null);   // { tournaments, cities, total }
  const [loading, setLoading] = useState(true);

  const fetchingRef = useRef(false);

  const fetchData = useCallback(async () => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    try {
      const d = await getAllTournaments({ q: searchQ || undefined, sport: sport || undefined, city: city || undefined });
      setData(d);
    } catch (e) {
      console.error(e);
    } finally {
      fetchingRef.current = false;
      setLoading(false);
    }
  }, [searchQ, sport, city]);

  useEffect(() => {
    setLoading(true);
    fetchData();
  }, [fetchData]);

  // Keep URL in sync
  useEffect(() => {
    const p = {};
    if (sport)   p.sport  = sport;
    if (city)    p.city   = city;
    if (searchQ) p.q      = searchQ;
    setSearchParams(p, { replace: true });
  }, [sport, city, searchQ, setSearchParams]);

  // Debounce search input
  useEffect(() => {
    const t = setTimeout(() => setSearchQ(inputQ), 400);
    return () => clearTimeout(t);
  }, [inputQ]);

  const tournaments = data?.tournaments || [];
  const cities      = data?.cities      || [];
  const total       = data?.total       || 0;

  const activeSportOption = SPORT_OPTIONS.find(s => s.key === sport) || SPORT_OPTIONS[0];
  const hasFilters = sport || city || searchQ;

  function clearFilters() {
    setSport(""); setCity(""); setInputQ(""); setSearchQ("");
  }

  return (
    <div className="app" style={{ minHeight: "100vh" }}>

      {/* ── HEADER ─────────────────────────────────────────────────────────── */}
      <header style={{
        background: "var(--surface)",
        borderBottom: "1px solid var(--border)",
        position: "sticky", top: 0, zIndex: 200,
      }}>
        <div style={{
          maxWidth: 1200, margin: "0 auto", padding: "0 16px",
          height: 60, display: "flex", alignItems: "center",
          justifyContent: "space-between", gap: 12,
        }}>
          {/* Brand */}
          <div
            onClick={() => navigate("/")}
            style={{
              fontFamily: "var(--font-display)", fontSize: 17, fontWeight: 900,
              color: "var(--ink)", whiteSpace: "nowrap", cursor: "pointer",
              textTransform: "uppercase", letterSpacing: -0.5, lineHeight: 1,
              flexShrink: 0,
            }}
          >
            The<span style={{ color: "var(--primary)" }}>Score</span>Board
          </div>

          {/* Search bar — hidden on mobile, filters below cover it */}
          <div className="tourn-header-search" style={{ flex: 1, maxWidth: 400, position: "relative" }}>
            <svg style={{
              position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)",
              color: "var(--muted)", pointerEvents: "none",
            }} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              type="text"
              placeholder="Search tournaments, cities…"
              value={inputQ}
              onChange={e => setInputQ(e.target.value)}
              style={{
                width: "100%", boxSizing: "border-box",
                padding: "8px 10px 8px 32px", borderRadius: 7,
                border: "1.5px solid var(--border)",
                background: "var(--elevated)", color: "var(--ink)",
                fontSize: 13, outline: "none",
                fontFamily: "var(--font-body)",
              }}
            />
          </div>

          {/* Right actions */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            <button
              onClick={() => navigate(isLoggedIn() ? "/organiser" : "/login")}
              className="landing-cta-btn"
            >
              {isLoggedIn() ? "Dashboard" : "Organise →"}
            </button>
          </div>
        </div>
      </header>

      {/* ── HERO STRIP ─────────────────────────────────────────────────────── */}
      <div style={{
        background: "var(--surface)",
        borderBottom: "2px solid var(--border)",
        padding: "20px 24px",
        position: "sticky", top: 60, zIndex: 90,
      }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>

          {/* Title row */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            gap: 12, marginBottom: 14, flexWrap: "wrap",
          }}>
            <div>
              <div style={{
                fontFamily: "var(--font-display)", fontSize: "clamp(18px,3vw,24px)",
                fontWeight: 900, color: "var(--ink)", letterSpacing: -1, lineHeight: 1,
              }}>
                All Tournaments
              </div>
              <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4, display: "flex", alignItems: "center", gap: 10 }}>
                {loading ? (
                  <span>Loading…</span>
                ) : (
                  <>
                    <span>{total} tournament{total !== 1 ? "s" : ""}</span>
                  </>
                )}
              </div>
            </div>
            <button
              onClick={() => navigate("/")}
              style={{
                background: "none", border: "1px solid var(--border)",
                color: "var(--muted)", borderRadius: 6, padding: "7px 14px",
                fontSize: 12, fontWeight: 700, cursor: "pointer",
                fontFamily: "var(--font-display)", textTransform: "uppercase", letterSpacing: 1,
                transition: "all 0.15s", flexShrink: 0,
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--primary)"; e.currentTarget.style.color = "var(--primary)"; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "var(--muted)"; }}
            >
              ← Home
            </button>
          </div>

          {/* Mobile search bar — visible only when header search is hidden */}
          <div className="tourn-mobile-search" style={{ marginBottom: 12 }}>
            <div style={{ position: "relative" }}>
              <svg style={{
                position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)",
                color: "var(--muted)", pointerEvents: "none",
              }} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <input
                type="text"
                placeholder="Search tournaments, cities…"
                value={inputQ}
                onChange={e => setInputQ(e.target.value)}
                style={{
                  width: "100%", boxSizing: "border-box",
                  padding: "9px 10px 9px 32px", borderRadius: 8,
                  border: "1.5px solid var(--border)",
                  background: "var(--elevated)", color: "var(--ink)",
                  fontSize: 13, outline: "none", fontFamily: "var(--font-body)",
                }}
              />
            </div>
          </div>

          {/* Sport filter row */}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            {SPORT_OPTIONS.map(s => (
              <Pill
                key={s.key}
                active={sport === s.key}
                onClick={() => setSport(s.key)}
                accent={s.color}
              >
                <span>{s.icon}</span> {s.label}
              </Pill>
            ))}

            <div style={{ width: 1, height: 20, background: "var(--border)", margin: "0 4px" }} />

            {/* City dropdown */}
            {cities.length > 0 && (
              <div style={{ position: "relative", marginLeft: 4 }}>
                <svg style={{
                  position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)",
                  color: "var(--muted)", pointerEvents: "none",
                }} width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
                  <circle cx="12" cy="9" r="2.5"/>
                </svg>
                <select
                  value={city}
                  onChange={e => setCity(e.target.value)}
                  style={{
                    background: city ? "var(--primary-dim)" : "var(--surface)",
                    border: city ? "1.5px solid var(--primary)" : "1.5px solid var(--border)",
                    color: city ? "var(--primary)" : "var(--muted)",
                    fontSize: 12, fontWeight: 700,
                    padding: "6px 10px 6px 28px",
                    borderRadius: 6, cursor: "pointer", outline: "none",
                    fontFamily: "var(--font-body)", appearance: "none",
                    WebkitAppearance: "none",
                  }}
                >
                  <option value="">All Cities</option>
                  {cities.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            )}

            {/* Clear button */}
            {hasFilters && (
              <button
                onClick={clearFilters}
                style={{
                  background: "none", border: "1px solid var(--border)",
                  color: "var(--muted)", borderRadius: 6, padding: "6px 12px",
                  fontSize: 11, fontWeight: 700, cursor: "pointer",
                  fontFamily: "var(--font-body)", letterSpacing: 0.5,
                  transition: "all 0.15s",
                }}
                onMouseEnter={e => { e.currentTarget.style.color = "var(--ink)"; e.currentTarget.style.borderColor = "var(--ink)"; }}
                onMouseLeave={e => { e.currentTarget.style.color = "var(--muted)"; e.currentTarget.style.borderColor = "var(--border)"; }}
              >
                Clear ×
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── CONTENT ────────────────────────────────────────────────────────── */}
      <main style={{ padding: "32px 24px 64px", maxWidth: 1100, margin: "0 auto" }}>

        {loading ? (
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
            gap: 16,
          }}>
            {[1, 2, 3, 4, 5, 6].map(i => <SkeletonCard key={i} />)}
          </div>
        ) : tournaments.length === 0 ? (
          /* Empty state */
          <div style={{
            textAlign: "center", padding: "80px 24px",
            display: "flex", flexDirection: "column", alignItems: "center", gap: 16,
          }}>
            <div style={{
              width: 64, height: 64, borderRadius: 16,
              background: "var(--elevated)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 28,
            }}>
              🏆
            </div>
            <div style={{
              fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 900,
              textTransform: "uppercase", letterSpacing: -0.5, color: "var(--ink)",
            }}>
              {hasFilters ? "No matching tournaments" : "No tournaments yet"}
            </div>
            <p style={{ color: "var(--muted)", fontSize: 14, maxWidth: 380, margin: 0 }}>
              {hasFilters
                ? "Try adjusting your filters or search term."
                : "Be the first to organise one in your city!"}
            </p>
            {hasFilters ? (
              <button
                onClick={clearFilters}
                style={{
                  marginTop: 8, background: "var(--elevated)", color: "var(--ink)",
                  border: "1px solid var(--border)", borderRadius: 8, padding: "10px 24px",
                  fontFamily: "var(--font-display)", fontSize: 12, fontWeight: 800,
                  textTransform: "uppercase", letterSpacing: 1, cursor: "pointer",
                }}
              >
                Clear Filters
              </button>
            ) : (
              <button
                onClick={() => navigate(isLoggedIn() ? "/organiser" : "/register")}
                style={{
                  marginTop: 8, background: "var(--primary)", color: "#fff",
                  border: "none", borderRadius: 8, padding: "12px 24px",
                  fontFamily: "var(--font-display)", fontSize: 12, fontWeight: 800,
                  textTransform: "uppercase", letterSpacing: 1, cursor: "pointer",
                }}
              >
                Get Started →
              </button>
            )}
          </div>
        ) : (
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
            gap: 16,
          }}>
            {tournaments.map(t => (
              <TournamentCard
                key={t.tournament_id}
                tournament={t}
                onClick={() => navigate(`/t/${t.slug}`)}
              />
            ))}
          </div>
        )}
      </main>

      {/* ── FOOTER ─────────────────────────────────────────────────────────── */}
      <footer style={{
        background: "var(--elevated)", borderTop: "2px solid var(--border)",
        padding: "28px 24px", textAlign: "center",
      }}>
        <div style={{ color: "var(--muted)", fontSize: 12 }}>
          © {new Date().getFullYear()} TheScoreBoard · Built for sports communities
        </div>
      </footer>
    </div>
  );
}
