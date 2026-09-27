import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { getSportPageData } from "../api/client";
import Header from "../components/shared/Header";
import TournamentCard, { SPORT_LABELS, SPORT_ICONS } from "../components/shared/TournamentCard";
import usePageMeta from "../hooks/usePageMeta";

const SPORT_ABBREV = { table_tennis: "🏓", badminton: "🏸", cricket: "🏏", football: "⚽", };

const SPORT_URL_TO_KEY = {
  football:       "football",
  cricket:        "cricket",
  "table-tennis": "table_tennis",
  badminton:      "badminton",
};

const SPORT_COLOR = {
  football:     "#22c55e",
  cricket:      "#D97706",
  table_tennis: "#FF6B35",
  badminton:    "#38bdf8",
};

export default function SportPage() {
  const location = useLocation();
  const sportUrl = location.pathname.replace("/", "");
  const navigate = useNavigate();
  const sportLabel = SPORT_LABELS[sportUrl.replace(/-/g, "_")] || sportUrl;
  usePageMeta(
    `${sportLabel} Tournaments`,
    `Find local ${sportLabel.toLowerCase()} tournaments near you. Register to compete and follow live scores on TheScoreBoard.`
  );
  const [data,        setData]        = useState(null);
  const [filterCity,  setFilterCity]  = useState("");
  const [searchQ,     setSearchQ]     = useState("");

  const sportKey = SPORT_URL_TO_KEY[sportUrl];
  const accent   = SPORT_COLOR[sportKey] || "var(--primary)";

  const fetchingRef = useRef(false);

  const fetchData = useCallback(async () => {
    if (!sportUrl || fetchingRef.current) return;
    fetchingRef.current = true;
    try {
      const d = await getSportPageData(sportUrl, filterCity || null, searchQ || null);
      setData(d);
    } catch (e) {
      console.error(e);
    } finally {
      fetchingRef.current = false;
    }
  }, [sportUrl, filterCity, searchQ]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const allTournaments = data?.tournaments || [];
  const cities         = data?.cities || [];

  const tournaments = allTournaments;

  return (
    <div className="app">
      <Header
        showSearch
        onSearch={setSearchQ}
        searchPlaceholder={`Search ${SPORT_LABELS[sportKey] || sportUrl} tournaments…`}
      />

      {/* ── SPORT HERO STRIP ── */}
      <div className="sport-hero-strip" style={{
        background: `linear-gradient(135deg, var(--surface) 0%, ${accent}10 100%)`,
        borderBottom: `2px solid ${accent}33`,
        padding: "20px 24px",
        position: "sticky", top: 56, zIndex: 90,
      }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          {/* Sport identity row */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{
                width: 52, height: 52, borderRadius: 12, flexShrink: 0,
                background: `${accent}18`, border: `2px solid ${accent}44`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontFamily: "var(--font-display)", fontSize: 16, fontWeight: 900, color: accent,
              }}>
                {SPORT_ABBREV[sportKey] || sportKey.slice(0,2).toUpperCase()}
              </div>
              <div>
                <div style={{
                  fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 900,
                  textTransform: "uppercase", letterSpacing: -1, color: "var(--ink)", lineHeight: 1,
                }}>
                  {SPORT_LABELS[sportKey] || sportUrl}
                </div>
                <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>
                  <span>{allTournaments.length} tournament{allTournaments.length !== 1 ? "s" : ""}</span>
                </div>
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
              ← All Sports
            </button>
          </div>

          {/* Filter pills row */}
          <div className="sport-filter-pills" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            {cities.length > 0 && (
              <div style={{ position: "relative", marginLeft: 4 }}>
                <svg style={{
                  position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)",
                  color: "var(--muted)", pointerEvents: "none",
                }} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
                  <circle cx="12" cy="9" r="2.5"/>
                </svg>
                <select
                  value={filterCity}
                  onChange={e => setFilterCity(e.target.value)}
                  style={{
                    background: filterCity ? "var(--primary-dim)" : "var(--surface)",
                    border: filterCity ? "1.5px solid var(--primary)" : "1.5px solid var(--border)",
                    color: filterCity ? "var(--primary)" : "var(--muted)",
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

            {/* Clear filters */}
            {filterCity && (
              <button
                onClick={() => { setFilterCity(""); }}
                style={{
                  background: "none", border: "1px solid var(--border)",
                  color: "var(--muted)", borderRadius: 6, padding: "6px 12px",
                  fontSize: 11, fontWeight: 700, cursor: "pointer",
                  fontFamily: "var(--font-body)", letterSpacing: 0.5,
                }}
              >
                Clear ×
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── CONTENT ── */}
      <div className="page-container">
        {!data ? (
          /* Skeleton */
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))", gap: 16 }}>
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} style={{ borderRadius: 12, border: "2px solid var(--border)", overflow: "hidden" }}>
                <div className="skeleton" style={{ height: 4 }}/>
                <div style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 10 }}>
                  <div className="skeleton" style={{ height: 12, width: "40%" }}/>
                  <div className="skeleton" style={{ height: 18, width: "70%" }}/>
                  <div className="skeleton" style={{ height: 12, width: "55%" }}/>
                  <div className="skeleton" style={{ height: 12, width: "45%", marginTop: 4 }}/>
                </div>
              </div>
            ))}
          </div>
        ) : tournaments.length === 0 ? (
          <div className="empty">
            <div className="empty-icon" style={{ opacity: 0.25, fontFamily: "var(--font-display)", fontSize: 28, fontWeight: 900, color: accent }}>{SPORT_ABBREV[sportKey] || "?"}</div>
            <div className="empty-title">
              {filterCity
                ? "No Matching Tournaments"
                : `No ${SPORT_LABELS[sportKey]} Tournaments Yet`}
            </div>
            <p style={{ fontSize: 13, color: "var(--muted)", marginTop: 6 }}>
              {filterCity
                ? "Try clearing your filters."
                : "Check back soon or organize one!"}
            </p>
            {(filterCity) && (
              <button
                onClick={() => { setFilterCity(""); }}
                className="btn btn-outline"
                style={{ marginTop: 16, fontSize: 12 }}
              >
                Clear Filters
              </button>
            )}
          </div>
        ) : (
          <Section label="Tournaments" tournaments={tournaments} sportUrl={sportUrl} navigate={navigate} accent={accent} />
        )}
      </div>

      <footer style={{ textAlign: "center", padding: "20px 24px", color: "var(--muted)", fontSize: 12, borderTop: "1px solid var(--border)", marginTop: 8 }}>
        TheScoreBoard · {SPORT_LABELS[sportKey]} Tournaments
      </footer>
    </div>
  );
}

function Section({ label, tournaments, sportUrl, navigate, accent }) {
  return (
    <div style={{ marginBottom: 40 }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 10, marginBottom: 16,
        paddingBottom: 10, borderBottom: "2px solid var(--border)",
      }}>
        <span style={{
          fontFamily: "var(--font-display)", fontSize: 13, fontWeight: 900,
          textTransform: "uppercase", letterSpacing: 1, color: "var(--ink)",
        }}>
          {badge ? "" : label}
        </span>
        <span style={{ fontSize: 12, color: "var(--muted)", marginLeft: 2 }}>
          ({tournaments.length})
        </span>
      </div>
      <div className="sport-tournament-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))", gap: 14 }}>
        {tournaments.map(t => (
          <TournamentCard
            key={t.tournament_id}
            tournament={t}
            onClick={() => navigate(`/${sportUrl}/tournament/${t.slug}`)}
          />
        ))}
      </div>
    </div>
  );
}
