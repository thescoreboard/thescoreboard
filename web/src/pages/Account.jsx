import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { getMe, deleteAccount, clearToken, setStoredUser } from "../api/client";
import OrgHeader from "../components/shared/OrgHeader";
import PageLoader from "../components/shared/PageLoader";

// Account page — mirrors the mobile Profile tab: account details, sign out,
// and account deletion. There is no player profile.
export default function Account() {
  const navigate = useNavigate();
  const [loading,    setLoading]    = useState(true);
  const [user,       setUser]       = useState(null);
  const [msg,        setMsg]        = useState("");
  const [showDelete, setShowDelete] = useState(false);
  const [deleting,   setDeleting]   = useState(false);

  const flash = (t) => { setMsg(t); setTimeout(() => setMsg(""), 3000); };

  useEffect(() => {
    getMe()
      .then(u => { setUser(u); setStoredUser(u); })
      .catch(() => { clearToken(); navigate("/login"); })
      .finally(() => setLoading(false));
  }, []);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteAccount();
      clearToken();
      navigate("/", { replace: true });
    } catch (e) {
      setDeleting(false);
      setShowDelete(false);
      flash("Could not delete account: " + e.message);
    }
  };

  const handleLogout = () => { clearToken(); navigate("/", { replace: true }); };

  if (loading) return <PageLoader />;

  return (
    <div className="app">
      <OrgHeader user={user} onLogout={handleLogout}
        crumbs={[{ label: "My Tournaments", path: "/organiser" }, { label: "Account" }]} />
      {msg && <div className="flash success">{msg}</div>}

      <div style={{ maxWidth: 720, margin: "0 auto", padding: "28px 20px 60px", display: "grid", gap: 20 }}>

        <div className="card">
          <div className="card-title" style={{ marginBottom: 16 }}>Account</div>
          <div style={{ display: "grid", gap: 12 }}>
            <div className="field"><label>Name</label>
              <input className="input" value={user?.name || ""} readOnly style={{ color: "var(--muted)", background: "var(--elevated)" }} /></div>
            <div className="field"><label>Email</label>
              <input className="input" value={user?.email || ""} readOnly style={{ color: "var(--muted)", background: "var(--elevated)" }} /></div>
          </div>
        </div>

        <div className="card" style={{ borderColor: "rgba(229,62,62,.4)" }}>
          <div className="card-title" style={{ marginBottom: 6, color: "var(--red)" }}>Delete Account</div>
          <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 14 }}>
            Permanently deletes your account and the data tied to it. This cannot be undone.
          </p>
          <button className="btn btn-danger" onClick={() => setShowDelete(true)}>Delete my account</button>
        </div>
      </div>

      {showDelete && (
        <div className="overlay" onClick={() => !deleting && setShowDelete(false)}>
          <div className="danger-box" onClick={e => e.stopPropagation()}>
            <div className="danger-icon">!</div>
            <div className="danger-title">Delete Account</div>
            <div className="danger-body">This will permanently delete <strong>{user?.email}</strong>.</div>
            <div className="danger-warn">This action cannot be undone.</div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="btn btn-outline" onClick={() => setShowDelete(false)} disabled={deleting}>Cancel</button>
              <button className="btn btn-danger" onClick={handleDelete} disabled={deleting}>{deleting ? "Deleting…" : "Delete Permanently"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
