import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import {
  login, setToken, consumeLoginRedirect,
  getMe, setStoredUser,
} from "../../api/client";
import GoogleSignInButton from "../../components/auth/GoogleButton";
import usePageMeta from "../../hooks/usePageMeta";

export default function Login() {
  usePageMeta("Sign In");
  const navigate = useNavigate();
  const [form,    setForm]    = useState({ email: "", password: "" });
  const [error,   setError]   = useState("");
  const [loading, setLoading] = useState(false);

  /** Fetch /auth/me, cache the user, then land on the organiser dashboard (or the page they came from). */
  async function postAuthRedirect() {
    try { setStoredUser(await getMe()); } catch { /* token is set; user is fetched on next load */ }
    navigate(consumeLoginRedirect("/organiser"), { replace: true });
  }

  const handleSubmit = async () => {
    if (!form.email || !form.password) return setError("All fields are required.");
    setLoading(true); setError("");
    try {
      const data = await login(form);
      setToken(data.access_token);
      await postAuthRedirect();
    } catch (e) { setError(e.message || "Login failed."); }
    finally { setLoading(false); }
  };

  const cardStyle = {
    background: "var(--surface)", padding: "40px", borderRadius: "12px",
    border: "1px solid var(--border)", width: "100%", maxWidth: "400px",
  };
  const inputStyle = {
    width: "100%", padding: "10px", borderRadius: "8px",
    border: "1px solid var(--input-border)", background: "var(--input-bg)", color: "var(--ink)",
  };
  const labelStyle = { color: "var(--ink)", fontSize: "14px", fontWeight: "600", marginBottom: "6px", display: "block" };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg)" }}>
      <div style={cardStyle}>

        {/* Brand */}
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div className="header-brand" style={{ color: "var(--ink)", display: "inline-block" }}>
            The<span className="accent" style={{ color: "var(--primary)" }}>Score</span>Board
          </div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: 2, color: "var(--muted)", marginTop: 6 }}>
            Welcome Back
          </div>
        </div>

        {/* Google SSO */}
        <GoogleSignInButton
          onSuccess={postAuthRedirect}
          onError={(msg) => setError(msg)}
        />

        {/* Divider */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "20px 0" }}>
          <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
          <span style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>OR</span>
          <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
        </div>

        {/* Email / password */}
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Email</label>
          <input className="input" type="email" placeholder="you@email.com"
            value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
            onKeyDown={e => e.key === "Enter" && handleSubmit()} style={inputStyle} />
        </div>
        <div style={{ marginBottom: 20 }}>
          <label style={labelStyle}>Password</label>
          <input className="input" type="password" placeholder="••••••••"
            value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
            onKeyDown={e => e.key === "Enter" && handleSubmit()} style={inputStyle} />
        </div>

        {error && (
          <div style={{ background: "var(--red-dim)", border: "1px solid rgba(229,62,62,0.3)", borderRadius: 6, padding: "9px 13px", marginBottom: 12, fontFamily: "var(--font-display)", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: .5, color: "var(--red)" }}>
            {error}
          </div>
        )}

        <button className="btn btn-gradient btn-lg"
          style={{ width: "100%", marginTop: 4, background: "var(--primary)", color: "#FFF", padding: "14px", borderRadius: "8px", border: "none", fontWeight: "bold", cursor: "pointer" }}
          onClick={handleSubmit} disabled={loading}>
          {loading ? "Signing in…" : "Sign In →"}
        </button>

        <div style={{ textAlign: "center", marginTop: 20, fontSize: 13, color: "var(--muted)" }}>
          Don't have an account?{" "}
          <Link to="/register" style={{ color: "var(--primary)", fontWeight: 700 }}>Register</Link>
        </div>
        <div style={{ textAlign: "center", marginTop: 8, fontSize: 13, color: "var(--muted)" }}>
          <Link to="/" style={{ color: "var(--muted)", textDecoration: "none" }}>← Back to home</Link>
        </div>
      </div>
    </div>
  );
}
