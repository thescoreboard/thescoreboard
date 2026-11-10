import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  getDashboard, createOrg,
  deleteTournament, clearToken, setStoredUser,
} from "../../api/client";
import OrgHeader from "../../components/shared/OrgHeader";

const SPORT_EMOJI  = { table_tennis:"🏓", badminton:"🏸", cricket:"🏏", football:"⚽", };
const sportIcons   = (events=[]) => {
  const keys = [...new Set(events.map(e => e.sport_key).filter(Boolean))];
  if (!keys.length) return null;
  return keys.map(k => SPORT_EMOJI[k] || "🏆").join(" ");
};

export default function Dashboard() {
  const navigate = useNavigate();
  const [user,        setUser]        = useState(null);
  const [orgs,        setOrgs]        = useState([]);   // [{org_id, name, ...}]
  const [orgData,     setOrgData]     = useState({});   // org_id → { org, tournaments[] }
  const [activeOrg,   setActiveOrg]   = useState(null);
  const [msg,         setMsg]         = useState("");

  // Tournaments for the currently-selected org
  const tournaments = activeOrg ? (orgData[activeOrg.org_id]?.tournaments || []) : [];

  const [showDeleteModal,    setShowDeleteModal]    = useState(null);
  const [showKebab,          setShowKebab]          = useState(null);
  const [setupFailed,         setSetupFailed]        = useState(false);
  const [filterSport,  setFilterSport]  = useState("all");

  const flash = (t) => { setMsg(t); setTimeout(() => setMsg(""), 3000); };

  useEffect(() => {
    getDashboard().then(async data => {
      // Superadmin has no business here — send straight to the admin panel
      if (data.user?.is_superadmin) {
        navigate("/admin", { replace: true });
        return;
      }

      setUser(data.user);
      setStoredUser(data.user); // keep localStorage in sync for OrgHeader + role helpers
      const orgList = data.orgs || [];
      const map = {};
      let cleanOrgs = orgList.map(({ tournaments, ...o }) => { map[o.org_id] = { org: o, tournaments: tournaments || [] }; return o; });

      // Organisers never manage orgs: a personal one is created silently on first visit.
      if (!cleanOrgs.length && data.user) {
        try {
          const autoName = data.user.name || "My Tournaments";
          const org = await createOrg({ name: autoName, city: "", state: "" });
          map[org.org_id] = { org, tournaments: [] };
          cleanOrgs = [org];
        } catch {
          setSetupFailed(true);
        }
      }

      setOrgs(cleanOrgs);
      setOrgData(map);
      if (cleanOrgs.length) setActiveOrg(cleanOrgs[0]);
    }).catch(() => { clearToken(); navigate("/login"); });
  }, []);

  useEffect(() => {
    const close = () => { setShowKebab(null); };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, []);

  const handleLogout    = () => { clearToken(); navigate("/", { replace:true }); };
  const setOrgTournaments = (orgId, updater) =>
    setOrgData(prev => ({
      ...prev,
      [orgId]: { ...prev[orgId], tournaments: typeof updater === "function" ? updater(prev[orgId]?.tournaments || []) : updater },
    }));

  const handleDeleteTournament = async () => {
    try {
      await deleteTournament(activeOrg.org_id, showDeleteModal.tournament_id);
      setOrgTournaments(activeOrg.org_id, p => p.filter(t => t.tournament_id !== showDeleteModal.tournament_id));
      setShowDeleteModal(null); flash("Tournament deleted.");
    } catch(e) { flash("Error: "+e.message); }
  };

  const availableSports = [...new Set(
    tournaments.flatMap(t => (t.events||[]).map(e => e.sport_key).filter(Boolean))
  )];

  const SPORT_LABEL = { table_tennis:"Table Tennis", badminton:"Badminton", cricket:"Cricket", football:"Football", };

  const sorted = [...tournaments]
    .filter(t => filterSport  === "all" || (t.events||[]).some(e => e.sport_key === filterSport));

  return (
    <div className="app">
      <OrgHeader
        user={user}
        onLogout={handleLogout}
        crumbs={[{ label: "My Tournaments" }]}
      />

      {msg && <div className="flash success">{msg}</div>}

      <div className="sidebar-layout">
        {/* ── MAIN ── */}
        <main className="dashboard-main" style={{ flex:1, padding:"28px 32px", minWidth:0, overflow:"hidden", maxWidth:1100, margin:"0 auto" }}>
          <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:24, gap:16 }} className="dashboard-header">
            <div>
              <div style={{ fontFamily:"var(--font-display)", fontSize:24, fontWeight:900, textTransform:"uppercase", letterSpacing:"-1px", color:"var(--ink)", lineHeight:1 }}>
                My Tournaments
              </div>
              <div style={{ fontSize:13, color:"var(--muted)", marginTop:4 }}>
                {activeOrg
                  ? <span>{tournaments.length} tournament{tournaments.length!==1?"s":""}</span>
                  : ""}
              </div>
            </div>
            <button
              className="btn btn-gradient"
              style={{ borderRadius:8, fontSize:12, flexShrink:0 }}
              onClick={() => navigate("/organiser/create")}
            >
              + New Tournament
            </button>
          </div>

          {/* Filters */}
          {tournaments.length > 0 && (
            <div style={{ display:"flex", flexWrap:"wrap", gap:8, marginBottom:16 }}>
              {/* Sport chips — only show sports present in this org */}
              {availableSports.length > 0 && (
                <>
                  <span style={{ width:1, height:24, background:"var(--border)", alignSelf:"center" }}/>
                  {availableSports.map(sk => {
                    const active = filterSport === sk;
                    return (
                      <button key={sk} onClick={() => setFilterSport(active ? "all" : sk)} style={{
                        padding:"5px 12px", borderRadius:20, fontSize:11, fontWeight:700,
                        textTransform:"uppercase", letterSpacing:1,
                        border:`1.5px solid ${active ? "var(--primary)" : "var(--border)"}`,
                        background: active ? "var(--primary)" : "var(--surface)",
                        color: active ? "#fff" : "var(--muted)",
                        cursor:"pointer", transition:"all .15s",
                      }}>{SPORT_EMOJI[sk]||""} {SPORT_LABEL[sk]||sk}</button>
                    );
                  })}
                </>
              )}
            </div>
          )}

          <div className="section-label">
            Your Tournaments
            {filterSport !== "all" && (
              <span style={{ fontSize:11, color:"var(--muted)", fontWeight:400, marginLeft:8 }}>
                {sorted.length} result{sorted.length!==1?"s":""}
                {" · "}<span style={{ cursor:"pointer", color:"var(--primary)" }}
                  onClick={() => setFilterSport("all")}>Clear</span>
              </span>
            )}
          </div>

          {!activeOrg ? (
            setupFailed ? (
              <div className="empty">
                <div className="empty-icon"></div>
                <div className="empty-title">Something went wrong</div>
                <p style={{ fontSize:13 }}>We couldn't set up your account. Please refresh and try again.</p>
                <button className="btn btn-primary" style={{ marginTop:16 }} onClick={() => window.location.reload()}>Refresh</button>
              </div>
            ) : <div className="empty" />
          ) : sorted.length === 0 ? (
            <div className="empty">
              <div className="empty-icon"></div>
              <div className="empty-title">No Tournaments Yet</div>
              <p style={{ fontSize:13 }}>Hit <strong>+ New Tournament</strong> to get started.</p>
            </div>
          ) : (
            <div className="dashboard-tournaments">{sorted.map(t => (
              <TournamentCard key={t.tournament_id} tournament={t}
                showKebab={showKebab===t.tournament_id}
                onKebabToggle={e => { e.stopPropagation(); setShowKebab(showKebab===t.tournament_id?null:t.tournament_id); }}
                onManage={() => {
                  const events = t.events || [];
                  navigate(events.length
                    ? `/organiser/tournament/${t.tournament_id}/event/${events[0].event_id}`
                    : `/organiser/tournament/${t.tournament_id}`);
                }}
                onDelete={() => { setShowKebab(null); setShowDeleteModal(t); }}
                onCopy={() => { navigator.clipboard.writeText(`${window.location.origin}/t/${t.slug}`); flash("Link copied!"); setShowKebab(null); }}
              />
            ))}</div>
          )}

        </main>
      </div>

      {/* ── FAB (mobile only) — quick create without opening the drawer ── */}
      {activeOrg && (
        <button
          onClick={() => navigate("/organiser/create")}
          style={{
            position: "fixed", bottom: 24, right: 20, zIndex: 100,
            display: "flex", alignItems: "center", justifyContent: "center",
            width: 56, height: 56, borderRadius: "50%",
            background: "var(--primary)", color: "#fff",
            border: "none", fontSize: 26, lineHeight: 1,
            boxShadow: "0 4px 20px rgba(255,107,53,0.5)", cursor: "pointer",
            transition: "all 0.2s",
          }}
          className="fab-hide-desktop"
          title="New Tournament"
        >
          +
        </button>
      )}

      {/* ── DELETE TOURNAMENT ── */}
      {showDeleteModal && (
        <div className="overlay" onClick={() => setShowDeleteModal(null)}>
          <div className="danger-box" onClick={e=>e.stopPropagation()}>
            <div className="danger-icon">!</div>
            <div className="danger-title">Delete Tournament</div>
            <div className="danger-body">Permanently delete <strong>{showDeleteModal.name}</strong>. All events, matches, and player data will be removed.</div>
            <div className="danger-warn">This action cannot be undone.</div>
            <div style={{ display:"flex", gap:8, justifyContent:"flex-end" }}>
              <button className="btn btn-outline" onClick={() => setShowDeleteModal(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={handleDeleteTournament}>Delete Permanently</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TournamentCard({ tournament:t, showKebab, onKebabToggle, onManage, onDelete, onCopy }) {
  const events  = t.events || [];
  const icons   = sportIcons(events);
  return (
    <div
      onClick={onManage}
      style={{
        background: "var(--surface)",
        border: "2px solid var(--border)",
        borderRadius: "var(--radius-lg)",
        padding: "14px 16px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        gap: 12, marginBottom: 8, cursor: "pointer", transition: "all 0.15s",
        position: "relative",
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--primary)"; e.currentTarget.style.boxShadow = "0 4px 16px rgba(255,107,53,0.10)"; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.boxShadow = "none"; }}
    >
      <div style={{ display:"flex", alignItems:"center", gap:12, flex:1, minWidth:0 }}>
        <div style={{
          width: 42, height: 42, borderRadius: "var(--radius-md)",
          background: "var(--primary-dim)", border: "1px solid rgba(255,107,53,0.2)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: icons ? 18 : 15, fontWeight: 900,
          color: "var(--primary)", flexShrink: 0,
          fontFamily: icons ? "inherit" : "var(--font-display)",
        }}>{icons || t.name?.[0]?.toUpperCase() || "🏆"}</div>
        <div style={{ minWidth:0 }}>
          <div style={{
            fontFamily:"var(--font-display)", fontSize:14, fontWeight:900,
            textTransform:"uppercase", letterSpacing:-0.5, color:"var(--ink)",
            whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis",
          }}>{t.name}</div>
          <div style={{ fontSize:12, color:"var(--muted)", marginTop:1 }}>
            {[t.venue, t.city].filter(Boolean).join(" · ") || "No venue set"}
          </div>
          <div style={{ display:"flex", gap:6, marginTop:6, flexWrap:"wrap", alignItems:"center" }}>
            {events.length > 0 && (
              <span style={{ fontSize:11, color:"var(--muted)", fontWeight:600 }}>
                {events.length} event{events.length!==1?"s":""}
              </span>
            )}
          </div>
        </div>
      </div>
      <div style={{ display:"flex", alignItems:"center", gap:6, flexShrink:0 }} onClick={e=>e.stopPropagation()}>
        <button className="btn btn-primary btn-sm" onClick={onManage} style={{ fontSize:11 }}>Manage</button>
        <div style={{ position:"relative" }}>
          <button
            className="btn btn-ghost btn-sm"
            style={{ width:32, padding:0, fontSize:18, letterSpacing:1 }}
            onClick={onKebabToggle}
          >⋯</button>
          {showKebab && (
            <div className="kebab-menu" onClick={e=>e.stopPropagation()}>
              <button className="kebab-item" onClick={onManage}>✏ Edit / Manage</button>
              <button className="kebab-item" onClick={onCopy}>⛓ Copy share link</button>
              {onDelete && <button className="kebab-item danger" onClick={onDelete}>✕ Delete</button>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}