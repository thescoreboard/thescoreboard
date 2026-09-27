/**
 * JoinTournament — landing page for tournament invite links (/join/:token).
 *
 * Public route: shows who's inviting you to what BEFORE asking for auth.
 * Not logged in → stash the join URL via saveLoginRedirect and send to
 * login/register; the existing post-auth redirect flow brings them back here.
 * Logged in → one-click accept, then straight into the workspace.
 */
import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import {
  getInviteInfo, acceptInvite, isLoggedIn,
  saveLoginRedirect,
} from "../api/client";

const ROLE_LABELS = {
  admin: { label: "Admin",  desc: "Full control — publish, manage members, everything." },
  staff: { label: "Staff",  desc: "Organising team — players, fixtures, scoring, tournament info." },
};

export default function JoinTournament() {
  const { token } = useParams();
  const navigate = useNavigate();
  const [info, setInfo]         = useState(null);
  const [loading, setLoading]   = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [error, setError]       = useState("");

  useEffect(() => {
    getInviteInfo(token)
      .then(setInfo)
      .catch(() => setInfo({ valid: false, reason: "not_found" }))
      .finally(() => setLoading(false));
  }, [token]);

  const handleAccept = async () => {
    setAccepting(true);
    setError("");
    try {
      const res = await acceptInvite(token);
      navigate(`/organiser/tournament/${res.tournament_id}`, { replace: true });
    } catch (e) {
      const msg = String(e.message || "");
      if (msg.includes("invite_expired"))      setError("This invite link has expired. Ask the organiser for a new one.");
      else if (msg.includes("invite_revoked")) setError("This invite link was revoked by the organiser.");
      else setError("Could not accept the invite: " + msg);
      setAccepting(false);
    }
  };

  const goToAuth = (path) => {
    saveLoginRedirect(`/join/${token}`);
    navigate(path);
  };

  const card = (children) => (
    <div className="organizer-flow" style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div className="card" style={{ maxWidth: 440, width: "100%", padding: "32px 28px", textAlign: "center" }}>
        {children}
      </div>
    </div>
  );

  if (loading) return card(<div style={{ color: "var(--muted)", fontSize: 14 }}>Checking your invite…</div>);

  if (!info?.valid) {
    const reasons = {
      expired:  "This invite link has expired. Ask the organiser to send you a new one.",
      revoked:  "This invite link was revoked by the organiser.",
      not_found: "This invite link isn't valid. Double-check the link or ask the organiser for a new one.",
    };
    return card(
      <>
        <div style={{ fontSize: 34, marginBottom: 12 }}>🔗</div>
        <div style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 900, textTransform: "uppercase", letterSpacing: -0.5, color: "var(--ink)", marginBottom: 10 }}>
          Invite Not Valid
        </div>
        <div style={{ fontSize: 14, color: "var(--muted)", marginBottom: 20, lineHeight: 1.6 }}>
          {reasons[info?.reason] || reasons.not_found}
        </div>
        <Link to="/" className="btn btn-outline btn-sm">← Back to home</Link>
      </>
    );
  }

  const role = ROLE_LABELS[info.role] || ROLE_LABELS.staff;

  return card(
    <>
      <div style={{ fontSize: 34, marginBottom: 12 }}>🏆</div>
      <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 6 }}>
        {info.inviter_name ? `${info.inviter_name} has invited you to help manage` : "You've been invited to help manage"}
      </div>
      <div style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 900, textTransform: "uppercase", letterSpacing: -0.5, color: "var(--ink)", marginBottom: 4 }}>
        {info.tournament_name}
      </div>
      {info.org_name && (
        <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 14 }}>by {info.org_name}</div>
      )}

      <div style={{ background: "var(--elevated)", border: "1px solid var(--border)", borderRadius: 10, padding: "12px 16px", marginBottom: 20, textAlign: "left" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <span style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: 1, color: "var(--muted)" }}>Your role</span>
          <span className={info.role === "admin" ? "pill pill-orange" : "pill pill-green"}>{role.label}</span>
        </div>
        <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.5 }}>{role.desc}</div>
      </div>

      {error && (
        <div style={{ padding: "10px 14px", borderRadius: 8, background: "#fee2e2", border: "1px solid #fca5a5", color: "#dc2626", fontSize: 13, marginBottom: 14, textAlign: "left" }}>
          {error}
        </div>
      )}

      {isLoggedIn() ? (
        <button className="btn btn-primary" style={{ width: "100%" }} disabled={accepting} onClick={handleAccept}>
          {accepting ? "Joining…" : "Accept Invitation →"}
        </button>
      ) : (
        <>
          <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 12 }}>
            Log in or create a free account to join.
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => goToAuth("/login")}>Log In</button>
            <button className="btn btn-outline" style={{ flex: 1 }} onClick={() => goToAuth("/register")}>Sign Up</button>
          </div>
        </>
      )}
    </>
  );
}
