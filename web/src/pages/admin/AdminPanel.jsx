/**
 * AdminPanel — superadmin only.
 *
 * Layout:
 *   • Dedicated slim header (brand + "Super Admin" badge + theme toggle + logout)
 *   • Analytics strip — users, tournaments, orgs at a glance
 *   • User management table — toggle plan & active status
 */
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  getMe, adminGetStats, adminListUsers, adminUpdateUser, clearToken,
} from "../../api/client";
import PageLoader from "../../components/shared/PageLoader";

// ── Small helpers ─────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, color = "var(--ink)", accent = false }) {
  return (
    <div style={{
      background: accent ? "rgba(124,58,237,.06)" : "var(--surface)",
      border: `1px solid ${accent ? "rgba(124,58,237,.2)" : "var(--border)"}`,
      borderRadius: 12, padding: "16px 20px", minWidth: 120,
    }}>
      <div style={{ fontFamily: "var(--font-display)", fontSize: 28, fontWeight: 900, color, lineHeight: 1 }}>
        {value}
      </div>
      <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: "var(--muted)", marginTop: 5 }}>
        {label}
      </div>
      {sub && (
        <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 3 }}>{sub}</div>
      )}
    </div>
  );
}

function SectionHeading({ children }) {
  return (
    <div style={{
      fontFamily: "var(--font-display)", fontSize: 10, fontWeight: 900,
      textTransform: "uppercase", letterSpacing: 2, color: "var(--muted)",
      marginBottom: 12, marginTop: 32,
    }}>
      {children}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function AdminPanel() {
  const navigate  = useNavigate();
  const [user,    setUser]    = useState(null);
  const [stats,   setStats]   = useState(null);
  const [users,   setUsers]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [denied,  setDenied]  = useState(false);
  const [saving,  setSaving]  = useState(null);
  const [msg,     setMsg]     = useState("");
  const [search,  setSearch]  = useState("");
  const [theme,   setTheme]   = useState(() => localStorage.getItem("theme") || "light");

  const flash = (t) => { setMsg(t); setTimeout(() => setMsg(""), 3000); };

  const toggleTheme = () => {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("theme", next);
  };

  const logout = () => { clearToken(); navigate("/login", { replace: true }); };

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, []);

  useEffect(() => {
    async function load() {
      try {
        const me = await getMe();
        setUser(me);
        if (!me.is_superadmin) { setDenied(true); setLoading(false); return; }
        const [s, list] = await Promise.all([adminGetStats(), adminListUsers()]);
        setStats(s);
        setUsers(list);
      } catch (e) {
        if (e.message?.includes("403") || e.message?.includes("Superadmin")) {
          setDenied(true);
        } else {
          clearToken(); navigate("/login", { replace: true });
        }
      }
      setLoading(false);
    }
    load();
  }, [navigate]);

  const togglePlan = async (u) => {
    const next = u.plan === "pro" ? "free" : "pro";
    setSaving(u.user_id);
    try {
      const updated = await adminUpdateUser(u.user_id, { plan: next });
      setUsers(prev => prev.map(x => x.user_id === updated.user_id ? updated : x));
      // Update stats.users.pro count
      setStats(s => s ? {
        ...s,
        users: { ...s.users, pro: s.users.pro + (next === "pro" ? 1 : -1) },
      } : s);
      flash(`${updated.name} → ${updated.plan.toUpperCase()}`);
    } catch (e) { flash("Error: " + e.message); }
    setSaving(null);
  };

  const toggleActive = async (u) => {
    setSaving(u.user_id);
    try {
      const updated = await adminUpdateUser(u.user_id, { is_active: !u.is_active });
      setUsers(prev => prev.map(x => x.user_id === updated.user_id ? updated : x));
      flash(`${updated.name} → ${updated.is_active ? "active" : "banned"}`);
    } catch (e) { flash("Error: " + e.message); }
    setSaving(null);
  };

  if (loading) return <PageLoader />;

  if (denied) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg)" }}>
        <div style={{ textAlign: "center", padding: 40 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🔒</div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 900, color: "var(--ink)", marginBottom: 8 }}>Access Denied</div>
          <div style={{ color: "var(--muted)", fontSize: 14, marginBottom: 24 }}>This panel is restricted to superadmins.</div>
          <button onClick={() => navigate("/organiser")} style={{ padding: "10px 24px", borderRadius: 8, background: "var(--primary)", color: "#fff", border: "none", cursor: "pointer", fontWeight: 700 }}>
            Go to Dashboard
          </button>
        </div>
      </div>
    );
  }

  const filtered = users.filter(u =>
    !search ||
    u.name?.toLowerCase().includes(search.toLowerCase()) ||
    u.email?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)" }}>

      {/* ── Admin Header ── */}
      <header style={{
        background: "var(--surface)", borderBottom: "1px solid var(--border)",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 24px", height: 56, position: "sticky", top: 0, zIndex: 100,
      }}>
        {/* Brand + badge */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 900, color: "var(--ink)", letterSpacing: -0.5 }}>
            The<span style={{ color: "var(--primary)" }}>Score</span>Board
          </span>
          <span style={{
            padding: "3px 10px", borderRadius: 20, fontSize: 9, fontWeight: 900,
            textTransform: "uppercase", letterSpacing: 1.2,
            background: "rgba(124,58,237,.12)", color: "#7c3aed",
            border: "1px solid rgba(124,58,237,.3)",
          }}>
            Super Admin
          </span>
        </div>

        {/* Controls */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {user?.name && (
            <span style={{ fontSize: 13, color: "var(--muted)", fontWeight: 600 }}>{user.name}</span>
          )}
          {/* Theme toggle */}
          <button onClick={toggleTheme} aria-label="Toggle dark mode" style={{
            background: "none", border: "1px solid var(--border)", borderRadius: 6,
            width: 32, height: 32, cursor: "pointer", color: "var(--ink)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            {theme === "light"
              ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
              : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
            }
          </button>
          <button onClick={logout} style={{
            padding: "6px 16px", borderRadius: 6, border: "1px solid var(--border)",
            background: "var(--elevated)", color: "var(--muted)", cursor: "pointer",
            fontSize: 12, fontWeight: 700,
          }}>
            Logout
          </button>
        </div>
      </header>

      {/* Flash */}
      {msg && (
        <div style={{ background: "rgba(22,163,74,.1)", borderBottom: "1px solid rgba(22,163,74,.25)", padding: "10px 24px", fontSize: 13, fontWeight: 700, color: "#16a34a" }}>
          {msg}
        </div>
      )}

      <div style={{ maxWidth: 1040, margin: "0 auto", padding: "32px 20px 80px" }}>

        {/* Page title */}
        <div style={{ marginBottom: 4 }}>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 900, textTransform: "uppercase", letterSpacing: -1, color: "var(--ink)" }}>
            Admin Dashboard
          </div>
          <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 4 }}>
            Platform-wide overview · manage user plans and access
          </div>
        </div>

        {/* ── Analytics ── */}
        {stats && (
          <>
            <SectionHeading>Users</SectionHeading>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <StatCard label="Total Users"   value={stats.users.total}   color="var(--ink)" />
              <StatCard label="Active"         value={stats.users.active}  color="#16a34a" />
              <StatCard label="Pro Accounts"   value={stats.users.pro}     color="#d97706" accent />
              <StatCard label="New This Week"  value={stats.users.new_7d}  color="var(--primary)"
                sub={`${stats.users.new_30d} this month`} />
            </div>

            <SectionHeading>Tournaments</SectionHeading>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <StatCard label="Total"       value={stats.tournaments.total}        color="var(--ink)" />
              <StatCard label="Live Now"    value={stats.tournaments.live}         color="var(--primary)" accent={stats.tournaments.live > 0} />
              <StatCard label="Open Reg."   value={stats.tournaments.registration} color="#22c55e" />
              <StatCard label="Completed"   value={stats.tournaments.completed}    color="var(--muted)" />
              <StatCard label="Drafts"      value={stats.tournaments.draft}        color="var(--muted)" />
              <StatCard label="Orgs"        value={stats.orgs.total}               color="var(--ink)" />
            </div>
          </>
        )}

        {/* ── User Management ── */}
        <SectionHeading>User Management</SectionHeading>

        {/* Search */}
        <input
          placeholder="Search by name or email…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            width: "100%", padding: "10px 14px", borderRadius: 8,
            border: "1px solid var(--border)", background: "var(--elevated)",
            color: "var(--ink)", fontSize: 14, marginBottom: 12, boxSizing: "border-box",
          }}
        />

        {/* Table */}
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
          {/* Column headers */}
          <div style={{
            display: "grid", gridTemplateColumns: "2fr 1.5fr 60px 90px 110px",
            padding: "10px 16px", borderBottom: "1px solid var(--border)", background: "var(--elevated)",
          }}>
            {["User", "Joined", "Orgs", "Status", "Plan"].map(h => (
              <div key={h} style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: "var(--muted)" }}>{h}</div>
            ))}
          </div>

          {filtered.length === 0 && (
            <div style={{ padding: "32px 16px", textAlign: "center", color: "var(--muted)", fontSize: 14 }}>
              No users found.
            </div>
          )}

          {filtered.map((u, i) => (
            <div
              key={u.user_id}
              style={{
                display: "grid", gridTemplateColumns: "2fr 1.5fr 60px 90px 110px",
                padding: "12px 16px", alignItems: "center",
                borderBottom: i < filtered.length - 1 ? "1px solid var(--border)" : "none",
                opacity: saving === u.user_id ? 0.45 : 1, transition: "opacity .15s",
                background: u.user_id === user?.user_id ? "rgba(124,58,237,.03)" : "transparent",
              }}
            >
              {/* Name + email */}
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)", display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                  {u.name}
                  {u.is_superadmin && (
                    <span style={{ padding: "1px 7px", borderRadius: 20, fontSize: 9, fontWeight: 900, textTransform: "uppercase", letterSpacing: 0.8, background: "rgba(124,58,237,.12)", color: "#7c3aed", border: "1px solid rgba(124,58,237,.3)" }}>
                      admin
                    </span>
                  )}
                  {u.user_id === user?.user_id && (
                    <span style={{ fontSize: 10, color: "var(--muted)", fontWeight: 600 }}>you</span>
                  )}
                </div>
                <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2, wordBreak: "break-all" }}>{u.email}</div>
              </div>

              {/* Joined */}
              <div style={{ fontSize: 12, color: "var(--muted)" }}>
                {u.created_at
                  ? new Date(u.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "2-digit" })
                  : "—"}
              </div>

              {/* Org count */}
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)" }}>{u.org_count}</div>

              {/* Active / Banned */}
              <div>
                <button
                  onClick={() => toggleActive(u)}
                  disabled={saving !== null || u.user_id === user?.user_id}
                  title={u.user_id === user?.user_id ? "Cannot ban yourself" : (u.is_active ? "Click to ban" : "Click to unban")}
                  style={{
                    padding: "4px 10px", borderRadius: 6, border: "none",
                    background: u.is_active ? "rgba(22,163,74,.12)" : "rgba(220,38,38,.12)",
                    color: u.is_active ? "#16a34a" : "#dc2626",
                    fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5,
                    cursor: u.user_id === user?.user_id ? "not-allowed" : "pointer",
                  }}
                >
                  {u.is_active ? "Active" : "Banned"}
                </button>
              </div>

              {/* Plan toggle */}
              <div>
                <button
                  onClick={() => togglePlan(u)}
                  disabled={saving !== null}
                  style={{
                    padding: "5px 14px", borderRadius: 6, border: "none",
                    background: u.plan === "pro" ? "#f59e0b" : "var(--elevated)",
                    color: u.plan === "pro" ? "#fff" : "var(--muted)",
                    fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5,
                    cursor: "pointer", transition: "all .15s",
                    border: u.plan === "pro" ? "none" : "1px solid var(--border)",
                    boxShadow: u.plan === "pro" ? "0 1px 6px rgba(245,158,11,.4)" : "none",
                  }}
                >
                  {u.plan === "pro" ? "★ Pro" : "Free"}
                </button>
              </div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 10, fontSize: 12, color: "var(--muted)", textAlign: "right" }}>
          {filtered.length} of {users.length} user{users.length !== 1 ? "s" : ""}
        </div>

      </div>
    </div>
  );
}
