import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import {
  register, setToken, consumeLoginRedirect,
  getMe, setStoredUser,
} from "../../api/client";
import GoogleSignInButton from "../../components/auth/GoogleButton";
import usePageMeta from "../../hooks/usePageMeta";

// Eye / eye-off icons for the password visibility toggle
function EyeIcon({ off }) {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {off ? (
        <>
          <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-5.05 0-9.29-3.14-11-8 .69-1.94 1.85-3.68 3.34-5.06M9.9 4.24A10.94 10.94 0 0 1 12 4c5.05 0 9.29 3.14 11 8-.53 1.5-1.35 2.86-2.4 4.02M14.12 14.12a3 3 0 1 1-4.24-4.24" />
          <line x1="1" y1="1" x2="23" y2="23" />
        </>
      ) : (
        <>
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
          <circle cx="12" cy="12" r="3" />
        </>
      )}
    </svg>
  );
}

// Password input with a show/hide eye toggle button
function PasswordField({ value, onChange, placeholder, onKeyDown, inputStyle }) {
  const [visible, setVisible] = useState(false);
  return (
    <div style={{ position: "relative" }}>
      <input className="input" type={visible ? "text" : "password"} placeholder={placeholder}
        value={value} onChange={onChange} onKeyDown={onKeyDown}
        style={{ ...inputStyle, paddingRight: 40 }} />
      <button type="button" onClick={() => setVisible(v => !v)}
        aria-label={visible ? "Hide password" : "Show password"}
        style={{
          position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
          background: "none", border: "none", cursor: "pointer", padding: 4,
          display: "flex", alignItems: "center", color: "var(--muted)",
        }}>
        <EyeIcon off={visible} />
      </button>
    </div>
  );
}

export default function Register() {
  usePageMeta("Create Account");
  const navigate = useNavigate();
  const [form,    setForm]    = useState({ name: "", email: "", password: "", phone: "" });
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error,   setError]   = useState("");
  const [loading, setLoading] = useState(false);

  const passwordsMatch = confirmPassword.length > 0 && form.password === confirmPassword;
  const passwordsMismatch = confirmPassword.length > 0 && form.password !== confirmPassword;

  /** New accounts land on the organiser dashboard (where they create their first organisation),
   *  or on the page they were redirected from (tsb_next). */
  async function postRegisterRedirect() {
    try {
      const u = await getMe();
      setStoredUser(u);
    } catch { /* ignore — token is set, user will be fetched on next load */ }
    navigate(consumeLoginRedirect("/organiser"), { replace: true });
  }

  const handleSubmit = async () => {
    if (!form.name || !form.email || !form.password)
      return setError("Name, email and password are required.");
    if (form.password.length < 6)
      return setError("Password must be at least 6 characters.");
    if (form.password !== confirmPassword)
      return setError("Passwords do not match.");
    setLoading(true); setError("");
    try {
      const data = await register(form);
      setToken(data.access_token);
      await postRegisterRedirect();
    } catch (e) { setError(e.message || "Registration failed."); }
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
            Create Your Account
          </div>
        </div>

        {/* Google SSO — fastest path */}
        <GoogleSignInButton
          onSuccess={postRegisterRedirect}
          onError={(msg) => setError(msg)}
        />

        {/* Divider */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "20px 0" }}>
          <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
          <span style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>OR REGISTER WITH EMAIL</span>
          <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
        </div>

        {/* Email / password form */}
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Full Name *</label>
          <input className="input" type="text" placeholder="Your name"
            value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} style={inputStyle} />
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Email *</label>
          <input className="input" type="email" placeholder="you@email.com"
            value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} style={inputStyle} />
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Password *</label>
          <PasswordField
            value={form.password}
            onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
            onKeyDown={e => e.key === "Enter" && handleSubmit()}
            placeholder="Min 6 characters"
            inputStyle={inputStyle}
          />
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Re-enter Password *</label>
          <PasswordField
            value={confirmPassword}
            onChange={e => setConfirmPassword(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleSubmit()}
            placeholder="Re-enter your password"
            inputStyle={{
              ...inputStyle,
              ...(passwordsMismatch && { borderColor: "var(--red)" }),
              ...(passwordsMatch && { borderColor: "var(--green)" }),
            }}
          />
          {passwordsMatch && (
            <div style={{ fontSize: 12, color: "var(--green)", marginTop: 6, fontWeight: 600 }}>
              ✓ Passwords match
            </div>
          )}
          {passwordsMismatch && (
            <div style={{ fontSize: 12, color: "var(--red)", marginTop: 6, fontWeight: 600 }}>
              Passwords do not match
            </div>
          )}
        </div>
        <div style={{ marginBottom: 20 }}>
          <label style={labelStyle}>Phone (optional)</label>
          <input className="input" type="tel" placeholder="9876543210"
            value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} style={inputStyle} />
        </div>

        {error && (
          <div style={{ background: "var(--red-dim)", border: "1px solid rgba(229,62,62,0.3)", borderRadius: 6, padding: "9px 13px", marginBottom: 12, fontFamily: "var(--font-display)", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: .5, color: "var(--red)" }}>
            {error}
          </div>
        )}

        {/* Legal agreement */}
        <p style={{ fontSize: 12, color: "var(--muted)", textAlign: "center", marginBottom: 14, lineHeight: 1.6 }}>
          By creating an account you agree to our{" "}
          <a href="/terms" target="_blank" rel="noopener noreferrer" style={{ color: "var(--primary)", textDecoration: "none", fontWeight: 600 }}>Terms of Service</a>
          {" "}and{" "}
          <a href="/privacy" target="_blank" rel="noopener noreferrer" style={{ color: "var(--primary)", textDecoration: "none", fontWeight: 600 }}>Privacy Policy</a>.
        </p>

        <button className="btn btn-gradient btn-lg"
          style={{
            width: "100%", marginTop: 0, background: "var(--primary)", color: "#FFF",
            padding: "14px", borderRadius: "8px", border: "none", fontWeight: "bold",
            cursor: loading || !passwordsMatch ? "not-allowed" : "pointer",
            opacity: loading || !passwordsMatch ? 0.6 : 1,
          }}
          onClick={handleSubmit} disabled={loading || !passwordsMatch}>
          {loading ? "Creating account…" : "Create Account →"}
        </button>

        <div style={{ textAlign: "center", marginTop: 20, fontSize: 13, color: "var(--muted)" }}>
          Already have an account?{" "}
          <Link to="/login" style={{ color: "var(--primary)", fontWeight: 700 }}>Sign in</Link>
        </div>
        <div style={{ textAlign: "center", marginTop: 8, fontSize: 13, color: "var(--muted)" }}>
          <Link to="/" style={{ color: "var(--muted)", textDecoration: "none" }}>← Back to home</Link>
        </div>
      </div>
    </div>
  );
}
