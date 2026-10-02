import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  getDashboard, createOrg, deleteOrg,
  deleteTournament, clearToken, setStoredUser,
} from "../../api/client";
import OrgHeader from "../../components/shared/OrgHeader";
import CitySelect, { CITY_STATE_MAP } from "../../components/shared/CitySelect";

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

  const [showOrgModal,       setShowOrgModal]       = useState(false);
  const [showDeleteOrgModal, setShowDeleteOrgModal] = useState(false);
  const [showDeleteModal,    setShowDeleteModal]    = useState(null);
  const [showKebab,          setShowKebab]          = useState(null);
  const [onboarding,         setOnboarding]         = useState(false);
  const [mobileMenuOpen,     setMobileMenuOpen]     = useState(false);
  const [orgForm,    setOrgForm]    = useState({ name:"", city:"", state:"" });
  const [orgLoading, setOrgLoading] = useState(false);
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

      // Auto-create a personal org for first-time organisers — no onboarding gate.
      if (!cleanOrgs.length && data.user) {
        try {
          const autoName = data.user.name ? `${data.user.name}'s Club` : "My Club";
          const org = await createOrg({ name: autoName, city: "", state: "" });
          map[org.org_id] = { org, tournaments: [] };
          cleanOrgs = [org];
          flash(`Welcome! We created "${org.name}" for you — rename it anytime.`);
        } catch {
          // If auto-create fails, fall back to onboarding modal
          setOnboarding(true);
        }
      }

      setOrgs(cleanOrgs);
      setOrgData(map);
      if (cleanOrgs.length) setActiveOrg(cleanOrgs[0]);
    }).catch(() => { clearToken(); navigate("/login"); });
  }, []);

  useEffect(() => {
    const close = () => { setShowKebab(null); setMobileMenuOpen(false); };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, []);

  const handleLogout    = () => { clearToken(); navigate("/", { replace:true }); };
  const setOrgTournaments = (orgId, updater) =>
    setOrgData(prev => ({
      ...prev,
      [orgId]: { ...prev[orgId], tournaments: typeof updater === "function" ? updater(prev[orgId]?.tournaments || []) : updater },
    }));

  const handleCreateOrg = async () => {
    if (!orgForm.name.trim()) return flash("Name required.");
    setOrgLoading(true);
    try {
      const org = await createOrg(orgForm);
      setOrgs(p => [org, ...p]);
      setOrgData(prev => ({ ...prev, [org.org_id]: { org, tournaments: [] } }));
      setActiveOrg(org);
      setOnboarding(false); setShowOrgModal(false);
      setOrgForm({ name:"", city:"", state:"" }); flash("Organization created!");
    } catch(e) { flash("Error: "+e.message); }
    finally { setOrgLoading(false); }
  };

  const handleDeleteOrg = async () => {
    try {
      await deleteOrg(activeOrg.org_id);
      const rest = orgs.filter(o => o.org_id !== activeOrg.org_id);
      setOrgs(rest);
      setOrgData(prev => { const n = {...prev}; delete n[activeOrg.org_id]; return n; });
      setActiveOrg(rest[0] || null);
      setShowDeleteOrgModal(false); flash("Organization deleted.");
    } catch(e) { flash("Error: "+e.message); }
  };

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

      {/* ── MOBILE NAV BAR + DRAWER (small screens only) ── */}
      <div className="mobile-org-bar" style={{ justifyContent:"space-between" }} onClick={e => e.stopPropagation()}>
        <span className="mobile-org-bar-name">{activeOrg?.name || "Dashboard"}</span>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <span className="mobile-org-bar-link" onClick={() => navigate("/")}>Public Site</span>
          <button
            onClick={() => setMobileMenuOpen(o => !o)}
            style={{ background:"none", border:"1px solid var(--border)", borderRadius:6, width:30, height:30, cursor:"pointer", color:"var(--ink)", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}
          >
            {mobileMenuOpen
              ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
            }
          </button>
        </div>
      </div>

      {/* Mobile slide-down menu */}
      {mobileMenuOpen && (
        <div style={{ background:"var(--surface)", borderBottom:"2px solid var(--border)", padding:"8px 0 12px" }} className="mobile-sidebar-drawer" onClick={e => e.stopPropagation()}>
          {/* Section: Menu */}
          <div style={{ fontSize:9, fontWeight:700, textTransform:"uppercase", letterSpacing:2, color:"var(--subtle)", padding:"6px 20px 4px" }}>Menu</div>
          <div className="sidebar-item active" style={{ padding:"10px 20px", margin:"1px 8px", borderRadius:8 }}
            onClick={() => setMobileMenuOpen(false)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/></svg>
            Overview
          </div>
          <div className="sidebar-item" style={{ padding:"10px 20px", margin:"1px 8px", borderRadius:8 }}
            onClick={() => { navigate("/"); setMobileMenuOpen(false); }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 12a3 3 0 11-6 0 3 3 0 016 0zM2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
            Public Site
          </div>

          {/* Section: Orgs */}
          {orgs.length > 0 && <>
            <div style={{ fontSize:9, fontWeight:700, textTransform:"uppercase", letterSpacing:2, color:"var(--subtle)", padding:"10px 20px 4px" }}>Organizations</div>
            {orgs.map(o => (
              <div key={o.org_id}
                className={`sidebar-item${activeOrg?.org_id === o.org_id ? " active" : ""}`}
                style={{ padding:"10px 20px", margin:"1px 8px", borderRadius:8 }}
                onClick={() => { setActiveOrg(o); setMobileMenuOpen(false); }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/></svg>
                {o.name}
              </div>
            ))}
          </>}

          <div className="sidebar-item" style={{ padding:"10px 20px", margin:"1px 8px", borderRadius:8 }}
            onClick={() => { setMobileMenuOpen(false); setShowOrgModal(true); }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 4v16m8-8H4"/></svg>
            New Org
          </div>

          {/* Danger: Delete org */}
          {activeOrg && (
            <div style={{ margin:"8px 8px 0", paddingTop:8, borderTop:"1px solid var(--border)" }}>
              <div className="sidebar-item danger" style={{ padding:"10px 20px", borderRadius:8 }}
                onClick={() => { setMobileMenuOpen(false); setShowDeleteOrgModal(true); }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                Delete Org
              </div>
            </div>
          )}
        </div>
      )}

      <div className="sidebar-layout">
        {/* ── SIDEBAR ── */}
        <aside className="sidebar">
          <div style={{ flex: 1 }}>
            {activeOrg && (
              <span className="sidebar-org-chip" title={activeOrg.name}>{activeOrg.name}</span>
            )}

            <div className="sidebar-section-label">Menu</div>
            <div className="sidebar-item active">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/></svg>
              Overview
            </div>
            <div className="sidebar-item" onClick={() => navigate("/")}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 12a3 3 0 11-6 0 3 3 0 016 0zM2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
              Public Site
            </div>

            <div className="sidebar-section-label">Organizations</div>
            {orgs.map(o => (
              <div key={o.org_id}
                className={`sidebar-item${activeOrg?.org_id===o.org_id?" active":""}`}
                onClick={() => setActiveOrg(o)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/></svg>
                {o.name}
              </div>
            ))}
            <div className="sidebar-item" onClick={() => setShowOrgModal(true)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 4v16m8-8H4"/></svg>
              New Org
            </div>
          </div>

          {activeOrg && (
            <div style={{ padding: "10px 12px", borderTop: "1px solid var(--border)" }}>
              <div className="sidebar-item danger" style={{ borderRadius: 6 }} onClick={() => setShowDeleteOrgModal(true)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                Delete Org
              </div>
            </div>
          )}
        </aside>

        {/* ── MAIN ── */}
        <main className="dashboard-main" style={{ flex:1, padding:"28px 32px", minWidth:0, overflow:"hidden" }}>
          <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:24, gap:16 }} className="dashboard-header">
            <div>
              <div style={{ fontFamily:"var(--font-display)", fontSize:24, fontWeight:900, textTransform:"uppercase", letterSpacing:"-1px", color:"var(--ink)", lineHeight:1 }}>
                My Tournaments
              </div>
              <div style={{ fontSize:13, color:"var(--muted)", marginTop:4 }}>
                {activeOrg
                  ? <span>{activeOrg.name} <span style={{ color:"var(--border-mid)" }}>·</span> {tournaments.length} tournament{tournaments.length!==1?"s":""}</span>
                  : "No organization yet"}
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
            <div className="empty">
              <div className="empty-icon"></div>
              <div className="empty-title">No Organization Yet</div>
              <p style={{ fontSize:13 }}>
                Create an organization first to run tournaments.
              </p>
              <button className="btn btn-primary" style={{ marginTop:16 }} onClick={() => setOnboarding(true)}>
                Get Started
              </button>
            </div>
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

      {/* ── ONBOARDING ── */}
      {onboarding && (
        <div className="overlay" onClick={() => setOnboarding(false)}>
          <div style={{ background:"var(--surface)", border:"2px solid var(--border-mid)", borderRadius:12, padding:32, width:"100%", maxWidth:420, animation:"fadeIn .2s ease" }} onClick={e=>e.stopPropagation()}>
            <div style={{ fontFamily:"var(--font-display)", fontSize:10, fontWeight:800, textTransform:"uppercase", letterSpacing:3, color:"var(--primary)", marginBottom:8 }}>Welcome</div>
            <div style={{ fontFamily:"var(--font-display)", fontSize:22, fontWeight:900, textTransform:"uppercase", letterSpacing:-1, marginBottom:10 }}>Get Started</div>
            <p style={{ fontSize:13, color:"var(--muted)", marginBottom:20 }}>Create your organization — your club, school, or group.</p>
            <div style={{ border:"2px solid var(--border)", borderRadius:8, padding:"14px 16px", cursor:"pointer", transition:"all .15s", marginBottom:8 }}
              onClick={() => { setOnboarding(false); setShowOrgModal(true); }}
              onMouseOver={e=>e.currentTarget.style.borderColor="var(--primary)"}
              onMouseOut={e=>e.currentTarget.style.borderColor="var(--border)"}
            >
              <div style={{ fontFamily:"var(--font-display)", fontSize:14, fontWeight:800, textTransform:"uppercase", letterSpacing:-0.5 }}>Create an Organization</div>
              <div style={{ fontSize:12, color:"var(--muted)", marginTop:2 }}>Club, school, company — add your group</div>
            </div>
            <div style={{ fontSize:12, color:"var(--muted)", textAlign:"center", marginTop:12, cursor:"pointer" }} onClick={() => setOnboarding(false)}>Skip for now</div>
          </div>
        </div>
      )}

      {/* ── CREATE ORG ── */}
      {showOrgModal && (
        <div className="overlay" onClick={() => setShowOrgModal(false)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <div className="modal-header">
              <div><div className="modal-title">Create Organization</div><div className="modal-sub">Your club, school, or group</div></div>
              <button className="modal-close" onClick={() => setShowOrgModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="field"><label>Organization Name *</label>
                <input className="input" autoFocus placeholder="e.g. Tenx Sports Club" value={orgForm.name}
                  onChange={e=>setOrgForm(f=>({...f,name:e.target.value}))}
                  onKeyDown={e=>e.key==="Enter"&&handleCreateOrg()} /></div>
              <CitySelect
                city={orgForm.city}
                onChange={city => setOrgForm(f => ({ ...f, city, state: city ? (CITY_STATE_MAP[city] || "") : "" }))}
              />
              {orgForm.city && (
                <div className="field">
                  <label>State</label>
                  <input className="input" value={orgForm.state} readOnly
                    style={{ color: "var(--muted)", cursor: "default", background: "var(--elevated)" }} />
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setShowOrgModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleCreateOrg} disabled={orgLoading}>{orgLoading?"Creating…":"Create"}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── DELETE ORG ── */}
      {showDeleteOrgModal && activeOrg && (
        <div className="overlay" onClick={() => setShowDeleteOrgModal(false)}>
          <div className="danger-box" onClick={e=>e.stopPropagation()}>
            <div className="danger-icon">!</div>
            <div className="danger-title">Delete Organization</div>
            <div className="danger-body">You're deleting <strong>{activeOrg.name}</strong> and all <strong>{tournaments.length} tournament{tournaments.length!==1?"s":""}</strong> inside it.</div>
            <div className="danger-warn">This action cannot be undone.</div>
            <div style={{ display:"flex", gap:8, justifyContent:"flex-end" }}>
              <button className="btn btn-outline" onClick={() => setShowDeleteOrgModal(false)}>Cancel</button>
              <button className="btn btn-danger" onClick={handleDeleteOrg}>Delete Organization</button>
            </div>
          </div>
        </div>
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